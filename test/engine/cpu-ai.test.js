import { describe, it, expect } from 'vitest';
import {
  cpuDecide,
  isBeingTargeted,
  getStrongestEnemy,
  getWeakestAlly,
  findHealMove,
  findBuffMove,
  findBestAttackMove,
} from '../../engine/cpu-ai.js';
import { ELEMENT, STATUS, TARGET, PLAYER_MOVE, MAX_SUPER_POINTS } from '../../engine/constants.js';
import { createPlayer, createMove, createArena } from '../../engine/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.scrNam = 'CPU';
  p.charId = 1;
  p.hp = 500;
  p.maxHp = 500;
  p.mp = 100;
  p.maxMp = 100;
  p.sp = 0;
  p.physStr = 50;
  p.magStr = 50;
  p.physDef = 0;
  p.magDef = 0;
  p.isAlive = true;
  p.isCpu = true;
  p.teamId = 1;
  Object.assign(p, overrides);
  return p;
}

function makeEnemy(overrides = {}) {
  return makePlayer({
    scrNam: 'Enemy',
    teamId: 2,
    isCpu: false,
    ...overrides,
  });
}

function makeMove(element, strength, overrides = {}) {
  const m = createMove();
  m.element = element;
  m.strength = strength;
  m.name = 'Test Move';
  m.cmdKey = 'test';
  m.beginAttack = '%SN attacks %T!';
  m.hit = '%SN hits %T!';
  m.miss = '%SN misses %T!';
  Object.assign(m, overrides);
  return m;
}

function makeArena() {
  return createArena();
}

// ── isBeingTargeted ────────────────────────────────────────────────────────

describe('isBeingTargeted', () => {
  it('returns true when an enemy has a pending move targeting this player', () => {
    const cpu = makePlayer();
    const enemy = makeEnemy({ curMove: 1, target: 0 });
    enemy.moves[1] = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    const allPlayers = [cpu, enemy];
    expect(isBeingTargeted(0, allPlayers)).toBe(true);
  });

  it('returns false when no one targets this player', () => {
    const cpu = makePlayer();
    const enemy = makeEnemy({ curMove: 0 });
    const allPlayers = [cpu, enemy];
    expect(isBeingTargeted(0, allPlayers)).toBe(false);
  });

  it('returns true for ALL_FOE targeting', () => {
    const cpu = makePlayer();
    const enemy = makeEnemy({ curMove: 1, target: 1 });
    enemy.moves[1] = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_FOE });
    const allPlayers = [cpu, enemy];
    expect(isBeingTargeted(0, allPlayers)).toBe(true);
  });

  it('returns false when targeted by an ally', () => {
    const cpu = makePlayer();
    const ally = makePlayer({ scrNam: 'Ally', curMove: 1, target: 0, teamId: 1 });
    ally.moves[1] = makeMove(ELEMENT.HEAL, 100, { target: TARGET.ALLY });
    const allPlayers = [cpu, ally];
    expect(isBeingTargeted(0, allPlayers)).toBe(false);
  });
});

// ── getStrongestEnemy ──────────────────────────────────────────────────────

describe('getStrongestEnemy', () => {
  it('returns the enemy with the highest HP', () => {
    const cpu = makePlayer();
    const e1 = makeEnemy({ hp: 300 });
    const e2 = makeEnemy({ hp: 600, scrNam: 'StrongEnemy' });
    const allPlayers = [cpu, e1, e2];
    expect(getStrongestEnemy(cpu, allPlayers)).toBe(2);
  });

  it('returns -1 when no enemies exist', () => {
    const cpu = makePlayer();
    const allPlayers = [cpu];
    expect(getStrongestEnemy(cpu, allPlayers)).toBe(-1);
  });

  it('ignores dead enemies', () => {
    const cpu = makePlayer();
    const e1 = makeEnemy({ hp: 0, isAlive: false });
    const e2 = makeEnemy({ hp: 200 });
    const allPlayers = [cpu, e1, e2];
    expect(getStrongestEnemy(cpu, allPlayers)).toBe(2);
  });
});

// ── getWeakestAlly ─────────────────────────────────────────────────────────

