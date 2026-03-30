/**
 * Item system — spawn and pickup logic.
 * Ported from VB6 item handling.
 */

import { applyStatus } from './status.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultRand(min, max) {
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── spawnItem ─────────────────────────────────────────────────────────────

/**
 * Pick a random item from the available list. If there's already an item
 * on the field, return the telefrag message for the old one + spawn
 * message for the new one.
 *
 * @param {object[]} availableItems - Array of item objects (createItem shape)
 * @param {object|null} currentItem - Currently active item on the field, or null
 * @param {object} [opts] - Options
 * @param {function} [opts.rand] - RNG function rand(min, max) for testing
 * @returns {{ item: object, messages: string[] }}
 */
export function spawnItem(availableItems, currentItem, opts = {}) {
  const rand = opts.rand || defaultRand;
  const messages = [];

  if (!availableItems || availableItems.length === 0) {
    return { item: null, messages: [] };
  }

  // Telefrag: if there's already an item, it gets destroyed
  if (currentItem && currentItem.name) {
    if (currentItem.telefragStr) {
      messages.push(currentItem.telefragStr);
    }
  }

  // Pick random new item — return a copy so we don't mutate the dataset
  const idx = rand(0, availableItems.length - 1);
  const item = { ...availableItems[idx] };
  if (item.playerStat) item.playerStat = [...item.playerStat];

  if (item.spawnStr) {
    messages.push(item.spawnStr);
  }

  return { item, messages };
}

// ── pickupItem ────────────────────────────────────────────────────────────

/**
 * Apply item effects to the player: add HP/MP, apply status effects
 * (each has a % chance based on the playerStat array value).
 *
 * @param {object} player - A player object (createPlayer shape)
 * @param {object} item   - An item object (createItem shape)
 * @param {object} [opts] - Options
 * @param {function} [opts.rand] - RNG function rand(min, max) for testing
 * @param {number}   [opts.gameTime] - Current game time for status application
 * @returns {{ messages: string[] }}
 */
export function pickupItem(player, item, opts = {}) {
  const rand = opts.rand || defaultRand;
  const gameTime = opts.gameTime || 0;
  const messages = [];

  // Dead players can't pick up items
  if (!player.isAlive || player.hp <= 0) {
    return { messages: [`${player.scrNam} is dead and cannot pick up items.`] };
  }

  // Pickup message
  if (item.playerGet) {
    messages.push(item.playerGet.replace(/%P/g, player.scrNam).replace(/%SN/g, player.scrNam));
  }

  // Apply HP
  if (item.playerHp) {
    player.hp += item.playerHp;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    if (player.hp <= 0) {
      player.hp = 0;
      player.isAlive = false;
      messages.push(`${player.scrNam} has been killed by the ${item.name || 'item'}!`);
    }
  }

  // Apply MP
  if (item.playerMp) {
    player.mp += item.playerMp;
    if (player.mp > player.maxMp) player.mp = player.maxMp;
    if (player.mp < 0) player.mp = 0;
  }

  // Apply status effects — playerStat[i] is a percentage chance (1-100)
  if (item.playerStat) {
    for (let i = 1; i < item.playerStat.length; i++) {
      const chance = item.playerStat[i];
      if (chance > 0) {
        const roll = rand(1, 100);
        if (roll <= chance) {
          applyStatus(player, i, 1, gameTime);
        }
      }
    }
  }

  return { messages };
}
