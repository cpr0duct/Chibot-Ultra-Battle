/**
 * Parser for .CH2 character files (ChUB 2000 "new" format).
 *
 * The file is line-oriented, written by VB6 `Write #1` (auto-quotes strings)
 * or `Print #1` with explicit Chr$(34) wrapping.  Strings are surrounded by
 * double-quotes; integers are bare numbers.
 *
 * Authoritative references:
 *   - ChiSource/CH1.BAS  SaveNewChar / LoadNewChar
 *   - test/fixtures/CLOUD.CH2
 */

import { createCharacter, createMove } from '../engine/types.js';
import { stripQuotes } from './string-vars.js';
import { MAX_MOVES } from '../engine/constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split file content into trimmed, non-undefined lines.
 * Handles both \r\n and \n line endings.
 */
function splitLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/** Read the next line and advance the cursor. */
function nextLine(lines, cursor) {
  if (cursor.pos >= lines.length) return '';
  return lines[cursor.pos++];
}

/** Read next line as a string (strip surrounding quotes). */
function readString(lines, cursor) {
  return stripQuotes(nextLine(lines, cursor));
}

/** Read next line as an integer. Treats empty / non-numeric as 0. */
function readInt(lines, cursor) {
  const raw = nextLine(lines, cursor).trim();
  if (raw === '' || raw === '""') return 0;
  // Strip quotes if present (some fields encoded as quoted numbers)
  const stripped = stripQuotes(raw);
  const n = parseInt(stripped, 10);
  return isNaN(n) ? 0 : n;
}

/** Write a quoted string line. */
function writeString(value) {
  return `"${value ?? ''}"`;
}

/** Write a bare integer line. */
function writeInt(value) {
  return `${value ?? 0}`;
}

// ── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse a .CH2 file into a character object matching createCharacter() shape.
 *
 * Format (SaveNewChar / CLOUD.CH2):
 *   "FullName"
 *   "SenshiID"
 *   Rx                  (weakTo + resist*100, integer — or "" for 0)
 *   "PickMe"
 *   "SelectStr"
 *   "SelectJoin"
 *   PhysStr
 *   PhysDef
 *   MagStr
 *   MagDef
 *   "BlockYes"
 *   "Rest"
 *   "Block"
 *   "BlockFail"
 *   Taunts 1-5          (quoted strings)
 *   "Fatal.CmdKey"
 *   "Fatal.PreFatal"
 *   "Fatal.FatalMove"
 *   12 × Move blocks    (44 lines each)
 *   DeathStr 1-5        (quoted)
 *   KillStr 1-5         (quoted)
 *   Desc 1-4            (quoted)
 */
