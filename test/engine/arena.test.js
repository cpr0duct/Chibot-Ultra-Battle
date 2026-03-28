import { describe, it, expect } from 'vitest';
import { applyRestoration, rollArenaEvent } from '../../engine/arena.js';
import { createPlayer, createArena, createArenaEvent } from '../../engine/types.js';

/** Helper: create a player with some HP/MP for testing */
function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.hp = 300;
  p.maxHp = 500;
  p.mp = 50;
  p.maxMp = 200;
  p.scrNam = 'TestPlayer';
  p.isAlive = true;
  Object.assign(p, overrides);
  return p;
}

/** Helper: create an arena with known restoration ranges */
function makeArena(overrides = {}) {
  const a = createArena();
  Object.assign(a, overrides);
  return a;
}

// ── applyRestoration ──────────────────────────────────────────────────────

describe('applyRestoration', () => {
  it('restores HP within the arena range', () => {
    const p = makePlayer();
    const a = makeArena({ restLowHp: 10, restHighHp: 30, restLowMp: 0, restHighMp: 0 });
    const rand = () => 20; // always returns 20

    const result = applyRestoration(p, a, { rand });
    expect(result.hpRestored).toBe(20);
    expect(p.hp).toBe(320);
  });

  it('restores MP within the arena range', () => {
    const p = makePlayer();
    const a = makeArena({ restLowHp: 0, restHighHp: 0, restLowMp: 5, restHighMp: 15 });
    const rand = () => 10;

    const result = applyRestoration(p, a, { rand });
    expect(result.mpRestored).toBe(10);
    expect(p.mp).toBe(60);
  });

  it('applies hpPerSecond and mpPerSecond gradual recovery', () => {
    const p = makePlayer();
    const a = makeArena({ restLowHp: 0, restHighHp: 0, restLowMp: 0, restHighMp: 0, hpPerSecond: 5, mpPerSecond: 3 });
    const rand = () => 0;

    const result = applyRestoration(p, a, { rand });
    expect(result.hpRestored).toBe(5);
    expect(result.mpRestored).toBe(3);
    expect(p.hp).toBe(305);
    expect(p.mp).toBe(53);
  });

  it('combines rest range and per-second recovery', () => {
    const p = makePlayer();
    const a = makeArena({ restLowHp: 10, restHighHp: 10, restLowMp: 5, restHighMp: 5, hpPerSecond: 2, mpPerSecond: 1 });
    const rand = (min, max) => min; // returns low end

    const result = applyRestoration(p, a, { rand });
    expect(result.hpRestored).toBe(12); // 10 + 2
    expect(result.mpRestored).toBe(6);  // 5 + 1
  });

  it('caps HP at maxHp', () => {
    const p = makePlayer({ hp: 495, maxHp: 500 });
    const a = makeArena({ restLowHp: 20, restHighHp: 20, restLowMp: 0, restHighMp: 0 });
    const rand = () => 20;

    const result = applyRestoration(p, a, { rand });
    expect(result.hpRestored).toBe(5);
    expect(p.hp).toBe(500);
  });

  it('caps MP at maxMp', () => {
    const p = makePlayer({ mp: 195, maxMp: 200 });
    const a = makeArena({ restLowHp: 0, restHighHp: 0, restLowMp: 20, restHighMp: 20 });
    const rand = () => 20;

    const result = applyRestoration(p, a, { rand });
    expect(result.mpRestored).toBe(5);
    expect(p.mp).toBe(200);
  });

  it('does not restore below zero', () => {
    const p = makePlayer({ hp: 500, maxHp: 500 });
    const a = makeArena({ restLowHp: 0, restHighHp: 0, restLowMp: 0, restHighMp: 0, hpPerSecond: 0, mpPerSecond: 0 });
    const rand = () => 0;

    const result = applyRestoration(p, a, { rand });
    expect(result.hpRestored).toBe(0);
    expect(result.mpRestored).toBe(0);
  });
});

// ── rollArenaEvent ────────────────────────────────────────────────────────

describe('rollArenaEvent', () => {
  it('triggers an event and applies damage to a random target', () => {
    const p1 = makePlayer({ scrNam: 'Alice' });
    const p2 = makePlayer({ scrNam: 'Bob' });
    const a = makeArena();
    a.events[0] = {
      name: 'Meteor',
      frequency: 5, // 100% trigger
      hpDamage: 50,
      hitStr: '%T was hit by a meteor!',
      missStr: 'The meteor missed.',
      hitsAll: false,
    };

    // rand: first call roll=1 (triggers), second call idx=0 (picks Alice)
    let callCount = 0;
    const rand = (min, max) => {
      callCount++;
      if (callCount === 1) return 1;  // roll <= 100, triggers
      if (callCount === 2) return 0;  // target index 0
      return min;
    };

    const result = rollArenaEvent(a, [p1, p2], 0, { rand });
    expect(result.triggered).toHaveLength(1);
    expect(result.messages).toContain('Alice was hit by a meteor!');
    expect(p1.hp).toBe(250); // 300 - 50
    expect(p2.hp).toBe(300); // unaffected
  });

  it('does not trigger when roll exceeds threshold', () => {
    const p1 = makePlayer({ scrNam: 'Alice' });
    const a = makeArena();
    a.events[0] = {
      name: 'Quake',
      frequency: 1, // threshold = 20
      hpDamage: 30,
      hitStr: '%T felt the earth shake!',
      missStr: '',
      hitsAll: false,
    };

    // Roll 50 > 20, should not trigger
    const rand = () => 50;

    const result = rollArenaEvent(a, [p1], 0, { rand });
    expect(result.triggered).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
    expect(p1.hp).toBe(300);
  });

  it('hitsAll flag damages all living players', () => {
    const p1 = makePlayer({ scrNam: 'Alice', hp: 200 });
    const p2 = makePlayer({ scrNam: 'Bob', hp: 200 });
    const p3 = makePlayer({ scrNam: 'Dead', hp: 0, isAlive: false });
    const a = makeArena();
    a.events[0] = {
      name: 'Flood',
      frequency: 5,
      hpDamage: 25,
      hitStr: '%T was swept by the flood!',
      missStr: '',
      hitsAll: true,
    };

    const rand = () => 1; // always triggers

    const result = rollArenaEvent(a, [p1, p2, p3], 0, { rand });
    expect(result.triggered).toHaveLength(1);
    expect(result.messages).toHaveLength(2);
    expect(result.messages).toContain('Alice was swept by the flood!');
    expect(result.messages).toContain('Bob was swept by the flood!');
    expect(p1.hp).toBe(175);
    expect(p2.hp).toBe(175);
    expect(p3.hp).toBe(0); // dead player unaffected
  });

  it('skips events with empty name', () => {
    const p1 = makePlayer();
    const a = makeArena();
    // All events have empty name by default
    const rand = () => 1;

    const result = rollArenaEvent(a, [p1], 0, { rand });
    expect(result.triggered).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  it('skips events when no living players', () => {
    const p1 = makePlayer({ isAlive: false });
    const a = makeArena();
    a.events[0] = {
      name: 'Storm',
      frequency: 5,
      hpDamage: 10,
      hitStr: '%T was struck!',
      missStr: '',
      hitsAll: false,
    };

    const rand = () => 1;
    const result = rollArenaEvent(a, [p1], 0, { rand });
    expect(result.triggered).toHaveLength(0);
  });
});
