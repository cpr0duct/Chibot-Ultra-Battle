import { describe, it, expect } from 'vitest';
import {
  applyStatus,
  removeStatus,
  tickStatuses,
  canAct,
  getMoveTimeModifier,
  isPhysicalOnly,
  getStatusList,
} from '../../engine/status.js';
import { STATUS, MAX_STATUS, TIMING } from '../../engine/constants.js';
import { createPlayer } from '../../engine/types.js';

/** Helper: create a player with some HP for testing */
function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.hp = 500;
  p.maxHp = 500;
  Object.assign(p, overrides);
  return p;
}

/** Deterministic rand that always returns a fixed value */
function fixedRand(val) {
  return () => val;
}

// ── applyStatus ────────────────────────────────────────────────────────────

describe('applyStatus', () => {
  it('sets a timed status to the provided gameTime', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.MUTE, 1, 100);
    expect(p.status[STATUS.MUTE]).toBe(100);
  });

  it('does nothing when value is 0', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.MUTE, 0, 100);
    expect(p.status[STATUS.MUTE]).toBe(0);
  });

  it('removes status when value is -1', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 50;
    applyStatus(p, STATUS.MUTE, -1);
    expect(p.status[STATUS.MUTE]).toBe(0);
  });

  it('ignores invalid status IDs', () => {
    const p = makePlayer();
    applyStatus(p, 0, 1, 100);
    applyStatus(p, 99, 1, 100);
    // Should not throw or corrupt
    expect(p.status[0]).toBe(0);
  });

  it('sets Reraise to -1 (permanent)', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.RERAISE, 1, 100);
    expect(p.status[STATUS.RERAISE]).toBe(-1);
  });

  it('does not re-apply Reraise after it was used (status === 42)', () => {
    const p = makePlayer();
    p.status[STATUS.RERAISE] = 42;
    applyStatus(p, STATUS.RERAISE, 1, 100);
    expect(p.status[STATUS.RERAISE]).toBe(42);
  });

  it('sets Regen to gameTime for tick tracking', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.REGEN, 1, 200);
    expect(p.status[STATUS.REGEN]).toBe(200);
  });

  it('sets Quick to -1 (one-use)', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.QUICK, 1, 100);
    expect(p.status[STATUS.QUICK]).toBe(-1);
  });

  it('sets Barrier to fixed 100', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.BARRIER, 1, 100);
    expect(p.status[STATUS.BARRIER]).toBe(100);
  });

  it('sets MBarrier to fixed 100', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.M_BARRIER, 1, 100);
    expect(p.status[STATUS.M_BARRIER]).toBe(100);
  });

  it('Haste cancels Slow', () => {
    const p = makePlayer();
    p.status[STATUS.SLOW] = 50;
    applyStatus(p, STATUS.HASTE, 1, 100);
    expect(p.status[STATUS.HASTE]).toBe(100);
    expect(p.status[STATUS.SLOW]).toBe(0);
  });

  it('Slow cancels Haste', () => {
    const p = makePlayer();
    p.status[STATUS.HASTE] = 50;
    applyStatus(p, STATUS.SLOW, 1, 100);
    expect(p.status[STATUS.SLOW]).toBe(100);
    expect(p.status[STATUS.HASTE]).toBe(0);
  });

  it('Virus sets virus flag and poison timer behind gameTime', () => {
    const p = makePlayer();
    applyStatus(p, STATUS.VIRUS, 1, 100);
    expect(p.status[STATUS.VIRUS]).toBe(1);
    expect(p.status[STATUS.POISON]).toBe(85); // 100 - 15
  });
});

// ── removeStatus ───────────────────────────────────────────────────────────

describe('removeStatus', () => {
  it('sets status to 0', () => {
    const p = makePlayer();
    p.status[STATUS.FREEZE] = 100;
    removeStatus(p, STATUS.FREEZE);
    expect(p.status[STATUS.FREEZE]).toBe(0);
  });

  it('removing poison also clears virus', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 100;
    p.status[STATUS.VIRUS] = 1;
    removeStatus(p, STATUS.POISON);
    expect(p.status[STATUS.POISON]).toBe(0);
    expect(p.status[STATUS.VIRUS]).toBe(0);
  });

  it('ignores invalid status IDs', () => {
    const p = makePlayer();
    removeStatus(p, 0);
    removeStatus(p, 99);
    // no crash
  });
});

// ── canAct ─────────────────────────────────────────────────────────────────

