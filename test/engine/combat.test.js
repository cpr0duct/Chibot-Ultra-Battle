import { describe, it, expect } from 'vitest';
import {
  queueMove,
  resolveMove,
  resolveBlock,
  resolveRest,
  resolveFatality,
  getTargets,
  checkBattleEnd,
} from '../../engine/combat.js';
import { ELEMENT, STATUS, TARGET, PLAYER_MOVE, TIMING, CHEESE_LIMIT } from '../../engine/constants.js';
import { createPlayer, createMove, createArena } from '../../engine/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.scrNam = 'TestPlayer';
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
  p.teamId = 1;
  Object.assign(p, overrides);
  return p;
}

function makeMove(element, strength, overrides = {}) {
  const m = createMove();
  m.element = element;
  m.strength = strength;
  m.name = 'Test Move';
  m.beginAttack = '%SN attacks %T!';
  m.hit = '%SN hits %T!';
  m.miss = '%SN misses %T!';
  m.critHit = '%SN critically hits %T!';
  Object.assign(m, overrides);
  return m;
}

function makeArena() {
  return createArena();
}

function makeGameState(allPlayers, overrides = {}) {
  return {
    gameTime: 0,
    allPlayers,
    arena: makeArena(),
    ...overrides,
  };
}

// ── getTargets ─────────────────────────────────────────────────────────────

describe('getTargets', () => {
  function setupPlayers() {
    return [
      makePlayer({ scrNam: 'P0', teamId: 1 }),
      makePlayer({ scrNam: 'P1', teamId: 1 }),
      makePlayer({ scrNam: 'P2', teamId: 2 }),
      makePlayer({ scrNam: 'P3', teamId: 2 }),
    ];
  }

  it('ENEMY: returns only the selected target', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.PHYSICAL, 100, { target: TARGET.ENEMY });
    const targets = getTargets(0, move, players, 2);
    expect(targets).toEqual([2]);
  });

  it('ALL_FOE: returns all living enemies', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_FOE });
    const targets = getTargets(0, move, players, 2);
    expect(targets).toEqual([2, 3]);
  });

  it('ALL_FRIEND: returns all living allies', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.HEAL, 100, { target: TARGET.ALL_FRIEND });
    const targets = getTargets(0, move, players, 0);
    expect(targets).toEqual([0, 1]);
  });

  it('ALLY: returns single ally', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.HEAL, 100, { target: TARGET.ALLY });
    const targets = getTargets(0, move, players, 1);
    expect(targets).toEqual([1]);
  });

  it('ALL_TEAM: returns all on target team', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_TEAM });
    const targets = getTargets(0, move, players, 2);
    expect(targets).toEqual([2, 3]);
  });

  it('EVERYBODY: returns all living players', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.EVERYBODY });
    const targets = getTargets(0, move, players, 0);
    expect(targets).toEqual([0, 1, 2, 3]);
  });

  it('ALL_BUT_SELF: returns everyone except self', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_BUT_SELF });
    const targets = getTargets(0, move, players, 0);
    expect(targets).toEqual([1, 2, 3]);
  });

  it('ONLY_SELF: returns just self', () => {
    const players = setupPlayers();
    const move = makeMove(ELEMENT.HEAL, 100, { target: TARGET.ONLY_SELF });
    const targets = getTargets(0, move, players, 0);
    expect(targets).toEqual([0]);
  });

  it('skips dead players for non-Life moves', () => {
    const players = setupPlayers();
    players[2].hp = 0;
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_FOE });
    const targets = getTargets(0, move, players, 2);
    expect(targets).toEqual([3]);
  });

  it('includes dead players for Life moves', () => {
    const players = setupPlayers();
    players[1].hp = 0;
    const move = makeMove(ELEMENT.LIFE, 0, { target: TARGET.ALLY });
    const targets = getTargets(0, move, players, 1);
    expect(targets).toEqual([1]);
  });

  it('skips MIA players', () => {
    const players = setupPlayers();
    players[2].status[STATUS.MIA] = 100;
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ALL_FOE });
    const targets = getTargets(0, move, players, 2);
    expect(targets).toEqual([3]);
  });
});

