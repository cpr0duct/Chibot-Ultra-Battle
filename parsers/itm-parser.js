/**
 * Parser for .ITM item files (ChUB 2000).
 *
 * The file is line-oriented, written by the VB6 Item Editor (FITEMED.FRM)
 * and read by DATASET.BAS `LoadItem`.
 *
 * Format (33 lines):
 *   "Name"            (quoted string)
 *   "Spawn"           (quoted string)
 *   "Telefrag"        (quoted string)
 *   "PlayerGet"       (quoted string — %SN for player name)
 *   "YoumaGet"        (quoted string — %Y for youma name)
 *   PlayerHP          (integer)
 *   PlayerMP          (integer)
 *   26 status values  (integers, % chance — see STATUS_FILE_ORDER below)
 *
 * Authoritative references:
 *   - ChiSource/DATASET.BAS  LoadItem
 *   - ChiSource_fetched/FITEMED.FRM  (item editor)
 *   - test/fixtures/CURE.ITM
 */

import { createItem } from '../engine/types.js';
import { STATUS } from '../engine/constants.js';
import { stripQuotes } from './string-vars.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split file content into lines.
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

// ── Status field order in .ITM files ──────────────────────────────────────
//
// The 26 status values in the file map to status array indices as follows.
// This order comes from DATASET.BAS LoadItem and the FITEMED.FRM editor.
// Two positions (indices 12-13 in file order) are padding/discarded values
// that the game reads into a throwaway variable (Rx).

const STATUS_FILE_ORDER = [
  STATUS.MUTE,        //  0 — Mute
  STATUS.CHAOS,       //  1 — Chaos
  STATUS.FREEZE,      //  2 — Freeze
  STATUS.SLEEP,       //  3 — Sleep
  STATUS.POISON,      //  4 — Poison
  STATUS.BLIND,       //  5 — Blind
  STATUS.CURSE,       //  6 — Curse
  STATUS.HASTE,       //  7 — Haste
  STATUS.BARRIER,     //  8 — Barrier
  STATUS.BLESS,       //  9 — Bless
  STATUS.SLOW,        // 10 — Slow
  STATUS.STUN,        // 11 — Stun
  null,               // 12 — discarded (Rx padding)
  null,               // 13 — discarded (Rx padding)
  STATUS.STOP,        // 14 — Stop
  STATUS.M_BARRIER,   // 15 — MBarrier
  STATUS.RERAISE,     // 16 — Reraise / Life3
  STATUS.QUICK,       // 17 — Quick
  STATUS.REGEN,       // 18 — Regen
  STATUS.MUSHROOM,    // 19 — Mushroom
  STATUS.MIA,         // 20 — MIA
  STATUS.BERSERK,     // 21 — Berserk
  STATUS.SCARECROW,   // 22 — Scarecrow  (not read by game LoadItem)
  STATUS.CHARM,       // 23 — Charm      (not read by game LoadItem)
  STATUS.CPU_WAIT,    // 24 — R1         (not read by game LoadItem)
  STATUS.HIT_RATE,    // 25 — R2         (not read by game LoadItem)
];

// ── Parse ──────────────────────────────────────────────────────────────────

/**
 * Parse a .ITM file into an item object matching createItem() shape.
 *
 * @param {string} content — raw file content
 * @returns {object} item matching createItem() shape
 */
export function parseItm(content) {
  const lines = splitLines(content);
  const cursor = { pos: 0 };
  const item = createItem();

  // ── Strings ───────────────────────────────────────────────────────────
  item.name        = readString(lines, cursor);  // 1
  item.spawnStr    = readString(lines, cursor);  // 2
  item.telefragStr = readString(lines, cursor);  // 3
  item.playerGet   = readString(lines, cursor);  // 4
  item.youmaGet    = readString(lines, cursor);  // 5

  // ── HP / MP ───────────────────────────────────────────────────────────
  item.playerHp = readInt(lines, cursor);        // 6
  item.playerMp = readInt(lines, cursor);        // 7

  // ── Status effects (26 values) ────────────────────────────────────────
  for (let i = 0; i < STATUS_FILE_ORDER.length; i++) {
    const val = readInt(lines, cursor);
    const idx = STATUS_FILE_ORDER[i];
    if (idx !== null) {
      item.playerStat[idx] = val;
    }
    // null indices are discarded padding
  }

  return item;
}

// ── Serialize ──────────────────────────────────────────────────────────────

/**
 * Serialize an item object back to .ITM file content.
 * Produces the format expected by DATASET.BAS LoadItem.
 *
 * @param {object} item — item matching createItem() shape
 * @returns {string} file content
 */
export function serializeItm(item) {
  const out = [];

  // ── Strings ───────────────────────────────────────────────────────────
  out.push(writeString(item.name));
  out.push(writeString(item.spawnStr));
  out.push(writeString(item.telefragStr));
  out.push(writeString(item.playerGet));
  out.push(writeString(item.youmaGet));

  // ── HP / MP ───────────────────────────────────────────────────────────
  out.push(writeInt(item.playerHp));
  out.push(writeInt(item.playerMp));

  // ── Status effects (26 values) ────────────────────────────────────────
  const s = item.playerStat;
  for (let i = 0; i < STATUS_FILE_ORDER.length; i++) {
    const idx = STATUS_FILE_ORDER[i];
    out.push(writeInt(idx !== null ? s[idx] : 0));
  }

  return out.join('\n');
}
