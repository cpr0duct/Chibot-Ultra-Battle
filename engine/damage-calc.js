/**
 * Damage calculation engine — ported from VB6 ProjectedTotalDamage / PredictDamageCount.
 *
 * Source: ChiSource/CPU.bas (ProjectedTotalDamage, ProjectedSuperDamage)
 *         ChiSource/DECLARE.BAS (DoesDamage)
 */

import { ELEMENT, STATUS, CHEESE_LIMIT } from './constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if the given element deals damage (as opposed to being
 * a status-only, morph, life, etc. element).
 */
function doesDamage(element) {
  switch (element) {
    case ELEMENT.PHYSICAL:
    case ELEMENT.MOON:
    case ELEMENT.SHADOW:
    case ELEMENT.WATER:
    case ELEMENT.FIRE:
    case ELEMENT.LIGHTNING:
    case ELEMENT.HEART:
    case ELEMENT.EARTH:
    case ELEMENT.WIND:
    case ELEMENT.KI:
    case ELEMENT.LUMINOUS:
    case ELEMENT.HP_THEFT:
    case ELEMENT.MP_THEFT:
    case ELEMENT.DEMI:
    case ELEMENT.POISON:
    case ELEMENT.GRASS:
    case ELEMENT.ROCK:
    case ELEMENT.DIRT:
    case ELEMENT.PSYCHIC:
    case ELEMENT.GHOST:
    case ELEMENT.HP_BASED:
      return true;
    default:
      return false;
  }
}

/**
 * True if the element uses physical stats (physStr / physDef).
 * Everything else uses magical stats.
 */
function isPhysical(element) {
  return element === ELEMENT.PHYSICAL;
}

// ── Main damage projection ─────────────────────────────────────────────────

/**
 * Project the damage for a single attack (attacker → target).
 *
 * @param {object} attacker  - Player state (createPlayer shape)
 * @param {object} target    - Player state (createPlayer shape)
 * @param {object} move      - Move definition (createMove shape); uses
 *                              move.element, move.strength
 * @param {object} arena     - Arena definition (createArena shape)
 * @param {object} [options] - Optional overrides:
 *        seed    (number 0-1) replaces Math.random for deterministic tests
 *        isSuper (bool)       whether this is a super attack
 *        superNum (int)       SP amount for super hit multiplier
 * @returns {{ damage: number, isCrit: boolean, hits: number, isHeal: boolean }}
 */
