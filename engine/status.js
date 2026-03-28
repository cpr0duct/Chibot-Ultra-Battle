/**
 * Status effect system for ChUB 2000 Web.
 * Ported from VB6: DECLARE.BAS (AddStatus, RemoveStatus, Check2RemoveStatus)
 *
 * Status values in the player.status[] array:
 *   0      = not active
 *   -1     = permanent (Reraise, Regen, Quick)
 *   > 0    = game-time when the status was applied (used to compute expiry)
 *   100    = special fixed value for Barrier / MBarrier (HP absorb)
 *   True/1 = flag-based (Virus)
 */

import { STATUS, MAX_STATUS, TIMING } from './constants.js';

// ── Status name lookup (for UI) ────────────────────────────────────────────

const STATUS_NAMES = Object.freeze({
  [STATUS.MUTE]:       'Mute',
  [STATUS.CHAOS]:      'Chaos',
  [STATUS.FREEZE]:     'Freeze',
  [STATUS.POISON]:     'Poison',
  [STATUS.BLIND]:      'Blind',
  [STATUS.INVINCIBLE]: 'Invincible',
  [STATUS.HASTE]:      'Haste',
  [STATUS.MORPH]:      'Morph',
  [STATUS.SCARECROW]:  'Scarecrow',
  [STATUS.SLOW]:       'Slow',
  [STATUS.STUN]:       'Stun',
  [STATUS.RERAISE]:    'Reraise',
  [STATUS.REGEN]:      'Regen',
  [STATUS.STOP]:       'Stop',
  [STATUS.MUSHROOM]:   'Mushroom',
  [STATUS.MIA]:        'MIA',
  [STATUS.QUICK]:      'Quick',
  [STATUS.BERSERK]:    'Berserk',
  [STATUS.SLEEP]:      'Sleep',
  [STATUS.VIRUS]:      'Virus',
  [STATUS.CPU_WAIT]:   'CPU Wait',
  [STATUS.HIT_RATE]:   'Hit Rate',
  [STATUS.BARRIER]:    'Barrier',
  [STATUS.M_BARRIER]:  'MBarrier',
  [STATUS.BLESS]:      'Bless',
  [STATUS.CURSE]:      'Curse',
  [STATUS.CHARM]:      'Charm',
  [STATUS.PMS]:        'PMS',
  [STATUS.ZOMBIE]:     'Zombie',
  [STATUS.HAMEDO]:     'Hamedo',
});

// ── Duration table (game-seconds, with lag=1 simplification) ───────────────
// From Check2RemoveStatus: XTimer - status >= N * Int(Config.Lag / 1000)
// We normalise to lag=1 so durations are in game-seconds.

const STATUS_DURATION = Object.freeze({
  [STATUS.MUTE]:      35,
  [STATUS.SCARECROW]: 35,
  [STATUS.CHAOS]:     35,
  [STATUS.FREEZE]:    20,
  [STATUS.SLEEP]:     40,
  [STATUS.BLIND]:     35,
  [STATUS.HASTE]:     120,
  [STATUS.SLOW]:      60,
  [STATUS.STUN]:      20,
  [STATUS.STOP]:      30,
  [STATUS.MUSHROOM]:  30,
  [STATUS.MIA]:       30,
  [STATUS.BERSERK]:   30,
  [STATUS.BLESS]:     100,
  [STATUS.CURSE]:     45,
  [STATUS.POISON]:    15,  // tick interval, not total duration
  [STATUS.REGEN]:     15,  // tick interval
});

// ── applyStatus ────────────────────────────────────────────────────────────

/**
 * Apply a status effect to a player.
 *
 * @param {object}  player    - A player object (from createPlayer)
 * @param {number}  statusId  - STATUS.* constant (1-32)
 * @param {number}  value     - >0 sets (duration/flag), -1 removes, 0 no-op
 * @param {number} [gameTime] - Current game time (XTimer). Required for
 *                               duration-based statuses when value > 0.
 */
