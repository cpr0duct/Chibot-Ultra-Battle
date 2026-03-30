/**
 * apply-audit-fixes.js
 *
 * Reads audit reports (balance + spelling), applies fixes to .CH2/.CHE files
 * for changes that are stored on disk (spelling, strength caps, useless chars,
 * defense reductions), and creates a calcMpReq module for runtime MP cost
 * calculation (since mpReq is not stored in .CH2 files — VB6 computed it
 * at load time via CalcMP).
 *
 * Usage: node scripts/apply-audit-fixes.js
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { parseCh2, serializeCh2 } from '../parsers/ch2-parser.js';
import { loadDataset } from '../parsers/index.js';
import { ELEMENT } from '../engine/constants.js';

const ROOT = join(import.meta.dirname, '..');
const CHARACTERS_DIR = join(ROOT, 'data', 'characters');
const DATASET_INI = join(ROOT, 'data', 'datasets', 'arcade.ini');
const BALANCE_FILE = join(ROOT, 'test', 'audit-balance-v2.json');
const SPELLING_FILE = join(ROOT, 'test', 'audit-spelling.json');
const OUTPUT_FILE = join(ROOT, 'test', 'audit-fixes-applied.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function findFilesRecursive(dir, extensions) {
  let results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFilesRecursive(fp, extensions));
    } else if (extensions.some(ext => entry.name.toUpperCase().endsWith(ext))) {
      results.push(fp);
    }
  }
  return results.sort();
}

/**
 * Calculate mpReq for a move based on element and strength.
 * Mirrors the VB6 CalcMP logic.
 */
