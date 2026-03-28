/**
 * Parser for .AN2 arena files (ChUB 2000 "new" arena format).
 *
 * The file is line-oriented, written by VB6 `Write #2` (auto-quotes strings).
 * Strings are surrounded by double-quotes; numbers are bare.
 *
 * Authoritative references:
 *   - ChiSource/ARENA1.BAS  SaveNewArena / LoadNewArena
 *   - test/fixtures/0.an2   (Grassy Field)
 *
 * File layout (LoadNewArena):
 *   "Name"                         (1 quoted string)
 *   "Desc(1)" .. "Desc(10)"       (10 quoted strings)
 *   AllAttacks                     (1 number — global multiplier)
 *   Effect(1) .. Effect(30)        (30 numbers — per-element multipliers)
 *   RestLowHP, RestHighHP          (2 ints)
 *   RestLowMP, RestHighMP          (2 ints)
 *   GradualHP, GradualMP           (2 ints)
 *   Per event (up to 10):
 *     "Name"                       (quoted — empty string = unused slot)
 *     Frequency                    (int)
 *     ElementStr (hpDamage)        (int)
 *     "Hit"                        (quoted)
 *     "Miss"                       (quoted)
 *     HitsAll                      (int, 0 or 1)
 */

import { createArena, createArenaEvent } from '../engine/types.js';
import { stripQuotes } from './string-vars.js';
import {
  MAX_ARENA_DESCRIPTION_LINES,
  MAX_ARENA_ELEMENTS,
} from '../engine/constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Split file content into lines. Handles \r\n and \n. */
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

/** Read next line as a float. Treats empty / non-numeric as 0. */
function readFloat(lines, cursor) {
  const raw = nextLine(lines, cursor).trim();
  if (raw === '' || raw === '""') return 0;
  const stripped = stripQuotes(raw);
  const n = parseFloat(stripped);
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
 * Parse a .AN2 file into an arena object matching createArena() shape.
 *
 * elements[0] = AllAttacks (global multiplier on all attacks)
 * elements[1..30] = per-element multipliers (Effect(1)..Effect(30))
 */
export function parseAn2(content) {
  const lines = splitLines(content);
  const cursor = { pos: 0 };
  const arena = createArena();

  // Name
  arena.name = readString(lines, cursor);

  // Description (10 lines)
  for (let i = 0; i < MAX_ARENA_DESCRIPTION_LINES; i++) {
    arena.description[i] = readString(lines, cursor);
  }

  // AllAttacks (elements[0])
  arena.elements[0] = readFloat(lines, cursor);

  // Effect(1..30) -> elements[1..30]
  for (let i = 1; i < MAX_ARENA_ELEMENTS; i++) {
    arena.elements[i] = readFloat(lines, cursor);
  }

  // Restoration values
  arena.restLowHp = readInt(lines, cursor);
  arena.restHighHp = readInt(lines, cursor);
  arena.restLowMp = readInt(lines, cursor);
  arena.restHighMp = readInt(lines, cursor);
  arena.hpPerSecond = readInt(lines, cursor);
  arena.mpPerSecond = readInt(lines, cursor);

  // Events (up to 10, each 6 lines in .AN2 format)
  const MAX_FILE_EVENTS = 10;
  for (let i = 0; i < MAX_FILE_EVENTS; i++) {
    const evt = createArenaEvent();
    evt.name = readString(lines, cursor);
    evt.frequency = readInt(lines, cursor);
    evt.hpDamage = readInt(lines, cursor);
    evt.hitStr = readString(lines, cursor);
    evt.missStr = readString(lines, cursor);
    evt.hitsAll = readInt(lines, cursor) !== 0;
    arena.events[i] = evt;
  }

  return arena;
}

// ── Serialize ──────────────────────────────────────────────────────────────

/**
 * Serialize an arena object back to .AN2 file content.
 * Produces the SaveNewArena format (VB6 Write #2).
 */
export function serializeAn2(arena) {
  const out = [];

  // Name
  out.push(writeString(arena.name));

  // Description (10 lines)
  for (let i = 0; i < MAX_ARENA_DESCRIPTION_LINES; i++) {
    out.push(writeString(arena.description[i]));
  }

  // AllAttacks (elements[0])
  out.push(writeInt(arena.elements[0]));

  // Effect(1..30) -> elements[1..30]
  for (let i = 1; i < MAX_ARENA_ELEMENTS; i++) {
    out.push(writeInt(arena.elements[i]));
  }

  // Restoration values
  out.push(writeInt(arena.restLowHp));
  out.push(writeInt(arena.restHighHp));
  out.push(writeInt(arena.restLowMp));
  out.push(writeInt(arena.restHighMp));
  out.push(writeInt(arena.hpPerSecond));
  out.push(writeInt(arena.mpPerSecond));

  // Events (10 slots)
  const MAX_FILE_EVENTS = 10;
  for (let i = 0; i < MAX_FILE_EVENTS; i++) {
    const evt = arena.events[i] || createArenaEvent();
    out.push(writeString(evt.name));
    out.push(writeInt(evt.frequency));
    out.push(writeInt(evt.hpDamage));
    out.push(writeString(evt.hitStr));
    out.push(writeString(evt.missStr));
    out.push(writeInt(evt.hitsAll ? 1 : 0));
  }

  return out.join('\n');
}
