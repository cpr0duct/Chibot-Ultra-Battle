/**
 * Generate .CH2 character files for the Undertale roster.
 *
 * Usage:  node scripts/create-undertale.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// We can't import ESM directly from a script easily, so we'll inline the
// serialisation logic matching serializeCh2 from parsers/ch2-parser.js.

const MAX_MOVES = 12;
const MAX_STATUS = 32;

function writeString(value) {
  return `"${value ?? ''}"`;
}
function writeInt(value) {
  return `${value ?? 0}`;
}

function createEmptyMove() {
  return {
    name: '',
    cmdKey: '',
    canSuper: 0,
    beginAttack: '',
    beginSuperAttack: '',
    beginHealSelf: '',
    hit: '',
    superHit: '',
    maxSuperHits: 0,
    healSelf: '',
    critHit: '',
    healMeld: '',
    miss: '',
    superMiss: '',
    status: new Array(MAX_STATUS + 1).fill(0),
    element: 0,
    strength: 0,
    target: 2, // TARGET.ENEMY
  };
}

/**
 * Build a full character object from a roster entry.
 */
function buildCharacter(entry) {
  // Build moves array, pad to 12
  const moves = [];
  for (let i = 0; i < MAX_MOVES; i++) {
    if (entry.moves && entry.moves[i]) {
      const src = entry.moves[i];
      const m = createEmptyMove();
      m.name = src.name || '';
      m.cmdKey = src.cmdKey || '';
      m.canSuper = src.canSuper || 0;
      m.beginAttack = src.beginAttack || '';
      m.beginSuperAttack = src.beginSuperAttack || '';
      m.beginHealSelf = src.beginHealSelf || '';
      m.hit = src.hit || '';
      m.superHit = src.superHit || '';
      m.maxSuperHits = src.maxSuperHits || 0;
      m.healSelf = src.healSelf || '';
      m.critHit = src.critHit || '';
      m.healMeld = src.healMeld || '';
      m.miss = src.miss || '';
      m.superMiss = src.superMiss || '';
      m.element = src.element || 0;
      m.strength = src.strength || 0;
      m.target = src.target != null ? src.target : 2;
      // status stays all zeros unless specified
      if (src.status) {
        for (const [k, v] of Object.entries(src.status)) {
          m.status[Number(k)] = v;
        }
      }
      moves.push(m);
    } else {
      moves.push(createEmptyMove());
    }
  }

  // Generate Undertale-themed death strings
  const deathStr = [
    `${entry.fullName}'s HP dropped to 0. Their SOUL shatters...`,
    `${entry.fullName} has been struck down!`,
    `${entry.fullName} falls... but their memory remains.`,
    `${entry.fullName} can't hold on any longer...`,
    `${entry.fullName} fades away...`,
  ];

  // Generate Undertale-themed kill strings
  const killStr = [
    `${entry.fullName} strikes the final blow!`,
    `${entry.fullName} finishes the job! No mercy!`,
    `${entry.fullName} wins! +EXP!`,
    `${entry.fullName} is VICTORIOUS!`,
    `${entry.fullName} delivers the finishing strike!`,
  ];

  // Description lines (up to 4)
  const desc = ['', '', '', ''];
  if (entry.description) {
    // Split description into ~60 char lines for the 4 desc slots
    const words = entry.description.split(' ');
    let line = 0;
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > 60 && current.length > 0) {
        desc[line] = current;
        line++;
        if (line >= 4) break;
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (line < 4) desc[line] = current;
  }

  // Taunts (5) — pad if needed
  const taunts = ['', '', '', '', ''];
  if (entry.taunts) {
    for (let i = 0; i < 5; i++) {
      taunts[i] = entry.taunts[i] || '';
    }
  }

  // Fatality
  const fatality = {
    cmdKey: (entry.fatality && entry.fatality.cmdKey) || '',
    preFatal: (entry.fatality && entry.fatality.preFatal) || '',
    fatalMove: (entry.fatality && entry.fatality.fatalMove) || '',
  };

  return {
    fullName: entry.fullName || '',
    senshiId: entry.senshiId || '',
    weakTo: entry.weakTo || 0,
    resist: entry.resist || 0,
    pickMe: `Pick ${entry.fullName}!`,
    selectStr: `${entry.fullName} enters the battle!`,
    selectJoin: `${entry.fullName} joins the fight!`,
    physStr: entry.physStr || 0,
    physDef: entry.physDef || 0,
    magStr: entry.magStr || 0,
    magDef: entry.magDef || 0,
    blockYes: entry.blockYes || 'The block succeeds!',
    rest: entry.rest || `${entry.fullName} rests.`,
    block: entry.block || `${entry.fullName} blocks!`,
    blockFail: entry.blockFail || 'The block fails!',
    taunts,
    fatality,
    moves,
    deathStr,
    killStr,
    desc,
  };
}

