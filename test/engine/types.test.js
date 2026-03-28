import { describe, it, expect } from 'vitest';
import {
  createMove,
  createCharacter,
  createPlayer,
  createArena,
  createArenaEvent,
  createItem,
  createWeapon,
} from '../../engine/types.js';
import {
  MAX_MOVES,
  MAX_STATUS,
  MAX_TAUNTS,
  MAX_KILL_STRINGS,
  MAX_DEATH_STRINGS,
  MAX_ARENA_EVENTS,
  MAX_ARENA_ELEMENTS,
  MAX_ARENA_DESCRIPTION_LINES,
  MAX_WEAPON_MOVES,
  TARGET,
} from '../../engine/constants.js';

describe('createMove', () => {
  it('returns an object with all expected default fields', () => {
    const m = createMove();
    expect(m.name).toBe('');
    expect(m.cmdKey).toBe('');
    expect(m.canSuper).toBe(0);
    expect(m.beginAttack).toBe('');
    expect(m.beginSuperAttack).toBe('');
    expect(m.beginHealSelf).toBe('');
    expect(m.mpReq).toBe(0);
    expect(m.hit).toBe('');
    expect(m.superHit).toBe('');
    expect(m.maxSuperHits).toBe(0);
    expect(m.healSelf).toBe('');
    expect(m.critHit).toBe('');
    expect(m.healMeld).toBe('');
    expect(m.miss).toBe('');
    expect(m.superMiss).toBe('');
    expect(m.status).toHaveLength(MAX_STATUS + 1);
    expect(m.status.every((v) => v === 0)).toBe(true);
    expect(m.element).toBe(0);
    expect(m.strength).toBe(0);
    expect(m.target).toBe(TARGET.ENEMY);
    expect(m.weaponEffect).toBe(0);
    expect(m.instantHit).toBe(false);
    expect(m.reqAllUses).toBe(false);
  });

  it('returns independent instances', () => {
    const a = createMove();
    const b = createMove();
    a.name = 'Fire';
    expect(b.name).toBe('');
    a.status[0] = 5;
    expect(b.status[0]).toBe(0);
  });
});

describe('createCharacter', () => {
  it('returns an object with all expected default fields', () => {
    const c = createCharacter();
    expect(c.fullName).toBe('');
    expect(c.senshiId).toBe('');
    expect(c.species).toBe('');
    expect(c.pickMe).toBe('');
    expect(c.selectStr).toBe('');
    expect(c.selectJoin).toBe('');
    expect(c.physStr).toBe(0);
    expect(c.physDef).toBe(0);
    expect(c.magStr).toBe(0);
    expect(c.magDef).toBe(0);
    expect(c.weakTo).toBe(0);
    expect(c.resist).toBe(0);
    expect(c.rest).toBe('');
    expect(c.block).toBe('');
    expect(c.blockFail).toBe('');
    expect(c.blockYes).toBe('');
    expect(c.taunts).toHaveLength(MAX_TAUNTS);
    expect(c.taunts.every((t) => t === '')).toBe(true);
    expect(c.fatality).toEqual({ cmdKey: '', preFatal: '', fatalMove: '' });
    expect(c.moves).toHaveLength(MAX_MOVES);
    expect(c.moves[0]).toEqual(createMove());
    expect(c.deathStr).toHaveLength(MAX_DEATH_STRINGS);
    expect(c.deathStr.every((s) => s === '')).toBe(true);
    expect(c.killStr).toHaveLength(MAX_KILL_STRINGS);
    expect(c.killStr.every((s) => s === '')).toBe(true);
    expect(c.desc).toHaveLength(4);
    expect(c.desc.every((s) => s === '')).toBe(true);
  });

  it('returns independent move instances', () => {
    const a = createCharacter();
    const b = createCharacter();
    a.moves[0].name = 'Slash';
    expect(b.moves[0].name).toBe('');
  });
});

