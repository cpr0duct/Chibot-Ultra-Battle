/**
 * Calculate MP requirement for a move at load time.
 *
 * In the original VB6 ChUB 2000, MPReq was computed by CalcMP() when
 * loading characters from disk — it is NOT stored in the .CH2 file format.
 * This module provides the equivalent calculation for the web port.
 *
 * Called automatically by the dataset loader after parsing each character.
 */

import { ELEMENT } from './constants.js';

/**
 * Compute mpReq for a single move based on its element and strength.
 *
 * Rules (checked in priority order):
 * - LIFE (revive) moves: flat 30 MP (even with str=0)
 * - NO_DMG (status-only) moves: 5 per active status effect, min 5 (even with str=0)
 * - Other moves with str=0: free
 * - HEAL moves: max(10, floor(strength / 5))
 * - Damage moves with str > 50: max(5, floor(strength / 10))
 * - Everything else: 0 (free)
 *
 * @param {object} move  A move object with element, strength, cmdKey, status
 * @returns {number} The computed MP cost
 */
export function calcMpReq(move) {
  if (!move.cmdKey) return 0;

  const el = move.element;
  const str = move.strength;

  // LIFE element (revive) always costs 30 MP regardless of strength
  if (el === ELEMENT.LIFE) return 30;

  // Status-only moves (NO_DMG) — cost based on how many status effects applied
  if (el === ELEMENT.NO_DMG) {
    const statusCount = move.status ? move.status.filter(s => s !== 0).length : 0;
    return statusCount > 0 ? Math.max(5, statusCount * 5) : 0;
  }

  // Moves with 0 strength (other than LIFE and NO_DMG above) are free
  if (str === 0) return 0;

  // HEAL element: mpReq = max(10, floor(str / 5))
  if (el === ELEMENT.HEAL) {
    return Math.max(10, Math.floor(str / 5));
  }

  // Damage moves with significant strength
  if (str > 50) {
    return Math.max(5, Math.floor(str / 10));
  }

  return 0;
}

/**
 * Apply mpReq calculation to all moves of a character.
 * Called after parsing a .CH2 file.
 *
 * @param {object} character  A character object with a moves[] array
 */
export function applyMpReq(character) {
  if (!character.moves) return;
  for (const move of character.moves) {
    if (!move || !move.cmdKey) continue;
    move.mpReq = calcMpReq(move);
  }

  // Calculate maxMp if not set — MP isn't stored in .CH2 files.
  // Base MP pool = 50 + magStr * 2 (so a magStr:50 character has 150 MP).
  // This gives enough MP to cast several spells per battle without infinite sustain.
  if (!character.maxMp || character.maxMp === 0) {
    const magStr = character.magStr || 0;
    character.maxMp = 50 + magStr * 2;
  }
}