// ── queueMove ──────────────────────────────────────────────────────────────

describe('queueMove', () => {
  it('queues a valid move and returns begin-attack message', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100);
    attacker.moves = [null, move]; // move index 1
    const gs = makeGameState([attacker, target], { gameTime: 10 });

    const result = queueMove(attacker, 0, 1, 1, gs);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Attacker');
    expect(result.message).toContain('Target');
    expect(attacker.curMove).toBe(2); // moveIndex 1 stored as 1-based: 1+1=2
    expect(attacker.target).toBe(1);
    expect(attacker.moveStart).toBe(10);
  });

  it('fails if player is dead', () => {
    const p = makePlayer({ hp: 0, isAlive: false });
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/dead/i);
  });

  it('fails if player is frozen', () => {
    const p = makePlayer();
    p.status[STATUS.FREEZE] = 100;
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/status effect/i);
  });

  it('fails if player is stopped', () => {
    const p = makePlayer();
    p.status[STATUS.STOP] = 100;
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
  });

  it('fails if player is sleeping', () => {
    const p = makePlayer();
    p.status[STATUS.SLEEP] = 100;
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
  });

  it('fails if player is stunned', () => {
    const p = makePlayer();
    p.status[STATUS.STUN] = 100;
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
  });

  it('fails if muted and move is non-physical', () => {
    const p = makePlayer();
    p.status[STATUS.MUTE] = 100;
    p.moves = [null, makeMove(ELEMENT.FIRE, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Mute/);
  });

  it('allows physical move when muted', () => {
    const p = makePlayer();
    const target = makePlayer({ teamId: 2, scrNam: 'Target' });
    p.status[STATUS.MUTE] = 100;
    p.moves = [null, makeMove(ELEMENT.PHYSICAL, 100)];
    const gs = makeGameState([p, target]);
    const result = queueMove(p, 0, 1, 1, gs);
    expect(result.success).toBe(true);
  });

  it('fails if scarecrow and move is physical', () => {
    const p = makePlayer();
    p.status[STATUS.SCARECROW] = 100;
    p.moves = [null, makeMove(ELEMENT.PHYSICAL, 100)];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/scarecrow/i);
  });

  it('warns but allows when MP is insufficient (VB6 behavior)', () => {
    const p = makePlayer({ mp: 0 });
    const target = makePlayer({ teamId: 2, scrNam: 'Target' });
    const move = makeMove(ELEMENT.FIRE, 100, { mpReq: 50 });
    p.moves = [null, move];
    const gs = makeGameState([p, target]);
    const result = queueMove(p, 0, 1, 1, gs);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/WARNING.*MP/i);
  });

  it('rejects cheese-limited attack', () => {
    const p = makePlayer({ cheese: CHEESE_LIMIT });
    const target = makePlayer({ teamId: 2, scrNam: 'Target' });
    const move = makeMove(ELEMENT.FIRE, 200);
    p.moves = [null, move];
    const gs = makeGameState([p, target]);
    const result = queueMove(p, 0, 1, 1, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cheezy/i);
  });

  it('allows cheese-limited attack if PMS status is active', () => {
    const p = makePlayer({ cheese: CHEESE_LIMIT });
    const target = makePlayer({ teamId: 2, scrNam: 'Target' });
    p.status[STATUS.PMS] = 100;
    const move = makeMove(ELEMENT.FIRE, 200);
    p.moves = [null, move];
    const gs = makeGameState([p, target]);
    const result = queueMove(p, 0, 1, 1, gs);
    expect(result.success).toBe(true);
  });

  it('rejects move that requires super when not supered', () => {
    const p = makePlayer({ superNum: 0 });
    const move = makeMove(ELEMENT.FIRE, 100, { canSuper: 2 });
    p.moves = [null, move];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Super/);
  });

  it('rejects move that cannot be supered when superNum > 0', () => {
    const p = makePlayer({ superNum: 1, sp: 100 });
    const move = makeMove(ELEMENT.FIRE, 100, { canSuper: 0 });
    p.moves = [null, move];
    const gs = makeGameState([p]);
    const result = queueMove(p, 0, 1, 0, gs);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cannot be Supered/);
  });

  it('applies Quick status: moveStart set far in past', () => {
    const p = makePlayer();
    const target = makePlayer({ teamId: 2, scrNam: 'Target' });
    p.status[STATUS.QUICK] = -1;
    const move = makeMove(ELEMENT.FIRE, 100);
    p.moves = [null, move];
    const gs = makeGameState([p, target], { gameTime: 100 });
    const result = queueMove(p, 0, 1, 1, gs);
    expect(result.success).toBe(true);
    expect(p.moveStart).toBeLessThan(0);
    expect(p.status[STATUS.QUICK]).toBe(0);
  });
});