describe('createPlayer', () => {
  it('returns an object with all expected default fields', () => {
    const p = createPlayer();
    expect(p.scrNam).toBe('');
    expect(p.charId).toBe(0);
    expect(p.character).toBeNull();
    expect(p.teamId).toBe(0);
    expect(p.hp).toBe(0);
    expect(p.maxHp).toBe(0);
    expect(p.mp).toBe(0);
    expect(p.maxMp).toBe(0);
    expect(p.sp).toBe(0);
    expect(p.curMove).toBe(0);
    expect(p.moveStart).toBe(0);
    expect(p.target).toBe(0);
    expect(p.superNum).toBe(0);
    expect(p.cheese).toBe(0);
    expect(p.isCpu).toBe(false);
    expect(p.isAlive).toBe(true);
    expect(p.connected).toBe(true);
    expect(p.disconnectTime).toBe(0);
    expect(p.socketId).toBeNull();
    expect(p.status).toHaveLength(MAX_STATUS + 1);
    expect(p.status.every((v) => v === 0)).toBe(true);
    expect(p.rune).toBe(0);
    expect(p.weapon).toBe(0);
    expect(p.wpnUsesLeft).toBe(0);
    expect(p.defect).toBe(false);
    expect(p.kills).toBe(0);
    expect(p.deaths).toBe(0);
    expect(p.fatalities).toBe(0);
    expect(p.damageDealt).toBe(0);
    expect(p.damageTaken).toBe(0);
    expect(p.moves).toEqual([]);
    expect(p.cpuPersonality).toEqual({
      goodwill: 50,
      greed: 50,
      wrath: 50,
      arrogance: 50,
    });
    expect(p.runeTemp).toBe(0);
  });

  it('returns independent status arrays', () => {
    const a = createPlayer();
    const b = createPlayer();
    a.status[1] = 99;
    expect(b.status[1]).toBe(0);
  });
});

describe('createArenaEvent', () => {
  it('returns an object with all expected default fields', () => {
    const e = createArenaEvent();
    expect(e.name).toBe('');
    expect(e.frequency).toBe(0);
    expect(e.hpDamage).toBe(0);
    expect(e.hitStr).toBe('');
    expect(e.missStr).toBe('');
    expect(e.hitsAll).toBe(false);
  });
});

describe('createArena', () => {
  it('returns an object with all expected default fields', () => {
    const a = createArena();
    expect(a.name).toBe('');
    expect(a.description).toHaveLength(MAX_ARENA_DESCRIPTION_LINES);
    expect(a.description.every((s) => s === '')).toBe(true);
    expect(a.elements).toHaveLength(MAX_ARENA_ELEMENTS);
    expect(a.elements.every((v) => v === 1)).toBe(true);
    expect(a.restLowHp).toBe(0);
    expect(a.restHighHp).toBe(0);
    expect(a.restLowMp).toBe(0);
    expect(a.restHighMp).toBe(0);
    expect(a.hpPerSecond).toBe(0);
    expect(a.mpPerSecond).toBe(0);
    expect(a.events).toHaveLength(MAX_ARENA_EVENTS);
    expect(a.events[0]).toEqual(createArenaEvent());
  });

  it('returns independent event instances', () => {
    const a = createArena();
    const b = createArena();
    a.events[0].name = 'Earthquake';
    expect(b.events[0].name).toBe('');
  });
});

describe('createItem', () => {
  it('returns an object with all expected default fields', () => {
    const i = createItem();
    expect(i.name).toBe('');
    expect(i.spawnStr).toBe('');
    expect(i.telefragStr).toBe('');
    expect(i.playerGet).toBe('');
    expect(i.youmaGet).toBe('');
    expect(i.playerHp).toBe(0);
    expect(i.playerMp).toBe(0);
    expect(i.playerStat).toHaveLength(MAX_STATUS + 1);
    expect(i.playerStat.every((v) => v === 0)).toBe(true);
  });
});

describe('createWeapon', () => {
  it('returns an object with all expected default fields', () => {
    const w = createWeapon();
    expect(w.name).toBe('');
    expect(w.shortName).toBe('');
    expect(w.equipStr).toBe('');
    expect(w.description).toBe('');
    expect(w.dropStr).toBe('');
    expect(w.numUses).toBe(0);
    expect(w.moves).toHaveLength(MAX_WEAPON_MOVES);
    expect(w.moves[0]).toEqual(createMove());
  });

  it('returns independent move instances', () => {
    const a = createWeapon();
    const b = createWeapon();
    a.moves[0].name = 'Stab';
    expect(b.moves[0].name).toBe('');
  });
});