describe('canAct', () => {
  const disabling = [
    STATUS.FREEZE,
    STATUS.STOP,
    STATUS.SLEEP,
    STATUS.STUN,
    STATUS.MUSHROOM,
    STATUS.MIA,
  ];

  for (const sid of disabling) {
    it(`returns false when player has status ${sid}`, () => {
      const p = makePlayer();
      p.status[sid] = 100;
      expect(canAct(p)).toBe(false);
    });
  }

  it('returns true when player has no disabling statuses', () => {
    const p = makePlayer();
    expect(canAct(p)).toBe(true);
  });

  it('returns true with non-disabling statuses active', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 50;
    p.status[STATUS.HASTE] = 50;
    p.status[STATUS.BLESS] = 50;
    expect(canAct(p)).toBe(true);
  });
});

// ── getMoveTimeModifier ────────────────────────────────────────────────────

describe('getMoveTimeModifier', () => {
  it('returns 0 with no speed statuses', () => {
    const p = makePlayer();
    expect(getMoveTimeModifier(p)).toBe(0);
  });

  it('returns -5 with Haste', () => {
    const p = makePlayer();
    p.status[STATUS.HASTE] = 100;
    expect(getMoveTimeModifier(p)).toBe(TIMING.HASTE_HIT); // -5
  });

  it('returns +5 with Slow', () => {
    const p = makePlayer();
    p.status[STATUS.SLOW] = 100;
    expect(getMoveTimeModifier(p)).toBe(TIMING.SLOW_HIT); // +5
  });

  it('returns -10 with PMS', () => {
    const p = makePlayer();
    p.status[STATUS.PMS] = 100;
    expect(getMoveTimeModifier(p)).toBe(TIMING.PMS_HIT); // -10
  });

  it('returns -9999 with Quick (instant)', () => {
    const p = makePlayer();
    p.status[STATUS.QUICK] = -1;
    expect(getMoveTimeModifier(p)).toBe(-9999);
  });

  it('Quick overrides all other modifiers', () => {
    const p = makePlayer();
    p.status[STATUS.QUICK] = -1;
    p.status[STATUS.HASTE] = 100;
    p.status[STATUS.SLOW] = 100;
    expect(getMoveTimeModifier(p)).toBe(-9999);
  });

  it('stacks Haste + PMS', () => {
    const p = makePlayer();
    p.status[STATUS.HASTE] = 100;
    p.status[STATUS.PMS] = 100;
    expect(getMoveTimeModifier(p)).toBe(-15); // -5 + -10
  });

  it('stacks Haste + Slow (net 0)', () => {
    // Unusual in practice since they cancel, but test the math
    const p = makePlayer();
    p.status[STATUS.HASTE] = 100;
    p.status[STATUS.SLOW] = 100;
    expect(getMoveTimeModifier(p)).toBe(0); // -5 + 5
  });
});

// ── isPhysicalOnly ─────────────────────────────────────────────────────────

describe('isPhysicalOnly', () => {
  it('returns false with no restricting statuses', () => {
    const p = makePlayer();
    expect(isPhysicalOnly(p)).toBe(false);
  });

  it('returns true with Mute', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 100;
    expect(isPhysicalOnly(p)).toBe(true);
  });

  it('returns true with Scarecrow', () => {
    const p = makePlayer();
    p.status[STATUS.SCARECROW] = 100;
    expect(isPhysicalOnly(p)).toBe(true);
  });

  it('returns true with both Mute and Scarecrow', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 100;
    p.status[STATUS.SCARECROW] = 100;
    expect(isPhysicalOnly(p)).toBe(true);
  });
});

// ── getStatusList ──────────────────────────────────────────────────────────

describe('getStatusList', () => {
  it('returns empty array when no statuses active', () => {
    const p = makePlayer();
    expect(getStatusList(p)).toEqual([]);
  });

  it('lists all active statuses with id and name', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 50;
    p.status[STATUS.HASTE] = 100;
    const list = getStatusList(p);
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ id: STATUS.POISON, name: 'Poison' });
    expect(list).toContainEqual({ id: STATUS.HASTE, name: 'Haste' });
  });

  it('includes statuses with value -1', () => {
    const p = makePlayer();
    p.status[STATUS.RERAISE] = -1;
    const list = getStatusList(p);
    expect(list).toContainEqual({ id: STATUS.RERAISE, name: 'Reraise' });
  });

  it('does not include statuses with value 0', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 0;
    const list = getStatusList(p);
    expect(list.find((s) => s.id === STATUS.MUTE)).toBeUndefined();
  });
});

// ── tickStatuses ───────────────────────────────────────────────────────────