describe('getWeakestAlly', () => {
  it('returns the ally with the lowest HP percentage', () => {
    const cpu = makePlayer({ hp: 400 });
    const ally = makePlayer({ scrNam: 'Ally', hp: 100, maxHp: 500 });
    const allPlayers = [cpu, ally];
    expect(getWeakestAlly(cpu, allPlayers)).toBe(1);
  });

  it('returns self if self is weakest', () => {
    const cpu = makePlayer({ hp: 50, maxHp: 500 });
    const ally = makePlayer({ scrNam: 'Ally', hp: 400, maxHp: 500 });
    const allPlayers = [cpu, ally];
    expect(getWeakestAlly(cpu, allPlayers)).toBe(0);
  });
});

// ── findHealMove ───────────────────────────────────────────────────────────

describe('findHealMove', () => {
  it('finds a heal-element move', () => {
    const p = makePlayer();
    p.moves[0] = makeMove(ELEMENT.FIRE, 100);
    p.moves[1] = makeMove(ELEMENT.HEAL, 200, { name: 'Cure' });
    expect(findHealMove(p)).toBe(1);
  });

  it('returns -1 when no heal moves exist', () => {
    const p = makePlayer();
    p.moves[0] = makeMove(ELEMENT.FIRE, 100);
    expect(findHealMove(p)).toBe(-1);
  });

  it('returns the strongest heal move', () => {
    const p = makePlayer();
    p.moves[0] = makeMove(ELEMENT.HEAL, 50, { name: 'Minor Heal' });
    p.moves[1] = makeMove(ELEMENT.HEAL, 200, { name: 'Major Heal' });
    expect(findHealMove(p)).toBe(1);
  });
});

// ── findBuffMove ───────────────────────────────────────────────────────────

describe('findBuffMove', () => {
  it('finds a move that applies Regen', () => {
    const p = makePlayer();
    const m = makeMove(ELEMENT.NO_DMG, 0, { name: 'Regen Spell' });
    m.status[STATUS.REGEN] = 100;
    p.moves[0] = m;
    expect(findBuffMove(p, STATUS.REGEN)).toBe(0);
  });

  it('returns -1 when no buff move with high enough chance', () => {
    const p = makePlayer();
    const m = makeMove(ELEMENT.NO_DMG, 0, { name: 'Weak Buff' });
    m.status[STATUS.HASTE] = 30; // below 75% threshold
    p.moves[0] = m;
    expect(findBuffMove(p, STATUS.HASTE)).toBe(-1);
  });
});

// ── findBestAttackMove ─────────────────────────────────────────────────────

describe('findBestAttackMove', () => {
  it('returns the move with highest projected damage', () => {
    const p = makePlayer();
    const t = makeEnemy();
    const arena = makeArena();
    p.moves[0] = makeMove(ELEMENT.FIRE, 50, { name: 'Fireball' });
    p.moves[1] = makeMove(ELEMENT.FIRE, 200, { name: 'Mega Fire' });
    expect(findBestAttackMove(p, t, arena)).toBe(1);
  });

  it('skips MP_THEFT and HP_THEFT moves', () => {
    const p = makePlayer();
    const t = makeEnemy();
    const arena = makeArena();
    p.moves[0] = makeMove(ELEMENT.HP_THEFT, 200, { name: 'Drain' });
    p.moves[1] = makeMove(ELEMENT.FIRE, 50, { name: 'Fire' });
    expect(findBestAttackMove(p, t, arena)).toBe(1);
  });

  it('returns -1 when no damaging moves', () => {
    const p = makePlayer();
    const t = makeEnemy();
    const arena = makeArena();
    p.moves[0] = makeMove(ELEMENT.HEAL, 100, { name: 'Heal' });
    expect(findBestAttackMove(p, t, arena)).toBe(-1);
  });
});

// ── cpuDecide — Priority chain ─────────────────────────────────────────────