export function projectDamage(attacker, target, move, arena, options = {}) {
  const rng = options.seed !== undefined ? () => options.seed : Math.random;
  const element = move.element;

  // ── Special elements: early returns ──────────────────────────────────

  // NO_DMG / Morph / Life — pure status moves, no damage
  if (element === ELEMENT.NO_DMG || element === ELEMENT.MORPH || element === ELEMENT.LIFE) {
    return { damage: 0, isCrit: false, hits: 1, isHeal: false };
  }

  // DEMI — cuts target HP in half
  if (element === ELEMENT.DEMI) {
    return {
      damage: Math.floor(target.hp / 2),
      isCrit: false,
      hits: 1,
      isHeal: false,
    };
  }

  // HEAL — healing (positive damage = HP restored)
  if (element === ELEMENT.HEAL) {
    let damage = move.strength;

    // Randomize ±25%
    const quarter = Math.floor(damage / 4);
    damage += Math.floor(rng() * (quarter * 2 + 1)) - quarter;

    // Heals always use magStr (minimum 10)
    damage = Math.floor(damage * Math.max(attacker.magStr, 10) / 50);

    // Arena element multiplier for heal (index 2)
    if (arena.elements[ELEMENT.HEAL] !== undefined) {
      damage = Math.floor(damage * arena.elements[ELEMENT.HEAL]);
    }
    // Arena global multiplier (index 0 = allAttacks)
    damage = Math.floor(damage * arena.elements[0]);

    // Bless / Curse apply to heals too
    if (attacker.status[STATUS.BLESS]) {
      damage = Math.floor(damage * 1.5);
    }
    if (attacker.status[STATUS.CURSE]) {
      damage = Math.floor(damage / 1.5);
    }

    // Cap at cheese limit
    if (damage > CHEESE_LIMIT) {
      damage = CHEESE_LIMIT;
    }

    return { damage, isCrit: false, hits: 1, isHeal: true };
  }

  // HP_THEFT — steal HP from target
  if (element === ELEMENT.HP_THEFT) {
    let damage = move.strength;
    const quarter = Math.floor(damage / 4);
    damage += Math.floor(rng() * (quarter * 2 + 1)) - quarter;
    damage = Math.floor(damage * Math.max(attacker.magStr, 10) / 50);
    damage = Math.floor(damage * (100 - Math.min(target.magDef, 90)) / 50);
    // Cap at what target has
    damage = Math.min(damage, target.hp);
    // Cap at what attacker can hold
    damage = Math.min(damage, attacker.maxHp - attacker.hp);
    if (damage < 0) damage = 0;
    return { damage, isCrit: false, hits: 1, isHeal: false };
  }

  // MP_THEFT — steal MP from target
  if (element === ELEMENT.MP_THEFT) {
    let damage = move.strength;
    const quarter = Math.floor(damage / 4);
    damage += Math.floor(rng() * (quarter * 2 + 1)) - quarter;
    damage = Math.floor(damage * Math.max(attacker.magStr, 10) / 50);
    damage = Math.floor(damage * (100 - Math.min(target.magDef, 90)) / 50);
    // Cap at what target has
    damage = Math.min(damage, target.mp);
    // Cap at what attacker can hold
    damage = Math.min(damage, attacker.maxMp - attacker.mp);
    if (damage < 0) damage = 0;
    return { damage, isCrit: false, hits: 1, isHeal: false };
  }

  // ── Standard damage formula (steps 1-14 from spec) ──────────────────

  // 1. Base damage = move.strength
  let damage = move.strength;

  // 2. Randomize ±25%: damage += random(damage/2) - damage/4
  const half = Math.floor(damage / 2);
  const quarter = Math.floor(damage / 4);
  damage += Math.floor(rng() * (half + 1)) - quarter;

  // 3. Apply attacker stat (minimum 10 so zero-stat attackers still deal some damage)
  const rawAtkStat = isPhysical(element) ? attacker.physStr : attacker.magStr;
  const atkStat = Math.max(rawAtkStat, 10);
  damage = Math.floor(damage * atkStat / 50);

  // 4. Apply defender stat (cap effective defense at 90 so 100-def doesn't zero out damage)
  const rawDefStat = isPhysical(element) ? target.physDef : target.magDef;
  const defStat = Math.min(rawDefStat, 90);
  damage = Math.floor(damage * (100 - defStat) / 50);

  // 5. Arena element multiplier
  if (arena.elements[element] !== undefined) {
    damage = Math.floor(damage * arena.elements[element]);
  }

  // 6. Arena global multiplier (index 0 = allAttacks)
  damage = Math.floor(damage * arena.elements[0]);

  // 7. Weakness
  if (element === target.weakTo) {
    damage = Math.floor(damage * 1.5);
  }

  // 8. Resistance
  if (element === target.resist) {
    damage = Math.floor(damage * 0.5);
  }

  // 9. Bless
  if (attacker.status[STATUS.BLESS]) {
    damage = Math.floor(damage * 1.5);
  }

  // 10. Curse
  if (attacker.status[STATUS.CURSE]) {
    damage = Math.floor(damage / 1.5);
  }

  // 11. Blind
  if (attacker.status[STATUS.BLIND]) {
    damage = Math.floor(damage * 0.1);
  }

  // 12. Super multiplier
  let hits = 1;
  if (options.isSuper && options.superNum > 0) {
    hits = Math.floor(options.superNum / 50) + 2;
    damage = Math.floor(damage * hits);
  }

  // 13. Cheese limit
  if (damage > CHEESE_LIMIT) {
    damage = CHEESE_LIMIT;
  }

  // Floor: minimum 1 damage if the move has any strength (no free passes)
  if (damage < 1 && move.strength > 0) {
    damage = 1;
  } else if (damage < 0) {
    damage = 0;
  }

  // 14. Critical hit: 10% chance → damage *= 2
  const critRoll = rng();
  const isCrit = critRoll < 0.1;
  if (isCrit) {
    damage = damage * 2;
  }

  return { damage, isCrit, hits, isHeal: false };
}

// ── Hit chance ─────────────────────────────────────────────────────────────

/**
 * Determine if an attack hits.
 *
 * @param {number} element  - The element of the attack
 * @param {number} defense  - The relevant defense stat (0-100+)
 * @param {object} [options] - { seed: 0-1 } for deterministic testing
 * @returns {boolean} true if the attack hits
 */
export function calculateHitChance(element, defense, options = {}) {
  // NO_DMG (status-only) always hits
  if (element === ELEMENT.NO_DMG) {
    return true;
  }

  const rng = options.seed !== undefined ? options.seed : Math.random();

  // Defense of 0 = always hits (hitChance = 100%)
  // Defense of 100 = 50/50 (hitChance = 50%)
  // Formula: hitChance = 1 - (defense / 200)
  const hitChance = 1 - (defense / 200);

  return rng < hitChance;
}
