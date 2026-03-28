/**
 * Parser for .W2K weapon files (ChUB 2000 format).
 *
 * The file is line-oriented with quoted strings and bare integers,
 * matching the VB6 Write #1 / Print #1 conventions.
 *
 * Format:
 *   "Full Name"
 *   "Short Name"
 *   "Equip String"
 *   "Description"
 *   "Drop String"
 *   charges (integer, 0 = unlimited)
 *   5 × Move blocks (same 44-line format as .CH2 moves)
 */

import { createWeapon, createMove } from '../engine/types.js';
import { stripQuotes } from './string-vars.js';
import { MAX_WEAPON_MOVES } from '../engine/constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function splitLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function nextLine(lines, cursor) {
  if (cursor.pos >= lines.length) return '';
  return lines[cursor.pos++];
}

function readString(lines, cursor) {
  return stripQuotes(nextLine(lines, cursor));
}

function readInt(lines, cursor) {
  const raw = nextLine(lines, cursor).trim();
  if (raw === '' || raw === '""') return 0;
  const stripped = stripQuotes(raw);
  const n = parseInt(stripped, 10);
  return isNaN(n) ? 0 : n;
}

function writeString(value) {
  return `"${value ?? ''}"`;
}

function writeInt(value) {
  return `${value ?? 0}`;
}

// ── Move block read/write (shared with .CH2 format) ──────────────────────

function readMoveBlock(lines, cursor) {
  const move = createMove();

  move.name             = readString(lines, cursor);
  move.cmdKey           = readString(lines, cursor);
  move.canSuper         = readInt(lines, cursor);
  move.beginAttack      = readString(lines, cursor);
  move.beginSuperAttack = readString(lines, cursor);
  move.beginHealSelf    = readString(lines, cursor);
  move.hit              = readString(lines, cursor);
  move.superHit         = readString(lines, cursor);
  move.maxSuperHits     = readInt(lines, cursor);
  move.healSelf         = readString(lines, cursor);
  move.critHit          = readString(lines, cursor);
  move.healMeld         = readString(lines, cursor);
  move.miss             = readString(lines, cursor);

  // Status block (SaveNewChar order)
  move.status[1]  = readInt(lines, cursor);  // mute
  move.status[2]  = readInt(lines, cursor);  // chaos
  move.status[3]  = readInt(lines, cursor);  // freeze
  move.status[19] = readInt(lines, cursor);  // sleep
  move.status[4]  = readInt(lines, cursor);  // poison
  move.status[5]  = readInt(lines, cursor);  // blind
  readInt(lines, cursor);                     // pad (defup)
  move.status[7]  = readInt(lines, cursor);  // haste
  readInt(lines, cursor);                     // pad (attup)
  readInt(lines, cursor);                     // pad (DefDn)

  move.superMiss = readString(lines, cursor);

  move.status[10] = readInt(lines, cursor);  // slow
  move.status[11] = readInt(lines, cursor);  // stun
  move.status[12] = readInt(lines, cursor);  // life3/reraise
  move.status[13] = readInt(lines, cursor);  // regen
  move.status[14] = readInt(lines, cursor);  // stop
  move.status[15] = readInt(lines, cursor);  // mushroom
  move.status[16] = readInt(lines, cursor);  // MIA
  move.status[17] = readInt(lines, cursor);  // quick
  move.status[18] = readInt(lines, cursor);  // berserk
  move.status[23] = readInt(lines, cursor);  // barrier
  move.status[24] = readInt(lines, cursor);  // mbarrier
  move.status[26] = readInt(lines, cursor);  // curse
  move.status[25] = readInt(lines, cursor);  // bless
  move.status[9]  = readInt(lines, cursor);  // scarecrow
  move.status[27] = readInt(lines, cursor);  // charm
  move.status[21] = readInt(lines, cursor);  // R1 (cpu_wait)
  move.status[22] = readInt(lines, cursor);  // R2 (hit_rate)

  move.element   = readInt(lines, cursor);
  move.strength  = readInt(lines, cursor);
  move.target    = readInt(lines, cursor);

  return move;
}

function writeMoveBlock(move, out) {
  move = move || createMove();

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

// ── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse a .W2K file into a weapon object matching createWeapon() shape.
 */
export function parseW2k(content) {
  const lines = splitLines(content);
  const cursor = { pos: 0 };
  const wpn = createWeapon();

  // Header (6 lines)
  wpn.name        = readString(lines, cursor);
  wpn.shortName   = readString(lines, cursor);
  wpn.equipStr    = readString(lines, cursor);
  wpn.description = readString(lines, cursor);
  wpn.dropStr     = readString(lines, cursor);
  wpn.numUses     = readInt(lines, cursor);

  // 5 move blocks
  for (let m = 0; m < MAX_WEAPON_MOVES; m++) {
    wpn.moves[m] = readMoveBlock(lines, cursor);
  }

  return wpn;
}

// ── Serialize ──────────────────────────────────────────────────────────────

/**
 * Serialize a weapon object back to .W2K file content.
 */
export function serializeW2k(weapon) {
  const out = [];

  // Header
  out.push(writeString(weapon.name));
  out.push(writeString(weapon.shortName));
  out.push(writeString(weapon.equipStr));
  out.push(writeString(weapon.description));
  out.push(writeString(weapon.dropStr));
  out.push(writeInt(weapon.numUses));

  // 5 move blocks
  for (let m = 0; m < MAX_WEAPON_MOVES; m++) {
    writeMoveBlock(weapon.moves[m], out);
  }

  return out.join('\n');
}