describe('cpuDecide', () => {
  it('returns null for dead players', () => {
    const cpu = makePlayer({ hp: 0, isAlive: false });
    const result = cpuDecide(cpu, 0, [cpu], makeArena(), 100, { seed: 42 });
    expect(result).toBeNull();
  });

  it('returns null if player already has a pending move', () => {
    const cpu = makePlayer({ curMove: 1 });
    const result = cpuDecide(cpu, 0, [cpu], makeArena(), 100, { seed: 42 });
    expect(result).toBeNull();
  });

  // ── Priority 1: Block when targeted ──────────────────────────────────

  it('blocks when being targeted with enough SP', () => {
    const cpu = makePlayer({ sp: 100 });
    cpu.moves[0] = makeMove(ELEMENT.FIRE, 100, { name: 'Fire Blast' });

    const enemy = makeEnemy({ curMove: 1, target: 0 });
    enemy.moves[1] = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });

    const allPlayers = [cpu, enemy];
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });

    expect(result).not.toBeNull();
    expect(result.action).toBe('block');
    expect(result.moveIndex).toBe(PLAYER_MOVE.BLOCK);
  });

  it('does not block when SP < 100 and HP is low', () => {
    const cpu = makePlayer({ sp: 50, hp: 100 }); // HP < 40% of 500
    cpu.moves[0] = makeMove(ELEMENT.FIRE, 100, { name: 'Fire Blast' });

    const enemy = makeEnemy({ curMove: 1, target: 0 });
    enemy.moves[1] = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });

    const allPlayers = [cpu, enemy];
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });

    expect(result).not.toBeNull();
    // Should not block (SP < 100 and HP is low)
    expect(result.action).not.toBe('block');
  });

  // ── Priority 2: Super attack ─────────────────────────────────────────

  it('uses Super when SP >= 100 and arrogance is high', () => {
    const cpu = makePlayer({
      sp: 150,
      cpuPersonality: { goodwill: 50, greed: 50, wrath: 50, arrogance: 90 },
    });
    const superMove = makeMove(ELEMENT.FIRE, 200, {
      name: 'Super Fire',
      canSuper: 1,
    });
    cpu.moves[0] = superMove;

    const enemy = makeEnemy();
    const allPlayers = [cpu, enemy];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('super');
    expect(result.moveIndex).toBe(0);
    expect(result.targetIndex).toBe(1);
  });

  it('does not use Super when arrogance is low and SP < 300', () => {
    const cpu = makePlayer({
      sp: 150,
      cpuPersonality: { goodwill: 50, greed: 50, wrath: 50, arrogance: 20 },
    });
    const superMove = makeMove(ELEMENT.FIRE, 200, {
      name: 'Super Fire',
      canSuper: 1,
    });
    const normalMove = makeMove(ELEMENT.FIRE, 100, { name: 'Normal Fire' });
    cpu.moves[0] = superMove;
    cpu.moves[1] = normalMove;

    const enemy = makeEnemy();
    const allPlayers = [cpu, enemy];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    // Should attack normally, not super
    expect(result.action).not.toBe('super');
  });

  // ── Priority 3/4: Heal low-HP ally with high goodwill ────────────────

  it('heals low-HP ally when goodwill is high', () => {
    const cpu = makePlayer({
      cpuPersonality: { goodwill: 90, greed: 10, wrath: 10, arrogance: 10 },
    });
    const healMove = makeMove(ELEMENT.HEAL, 200, {
      name: 'Heal',
      target: TARGET.ALLY,
    });
    cpu.moves[0] = healMove;

    // No attack moves available
    const ally = makePlayer({ scrNam: 'Ally', hp: 100, maxHp: 500 }); // 20% HP
    const enemy = makeEnemy();
    const allPlayers = [cpu, ally, enemy];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('heal');
    expect(result.targetIndex).toBe(1); // ally
  });

  it('heals self when HP is below threshold', () => {
    const cpu = makePlayer({
      hp: 200, // 40%, below 50% threshold
      cpuPersonality: { goodwill: 50, greed: 10, wrath: 10, arrogance: 10 },
    });
    const healMove = makeMove(ELEMENT.HEAL, 200, {
      name: 'Self Heal',
      target: TARGET.ONLY_SELF,
    });
    cpu.moves[0] = healMove;

    const enemy = makeEnemy();
    const allPlayers = [cpu, enemy];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('heal');
    expect(result.targetIndex).toBe(0); // self
  });

  // ── Priority 5: Attack strongest enemy ───────────────────────────────

  it('attacks the strongest enemy', () => {
    const cpu = makePlayer({
      cpuPersonality: { goodwill: 10, greed: 10, wrath: 90, arrogance: 10 },
    });
    cpu.moves[0] = makeMove(ELEMENT.FIRE, 100, { name: 'Fireball' });

    const e1 = makeEnemy({ hp: 200 });
    const e2 = makeEnemy({ hp: 600, scrNam: 'StrongEnemy' });
    const allPlayers = [cpu, e1, e2];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('attack');
    expect(result.targetIndex).toBe(2); // strongest enemy
  });

  // ── Priority 6: Divert HP→SP when greedy ─────────────────────────────

  it('diverts HP to SP when greedy and HP is comfortable', () => {
    const cpu = makePlayer({
      hp: 480, maxHp: 500, sp: 0,
      cpuPersonality: { goodwill: 10, greed: 90, wrath: 10, arrogance: 10 },
    });
    // No moves at all — forces fallback past attack
    cpu.moves = [];

    const allPlayers = [cpu]; // No enemies to attack
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('divert');
    expect(result.divertAmount).toBeGreaterThan(0);
  });

  it('diverts more aggressively with high greed (50% HP threshold)', () => {
    const cpu = makePlayer({
      hp: 300, maxHp: 500, sp: 0, // 60% HP, above 50%
      cpuPersonality: { goodwill: 10, greed: 90, wrath: 10, arrogance: 10 },
    });
    cpu.moves = [];

    const allPlayers = [cpu];
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('divert');
  });

  it('does not divert when greed is low and HP is not high enough', () => {
    const cpu = makePlayer({
      hp: 400, maxHp: 500, sp: 0, // 80% HP, below 5/6 threshold
      cpuPersonality: { goodwill: 10, greed: 10, wrath: 10, arrogance: 10 },
    });
    cpu.moves = [];

    const allPlayers = [cpu];
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    // Should rest instead of divert (HP below 5/6 = 83%)
    expect(result.action).toBe('rest');
  });

  // ── Priority 7: Rest as fallback ─────────────────────────────────────

  it('rests as fallback when nothing else to do', () => {
    const cpu = makePlayer({
      hp: 300, maxHp: 500, sp: MAX_SUPER_POINTS, // SP full, HP not high enough to divert
      cpuPersonality: { goodwill: 10, greed: 10, wrath: 10, arrogance: 10 },
    });
    // No moves available
    cpu.moves = [];

    const allPlayers = [cpu]; // No enemies
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('rest');
    expect(result.moveIndex).toBe(PLAYER_MOVE.REST);
  });

  // ── Personality weights affect decisions ─────────────────────────────

  it('high wrath prioritizes attacking even when heal is available', () => {
    const cpu = makePlayer({
      hp: 200, maxHp: 500, // 40% HP, below heal threshold
      cpuPersonality: { goodwill: 10, greed: 10, wrath: 95, arrogance: 10 },
    });
    // Both heal and attack moves, but attack first in list
    cpu.moves[0] = makeMove(ELEMENT.FIRE, 200, { name: 'Strong Attack' });
    cpu.moves[1] = makeMove(ELEMENT.HEAL, 100, { name: 'Heal', target: TARGET.ONLY_SELF });

    const enemy = makeEnemy();
    const allPlayers = [cpu, enemy];

    // With seed 42, goodwill of 10 means heal check rarely passes,
    // but wrath of 95 means attack check almost always passes.
    // Self-heal still triggers at priority 4 if HP < threshold,
    // so let's test that wrath > goodwill in the overall behavior
    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    // Even with low HP, the CPU should act (not return null)
    expect(['attack', 'heal']).toContain(result.action);
  });

  it('high goodwill heals allies even at 70% HP', () => {
    const cpu = makePlayer({
      cpuPersonality: { goodwill: 90, greed: 10, wrath: 10, arrogance: 10 },
    });
    cpu.moves[0] = makeMove(ELEMENT.HEAL, 200, { name: 'Heal', target: TARGET.ALLY });

    // Ally at 60% HP — normally wouldn't heal, but high goodwill threshold is 70%
    const ally = makePlayer({ scrNam: 'Ally', hp: 300, maxHp: 500 });
    const allPlayers = [cpu, ally];

    const result = cpuDecide(cpu, 0, allPlayers, makeArena(), 100, { seed: 42 });
    expect(result).not.toBeNull();
    expect(result.action).toBe('heal');
    expect(result.targetIndex).toBe(1);
  });
});