/**
 * Serialize a character object to .CH2 format.
 * Mirrors serializeCh2 from parsers/ch2-parser.js exactly.
 */
function serializeCh2(ch) {
  const out = [];

  // Identity
  out.push(writeString(ch.fullName));
  out.push(writeString(ch.senshiId));

  // Rx = resist*100 + weakTo
  const rx = (ch.resist || 0) * 100 + (ch.weakTo || 0);
  out.push(writeInt(rx));

  out.push(writeString(ch.pickMe));
  out.push(writeString(ch.selectStr));
  out.push(writeString(ch.selectJoin));

  // Stats
  out.push(writeInt(ch.physStr));
  out.push(writeInt(ch.physDef));
  out.push(writeInt(ch.magStr));
  out.push(writeInt(ch.magDef));

  // Strings
  out.push(writeString(ch.blockYes));
  out.push(writeString(ch.rest));
  out.push(writeString(ch.block));
  out.push(writeString(ch.blockFail));

  // Taunts (5)
  for (let i = 0; i < 5; i++) {
    out.push(writeString(ch.taunts[i]));
  }

  // Fatality
  out.push(writeString(ch.fatality.cmdKey));
  out.push(writeString(ch.fatality.preFatal));
  out.push(writeString(ch.fatality.fatalMove));

  // Moves (12)
  for (let m = 0; m < MAX_MOVES; m++) {
    const move = ch.moves[m] || createEmptyMove();

    out.push(writeString(move.name));
    out.push(writeString(move.cmdKey));
    out.push(writeInt(move.canSuper));
    out.push(writeString(move.beginAttack));
    out.push(writeString(move.beginSuperAttack));
    out.push(writeString(move.beginHealSelf));
    out.push(writeString(move.hit));
    out.push(writeString(move.superHit));
    out.push(writeInt(move.maxSuperHits));
    out.push(writeString(move.healSelf));
    out.push(writeString(move.critHit));
    out.push(writeString(move.healMeld));
    out.push(writeString(move.miss));

    // Status block (SaveNewChar order)
    const s = move.status;
    out.push(writeInt(s[1]));   // mute
    out.push(writeInt(s[2]));   // chaos
    out.push(writeInt(s[3]));   // freeze
    out.push(writeInt(s[19]));  // sleep
    out.push(writeInt(s[4]));   // poison
    out.push(writeInt(s[5]));   // blind
    out.push(writeInt(0));      // pad (defup)
    out.push(writeInt(s[7]));   // haste
    out.push(writeInt(0));      // pad (attup)
    out.push(writeInt(0));      // pad (DefDn)

    out.push(writeString(move.superMiss));

    out.push(writeInt(s[10]));  // slow
    out.push(writeInt(s[11]));  // stun
    out.push(writeInt(s[12]));  // life3/reraise
    out.push(writeInt(s[13]));  // regen
    out.push(writeInt(s[14]));  // stop
    out.push(writeInt(s[15]));  // mushroom
    out.push(writeInt(s[16]));  // MIA
    out.push(writeInt(s[17]));  // quick
    out.push(writeInt(s[18]));  // berserk
    out.push(writeInt(s[23]));  // barrier
    out.push(writeInt(s[24]));  // mbarrier
    out.push(writeInt(s[26]));  // curse
    out.push(writeInt(s[25]));  // bless
    out.push(writeInt(s[9]));   // scarecrow
    out.push(writeInt(s[27]));  // charm
    out.push(writeInt(s[21]));  // R1 (cpu_wait)
    out.push(writeInt(s[22]));  // R2 (hit_rate)

    out.push(writeInt(move.element));
    out.push(writeInt(move.strength));
    out.push(writeInt(move.target));
  }

  // Trailing sections
  for (let i = 0; i < 5; i++) {
    out.push(writeString(ch.deathStr[i]));
  }
  for (let i = 0; i < 5; i++) {
    out.push(writeString(ch.killStr[i]));
  }
  for (let i = 0; i < 4; i++) {
    out.push(writeString(ch.desc[i]));
  }

  return out.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────

const rosterPath = join(ROOT, 'data', 'undertale-roster.json');
const outDir = join(ROOT, 'data', 'characters', 'undertale');

console.log('Reading roster from', rosterPath);
const roster = JSON.parse(readFileSync(rosterPath, 'utf-8'));

mkdirSync(outDir, { recursive: true });

let count = 0;
for (const entry of roster) {
  const ch = buildCharacter(entry);
  const content = serializeCh2(ch);
  const filename = `${entry.senshiId}.CH2`;
  const outPath = join(outDir, filename);
  writeFileSync(outPath, content, 'utf-8');
  console.log(`  Created ${filename}`);
  count++;
}

console.log(`\nDone! Created ${count} .CH2 files in ${outDir}`);
