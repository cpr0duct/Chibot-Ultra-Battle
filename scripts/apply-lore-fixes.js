/**
 * apply-lore-fixes.js
 *
 * Reads audit-lore-v2.json and applies element, target, stat, weakness/resistance,
 * and name fixes to .CH2 character files.
 *
 * Usage: node scripts/apply-lore-fixes.js
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseCh2, serializeCh2 } from '../parsers/ch2-parser.js';
import { loadDataset } from '../parsers/index.js';
import { ELEMENT, TARGET } from '../engine/constants.js';

const ROOT = join(import.meta.dirname, '..');
const CHARACTERS_DIR = join(ROOT, 'data', 'characters');
const DATASET_INI = join(ROOT, 'data', 'datasets', 'arcade.ini');
const AUDIT_FILE = join(ROOT, 'test', 'audit-lore-v2.json');
const OUTPUT_FILE = join(ROOT, 'test', 'audit-lore-fixes-applied.json');

// Indices to skip (encrypted/broken)
const SKIP_INDICES = new Set([342, 343, 400, 402]);

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

/** Build a reverse map: element name -> element value */
const ELEMENT_BY_NAME = {};
for (const [name, val] of Object.entries(ELEMENT)) {
  ELEMENT_BY_NAME[name] = val;
}

/** Parse an element name from audit expected field. Takes first option if "X or Y" */
function parseElementName(str) {
  if (!str) return null;
  // Handle "NONE str:0" or "NONE"
  const cleaned = str.replace(/\s+str:\d+/g, '').trim();
  // Handle "X or Y" - take first option
  const first = cleaned.split(/\s+or\s+/i)[0].trim();
  // Handle "X with strength Y+"
  const elName = first.replace(/\s+with\s+strength.*$/i, '').trim();
  if (elName === 'NONE') return ELEMENT.NO_DMG;
  const val = ELEMENT_BY_NAME[elName];
  return val !== undefined ? val : null;
}

/** Parse a target name */
function parseTargetName(str) {
  if (!str) return null;
  const first = str.split(/\s+or\s+/i)[0].trim();
  switch (first) {
    case 'ENEMY': return TARGET.ENEMY;
    case 'SELF': return TARGET.ALLY; // ALLY=3 is "default target = self"
    case 'ALL_ALLY': return TARGET.ALL_FRIEND;
    case 'ALL_FRIEND': return TARGET.ALL_FRIEND;
    case 'ONLY_SELF': return TARGET.ONLY_SELF;
    default: return null;
  }
}

/** Parse move index from field like "moves[6]" */
function parseMoveIndex(field) {
  const m = field.match(/moves\[(\d+)\]/);
  return m ? parseInt(m[1], 10) : -1;
}

// ── DBZ stat profiles ────────────────────────────────────────────────────────

const DBZ_MAIN_FIGHTERS = new Set([
  'Goku', 'Vegeta', 'Gohan', 'Gotenks', 'Trunks', 'Mirai Trunks',
  'SSJ2 Gohan', 'Super Goku 4', 'Super Vegeta 4', 'Vegetto',
  'Ultimate Gojiita', 'Mirai Gohan', 'Great Saiyaman', 'Goten',
  'Super #17', 'Adult Link'
]);
const DBZ_MAIN_VILLAINS = new Set([
  'Freeza', 'Cell', 'Majin Buu', 'Brolli', 'Super Buu',
  'Hildegarn', 'Janenba', 'Bojack', 'Kooler', 'Dabura',
  'Cell Jr', 'Garlic Jr', 'Turles', 'Lord Slug', 'Vegeta-Bebi',
  'Bebi'
]);
const DBZ_NAMEKIAN_SUPPORT = new Set([
  'Piccolo', 'Dende', 'Kaioushin', 'Kaiou-bit', 'Kibito',
  'The Eldest Namek', 'Piccolo Daimao', 'Nail'
]);
const DBZ_HUMAN_FIGHTERS = new Set([
  'Krillin', 'Yamcha', 'Tien', 'Chaozu', 'Videl', 'Pan',
  'Mister Satan', 'Master Roshi', 'Ubuu', 'Tapion', 'Zangya'
]);
const DBZ_MID_VILLAINS = new Set([
  'Nappa', 'Raditz', 'Ginyu', 'Recoom', 'Guld', 'Jees', 'Baata',
  'Zarbon', 'Kuwii', 'Majin Babidi', 'Nicky', 'Ginger', 'Gill',
  'Artificial 13', '#14', '#15', 'Artificial 16', 'Artificial 17',
  'Artificial 18', 'Artificial 19', 'Artificial 20'
]);
const DBZ_NON_FIGHTERS = new Set([
  'Puar'
]);