// ── resolveMove ────────────────────────────────────────────────────────────

describe('resolveMove', () => {
  it('does not resolve before time is up', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), 5);
    expect(result.resolved).toBe(false);
  });

  it('resolves a normal hit after enough time (seed for guaranteed hit)', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', physStr: 50, magStr: 50 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2, hp: 500, maxHp: 500, physDef: 0, magDef: 0 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // rng: first call = hit (0.1 < hitChance), second = damage seed, third+ = status
    let callCount = 0;
    const rng = () => {
      callCount++;
      return 0.5;
    };

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(target.hp).toBeLessThan(500);
    expect(attacker.curMove).toBe(0);
  });

  it('generates a miss when hit roll fails', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    const target = makePlayer({ scrNam: 'Target', teamId: 2, magDef: 199 }); // very high defense
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // rng returns 0.99 for hit roll -> misses when defense is very high
    const rng = () => 0.99;

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(result.messages.some(m => m.includes('misses'))).toBe(true);
    expect(target.hp).toBe(500); // no damage
  });

  it('generates a critical hit message', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // first call = hit roll (0.05 < 1.0 hitChance), second = damage seed (0.05 < 0.1 = crit)
    let callIdx = 0;
    const rng = () => {
      callIdx++;
      return 0.05;
    };

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    // Damage should be applied (crit = 2x damage)
    expect(target.hp).toBeLessThan(500);
  });

  it('heals target with HEAL element', () => {
    const healer = makePlayer({ scrNam: 'Healer', magStr: 50 });
    const target = makePlayer({ scrNam: 'Target', teamId: 1, hp: 200, maxHp: 500 });
    const move = makeMove(ELEMENT.HEAL, 100, {
      target: TARGET.ALLY,
      healSelf: '%SN heals %T.',
    });
    healer.moves = [null, move];
    healer.curMove = 2; // 1-based: move at index 1 → curMove=2
    healer.target = 1;
    healer.moveStart = 0;

    const rng = () => 0.5;
    const result = resolveMove(healer, 0, [healer, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(target.hp).toBeGreaterThan(200);
    expect(result.messages.some(m => m.includes('heals'))).toBe(true);
  });

  it('applies status effects from move', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    // 100% chance to apply poison
    move.status[STATUS.POISON] = 100;
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // rng: hit = 0.2 (hit), damage = 0.5, status roll = 0.5 (1-50 out of 100 = applied)
    const rng = () => 0.2;

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(result.statusChanges.some(sc => sc.status === STATUS.POISON && sc.applied)).toBe(true);
    expect(target.status[STATUS.POISON]).not.toBe(0);
  });

  it('consumes MP at resolution time', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', mp: 50 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY, mpReq: 30 });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const rng = () => 0.5;
    resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(attacker.mp).toBe(20);
  });

  it('fizzles if MP is gone at resolution time', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', mp: 0 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY, mpReq: 30 });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT);
    expect(result.resolved).toBe(true);
    expect(result.messages.some(m => m.includes('fizzles'))).toBe(true);
    expect(target.hp).toBe(500);
  });

  it('super attack consumes SP and applies multiplier', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', sp: 150, superNum: 1 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY, canSuper: 1 });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const rng = () => 0.5;
    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(attacker.sp).toBeLessThan(150); // consumed 100 SP (may gain some back from damage)
  });

  it('Haste reduces resolution time', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    attacker.status[STATUS.HASTE] = 1;
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // NORMAL_MOVE_HIT=15, HASTE_HIT=-5, so time needed = 10
    const rng = () => 0.5;
    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), 10, { rng });
    expect(result.resolved).toBe(true);
  });

  it('Slow increases resolution time', () => {
    const attacker = makePlayer({ scrNam: 'Attacker' });
    attacker.status[STATUS.SLOW] = 1;
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    // NORMAL_MOVE_HIT=15, SLOW_HIT=+5, so time needed = 20
    const rng = () => 0.5;
    const notYet = resolveMove(attacker, 0, [attacker, target], makeArena(), 19, { rng });
    expect(notYet.resolved).toBe(false);

    const now = resolveMove(attacker, 0, [attacker, target], makeArena(), 20, { rng });
    expect(now.resolved).toBe(true);
  });

  it('kills register and Reraise triggers', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', magStr: 100 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2, hp: 1, maxHp: 500 });
    target.status[STATUS.RERAISE] = -1;
    const move = makeMove(ELEMENT.FIRE, 200, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const rng = () => 0.5;
    const result = resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    // Reraise should have triggered
    expect(target.hp).toBeGreaterThan(0);
    expect(target.isAlive).toBe(true);
    expect(target.status[STATUS.RERAISE]).toBe(42); // consumed
    expect(result.messages.some(m => m.includes('Reraise'))).toBe(true);
  });

  it('updates cheese counter on damage', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', cheese: 0 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const rng = () => 0.5;
    resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(attacker.cheese).toBeGreaterThan(0);
  });

  it('attacker gains SP from dealing damage', () => {
    const attacker = makePlayer({ scrNam: 'Attacker', sp: 0 });
    const target = makePlayer({ scrNam: 'Target', teamId: 2 });
    const move = makeMove(ELEMENT.FIRE, 100, { target: TARGET.ENEMY });
    attacker.moves = [null, move];
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 1;
    attacker.moveStart = 0;

    const rng = () => 0.5;
    resolveMove(attacker, 0, [attacker, target], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(attacker.sp).toBeGreaterThan(0);
  });

  it('LIFE element revives dead player', () => {
    const caster = makePlayer({ scrNam: 'Caster' });
    const dead = makePlayer({ scrNam: 'Dead', teamId: 1, hp: 0, isAlive: false });
    const move = makeMove(ELEMENT.LIFE, 0, { target: TARGET.ALLY });
    caster.moves = [null, move];
    caster.curMove = 2; // 1-based: move at index 1 → curMove=2
    caster.target = 1;
    caster.moveStart = 0;

    const rng = () => 0.5;
    const result = resolveMove(caster, 0, [caster, dead], makeArena(), TIMING.NORMAL_MOVE_HIT, { rng });
    expect(result.resolved).toBe(true);
    expect(dead.hp).toBeGreaterThan(0);
    expect(dead.isAlive).toBe(true);
    expect(result.messages.some(m => m.includes('revives'))).toBe(true);
  });
});