export function applyStatus(player, statusId, value, gameTime = 0) {
  if (statusId < 1 || statusId > MAX_STATUS) return;
  if (value === 0) return;

  if (value === -1) {
    removeStatus(player, statusId);
    return;
  }

  // value > 0: apply the status
  switch (statusId) {
    // Permanent / flag statuses ------------------------------------------------
    case STATUS.RERAISE:
      // Life3/Reraise: only applies once (if already used, status===42, skip)
      if (player.status[STATUS.RERAISE] === 42) return;
      player.status[STATUS.RERAISE] = -1;
      break;

    case STATUS.REGEN:
      // Regen is permanent until removed; store gameTime for tick tracking
      player.status[STATUS.REGEN] = gameTime || -1;
      break;

    case STATUS.QUICK:
      // Quick is one-use: set to -1, consumed after next move
      player.status[STATUS.QUICK] = -1;
      break;

    case STATUS.VIRUS:
      // Flag-based; also sets poison timer behind current time so it ticks soon
      player.status[STATUS.VIRUS] = 1;
      player.status[STATUS.POISON] = gameTime - 15;
      break;

    // Barriers have a fixed HP-absorb value -----------------------------------
    case STATUS.BARRIER:
      player.status[STATUS.BARRIER] = 100;
      break;

    case STATUS.M_BARRIER:
      player.status[STATUS.M_BARRIER] = 100;
      break;

    // Haste cancels Slow; Slow cancels Haste ----------------------------------
    case STATUS.HASTE:
      player.status[STATUS.HASTE] = gameTime;
      if (player.status[STATUS.SLOW]) removeStatus(player, STATUS.SLOW);
      break;

    case STATUS.SLOW:
      player.status[STATUS.SLOW] = gameTime;
      if (player.status[STATUS.HASTE]) removeStatus(player, STATUS.HASTE);
      break;

    // All other timed statuses: store gameTime as start -------------------------
    default:
      player.status[statusId] = gameTime || value;
      break;
  }
}

// ── removeStatus ───────────────────────────────────────────────────────────

/**
 * Remove a status effect from a player (set to 0).
 * Handles side-effects matching VB6 RemoveStatus.
 *
 * @param {object} player   - A player object
 * @param {number} statusId - STATUS.* constant
 */
export function removeStatus(player, statusId) {
  if (statusId < 1 || statusId > MAX_STATUS) return;

  player.status[statusId] = 0;

  // Side effects from VB6 RemoveStatus
  switch (statusId) {
    case STATUS.POISON:
      // Removing poison also clears virus
      player.status[STATUS.VIRUS] = 0;
      break;
    default:
      break;
  }
}

// ── tickStatuses ───────────────────────────────────────────────────────────

/**
 * Called each miscLoop tick. Checks all timed statuses for expiry,
 * handles poison damage and regen healing.
 *
 * @param {object}   player   - A player object
 * @param {number}   gameTime - Current game time in game-seconds (XTimer)
 * @param {object}   [opts]   - Options
 * @param {number}   [opts.maxHp]  - Server maxHP setting (for poison/regen calc)
 * @param {function} [opts.rand]   - RNG function rand(min,max) for testing
 * @returns {object} Events that occurred: { expired: number[], poisonDmg, regenHeal }
 */
