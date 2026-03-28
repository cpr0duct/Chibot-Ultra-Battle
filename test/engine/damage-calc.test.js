import { describe, it, expect } from 'vitest';
import { projectDamage, calculateHitChance } from '../../engine/damage-calc.js';
import { ELEMENT, STATUS, CHEESE_LIMIT } from '../../engine/constants.js';
import { createPlayer, createMove, createArena } from '../../engine/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal attacker with sensible defaults. */
function makeAttacker(overrides = {}) {
  const p = createPlayer();
  p.hp = 500;
  p.maxHp = 500;
  p.mp = 100;
  p.maxMp = 100;
  p.physStr = 50;
  p.magStr = 50;
  Object.assign(p, overrides);
  return p;
}

/** Build a minimal target with sensible defaults. */
function makeTarget(overrides = {}) {
  const p = createPlayer();
  p.hp = 500;
  p.maxHp = 500;
  p.mp = 100;
  p.maxMp = 100;
  p.physDef = 0;
  p.magDef = 0;
  Object.assign(p, overrides);
  return p;
}

/** Build a move with given element and strength. */
function makeMove(element, strength) {
  const m = createMove();
  m.element = element;
  m.strength = strength;
  return m;
}

/** Default arena: all multipliers = 1. */
function makeArena() {
  return createArena(); // elements already filled with 1
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('projectDamage', () => {
  // ── Special elements ───────────────────────────────────────────────────

  it('NO_DMG returns 0 damage', () => {
    const result = projectDamage(
      makeAttacker(),
      makeTarget(),
      makeMove(ELEMENT.NO_DMG, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(0);
    expect(result.isHeal).toBe(false);
  });

  it('MORPH returns 0 damage', () => {
    const result = projectDamage(
      makeAttacker(),
      makeTarget(),
      makeMove(ELEMENT.MORPH, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(0);
  });

  it('LIFE returns 0 damage', () => {
    const result = projectDamage(
      makeAttacker(),
      makeTarget(),
      makeMove(ELEMENT.LIFE, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(0);
  });

  it('DEMI cuts target HP in half', () => {
    const result = projectDamage(
      makeAttacker(),
      makeTarget({ hp: 400 }),
      makeMove(ELEMENT.DEMI, 0),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(200);
    expect(result.isHeal).toBe(false);
  });

  it('HEAL element returns isHeal=true', () => {
    const result = projectDamage(
      makeAttacker({ magStr: 50 }),
      makeTarget(),
      makeMove(ELEMENT.HEAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.isHeal).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
  });

  // ── Base physical damage ───────────────────────────────────────────────

  it('base physical damage with equal stats (seed=0.5)', () => {
    // strength=100, physStr=50 (→ *1), physDef=0 (→ *2), arena=1
    // Step 1: damage = 100
    // Step 2: half=50, quarter=25. damage += floor(0.5 * 51) - 25 = 25 - 25 = 0 → damage = 100
    // Step 3: damage = floor(100 * 50/50) = 100
    // Step 4: damage = floor(100 * (100-0)/50) = floor(100 * 2) = 200
    // Steps 5-11: all neutral (multiplier 1, no status)
    // Step 14: crit seed=0.5 → no crit (0.5 >= 0.1)
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(200);
    expect(result.isCrit).toBe(false);
  });

  // ── Stat scaling ───────────────────────────────────────────────────────

  it('attacker physStr=100 doubles damage (2x)', () => {
    // strength=100, seed=0.5 → base stays 100 after randomization
    // physStr=100 → floor(100 * 100/50) = 200
    // physDef=0 → floor(200 * 100/50) = 400
    const result = projectDamage(
      makeAttacker({ physStr: 100 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(400);
  });

  it('defender physDef=75 reduces damage', () => {
    // strength=100, seed=0.5 → base=100
    // physStr=50 → floor(100 * 50/50) = 100
    // physDef=75 → floor(100 * (100-75)/50) = floor(100 * 0.5) = 50
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 75 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBe(50);
  });

  // ── Weakness / Resistance ──────────────────────────────────────────────

  it('weakness multiplier (1.5x)', () => {
    const target = makeTarget({ physDef: 0, weakTo: ELEMENT.FIRE, resist: 0 });
    const result = projectDamage(
      makeAttacker({ magStr: 50 }),
      target,
      makeMove(ELEMENT.FIRE, 100),
      makeArena(),
      { seed: 0.5 },
    );
    // base=100, magStr=50→*1=100, magDef=0→*2=200, arena=1, weakness→*1.5=300
    expect(result.damage).toBe(300);
  });

  it('resistance multiplier (0.5x)', () => {
    const target = makeTarget({ physDef: 0, weakTo: 0, resist: ELEMENT.FIRE });
    const result = projectDamage(
      makeAttacker({ magStr: 50 }),
      target,
      makeMove(ELEMENT.FIRE, 100),
      makeArena(),
      { seed: 0.5 },
    );
    // base=100, magStr=50→*1=100, magDef=0→*2=200, arena=1, resist→*0.5=100
    expect(result.damage).toBe(100);
  });

  // ── Status effects ─────────────────────────────────────────────────────

  it('bless buff (1.5x)', () => {
    const attacker = makeAttacker({ physStr: 50 });
    attacker.status[STATUS.BLESS] = 1;
    const result = projectDamage(
      attacker,
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    // base=200 (from stat scaling), bless→floor(200*1.5)=300
    expect(result.damage).toBe(300);
  });

  it('curse debuff (1/1.5x)', () => {
    const attacker = makeAttacker({ physStr: 50 });
    attacker.status[STATUS.CURSE] = 1;
    const result = projectDamage(
      attacker,
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    // base=200, curse→floor(200/1.5)=floor(133.33)=133
    expect(result.damage).toBe(133);
  });

  it('blind (0.1x)', () => {
    const attacker = makeAttacker({ physStr: 50 });
    attacker.status[STATUS.BLIND] = 1;
    const result = projectDamage(
      attacker,
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    // base=200, blind→floor(200*0.1)=20
    expect(result.damage).toBe(20);
  });

  // ── Arena multipliers ──────────────────────────────────────────────────

  it('arena element multiplier', () => {
    const arena = makeArena();
    arena.elements[ELEMENT.FIRE] = 2; // fire does 2x in this arena
    const result = projectDamage(
      makeAttacker({ magStr: 50 }),
      makeTarget({ magDef: 0 }),
      makeMove(ELEMENT.FIRE, 100),
      arena,
      { seed: 0.5 },
    );
    // base=100, magStr→100, magDef=0→200, arena fire=2→400, arena[0]=1→400
    expect(result.damage).toBe(400);
  });

  it('arena allAttacks multiplier (index 0)', () => {
    const arena = makeArena();
    arena.elements[0] = 2; // all attacks do 2x
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      arena,
      { seed: 0.5 },
    );
    // base=100, physStr→100, physDef=0→200, arena[PHYSICAL]=1→200, arena[0]=2→400
    expect(result.damage).toBe(400);
  });

  // ── Cheese limit ───────────────────────────────────────────────────────

  it('cheese limit enforcement', () => {
    // Use very high strength to exceed CHEESE_LIMIT
    const result = projectDamage(
      makeAttacker({ physStr: 100 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 5000),
      makeArena(),
      { seed: 0.5 },
    );
    // Without cap: 5000 * 2 * 2 = 20000. Capped at CHEESE_LIMIT = 1100.
    // seed=0.5 → no crit
    expect(result.damage).toBe(CHEESE_LIMIT);
  });

  // ── Super hit calculation ──────────────────────────────────────────────

  it('super hit calculation (SP=200 → hits=floor(200/50)+2=6)', () => {
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 50 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5, isSuper: true, superNum: 200 },
    );
    expect(result.hits).toBe(6);
    // base=100, physStr=50→100, physDef=50→100, *6 hits=600
    expect(result.damage).toBe(600);
  });

  // ── Critical hit ───────────────────────────────────────────────────────

  it('critical hit doubles damage (seed < 0.1)', () => {
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.05 },
    );
    // seed=0.05: randomize gives floor(0.05 * 51) - 25 = 2 - 25 = -23 → damage = 77
    // physStr 50/50 = 1 → 77; physDef (100-0)/50 = 2 → 154
    // crit seed=0.05 < 0.1 → *2 = 308
    expect(result.isCrit).toBe(true);
    expect(result.damage).toBe(308);
  });

  it('no critical when seed >= 0.1', () => {
    const result = projectDamage(
      makeAttacker({ physStr: 50 }),
      makeTarget({ physDef: 0 }),
      makeMove(ELEMENT.PHYSICAL, 100),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.isCrit).toBe(false);
  });

  // ── HP/MP Theft ────────────────────────────────────────────────────────

  it('HP_THEFT caps at target HP', () => {
    const result = projectDamage(
      makeAttacker({ magStr: 100, hp: 100, maxHp: 1000 }),
      makeTarget({ hp: 10, magDef: 0 }),
      makeMove(ELEMENT.HP_THEFT, 200),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBeLessThanOrEqual(10);
  });

  it('HP_THEFT caps at what attacker can hold', () => {
    const result = projectDamage(
      makeAttacker({ magStr: 100, hp: 495, maxHp: 500 }),
      makeTarget({ hp: 500, magDef: 0 }),
      makeMove(ELEMENT.HP_THEFT, 200),
      makeArena(),
      { seed: 0.5 },
    );
    // Attacker can only hold 5 more HP
    expect(result.damage).toBeLessThanOrEqual(5);
  });

  it('MP_THEFT caps at target MP', () => {
    const result = projectDamage(
      makeAttacker({ magStr: 100, mp: 0, maxMp: 1000 }),
      makeTarget({ mp: 5, magDef: 0 }),
      makeMove(ELEMENT.MP_THEFT, 200),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBeLessThanOrEqual(5);
  });

  // ── Negative damage floor ──────────────────────────────────────────────

  it('damage floors at 0 (no negative)', () => {
    // Very high defense → negative intermediate result
    const result = projectDamage(
      makeAttacker({ physStr: 1 }),
      makeTarget({ physDef: 99 }),
      makeMove(ELEMENT.PHYSICAL, 1),
      makeArena(),
      { seed: 0.5 },
    );
    expect(result.damage).toBeGreaterThanOrEqual(0);
  });
});

// ── calculateHitChance ─────────────────────────────────────────────────────

describe('calculateHitChance', () => {
  it('0 defense = always hits', () => {
    // hitChance = 1 - 0/200 = 1.0; seed=0.99 < 1.0 → hit
    expect(calculateHitChance(ELEMENT.PHYSICAL, 0, { seed: 0.99 })).toBe(true);
  });

  it('100 defense = 50/50 chance', () => {
    // hitChance = 1 - 100/200 = 0.5
    // seed=0.49 < 0.5 → hit
    expect(calculateHitChance(ELEMENT.PHYSICAL, 100, { seed: 0.49 })).toBe(true);
    // seed=0.51 >= 0.5 → miss
    expect(calculateHitChance(ELEMENT.PHYSICAL, 100, { seed: 0.51 })).toBe(false);
  });

  it('NO_DMG always hits regardless of defense', () => {
    expect(calculateHitChance(ELEMENT.NO_DMG, 100, { seed: 0.99 })).toBe(true);
    expect(calculateHitChance(ELEMENT.NO_DMG, 200, { seed: 0.99 })).toBe(true);
  });

  it('200 defense = never hits', () => {
    // hitChance = 1 - 200/200 = 0; seed=0 is not < 0 → miss
    expect(calculateHitChance(ELEMENT.PHYSICAL, 200, { seed: 0 })).toBe(false);
  });
});