// ── resolveBlock ───────────────────────────────────────────────────────────

describe('resolveBlock', () => {
  it('does not resolve before block timer expires', () => {
    const blocker = makePlayer({ scrNam: 'Blocker' });
    blocker.curMove = PLAYER_MOVE.BLOCK;
    blocker.moveStart = 0;
    blocker.target = 0;

    const result = resolveBlock(blocker, 0, [blocker], 10);
    expect(result.resolved).toBe(false);
  });

  it('resolves after block timer expires', () => {
    const blocker = makePlayer({ scrNam: 'Blocker' });
    blocker.curMove = PLAYER_MOVE.BLOCK;
    blocker.moveStart = 0;
    blocker.target = 0;

    const result = resolveBlock(blocker, 0, [blocker], TIMING.BLOCK_HIT);
    expect(result.resolved).toBe(true);
    expect(blocker.curMove).toBe(0);
    expect(result.messages.some(m => m.includes('lowers their guard'))).toBe(true);
  });

  it('counter-attacks when attacker is targeting blocker and SP >= 100', () => {
    const blocker = makePlayer({ scrNam: 'Blocker', sp: 100 });
    const counterMove = makeMove(ELEMENT.PHYSICAL, 50);
    blocker.moves = [null, counterMove];
    blocker.curMove = PLAYER_MOVE.BLOCK;
    blocker.moveStart = 0;
    blocker.target = 1; // counter move index

    const attacker = makePlayer({ scrNam: 'Attacker', teamId: 2 });
    attacker.curMove = 2; // 1-based: move at index 1 → curMove=2
    attacker.target = 0; // targeting blocker
    attacker.moveStart = 0;
    attacker.moves = [null, makeMove(ELEMENT.FIRE, 100)];

    const result = resolveBlock(blocker, 0, [blocker, attacker], TIMING.BLOCK_HIT);
    expect(result.resolved).toBe(true);
    expect(result.counterTarget).toBe(1);
    expect(blocker.sp).toBe(0);
    expect(result.messages.some(m => m.includes('counter-attacks'))).toBe(true);
  });
});

