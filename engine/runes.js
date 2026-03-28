/**
 * Rune system — passive rune effects applied at battle start.
 * Ported from VB6 rune logic.
 */

import { STATUS } from './constants.js';
import { applyStatus } from './status.js';

// ── Rune IDs ──────────────────────────────────────────────────────────────

export const RUNE_ID = Object.freeze({
  NONE:          0,
  HASTE:         1,
  MAGIC:         2,
  ARMOR:         3,
  COUNTER:       4,
  LUCK:          5,
  SURVIVAL:      6,
  THORNS:        7,
  COUNTER_GUARD: 8,
  STEALTH:       9,
  PRE:          10,
  SUMMONING:    11,
});

// ── Rune Names ────────────────────────────────────────────────────────────

export const RUNE_NAMES = Object.freeze({
  [RUNE_ID.NONE]:          'None',
  [RUNE_ID.HASTE]:         'Haste',
  [RUNE_ID.MAGIC]:         'Magic',
  [RUNE_ID.ARMOR]:         'Armor',
  [RUNE_ID.COUNTER]:       'Counter',
  [RUNE_ID.LUCK]:          'Luck',
  [RUNE_ID.SURVIVAL]:      'Survival',
  [RUNE_ID.THORNS]:        'Thorns',
  [RUNE_ID.COUNTER_GUARD]: 'Counter Guard',
  [RUNE_ID.STEALTH]:       'Stealth',
  [RUNE_ID.PRE]:           'Pre-emptive',
  [RUNE_ID.SUMMONING]:     'Summoning',
});

// ── Rune Descriptions ─────────────────────────────────────────────────────

const RUNE_DESCRIPTIONS = Object.freeze({
  [RUNE_ID.NONE]:          'No rune equipped.',
  [RUNE_ID.HASTE]:         'Grants Haste status at the start of battle.',
  [RUNE_ID.MAGIC]:         'Boosts magic damage by 25%.',
  [RUNE_ID.ARMOR]:         'Reduces incoming physical damage by 25%.',
  [RUNE_ID.COUNTER]:       'Chance to counter-attack when hit.',
  [RUNE_ID.LUCK]:          'Increases critical hit chance.',
  [RUNE_ID.SURVIVAL]:      'Survive a killing blow with 1 HP once per battle.',
  [RUNE_ID.THORNS]:        'Reflect 25% of physical damage taken back to attacker.',
  [RUNE_ID.COUNTER_GUARD]: 'Chance to block and counter physical attacks.',
  [RUNE_ID.STEALTH]:       'Start battle with MIA status.',
  [RUNE_ID.PRE]:           'Get a free action before the battle begins.',
  [RUNE_ID.SUMMONING]:     'Reduces summoning charge time.',
});

// ── applyRuneEffect ───────────────────────────────────────────────────────

/**
 * Apply the passive effect of a rune when battle starts.
 *
 * @param {object} player - A player object (createPlayer shape)
 * @param {number} runeId - RUNE_ID.* constant
 * @param {number} [gameTime] - Current game time for status application
 */
export function applyRuneEffect(player, runeId, gameTime = 0) {
  player.rune = runeId;

  switch (runeId) {
    case RUNE_ID.HASTE:
      applyStatus(player, STATUS.HASTE, 1, gameTime);
      break;
    case RUNE_ID.MAGIC:
      player.runeTemp = RUNE_ID.MAGIC;
      break;
    case RUNE_ID.ARMOR:
      player.runeTemp = RUNE_ID.ARMOR;
      break;
    case RUNE_ID.COUNTER:
      player.runeTemp = RUNE_ID.COUNTER;
      break;
    case RUNE_ID.LUCK:
      player.runeTemp = RUNE_ID.LUCK;
      break;
    case RUNE_ID.SURVIVAL:
      player.runeTemp = RUNE_ID.SURVIVAL;
      break;
    case RUNE_ID.THORNS:
      player.runeTemp = RUNE_ID.THORNS;
      break;
    case RUNE_ID.COUNTER_GUARD:
      player.runeTemp = RUNE_ID.COUNTER_GUARD;
      break;
    case RUNE_ID.STEALTH:
      applyStatus(player, STATUS.MIA, 1, gameTime);
      break;
    case RUNE_ID.PRE:
      applyStatus(player, STATUS.QUICK, 1, gameTime);
      break;
    case RUNE_ID.SUMMONING:
      player.runeTemp = RUNE_ID.SUMMONING;
      break;
    default:
      break;
  }
}

// ── getRuneDamageModifier ─────────────────────────────────────────────────

/**
 * Returns a damage multiplier from the player's rune.
 * Magic rune boosts magic damage. Armor rune reduces incoming physical.
 *
 * @param {object}  player     - A player object
 * @param {boolean} isPhysical - Whether the damage is physical
 * @param {boolean} [isIncoming] - Whether this is incoming damage (defense)
 * @returns {number} Damage multiplier (1.0 = no change)
 */
export function getRuneDamageModifier(player, isPhysical, isIncoming = false) {
  if (isIncoming) {
    // Armor rune reduces incoming physical damage by 25%
    if (player.rune === RUNE_ID.ARMOR && isPhysical) {
      return 0.75;
    }
    return 1.0;
  }

  // Outgoing: Magic rune boosts magic (non-physical) damage by 25%
  if (player.rune === RUNE_ID.MAGIC && !isPhysical) {
    return 1.25;
  }

  return 1.0;
}

// ── getRuneDescription ────────────────────────────────────────────────────

/**
 * Returns text description for UI.
 *
 * @param {number} runeId - RUNE_ID.* constant
 * @returns {string} Description text
 */
export function getRuneDescription(runeId) {
  return RUNE_DESCRIPTIONS[runeId] || 'Unknown rune.';
}