describe('tickStatuses', () => {
  it('expires timed statuses when duration exceeded', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 100;     // duration 35
    p.status[STATUS.FREEZE] = 100;   // duration 20

    const result = tickStatuses(p, 135); // 35 seconds later
    expect(p.status[STATUS.MUTE]).toBe(0);
    expect(p.status[STATUS.FREEZE]).toBe(0);
    expect(result.expired).toContain(STATUS.MUTE);
    expect(result.expired).toContain(STATUS.FREEZE);
  });

  it('does not expire statuses before their duration', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 100;

    tickStatuses(p, 120); // only 20 seconds, need 35
    expect(p.status[STATUS.MUTE]).toBe(100);
  });

  it('does not expire permanent (-1) statuses', () => {
    const p = makePlayer();
    p.status[STATUS.RERAISE] = -1;
    p.status[STATUS.REGEN] = -1;
    p.status[STATUS.QUICK] = -1;

    tickStatuses(p, 99999);
    // Reraise and Quick are not in timed checks so they remain.
    // Regen handles its own tick but doesn't remove itself.
    expect(p.status[STATUS.RERAISE]).toBe(-1);
    expect(p.status[STATUS.QUICK]).toBe(-1);
  });

  // ── Poison tick ──────────────────────────────────────────────────────────

  it('poison deals damage every 15 game-seconds', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 100;

    // rand always returns 10 for damage, 2 for wear-off check (no removal)
    let callCount = 0;
    const rand = (min, max) => {
      callCount++;
      if (callCount === 1) return 10; // damage
      return 2; // rand(1,3) != 1, so poison stays
    };

    const result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.poisonDmg).toBe(10);
    expect(p.hp).toBe(490);
    expect(p.status[STATUS.POISON]).toBe(115); // timer reset
  });

  it('poison wears off with 1-in-3 chance (rand returns 1)', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 100;

    let callCount = 0;
    const rand = (min, max) => {
      callCount++;
      if (callCount === 1) return 10; // damage
      return 1; // rand(1,3) === 1, poison removed
    };

    const result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.poisonDmg).toBe(10);
    expect(p.status[STATUS.POISON]).toBe(0);
    expect(p.status[STATUS.VIRUS]).toBe(0); // cleared by removeStatus
    expect(result.expired).toContain(STATUS.POISON);
  });

  it('virus poison deals 1.5x damage and ticks every 30s', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 100;
    p.status[STATUS.VIRUS] = 1;

    const rand = () => 10;

    // At 115 (only 15s), virus needs 30s interval - should NOT tick
    let result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.poisonDmg).toBe(0);

    // At 130 (30s elapsed) - should tick
    result = tickStatuses(p, 130, { maxHp: 500, rand });
    expect(result.poisonDmg).toBe(15); // 10 * 1.5 = 15
    expect(p.hp).toBe(485);
  });

  it('poison does not tick before 15 game-seconds', () => {
    const p = makePlayer();
    p.status[STATUS.POISON] = 100;

    const result = tickStatuses(p, 110, { maxHp: 500, rand: fixedRand(10) });
    expect(result.poisonDmg).toBe(0);
    expect(p.hp).toBe(500);
  });

  // ── Regen tick ───────────────────────────────────────────────────────────

  it('regen heals HP every 15 game-seconds', () => {
    const p = makePlayer();
    p.hp = 400;
    p.maxHp = 500;
    p.status[STATUS.REGEN] = 100;

    const rand = () => 20;
    const result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.regenHeal).toBe(20);
    expect(p.hp).toBe(420);
    expect(p.status[STATUS.REGEN]).toBe(115); // timer updated
  });

  it('regen does not heal above maxHp', () => {
    const p = makePlayer();
    p.hp = 495;
    p.maxHp = 500;
    p.status[STATUS.REGEN] = 100;

    const rand = () => 20;
    const result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.regenHeal).toBe(5);
    expect(p.hp).toBe(500);
  });

  it('regen does not heal when already at maxHp', () => {
    const p = makePlayer();
    p.hp = 500;
    p.maxHp = 500;
    p.status[STATUS.REGEN] = 100;

    const rand = () => 20;
    const result = tickStatuses(p, 115, { maxHp: 500, rand });
    expect(result.regenHeal).toBe(0);
    expect(p.hp).toBe(500);
  });

  it('regen with permanent (-1) ticks on first call', () => {
    const p = makePlayer();
    p.hp = 400;
    p.maxHp = 500;
    p.status[STATUS.REGEN] = -1;

    const rand = () => 25;
    const result = tickStatuses(p, 100, { maxHp: 500, rand });
    expect(result.regenHeal).toBe(25);
    expect(p.hp).toBe(425);
    // After tick, regen timer is updated to gameTime
    expect(p.status[STATUS.REGEN]).toBe(100);
  });

  // ── MIA expiry ───────────────────────────────────────────────────────────

  it('MIA expires after 30 game-seconds', () => {
    const p = makePlayer();
    p.status[STATUS.MIA] = 100;

    tickStatuses(p, 130);
    expect(p.status[STATUS.MIA]).toBe(0);
  });

  it('permanent MIA (-1) does not expire', () => {
    const p = makePlayer();
    p.status[STATUS.MIA] = -1;

    tickStatuses(p, 99999);
    expect(p.status[STATUS.MIA]).toBe(-1);
  });
});
