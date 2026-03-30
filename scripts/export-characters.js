/**
 * Export all character data to a single JSON file for audit review.
 * Run: node scripts/export-characters.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadDataset } from '../parsers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'default.json'), 'utf-8'));

async function main() {
  const ds = await loadDataset(join(config.datasetsDir, config.defaultDataset));
  const chars = ds.characters;

  const ELEMENT_NAMES = {
    0: 'NONE', 1: 'PHYSICAL', 2: 'HEAL', 3: 'MOON', 4: 'SHADOW',
    5: 'WATER', 6: 'FIRE', 7: 'LIGHTNING', 8: 'HEART', 9: 'EARTH',
    10: 'WIND', 11: 'KI', 12: 'LUMINOUS', 13: 'HP_THEFT', 14: 'MP_THEFT',
    15: 'DEMI', 16: 'MORPH', 17: 'LIFE', 18: 'NO_DMG', 19: 'REVEAL',
    20: 'POISON', 70: 'POISON', 28: 'WIND', 29: 'GRASS', 30: 'ROCK',
    31: 'DIRT', 32: 'PSYCHIC', 33: 'GHOST', 34: 'HP_BASED',
  };

  const TARGET_NAMES = { 1: 'ALL_ALLY', 2: 'ENEMY', 3: 'SELF' };

  const output = chars.map((c, idx) => {
    const moves = (c.moves || [])
      .filter(m => m && m.name && m.name.trim() !== '')
      .map(m => ({
        name: m.name,
        cmdKey: m.cmdKey,
        element: ELEMENT_NAMES[m.element] || `UNKNOWN(${m.element})`,
        elementId: m.element,
        strength: m.strength,
        target: TARGET_NAMES[m.target] || `UNKNOWN(${m.target})`,
        mpReq: m.mpReq || 0,
        canSuper: !!m.canSuper,
        hit: m.hit || '',
        miss: m.miss || '',
      }));

    return {
      index: idx,
      fullName: c.fullName,
      senshiId: c.senshiId,
      hp: c.hp,
      mp: c.mp,
      physStr: c.physStr,
      magStr: c.magStr,
      physDef: c.physDef,
      magDef: c.magDef,
      speed: c.speed,
      weakTo: ELEMENT_NAMES[c.weakTo] || `UNKNOWN(${c.weakTo})`,
      resist: ELEMENT_NAMES[c.resist] || `UNKNOWN(${c.resist})`,
      moveCount: moves.length,
      moves,
      hasPortrait: true, // we'll check in the agent
      portraitPath: `client/img/chars/${idx}.png`,
    };
  });

  const outPath = join(__dirname, '..', 'test', 'audit-characters.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Exported ${output.length} characters to ${outPath}`);

  // Also export a quick summary for the agents
  const summaryPath = join(__dirname, '..', 'test', 'audit-summary.txt');
  let summary = `ChUB 2000 Character Audit — ${output.length} characters\n\n`;
  for (const c of output) {
    summary += `[${c.index}] ${c.fullName} — HP:${c.hp} MP:${c.mp} PS:${c.physStr} MS:${c.magStr} PD:${c.physDef} MD:${c.magDef} SPD:${c.speed} — ${c.moveCount} moves — Weak:${c.weakTo} Resist:${c.resist}\n`;
    for (const m of c.moves) {
      summary += `    ${m.cmdKey}: "${m.name}" [${m.element} str:${m.strength} mp:${m.mpReq} tgt:${m.target}${m.canSuper ? ' SUPER' : ''}]\n`;
      if (m.hit) summary += `      hit: ${m.hit.slice(0, 100)}\n`;
    }
    summary += '\n';
  }
  writeFileSync(summaryPath, summary);
  console.log(`Exported summary to ${summaryPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