function getDbzStatProfile(name) {
  if (DBZ_MAIN_FIGHTERS.has(name)) return { physStr: 70, magStr: 60, physDef: 50, magDef: 45 };
  if (DBZ_MAIN_VILLAINS.has(name)) return { physStr: 65, magStr: 70, physDef: 55, magDef: 50 };
  if (DBZ_NAMEKIAN_SUPPORT.has(name)) return { physStr: 40, magStr: 75, physDef: 45, magDef: 60 };
  if (DBZ_HUMAN_FIGHTERS.has(name)) return { physStr: 55, magStr: 40, physDef: 40, magDef: 35 };
  if (DBZ_MID_VILLAINS.has(name)) return { physStr: 60, magStr: 45, physDef: 50, magDef: 40 };
  if (DBZ_NON_FIGHTERS.has(name)) return { physStr: 10, magStr: 20, physDef: 15, magDef: 20 };
  return null;
}

// ── Special stat profiles for non-DBZ characters ────────────────────────────

const SPECIAL_STATS = {
  189: { physStr: 60, magStr: 50, physDef: 70, magDef: 50 },   // Blastoise - tanky water
  204: { physStr: 20, magStr: 10, physDef: 60, magDef: 40 },   // Metapod - all defense
  206: { physStr: 40, magStr: 85, physDef: 35, magDef: 60 },   // Mewtwo - special attacker
  270: { physStr: 80, magStr: 20, physDef: 60, magDef: 30 },   // Wolverine - physical brute
  273: { physStr: 10, magStr: 30, physDef: 20, magDef: 30 },   // C-3P0 - protocol droid
  302: { physStr: 55, magStr: 50, physDef: 45, magDef: 50 },   // Luigi - balanced
  336: { physStr: 65, magStr: 45, physDef: 50, magDef: 40 },   // Adult Link - warrior
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Applying Lore Fixes ===\n');

  // Load dataset for index-to-name mapping
  console.log('Loading dataset from', DATASET_INI);
  const dataset = await loadDataset(DATASET_INI);
  console.log(`Loaded ${dataset.characters.length} characters from dataset\n`);

  // Load audit
  const audit = JSON.parse(readFileSync(AUDIT_FILE, 'utf-8'));
  console.log(`Audit entries: ${audit.length}\n`);

  // Build index -> audit entry map
  const auditByIndex = new Map();
  for (const entry of audit) {
    auditByIndex.set(entry.index, entry);
  }

  // Scan character files
  const charFiles = findFilesRecursive(CHARACTERS_DIR, ['.CH2', '.CHE']);
  console.log(`Found ${charFiles.length} character files\n`);

  // Build fullName -> [{ path }] map
  const fileMap = new Map();
  for (const filePath of charFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const ch = parseCh2(content);
      if (!fileMap.has(ch.fullName)) fileMap.set(ch.fullName, []);
      fileMap.get(ch.fullName).push({ path: filePath });
    } catch (e) {
      console.warn(`  Warning: Failed to parse ${filePath}: ${e.message}`);
    }
  }

  // Build dataset index -> fullName
  const indexToName = new Map();
  dataset.characters.forEach((ch, i) => {
    indexToName.set(i, ch.fullName);
  });

  const changes = [];
  let elementFixes = 0;
  let targetFixes = 0;
  let statFixes = 0;
  let weakResistFixes = 0;
  let nameFixes = 0;
  let otherFixes = 0;
  const processedFiles = new Set();

  for (const auditEntry of audit) {
    const idx = auditEntry.index;

    // Skip encrypted/broken
    if (SKIP_INDICES.has(idx)) continue;

    // Skip original chars
    if (auditEntry.isOriginal) continue;

    // Skip inappropriate
    if (auditEntry.issues.some(i => i.category === 'inappropriate')) continue;

    // Skip if no actionable issues
    const actionableIssues = auditEntry.issues.filter(i =>
      ['element', 'target_type', 'stats', 'weakness', 'resistance', 'move_name', 'other'].includes(i.category)
    );
    if (actionableIssues.length === 0) continue;

    const dsName = indexToName.get(idx);
    if (!dsName) {
      console.warn(`  Warning: No dataset character at index ${idx}`);
      continue;
    }

    const entries = fileMap.get(dsName) || fileMap.get(dsName.trim());
    if (!entries || entries.length === 0) {
      console.warn(`  Warning: No file found for '${dsName}' (index ${idx})`);
      continue;
    }

    const entry = entries[0];
    if (processedFiles.has(entry.path)) continue;
    processedFiles.add(entry.path);

    // Parse fresh
    let ch;
    try {
      ch = parseCh2(readFileSync(entry.path, 'utf-8'));
    } catch (e) {
      console.warn(`  Warning: Failed to parse ${entry.path}: ${e.message}`);
      continue;
    }

    const charChanges = [];
    let modified = false;

    for (const issue of actionableIssues) {
      switch (issue.category) {

        case 'element': {
          const moveIdx = parseMoveIndex(issue.field);
          if (moveIdx < 0 || moveIdx >= ch.moves.length) break;
          const move = ch.moves[moveIdx];
          if (!move) break;

          const newEl = parseElementName(issue.expected);
          if (newEl === null) {
            console.warn(`  Warning: Could not parse element '${issue.expected}' for ${dsName} ${issue.field}`);
            break;
          }

          if (move.element !== newEl) {
            const oldEl = move.element;
            move.element = newEl;
            charChanges.push(`Element fix: ${issue.field} '${move.name}' element ${oldEl} -> ${newEl} (${issue.expected})`);
            modified = true;
            elementFixes++;

            // Handle special cases from expected field
            // "NONE str:0" -> also set strength to 0
            if (issue.expected.includes('str:0')) {
              const oldStr = move.strength;
              move.strength = 0;
              charChanges.push(`  Also zeroed strength: ${oldStr} -> 0`);
            }
            // "KI with strength 80+" -> set strength if currently 0
            if (issue.expected.includes('with strength') && move.strength === 0) {
              move.strength = 80;
              charChanges.push(`  Also set strength to 80 (was 0)`);
            }
          }
          break;
        }

        case 'target_type': {
          const moveIdx = parseMoveIndex(issue.field);
          if (moveIdx < 0 || moveIdx >= ch.moves.length) break;
          const move = ch.moves[moveIdx];
          if (!move) break;

          const newTarget = parseTargetName(issue.expected);
          if (newTarget === null) {
            console.warn(`  Warning: Could not parse target '${issue.expected}' for ${dsName} ${issue.field}`);
            break;
          }

          if (move.target !== newTarget) {
            const oldTarget = move.target;
            move.target = newTarget;
            charChanges.push(`Target fix: ${issue.field} '${move.name}' target ${oldTarget} -> ${newTarget} (${issue.expected})`);
            modified = true;
            targetFixes++;
          }
          break;
        }

        case 'stats': {
          // Check if this is a DBZ character with 55/55/55/55
          if (ch.physStr !== 55 || ch.magStr !== 55 || ch.physDef !== 55 || ch.magDef !== 55) break;

          let profile = getDbzStatProfile(auditEntry.name);
          if (!profile) profile = SPECIAL_STATS[idx];
          if (!profile) {
            console.warn(`  Warning: No stat profile for '${auditEntry.name}' (index ${idx})`);
            break;
          }

          ch.physStr = profile.physStr;
          ch.magStr = profile.magStr;
          ch.physDef = profile.physDef;
          ch.magDef = profile.magDef;
          charChanges.push(`Stats: 55/55/55/55 -> ${profile.physStr}/${profile.magStr}/${profile.physDef}/${profile.magDef}`);
          modified = true;
          statFixes++;
          break;
        }

        case 'weakness': {
          const newWeak = parseElementName(issue.expected);
          if (newWeak === null) {
            console.warn(`  Warning: Could not parse weakness '${issue.expected}' for ${dsName}`);
            break;
          }
          const oldWeak = ch.weakTo;
          ch.weakTo = newWeak;
          charChanges.push(`Weakness: ${oldWeak} -> ${newWeak} (${issue.expected})`);
          modified = true;
          weakResistFixes++;
          break;
        }

        case 'resistance': {
          const newResist = parseElementName(issue.expected);
          if (newResist === null) {
            console.warn(`  Warning: Could not parse resistance '${issue.expected}' for ${dsName}`);
            break;
          }
          const oldResist = ch.resist;
          ch.resist = newResist;
          charChanges.push(`Resistance: ${oldResist} -> ${newResist} (${issue.expected})`);
          modified = true;
          weakResistFixes++;
          break;
        }

        case 'move_name': {
          // Only fix actual misspellings (where field and expected are both present)
          if (!issue.field || !issue.expected) break;
          const moveIdx = parseMoveIndex(issue.field);
          if (moveIdx < 0 || moveIdx >= ch.moves.length) break;
          const move = ch.moves[moveIdx];
          if (!move) break;

          // Only rename if it's a spelling fix (has current and expected)
          if (issue.current && issue.expected && move.name === issue.current) {
            move.name = issue.expected;
            charChanges.push(`Move name: ${issue.field} '${issue.current}' -> '${issue.expected}'`);
            modified = true;
            nameFixes++;
          }
          break;
        }

        case 'other': {
          // Handle specific fixable "other" issues
          if (issue.field === 'name' && issue.current && issue.expected) {
            if (ch.fullName === issue.current) {
              ch.fullName = issue.expected;
              charChanges.push(`Name fix: '${issue.current}' -> '${issue.expected}'`);
              modified = true;
              otherFixes++;
            }
          }
          // Fix negative strength bug (Strider Hiryu)
          if (issue.field && issue.field.startsWith('moves[') && issue.current && issue.current.includes('strength: -')) {
            const moveIdx = parseMoveIndex(issue.field);
            if (moveIdx >= 0 && moveIdx < ch.moves.length) {
              const move = ch.moves[moveIdx];
              if (move && move.strength < 0) {
                const oldStr = move.strength;
                move.strength = Math.abs(oldStr);
                charChanges.push(`Fixed negative strength: ${issue.field} '${move.name}' ${oldStr} -> ${move.strength}`);
                modified = true;
                otherFixes++;
              }
            }
          }
          break;
        }
      }
    }

    // Save if modified
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

  // Write summary
  const summary = {
    totalCharactersFixed: changes.length,
    elementFixes,
    targetFixes,
    statFixes,
    weakResistFixes,
    nameFixes,
    otherFixes,
    changes,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n=== Summary ===');
  console.log(`Characters modified: ${changes.length}`);
  console.log(`Element fixes: ${elementFixes}`);
  console.log(`Target fixes: ${targetFixes}`);
  console.log(`Stat fixes: ${statFixes}`);
  console.log(`Weakness/resistance fixes: ${weakResistFixes}`);
  console.log(`Name fixes: ${nameFixes}`);
  console.log(`Other fixes: ${otherFixes}`);
  console.log(`Report written to: ${OUTPUT_FILE}`);

  // Show all changes
  console.log('\nAll changes:');
  for (const ch of changes) {
    console.log(`  [${ch.index}] ${ch.name}:`);
    for (const c of ch.changes) {
      console.log(`    - ${c}`);
    }
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