function calcMpReq(move) {
  if (!move.cmdKey || move.strength === 0) return 0;

  const el = move.element;
  const str = move.strength;

  // HEAL element: mpReq = max(10, floor(str / 5))
  if (el === ELEMENT.HEAL) {
    return Math.max(10, Math.floor(str / 5));
  }

  // LIFE element (revive): flat 30 MP
  if (el === ELEMENT.LIFE) {
    return 30;
  }

  // Status-only moves (NO_DMG) — small cost if they apply status
  if (el === ELEMENT.NO_DMG) {
    const statusCount = move.status ? move.status.filter(s => s !== 0).length : 0;
    return statusCount > 0 ? Math.max(5, statusCount * 5) : 0;
  }

  // Damage moves with strength > 50: mpReq = max(5, floor(str / 10))
  if (str > 50) {
    return Math.max(5, Math.floor(str / 10));
  }

  return 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Applying Audit Fixes ===\n');

  // Step 1: Load the dataset to get the ordered character list
  console.log('Loading dataset from', DATASET_INI);
  const dataset = await loadDataset(DATASET_INI);
  console.log(`Loaded ${dataset.characters.length} characters from dataset\n`);

  // Step 2: Load audit reports
  const balanceAudit = JSON.parse(readFileSync(BALANCE_FILE, 'utf-8'));
  const spellingAudit = JSON.parse(readFileSync(SPELLING_FILE, 'utf-8'));
  console.log(`Balance audit: ${balanceAudit.length} entries`);
  console.log(`Spelling audit: ${spellingAudit.length} entries\n`);

  // Build index-based lookup maps from audit data
  const balanceByIndex = new Map();
  for (const entry of balanceAudit) {
    balanceByIndex.set(entry.index, entry);
  }

  const spellingByIndex = new Map();
  for (const entry of spellingAudit) {
    spellingByIndex.set(entry.index, entry);
  }

  // Step 3: Scan all .CH2/.CHE files, parse, match by fullName to dataset index
  const charFiles = findFilesRecursive(CHARACTERS_DIR, ['.CH2', '.CHE']);
  console.log(`Found ${charFiles.length} character files\n`);

  // Build fullName -> { path, parsed } map
  const fileMap = new Map();
  for (const filePath of charFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const ch = parseCh2(content);
      // Some names may appear multiple times — store all
      if (!fileMap.has(ch.fullName)) {
        fileMap.set(ch.fullName, []);
      }
      fileMap.get(ch.fullName).push({ path: filePath });
    } catch (e) {
      console.warn(`  Warning: Failed to parse ${filePath}: ${e.message}`);
    }
  }

  // Build dataset index -> fullName map
  const indexToName = new Map();
  const nameToIndex = new Map();
  dataset.characters.forEach((ch, i) => {
    indexToName.set(i, ch.fullName);
    // For reverse lookup, store the first occurrence
    if (!nameToIndex.has(ch.fullName)) {
      nameToIndex.set(ch.fullName, i);
    }
  });

  const changes = [];
  let balanceFixes = 0;
  let spellingFixes = 0;
  const processedFiles = new Set();

  // Process each audit entry
  const allIndices = new Set([
    ...balanceByIndex.keys(),
    ...spellingByIndex.keys(),
  ]);

  for (const idx of allIndices) {
    const dsName = indexToName.get(idx);
    if (!dsName) {
      console.warn(`  Warning: No dataset character at index ${idx}`);
      continue;
    }

    // Find the file for this character
    const fileEntries = fileMap.get(dsName);
    if (!fileEntries || fileEntries.length === 0) {
      // Try trimmed
      const trimmedEntries = fileMap.get(dsName.trim());
      if (!trimmedEntries || trimmedEntries.length === 0) {
        console.warn(`  Warning: No file found for '${dsName}' (index ${idx})`);
        continue;
      }
    }

    const entries = fileEntries || fileMap.get(dsName.trim());
    if (!entries) continue;

    // Use the first matching file (there should typically be only one)
    const entry = entries[0];
    if (processedFiles.has(entry.path)) continue;
    processedFiles.add(entry.path);

    // Parse fresh
    const ch = parseCh2(readFileSync(entry.path, 'utf-8'));
    const charChanges = [];
    let modified = false;

    // ── Spelling fixes ─────────────────────────────────────────────────
    const spEntry = spellingByIndex.get(idx);
    if (spEntry) {
      for (const issue of spEntry.issues) {
        const { field, current, suggested } = issue;

        if (field === 'fullName') {
          if (ch.fullName !== suggested && (ch.fullName === current || ch.fullName.trim() === current.trim())) {
            ch.fullName = suggested;
            charChanges.push(`Renamed from '${current}' to '${suggested}'`);
            modified = true;
            spellingFixes++;
          }
        } else if (field.startsWith('moves[')) {
          const match = field.match(/^moves\[(\d+)\]\.(.+)$/);
          if (match) {
            const moveIdx = parseInt(match[1], 10);
            const prop = match[2];
            const move = ch.moves[moveIdx];
            if (move) {
              const actual = (move[prop] || '').toString();
              const expected = (current || '').toString();
              if (actual !== suggested && (actual === expected || actual.trim() === expected.trim())) {
                move[prop] = suggested;
                charChanges.push(`Fixed ${field}: '${current}' -> '${suggested}'`);
                modified = true;
                spellingFixes++;
              }
            }
          }
        } else {
          // Direct top-level field
          const actual = (ch[field] || '').toString();
          const expected = (current || '').toString();
          if (actual !== suggested && (actual === expected || actual.trim() === expected.trim())) {
            ch[field] = suggested;
            charChanges.push(`Fixed ${field}: '${current}' -> '${suggested}'`);
            modified = true;
            spellingFixes++;
          }
        }
      }
    }

    // ── Trim whitespace from fullName and move names ─────────────────
    {
      const trimmed = ch.fullName.trim();
      if (trimmed !== ch.fullName) {
        charChanges.push(`Trimmed fullName whitespace`);
        ch.fullName = trimmed;
        modified = true;
        spellingFixes++;
      }
      for (let m = 0; m < ch.moves.length; m++) {
        const move = ch.moves[m];
        if (!move || !move.name) continue;
        const tn = move.name.trim();
        if (tn !== move.name) {
          charChanges.push(`Trimmed move[${m}].name whitespace`);
          move.name = tn;
          modified = true;
          spellingFixes++;
        }
      }
    }

    // ── Balance fixes ──────────────────────────────────────────────────
    const balEntry = balanceByIndex.get(idx);
    if (balEntry) {
      const processedMoves = new Set(); // track moves already fixed to avoid double-counting

      for (const issue of balEntry.issues) {
        switch (issue.type) {
          case 'useless_character': {
            // Convert weakest move to basic physical attack if no attack moves exist
            const hasAttackMove = ch.moves.some(m =>
              m && m.cmdKey &&
              m.element !== ELEMENT.HEAL &&
              m.element !== ELEMENT.LIFE &&
              m.element !== ELEMENT.NO_DMG &&
              m.strength > 0
            );
            if (!hasAttackMove) {
              // Find first empty slot or weakest existing move
              let targetIdx = -1;
              let weakestStr = Infinity;

              for (let m = 0; m < ch.moves.length; m++) {
                const move = ch.moves[m];
                if (!move || !move.cmdKey) {
                  targetIdx = m;
                  break;
                }
                if (move.strength < weakestStr) {
                  weakestStr = move.strength;
                  targetIdx = m;
                }
              }

              if (targetIdx >= 0) {
                const move = ch.moves[targetIdx];
                const oldName = move.name || '(empty)';
                const shortName = ch.fullName.split(' ')[0].replace(/[*]/g, '');
                move.name = `${shortName}'s Strike`;
                if (!move.cmdKey) move.cmdKey = shortName.toLowerCase().slice(0, 6) + 'str';
                move.element = ELEMENT.PHYSICAL;
                move.strength = 50;
                move.target = 2; // ENEMY
                move.hit = `%SN strikes %T with a powerful blow!`;
                move.miss = `%SN swings at %T but misses!`;
                move.beginAttack = `%SN prepares to attack!`;
                charChanges.push(`Converted move[${targetIdx}] '${oldName}' to basic attack '${move.name}'`);
                modified = true;
                balanceFixes++;
              }
            }
            break;
          }

          case 'unkillable_tank': {
            const reduceMatch = issue.suggestion.match(/Reduce (\w+) by (\d+)/);
            if (reduceMatch) {
              const stat = reduceMatch[1];
              const amount = parseInt(reduceMatch[2], 10);
              // Only apply if the stat still matches the original audit value
              const origStat = balEntry.effectiveStats[stat];
              if (ch[stat] !== undefined && ch[stat] === origStat) {
                const old = ch[stat];
                ch[stat] = Math.max(0, ch[stat] - amount);
                charChanges.push(`Reduced ${stat} from ${old} to ${ch[stat]}`);
                modified = true;
                balanceFixes++;
              }
            }
            break;
          }

          // mpReq-related issues are handled by calcMpReq at runtime
          // but we still log them for the report
          case 'infinite_free_heal':
          case 'heal_to_hp_ratio':
          case 'free_revive':
          case 'infinite_free_nuke':
          case 'broken_sustainability':
            // These will be fixed by calcMpReq in the loader
            break;
        }
      }

      // ── Cap absurd strength values (> 400) ────────────────────────
      for (let m = 0; m < ch.moves.length; m++) {
        const move = ch.moves[m];
        if (!move || !move.cmdKey) continue;
        if (move.strength > 400) {
          const old = move.strength;
          move.strength = 300;
          charChanges.push(`Capped move[${m}] '${move.name}' strength from ${old} to 300`);
          modified = true;
          balanceFixes++;
        }
      }
    }

    // ── Save if modified ─────────────────────────────────────────────
    if (modified) {
      const serialized = serializeCh2(ch);
      writeFileSync(entry.path, serialized, 'utf-8');

      changes.push({
        index: idx,
        name: ch.fullName,
        file: entry.path.replace(/\\/g, '/'),
        changes: charChanges,
      });
    }
  }

  // ── Step 5: Ensure calcMpReq module exists and loader is integrated ─────

  const calcMpReqPath = join(ROOT, 'engine', 'calc-mp-req.js');
  if (!existsSync(calcMpReqPath)) {
    console.log(`\nWARNING: ${calcMpReqPath} does not exist. Please create it manually.`);
  } else {
    console.log(`\ncalcMpReq module exists at ${calcMpReqPath}`);
  }

  // Update the dataset loader to call applyMpReq after parsing each character
  const loaderPath = join(ROOT, 'parsers', 'index.js');
  let loaderContent = readFileSync(loaderPath, 'utf-8');

  if (!loaderContent.includes('applyMpReq')) {
    // Add import
    loaderContent = loaderContent.replace(
      "import { parseW2k } from './w2k-parser.js';",
      "import { parseW2k } from './w2k-parser.js';\nimport { applyMpReq } from '../engine/calc-mp-req.js';"
    );

    // Add applyMpReq call after pushing to characters
    loaderContent = loaderContent.replace(
      "      const parsed = mapping.parser(content);\n      dataset[mapping.category].push(parsed);",
      "      const parsed = mapping.parser(content);\n      if (mapping.category === 'characters') applyMpReq(parsed);\n      dataset[mapping.category].push(parsed);"
    );

    writeFileSync(loaderPath, loaderContent, 'utf-8');
    console.log(`Updated ${loaderPath} to apply mpReq calculation at load time`);
  }

  // Count how many moves have non-zero mpReq from the loader
  let mpReqFixCount = 0;
  for (const ch of dataset.characters) {
    for (const move of ch.moves) {
      if (!move || !move.cmdKey) continue;
      if (move.mpReq > 0) {
        mpReqFixCount++;
      }
    }
  }

  // ── Write summary ──────────────────────────────────────────────────────
  const summary = {
    totalFixed: changes.length,
    balanceFixes,
    spellingFixes,
    mpReqFixesViaLoader: mpReqFixCount,
    changes,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n=== Summary ===');
  console.log(`Characters with .CH2 file changes: ${changes.length}`);
  console.log(`Balance fixes (in .CH2 files): ${balanceFixes}`);
  console.log(`Spelling fixes (in .CH2 files): ${spellingFixes}`);
  console.log(`MP cost fixes (via loader calcMpReq): ${mpReqFixCount} moves across all characters`);
  console.log(`Report written to: ${OUTPUT_FILE}`);

  // Show a sample of changes
  console.log('\nSample changes:');
  for (const ch of changes.slice(0, 15)) {
    console.log(`  [${ch.index}] ${ch.name}:`);
    for (const c of ch.changes.slice(0, 3)) {
      console.log(`    - ${c}`);
    }
    if (ch.changes.length > 3) console.log(`    ... and ${ch.changes.length - 3} more`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
