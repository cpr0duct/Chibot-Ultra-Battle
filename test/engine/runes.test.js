import { describe, it, expect } from 'vitest';
import {
  RUNE_ID,
  RUNE_NAMES,
  applyRuneEffect,
  getRuneDamageModifier,
  getRuneDescription,
} from '../../engine/runes.js';
import { STATUS } from '../../engine/constants.js';
import { createPlayer } from '../../engine/types.js';

/** Helper: create a player for testing */
function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.hp = 500;
  p.maxHp = 500;
  p.mp = 100;
  p.maxMp = 200;
  Object.assign(p, overrides);
  return p;
}

// ── RUNE_NAMES ────────────────────────────────────────────────────────────

describe('RUNE_NAMES', () => {
  it('has all 12 rune names (NONE through SUMMONING)', () => {
    expect(Object.keys(RUNE_NAMES)).toHaveLength(12);
    expect(RUNE_NAMES[RUNE_ID.NONE]).toBe('None');
    expect(RUNE_NAMES[RUNE_ID.HASTE]).toBe('Haste');
    expect(RUNE_NAMES[RUNE_ID.SUMMONING]).toBe('Summoning');
  });
});

// ── applyRuneEffect ───────────────────────────────────────────────────────

describe('applyRuneEffect', () => {
  it('NONE rune does nothing', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.NONE, 0);
    expect(p.rune).toBe(RUNE_ID.NONE);
    expect(p.status[STATUS.HASTE]).toBe(0);
  });

  it('HASTE rune applies Haste status', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.HASTE, 100);
    expect(p.rune).toBe(RUNE_ID.HASTE);
    expect(p.status[STATUS.HASTE]).toBe(100);
  });

  it('MAGIC rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.MAGIC, 0);
    expect(p.rune).toBe(RUNE_ID.MAGIC);
    expect(p.runeTemp).toBe(RUNE_ID.MAGIC);
  });

  it('ARMOR rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.ARMOR, 0);
    expect(p.rune).toBe(RUNE_ID.ARMOR);
    expect(p.runeTemp).toBe(RUNE_ID.ARMOR);
  });

  it('COUNTER rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.COUNTER, 0);
    expect(p.runeTemp).toBe(RUNE_ID.COUNTER);
  });

  it('LUCK rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.LUCK, 0);
    expect(p.runeTemp).toBe(RUNE_ID.LUCK);
  });

  it('SURVIVAL rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.SURVIVAL, 0);
    expect(p.runeTemp).toBe(RUNE_ID.SURVIVAL);
  });

  it('THORNS rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.THORNS, 0);
    expect(p.runeTemp).toBe(RUNE_ID.THORNS);
  });

  it('COUNTER_GUARD rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.COUNTER_GUARD, 0);
    expect(p.runeTemp).toBe(RUNE_ID.COUNTER_GUARD);
  });

  it('STEALTH rune applies MIA status', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.STEALTH, 100);
    expect(p.rune).toBe(RUNE_ID.STEALTH);
    expect(p.status[STATUS.MIA]).toBe(100);
  });

  it('PRE rune applies Quick status', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.PRE, 100);
    expect(p.rune).toBe(RUNE_ID.PRE);
    expect(p.status[STATUS.QUICK]).toBe(-1); // Quick is always -1
  });

  it('SUMMONING rune sets runeTemp', () => {
    const p = makePlayer();
    applyRuneEffect(p, RUNE_ID.SUMMONING, 0);
    expect(p.runeTemp).toBe(RUNE_ID.SUMMONING);
  });
});

// ── getRuneDamageModifier ─────────────────────────────────────────────────

describe('getRuneDamageModifier', () => {
  it('returns 1.0 for no rune', () => {
    const p = makePlayer({ rune: RUNE_ID.NONE });
    expect(getRuneDamageModifier(p, true)).toBe(1.0);
    expect(getRuneDamageModifier(p, false)).toBe(1.0);
  });

  it('Magic rune boosts outgoing magic damage by 25%', () => {
    const p = makePlayer({ rune: RUNE_ID.MAGIC });
    expect(getRuneDamageModifier(p, false)).toBe(1.25); // magic
    expect(getRuneDamageModifier(p, true)).toBe(1.0);   // physical unaffected
  });

  it('Armor rune reduces incoming physical damage by 25%', () => {
    const p = makePlayer({ rune: RUNE_ID.ARMOR });
    expect(getRuneDamageModifier(p, true, true)).toBe(0.75);   // incoming physical
    expect(getRuneDamageModifier(p, false, true)).toBe(1.0);   // incoming magic unaffected
    expect(getRuneDamageModifier(p, true, false)).toBe(1.0);   // outgoing unaffected
  });

  it('returns 1.0 for runes without damage modifiers', () => {
    const p = makePlayer({ rune: RUNE_ID.HASTE });
    expect(getRuneDamageModifier(p, true)).toBe(1.0);
    expect(getRuneDamageModifier(p, false)).toBe(1.0);
    expect(getRuneDamageModifier(p, true, true)).toBe(1.0);
  });
});

// ── getRuneDescription ────────────────────────────────────────────────────

describe('getRuneDescription', () => {
  it('returns description for known runes', () => {
    expect(getRuneDescription(RUNE_ID.HASTE)).toContain('Haste');
    expect(getRuneDescription(RUNE_ID.MAGIC)).toContain('magic');
    expect(getRuneDescription(RUNE_ID.ARMOR)).toContain('physical');
  });

  it('returns fallback for unknown rune ID', () => {
    expect(getRuneDescription(999)).toBe('Unknown rune.');
  });
});
