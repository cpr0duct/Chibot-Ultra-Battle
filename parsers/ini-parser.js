/**
 * Parser for .INI dataset files (ChUB 2000 dataset configuration).
 *
 * The INI file defines a dataset: game event messages, file glob patterns
 * for loading characters/items/arenas/weapons, and optional death/fatality
 * announcement strings.
 *
 * Format (from DATASET.BAS InitFromDisk):
 *   Lines 1-7:   Quoted message strings (pre-[more] block)
 *   Line 8:      [more] marker
 *   Lines 9-48:  Quoted message strings (post-[more] block, 40 strings)
 *   Remaining:   Bare glob patterns (e.g. smeb\*.*) until [Death] or EOF
 *   [Death]:     Optional section with quoted death announcement strings
 *   [Fatality]:  Optional section with quoted fatality announcement strings
 *
 * Authoritative reference: ChiSource/DATASET.BAS — InitFromDisk
 */

import { stripQuotes } from './string-vars.js';

// ── Message field names in order ──────────────────────────────────────────
// These correspond to DATASET.* fields read by VB6 Input # statements.

/** 7 fields read before [more] */
const PRE_MORE_FIELDS = [
  'loadStr',        // Dataset display name
  'beginSelect',    // Entries open announcement
  'endSelect',      // Entries closed announcement
  'battleBegin',    // Battle started
  'battlePause',    // Battle paused
  'battleUnPause',  // Battle unpaused
  'battleEnd',      // Battle over
];

/** 40 fields read after [more] */
const POST_MORE_FIELDS = [
  'clearChars',      // Characters cleared
  'charsNotCleared', // Characters not cleared
  'gameAborted',     // Game aborted by host
  'acceptDefects',   // SN accepts defects
  'declineDefects',  // SN declines defects
  'wantDraw',        // SN votes for draw
  'dontWantDraw',    // SN votes no draw
  'unMorphMsg',      // Revert to original form
  'goCharge',        // Continue charging
  'counter',         // Counter (ignored line)
  'fleeFail',        // Flee attempt failed
  'noGetItem',       // Nothing to get
  'hpDivert',        // HP divert to super meter
  'notEnoughMP',     // Not enough MP (ignored line)
  'allDead',         // Drawn game: mutual annihilation
  'draw',            // Drawn game: agreement
  'x1HrLeft',       // 1 hour remaining
  'x30MinsLeft',    // 30 minutes remaining
  'x20MinsLeft',    // 20 minutes remaining
  'x10MinsLeft',    // 10 minutes remaining
  'x5MinsLeft',     // 5 minutes remaining
  'x2MinsLeft',     // 2-minute warning
  'suddenDeath',    // Sudden death
  'x1MinsLeft',     // 1 minute remaining
  'x30SecsLeft',    // 30 seconds remaining
  'x15SecsLeft',    // 15 seconds remaining
  'x5SecsLeft',     // 5 seconds remaining
  'timeExpired',    // Time expired
  'beatYouma',      // You have won
  'youLose',        // You lose
  'respawn',        // Respawn message
  'beginVote',      // Voting start
  'commieVote',     // (ignored line)
  'remove',         // Player removes self
  'random',         // Random character selection
  'taken',          // Character already taken
  'defectSucc',     // Successful defect
  'defectFail',     // Failed defect
  'fleeAttempt',    // Flee attempt start
  'superKill',      // Super kill banner
];

/** All message field names in order */
export const MESSAGE_FIELDS = [...PRE_MORE_FIELDS, ...POST_MORE_FIELDS];

// ── Helpers ───────────────────────────────────────────────────────────────

function splitLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function isQuotedLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"');
}

// ── Parse ─────────────────────────────────────────────────────────────────

/**
 * Parse a .INI dataset file.
 *
 * @param {string} content  File content
 * @returns {{ messages: Object<string,string>, globs: string[], deathStrings: string[], fatalityStrings: string[] }}
 */
export function parseIni(content) {
  const lines = splitLines(content);
  const messages = {};
  const globs = [];
  const deathStrings = [];
  const fatalityStrings = [];

  let i = 0;

  // ── Section 1a: Pre-[more] messages (7 quoted strings) ────────────────
  for (const field of PRE_MORE_FIELDS) {
    if (i >= lines.length) break;
    messages[field] = stripQuotes(lines[i]);
    i++;
  }

  // ── [more] marker ─────────────────────────────────────────────────────
  if (i < lines.length && lines[i].trim().toLowerCase() === '[more]') {
    i++;
  }

  // ── Section 1b: Post-[more] messages (40 quoted strings) ──────────────
  for (const field of POST_MORE_FIELDS) {
    if (i >= lines.length) break;
    messages[field] = stripQuotes(lines[i]);
    i++;
  }

  // ── Section 2: Glob patterns & special sections ───────────────────────
  let currentSection = 'globs'; // 'globs' | 'death' | 'fatality'

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '') continue;

    const lower = line.toLowerCase();
    if (lower === '[death]') {
      currentSection = 'death';
      continue;
    }
    if (lower === '[fatality]') {
      currentSection = 'fatality';
      continue;
    }

    switch (currentSection) {
      case 'globs':
        globs.push(line);
        break;
      case 'death':
        deathStrings.push(stripQuotes(line));
        break;
      case 'fatality':
        fatalityStrings.push(stripQuotes(line));
        break;
    }
  }

  return { messages, globs, deathStrings, fatalityStrings };
}

// ── Serialize ─────────────────────────────────────────────────────────────

/**
 * Serialize a dataset object back to .INI file content.
 *
 * @param {{ messages: Object<string,string>, globs: string[], deathStrings: string[], fatalityStrings: string[] }} dataset
 * @returns {string}  File content
 */
export function serializeIni(dataset) {
  const out = [];
  const msgs = dataset.messages || {};

  // Pre-[more] messages
  for (const field of PRE_MORE_FIELDS) {
    out.push(`"${msgs[field] ?? ''}"`);
  }

  out.push('[more]');

  // Post-[more] messages
  for (const field of POST_MORE_FIELDS) {
    out.push(`"${msgs[field] ?? ''}"`);
  }

  // Glob patterns (bare lines)
  for (const glob of (dataset.globs || [])) {
    out.push(glob);
  }

  // Death section
  if (dataset.deathStrings && dataset.deathStrings.length > 0) {
    out.push('[Death]');
    for (const s of dataset.deathStrings) {
      out.push(`"${s}"`);
    }
  }

  // Fatality section
  if (dataset.fatalityStrings && dataset.fatalityStrings.length > 0) {
    out.push('[Fatality]');
    for (const s of dataset.fatalityStrings) {
      out.push(`"${s}"`);
    }
  }

  return out.join('\n');
}
