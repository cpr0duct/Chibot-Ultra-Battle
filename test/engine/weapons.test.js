import { describe, it, expect } from 'vitest';
import {
  WEAPON_EFFECT,
  equipWeapon,
  useWeaponMove,
  getWeaponMoves,
} from '../../engine/weapons.js';
import { createPlayer, createWeapon, createMove } from '../../engine/types.js';

/** Helper: create a player for testing */
function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.hp = 500;
  p.maxHp = 500;
  Object.assign(p, overrides);
  return p;
}

/** Helper: create a weapon with known moves */
function makeWeapon(overrides = {}) {
  const w = createWeapon();
  Object.assign(w, overrides);
  return w;
}

/** Helper: create a move with a name and weaponEffect */
function makeMove(name, weaponEffect = 0) {
  const m = createMove();
  m.name = name;
  m.weaponEffect = weaponEffect;
  return m;
}

// ── equipWeapon ───────────────────────────────────────────────────────────

describe('equipWeapon', () => {
  it('sets player.weapon and player.wpnUsesLeft', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Sword', numUses: 5, equipStr: 'You equip the Sword!' });
    w.moves[0] = makeMove('Slash');
    w.moves[1] = makeMove('Thrust');

    const result = equipWeapon(p, w);
    expect(p.weapon).toBe(w);
    expect(p.wpnUsesLeft).toBe(5);
    expect(result.messages).toContain('You equip the Sword!');
  });

  it('adds weapon moves to player.moves', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Axe', numUses: 3 });
    w.moves[0] = makeMove('Chop');

    equipWeapon(p, w);
    expect(p.moves.some((m) => m.name === 'Chop')).toBe(true);
  });

  it('does not add weapon moves with empty names', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Dagger', numUses: 2 });
    // moves[0] has empty name by default from createMove

    const movesBefore = p.moves.length;
    equipWeapon(p, w);
    expect(p.moves.length).toBe(movesBefore);
  });
});

// ── useWeaponMove ─────────────────────────────────────────────────────────

describe('useWeaponMove', () => {
  it('with NONE effect does not consume charges', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Staff', numUses: 3 });
    w.moves[0] = makeMove('Bonk', WEAPON_EFFECT.NONE);
    equipWeapon(p, w);

    const result = useWeaponMove(p, 0);
    expect(p.wpnUsesLeft).toBe(3);
    expect(result.weaponDropped).toBe(false);
    expect(result.weaponDestroyed).toBe(false);
  });

  it('with EXPEND effect decrements charges', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Gun', numUses: 3 });
    w.moves[0] = makeMove('Shoot', WEAPON_EFFECT.EXPEND);
    equipWeapon(p, w);

    useWeaponMove(p, 0);
    expect(p.wpnUsesLeft).toBe(2);
    expect(p.weapon).toBe(w); // still equipped
  });

  it('with EXPEND effect drops weapon when charges run out', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Gun', numUses: 1, dropStr: 'Gun falls apart!' });
    w.moves[0] = makeMove('Shoot', WEAPON_EFFECT.EXPEND);
    equipWeapon(p, w);

    const result = useWeaponMove(p, 0);
    expect(p.wpnUsesLeft).toBe(0);
    expect(p.weapon).toBeNull();
    expect(result.weaponDropped).toBe(true);
    expect(result.messages).toContain('Gun falls apart!');
  });

  it('with DROP effect drops weapon immediately', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Boomerang', numUses: 5, dropStr: 'Boomerang flies away!' });
    w.moves[0] = makeMove('Throw', WEAPON_EFFECT.DROP);
    equipWeapon(p, w);

    const result = useWeaponMove(p, 0);
    expect(p.weapon).toBeNull();
    expect(result.weaponDropped).toBe(true);
    expect(result.messages).toContain('Boomerang flies away!');
  });

  it('with DESTROY effect destroys weapon', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Bomb', numUses: 1 });
    w.moves[0] = makeMove('Explode', WEAPON_EFFECT.DESTROY);
    equipWeapon(p, w);

    const result = useWeaponMove(p, 0);
    expect(p.weapon).toBeNull();
    expect(result.weaponDestroyed).toBe(true);
  });

  it('removes weapon moves from player when weapon is removed', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Sword', numUses: 1, dropStr: 'Sword breaks!' });
    w.moves[0] = makeMove('Slash', WEAPON_EFFECT.EXPEND);
    equipWeapon(p, w);
    expect(p.moves.some((m) => m.name === 'Slash')).toBe(true);

    useWeaponMove(p, 0);
    expect(p.moves.some((m) => m.name === 'Slash')).toBe(false);
  });

  it('does nothing when player has no weapon', () => {
    const p = makePlayer();
    const result = useWeaponMove(p, 0);
    expect(result.weaponDropped).toBe(false);
    expect(result.weaponDestroyed).toBe(false);
    expect(result.messages).toHaveLength(0);
  });
});

// ── getWeaponMoves ────────────────────────────────────────────────────────

describe('getWeaponMoves', () => {
  it('returns weapon moves with non-empty names', () => {
    const p = makePlayer();
    const w = makeWeapon({ name: 'Sword' });
    w.moves[0] = makeMove('Slash');
    w.moves[1] = makeMove('Thrust');
    // moves[2..4] have empty names
    p.weapon = w;

    const moves = getWeaponMoves(p);
    expect(moves).toHaveLength(2);
    expect(moves[0].name).toBe('Slash');
    expect(moves[1].name).toBe('Thrust');
  });

  it('returns empty array when no weapon equipped', () => {
    const p = makePlayer();
    expect(getWeaponMoves(p)).toEqual([]);
  });

  it('returns empty array when weapon has no named moves', () => {
    const p = makePlayer();
    p.weapon = makeWeapon({ name: 'EmptyWeapon' });
    expect(getWeaponMoves(p)).toEqual([]);
  });
});