export function parseCh2(content) {
  const lines = splitLines(content);
  const cursor = { pos: 0 };
  const ch = createCharacter();

  // ── Identity ───────────────────────────────────────────────────────────
  ch.fullName   = readString(lines, cursor);    // 1
  ch.senshiId   = readString(lines, cursor);    // 2

  // Line 3: Rx = resist*100 + weakTo  (integer, but may be "" for 0)
  const rxRaw = nextLine(lines, cursor);
  const rxStripped = stripQuotes(rxRaw.trim());
  const rx = rxStripped === '' ? 0 : (parseInt(rxStripped, 10) || 0);
  ch.weakTo  = rx % 100;
  ch.resist  = Math.floor((rx - ch.weakTo) / 100);

  ch.pickMe     = readString(lines, cursor);    // 4
  ch.selectStr  = readString(lines, cursor);    // 5
  ch.selectJoin = readString(lines, cursor);    // 6

  // ── Stats ──────────────────────────────────────────────────────────────
  ch.physStr = readInt(lines, cursor);           // 7
  ch.physDef = readInt(lines, cursor);           // 8
  ch.magStr  = readInt(lines, cursor);           // 9
  ch.magDef  = readInt(lines, cursor);           // 10

  // ── Strings ────────────────────────────────────────────────────────────
  ch.blockYes  = readString(lines, cursor);      // 11
  ch.rest      = readString(lines, cursor);      // 12
  ch.block     = readString(lines, cursor);      // 13
  ch.blockFail = readString(lines, cursor);      // 14

  // Taunts (5)
  for (let i = 0; i < 5; i++) {
    ch.taunts[i] = readString(lines, cursor);    // 15-19
  }

  // ── Fatality ───────────────────────────────────────────────────────────
  ch.fatality.cmdKey    = readString(lines, cursor);  // 20
  ch.fatality.preFatal  = readString(lines, cursor);  // 21
  ch.fatality.fatalMove = readString(lines, cursor);  // 22

  // ── Moves (12 blocks, 44 lines each) ───────────────────────────────────
  for (let m = 0; m < MAX_MOVES; m++) {
    const move = createMove();

    move.name             = readString(lines, cursor);
    move.cmdKey           = readString(lines, cursor);
    move.canSuper         = readInt(lines, cursor);
    move.beginAttack      = readString(lines, cursor);
    move.beginSuperAttack = readString(lines, cursor);
    move.beginHealSelf    = readString(lines, cursor);
    move.hit              = readString(lines, cursor);
    move.superHit         = readString(lines, cursor);
    move.maxSuperHits     = readInt(lines, cursor);     // always 0 in SaveNewChar
    move.healSelf         = readString(lines, cursor);
    move.critHit          = readString(lines, cursor);
    move.healMeld         = readString(lines, cursor);
    move.miss             = readString(lines, cursor);

    // Status block (matches SaveNewChar order):
    // mute, chaos, freeze, sleep, poison, blind, pad(0), haste, pad(0), pad(0)
    move.status[1]  = readInt(lines, cursor);  // mute
    move.status[2]  = readInt(lines, cursor);  // chaos
    move.status[3]  = readInt(lines, cursor);  // freeze
    move.status[19] = readInt(lines, cursor);  // sleep (VB6 Status.sleep)
    move.status[4]  = readInt(lines, cursor);  // poison
    move.status[5]  = readInt(lines, cursor);  // blind
    readInt(lines, cursor);                     // pad (defup) — discarded
    move.status[7]  = readInt(lines, cursor);  // haste
    readInt(lines, cursor);                     // pad (attup) — discarded
    readInt(lines, cursor);                     // pad (DefDn) — discarded

    // SuperMiss (string)
    move.superMiss = readString(lines, cursor);

    // More status
    move.status[10] = readInt(lines, cursor);  // slow
    move.status[11] = readInt(lines, cursor);  // stun
    move.status[12] = readInt(lines, cursor);  // life3 / reraise
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

    ch.moves[m] = move;
  }

  // ── Trailing optional sections ─────────────────────────────────────────
  // DeathStr (5), KillStr (5), Desc (4) — may be absent
  for (let i = 0; i < 5; i++) {
    if (cursor.pos < lines.length) {
      ch.deathStr[i] = readString(lines, cursor);
    }
  }
  for (let i = 0; i < 5; i++) {
    if (cursor.pos < lines.length) {
      ch.killStr[i] = readString(lines, cursor);
    }
  }
  for (let i = 0; i < 4; i++) {
    if (cursor.pos < lines.length) {
      ch.desc[i] = readString(lines, cursor);
    }
  }

  return ch;
}

// ── Serialize ──────────────────────────────────────────────────────────────

/**
 * Serialize a character object back to .CH2 file content.
 * Produces the SaveNewChar format (VB6 Write #1).
 */
export function serializeCh2(ch) {
  const out = [];

  // ── Identity ───────────────────────────────────────────────────────────
  out.push(writeString(ch.fullName));
  out.push(writeString(ch.senshiId));

  // Rx = resist*100 + weakTo
  const rx = (ch.resist || 0) * 100 + (ch.weakTo || 0);
  out.push(writeInt(rx));

  out.push(writeString(ch.pickMe));
  out.push(writeString(ch.selectStr));
  out.push(writeString(ch.selectJoin));

  // ── Stats ──────────────────────────────────────────────────────────────
  out.push(writeInt(ch.physStr));
  out.push(writeInt(ch.physDef));
  out.push(writeInt(ch.magStr));
  out.push(writeInt(ch.magDef));

  // ── Strings ────────────────────────────────────────────────────────────
  out.push(writeString(ch.blockYes));
  out.push(writeString(ch.rest));
  out.push(writeString(ch.block));
  out.push(writeString(ch.blockFail));

  // Taunts (5)
  for (let i = 0; i < 5; i++) {
    out.push(writeString(ch.taunts[i]));
  }

  // ── Fatality ───────────────────────────────────────────────────────────
  out.push(writeString(ch.fatality.cmdKey));
  out.push(writeString(ch.fatality.preFatal));
  out.push(writeString(ch.fatality.fatalMove));

  // ── Moves ──────────────────────────────────────────────────────────────
  for (let m = 0; m < MAX_MOVES; m++) {
    const move = ch.moves[m] || createMove();

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

  // ── Trailing sections ──────────────────────────────────────────────────
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