// ── resolveRest ────────────────────────────────────────────────────────────

describe('resolveRest', () => {
  it('does not resolve before timer', () => {
    const player = makePlayer();
    player.curMove = PLAYER_MOVE.REST;
    player.moveStart = 0;
    const result = resolveRest(player, 0, makeArena(), 5);
    expect(result.resolved).toBe(false);
  });

  it('resolves and recovers HP/MP', () => {
    const arena = makeArena();
    arena.restLowHp = 20;
    arena.restHighHp = 50;
    arena.restLowMp = 5;
    arena.restHighMp = 15;

    const player = makePlayer({ hp: 200, maxHp: 500, mp: 20, maxMp: 100, sp: 0 });
    player.curMove = PLAYER_MOVE.REST;
    player.moveStart = 0;

    const result = resolveRest(player, 0, arena, TIMING.REST_HIT);
    expect(result.resolved).toBe(true);
    expect(player.hp).toBeGreaterThan(200);
    expect(player.mp).toBeGreaterThan(20);
    expect(player.sp).toBe(5);
    expect(player.curMove).toBe(0);
  });

  it('respects Haste modifier on rest timing', () => {
    const arena = makeArena();
    arena.restLowHp = 20;
    arena.restHighHp = 50;

    const player = makePlayer({ hp: 200, maxHp: 500 });
    player.status[STATUS.HASTE] = 1;
    player.curMove = PLAYER_MOVE.REST;
    player.moveStart = 0;

    // REST_HIT=10, HASTE=-5, so time needed = 5
    const result = resolveRest(player, 0, arena, 5);
    expect(result.resolved).toBe(true);
  });
});

// ── resolveFatality ────────────────────────────────────────────────────────

