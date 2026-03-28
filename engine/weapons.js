/**
 * Weapon system — equip, use, and manage weapon moves.
 * Ported from VB6 weapon handling.
 */

import { MAX_WEAPON_MOVES } from './constants.js';

// ── Weapon effect constants ───────────────────────────────────────────────

export const WEAPON_EFFECT = Object.freeze({
  NONE:    0, // No effect on weapon charges
  EXPEND:  1, // Expend one charge
  DROP:    2, // Drop the weapon
  DESTROY: 3, // Destroy the weapon
});

// ── equipWeapon ───────────────────────────────────────────────────────────

/**
 * Equip a weapon to a player. Sets player.weapon, player.wpnUsesLeft,
 * and adds weapon moves to the player's move list.
 *
 * @param {object} player - A player object (createPlayer shape)
 * @param {object} weapon - A weapon object (createWeapon shape)
 * @returns {{ messages: string[] }}
 */
export function equipWeapon(player, weapon) {
  const messages = [];

  player.weapon = weapon;
  player.wpnUsesLeft = weapon.numUses;

  // Add weapon moves to player's available moves
  if (weapon.moves) {
    for (let i = 0; i < weapon.moves.length; i++) {
      if (weapon.moves[i] && weapon.moves[i].name) {
        player.moves.push(weapon.moves[i]);
      }
    }
  }

  if (weapon.equipStr) {
    messages.push(weapon.equipStr);
  }

  return { messages };
}

// ── useWeaponMove ─────────────────────────────────────────────────────────

/**
 * Handle charge consumption based on weaponEffect.
 *   0 = no effect on charges
 *   1 = expend one charge
 *   2 = drop weapon
 *   3 = destroy weapon
 *
 * @param {object} player    - A player object
 * @param {number} moveIndex - Index into the weapon's moves array
 * @returns {{ weaponDropped: boolean, weaponDestroyed: boolean, messages: string[] }}
 */
export function useWeaponMove(player, moveIndex) {
  const messages = [];
  let weaponDropped = false;
  let weaponDestroyed = false;

  if (!player.weapon) {
    return { weaponDropped, weaponDestroyed, messages };
  }

  const weapon = player.weapon;
  const move = weapon.moves && weapon.moves[moveIndex];
  if (!move) {
    return { weaponDropped, weaponDestroyed, messages };
  }

  const effect = move.weaponEffect || WEAPON_EFFECT.NONE;

  switch (effect) {
    case WEAPON_EFFECT.EXPEND:
      player.wpnUsesLeft -= 1;
      if (player.wpnUsesLeft <= 0) {
        // Out of charges — drop the weapon
        weaponDropped = true;
        if (weapon.dropStr) {
          messages.push(weapon.dropStr);
        }
        _removeWeapon(player);
      }
      break;

    case WEAPON_EFFECT.DROP:
      weaponDropped = true;
      if (weapon.dropStr) {
        messages.push(weapon.dropStr);
      }
      _removeWeapon(player);
      break;

    case WEAPON_EFFECT.DESTROY:
      weaponDestroyed = true;
      _removeWeapon(player);
      break;

    case WEAPON_EFFECT.NONE:
    default:
      // No charge consumption
      break;
  }

  return { weaponDropped, weaponDestroyed, messages };
}

// ── getWeaponMoves ────────────────────────────────────────────────────────

/**
 * Return the weapon's available moves for the player.
 *
 * @param {object} player - A player object
 * @returns {object[]} Array of move objects from the equipped weapon
 */
export function getWeaponMoves(player) {
  if (!player.weapon || !player.weapon.moves) {
    return [];
  }

  return player.weapon.moves.filter((m) => m && m.name);
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _removeWeapon(player) {
  // Remove weapon moves from player's move list
  if (player.weapon && player.weapon.moves) {
    const weaponMoveNames = new Set(
      player.weapon.moves.filter((m) => m && m.name).map((m) => m.name)
    );
    player.moves = player.moves.filter((m) => !weaponMoveNames.has(m.name));
  }
  player.weapon = null;
  player.wpnUsesLeft = 0;
}