export function tickStatuses(player, gameTime, opts = {}) {
  const maxHp = opts.maxHp || player.maxHp || 500;
  const rand = opts.rand || defaultRand;
  const events = { expired: [], poisonDmg: 0, regenHeal: 0 };

  // ── Timed status expiry ──────────────────────────────────────────────────
  const timedChecks = [
    [STATUS.MUTE,      STATUS_DURATION[STATUS.MUTE]],
    [STATUS.SCARECROW, STATUS_DURATION[STATUS.SCARECROW]],
    [STATUS.CHAOS,     STATUS_DURATION[STATUS.CHAOS]],
    [STATUS.FREEZE,    STATUS_DURATION[STATUS.FREEZE]],
    [STATUS.SLEEP,     STATUS_DURATION[STATUS.SLEEP]],
    [STATUS.BLIND,     STATUS_DURATION[STATUS.BLIND]],
    [STATUS.HASTE,     STATUS_DURATION[STATUS.HASTE]],
    [STATUS.SLOW,      STATUS_DURATION[STATUS.SLOW]],
    [STATUS.STUN,      STATUS_DURATION[STATUS.STUN]],
    [STATUS.STOP,      STATUS_DURATION[STATUS.STOP]],
    [STATUS.MUSHROOM,  STATUS_DURATION[STATUS.MUSHROOM]],
    [STATUS.BERSERK,   STATUS_DURATION[STATUS.BERSERK]],
    [STATUS.BLESS,     STATUS_DURATION[STATUS.BLESS]],
    [STATUS.CURSE,     STATUS_DURATION[STATUS.CURSE]],
  ];

  for (const [sid, dur] of timedChecks) {
    const val = player.status[sid];
    if (val !== 0 && val !== -1 && gameTime - val >= dur) {
      removeStatus(player, sid);
      events.expired.push(sid);
    }
  }

  // MIA: expires unless permanent (-1)
  if (player.status[STATUS.MIA] !== 0 &&
      player.status[STATUS.MIA] !== -1 &&
      gameTime - player.status[STATUS.MIA] >= STATUS_DURATION[STATUS.MIA]) {
    removeStatus(player, STATUS.MIA);
    events.expired.push(STATUS.MIA);
  }

  // ── Poison tick ──────────────────────────────────────────────────────────
  if (player.status[STATUS.POISON] !== 0) {
    const isVirus = player.status[STATUS.VIRUS] !== 0;
    const interval = isVirus ? 30 : 15;

    if (gameTime - player.status[STATUS.POISON] >= interval) {
      let dmg = rand(Math.floor(maxHp / 50), Math.floor(maxHp / 10));
      if (isVirus) dmg = Math.floor(dmg * 1.5);

      player.hp -= dmg;
      events.poisonDmg = dmg;

      // Reset poison timer to current time
      player.status[STATUS.POISON] = gameTime;

      // 1-in-3 chance of wearing off (only if no virus)
      if (!isVirus && rand(1, 3) === 1) {
        removeStatus(player, STATUS.POISON);
        events.expired.push(STATUS.POISON);
      }
    }
  }

  // ── Regen tick ───────────────────────────────────────────────────────────
  if (player.status[STATUS.REGEN] !== 0) {
    // Regen is permanent (-1) but we need a tick timer.
    // Use absolute value or treat -1 as "always ready on first tick".
    const regenStart = player.status[STATUS.REGEN] === -1
      ? gameTime - 15  // triggers immediately on first tick
      : player.status[STATUS.REGEN];

    if (gameTime - regenStart >= 15) {
      let heal = rand(Math.floor(maxHp / 50), Math.floor(maxHp / 10));
      const room = player.maxHp - player.hp;
      if (heal > room) heal = room;
      if (heal > 0) {
        player.hp += heal;
        events.regenHeal = heal;
      }
      // Store current gameTime as next tick reference
      player.status[STATUS.REGEN] = gameTime;
    }
  }

  return events;
}

// ── canAct ─────────────────────────────────────────────────────────────────

/**
 * Returns false if the player is unable to act due to a disabling status.
 * Disabling: Freeze, Stop, Sleep, Stun, Mushroom, MIA.
 *
 * @param {object} player
 * @returns {boolean}
 */
export function canAct(player) {
  if (player.status[STATUS.FREEZE])    return false;
  if (player.status[STATUS.STOP])      return false;
  if (player.status[STATUS.SLEEP])     return false;
  if (player.status[STATUS.STUN])      return false;
  if (player.status[STATUS.MUSHROOM])  return false;
  if (player.status[STATUS.MIA])       return false;
  return true;
}

// ── getMoveTimeModifier ────────────────────────────────────────────────────

/**
 * Returns the total time adjustment in game-seconds for a player's
 * speed-related statuses. Effects stack additively.
 *
 * - Haste:  -5  (faster)
 * - Slow:   +5  (slower)
 * - PMS:   -10  (faster, rage)
 * - Quick: instant move (return -9999)
 *
 * @param {object} player
 * @returns {number} Adjustment in game-seconds (negative = faster)
 */
export function getMoveTimeModifier(player) {
  // Quick overrides everything: instant move
  if (player.status[STATUS.QUICK]) {
    return -9999;
  }

  let mod = 0;
  if (player.status[STATUS.HASTE]) mod += TIMING.HASTE_HIT;  // -5
  if (player.status[STATUS.SLOW])  mod += TIMING.SLOW_HIT;   // +5
  if (player.status[STATUS.PMS])   mod += TIMING.PMS_HIT;    // -10
  return mod;
}

// ── isPhysicalOnly ─────────────────────────────────────────────────────────

/**
 * Returns true if the player is restricted to physical-only moves.
 * Mute and Scarecrow both restrict to physical.
 *
 * @param {object} player
 * @returns {boolean}
 */
export function isPhysicalOnly(player) {
  return !!(player.status[STATUS.MUTE] || player.status[STATUS.SCARECROW]);
}

// ── getStatusList ──────────────────────────────────────────────────────────

/**
 * Returns an array of { id, name } for each active status on the player.
 * Used for UI display.
 *
 * @param {object} player
 * @returns {Array<{id: number, name: string}>}
 */
export function getStatusList(player) {
  const list = [];
  for (let i = 1; i <= MAX_STATUS; i++) {
    if (player.status[i]) {
      list.push({ id: i, name: STATUS_NAMES[i] || `Status ${i}` });
    }
  }
  return list;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function defaultRand(min, max) {
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