describe('resolveFatality', () => {
  it('does not resolve before timer', () => {
    const player = makePlayer();
    player.curMove = PLAYER_MOVE.FATAL;
    player.moveStart = 0;
    const target = makePlayer({ hp: 10, maxHp: 500 });
    const result = resolveFatality(player, 0, target, 1, 5);
    expect(result.resolved).toBe(false);
  });

  it('kills target at low HP (hp <= maxHp/6)', () => {
    const player = makePlayer({ scrNam: 'Killer' });
    player.curMove = PLAYER_MOVE.FATAL;
    player.moveStart = 0;
    // maxHp/6 = 83, target has 80
    const target = makePlayer({ scrNam: 'Victim', hp: 80, maxHp: 500 });

    const result = resolveFatality(player, 0, target, 1, TIMING.FATAL_HIT);
    expect(result.resolved).toBe(true);
    expect(result.killed).toBe(true);
    expect(target.hp).toBe(0);
    expect(target.isAlive).toBe(false);
  });

  it('ignores Reraise on fatality', () => {
    const player = makePlayer({ scrNam: 'Killer' });
    player.curMove = PLAYER_MOVE.FATAL;
    player.moveStart = 0;
    const target = makePlayer({ scrNam: 'Victim', hp: 80, maxHp: 500 });
    target.status[STATUS.RERAISE] = -1;

    const result = resolveFatality(player, 0, target, 1, TIMING.FATAL_HIT);
    expect(result.killed).toBe(true);
    expect(target.status[STATUS.RERAISE]).toBe(0);
    expect(target.isAlive).toBe(false);
  });

  it('fails if target HP is too high', () => {
    const player = makePlayer({ scrNam: 'Killer' });
    player.curMove = PLAYER_MOVE.FATAL;
    player.moveStart = 0;
    // maxHp/6 = 83, target has 200
    const target = makePlayer({ scrNam: 'Victim', hp: 200, maxHp: 500 });

    const result = resolveFatality(player, 0, target, 1, TIMING.FATAL_HIT);
    expect(result.resolved).toBe(true);
    expect(result.killed).toBe(false);
    expect(target.hp).toBe(200);
    expect(result.messages.some(m => m.includes('not weak enough'))).toBe(true);
  });
});

// ── checkBattleEnd ─────────────────────────────────────────────────────────

describe('checkBattleEnd', () => {
  it('teams: not ended when multiple teams alive', () => {
    const players = [
      makePlayer({ teamId: 1 }),
      makePlayer({ teamId: 2 }),
    ];
    const result = checkBattleEnd(players, 'teams');
    expect(result.ended).toBe(false);
  });

  it('teams: ended when one team left', () => {
    const players = [
      makePlayer({ teamId: 1 }),
      makePlayer({ teamId: 1 }),
      makePlayer({ teamId: 2, hp: 0, isAlive: false }),
    ];
    const result = checkBattleEnd(players, 'teams');
    expect(result.ended).toBe(true);
    expect(result.winners).toEqual([0, 1]);
    expect(result.message).toMatch(/Team 1 wins/);
  });

  it('teams: draw when everyone dead', () => {
    const players = [
      makePlayer({ teamId: 1, hp: 0, isAlive: false }),
      makePlayer({ teamId: 2, hp: 0, isAlive: false }),
    ];
    const result = checkBattleEnd(players, 'teams');
    expect(result.ended).toBe(true);
    expect(result.winners).toEqual([]);
    expect(result.message).toMatch(/Draw/);
  });

  it('ffa: not ended when multiple alive', () => {
    const players = [
      makePlayer({ scrNam: 'P1' }),
      makePlayer({ scrNam: 'P2' }),
    ];
    const result = checkBattleEnd(players, 'ffa');
    expect(result.ended).toBe(false);
  });

  it('ffa: ended when one player left', () => {
    const players = [
      makePlayer({ scrNam: 'Winner' }),
      makePlayer({ scrNam: 'Loser', hp: 0, isAlive: false }),
    ];
    const result = checkBattleEnd(players, 'ffa');
    expect(result.ended).toBe(true);
    expect(result.winners).toEqual([0]);
    expect(result.message).toMatch(/Winner wins/);
  });

  it('ffa: draw when nobody alive', () => {
    const players = [
      makePlayer({ hp: 0, isAlive: false }),
      makePlayer({ hp: 0, isAlive: false }),
    ];
    const result = checkBattleEnd(players, 'ffa');
    expect(result.ended).toBe(true);
    expect(result.winners).toEqual([]);
    expect(result.message).toMatch(/Draw/);
  });
});
