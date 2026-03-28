import { describe, it, expect } from 'vitest';
import {
  ELEMENT, STATUS, TARGET, PLAYER_MOVE, TIMING,
  RUNE, CHEESE_LIMIT, MAX_MOVES, MAX_STATUS,
  MAX_WEAPON_MOVES, MAX_ARENA_EVENTS, MAX_ARENA_ELEMENTS,
  MAX_ARENA_DESCRIPTION_LINES, MAX_TAUNTS, MAX_KILL_STRINGS,
  MAX_DEATH_STRINGS, MAX_SUPER_POINTS, MAX_STAT_TOTAL,
  MAX_INI_STRINGS, ELEMENT_BY_NAME
} from '../../engine/constants.js';

describe('constants', () => {
  describe('ELEMENT', () => {
    it('maps VB6 element constants', () => {
      expect(ELEMENT.NO_DMG).toBe(0);
      expect(ELEMENT.PHYSICAL).toBe(1);
      expect(ELEMENT.HEAL).toBe(2);
      expect(ELEMENT.MORPH).toBe(3);
      expect(ELEMENT.HP_THEFT).toBe(11);
      expect(ELEMENT.MP_THEFT).toBe(12);
      expect(ELEMENT.LIFE).toBe(17);
      expect(ELEMENT.DEMI).toBe(19);
      expect(ELEMENT.MOON).toBe(20);
      expect(ELEMENT.SHADOW).toBe(21);
      expect(ELEMENT.WATER).toBe(22);
      expect(ELEMENT.REVEAL).toBe(23);
      expect(ELEMENT.FIRE).toBe(24);
      expect(ELEMENT.LIGHTNING).toBe(25);
      expect(ELEMENT.HEART).toBe(26);
      expect(ELEMENT.EARTH).toBe(27);
      expect(ELEMENT.WIND).toBe(28);
      expect(ELEMENT.KI).toBe(29);
      expect(ELEMENT.LUMINOUS).toBe(30);
      expect(ELEMENT.STEAL_MOVE).toBe(42);
      expect(ELEMENT.INVINCIBLE).toBe(66);
      expect(ELEMENT.POISON).toBe(70);
      expect(ELEMENT.GRASS).toBe(71);
      expect(ELEMENT.ROCK).toBe(72);
      expect(ELEMENT.DIRT).toBe(73);
      expect(ELEMENT.PSYCHIC).toBe(74);
      expect(ELEMENT.GHOST).toBe(75);
      expect(ELEMENT.SP_THEFT).toBe(92);
      expect(ELEMENT.SLOT).toBe(100);
      expect(ELEMENT.HP_BASED).toBe(101);
      expect(ELEMENT.DISABLER).toBe(250);
      expect(ELEMENT.SUPER_P_BARRIER).toBe(251);
      expect(ELEMENT.WEAPON_BREAK).toBe(252);
      expect(ELEMENT.CLONE).toBe(253);
      expect(ELEMENT.BARRIER_LORE).toBe(254);
      expect(ELEMENT.STEAL_STAT).toBe(255);
    });

    it('has MAX_ELEMENT set to highest element', () => {
      expect(ELEMENT.MAX).toBe(75);
    });
  });

  describe('STATUS', () => {
    it('maps VB6 status constants', () => {
      expect(STATUS.MUTE).toBe(1);
      expect(STATUS.CHAOS).toBe(2);
      expect(STATUS.FREEZE).toBe(3);
      expect(STATUS.POISON).toBe(4);
      expect(STATUS.BLIND).toBe(5);
      expect(STATUS.INVINCIBLE).toBe(6);
      expect(STATUS.HASTE).toBe(7);
      expect(STATUS.MORPH).toBe(8);
      expect(STATUS.SCARECROW).toBe(9);
      expect(STATUS.SLOW).toBe(10);
      expect(STATUS.STUN).toBe(11);
      expect(STATUS.RERAISE).toBe(12);
      expect(STATUS.REGEN).toBe(13);
      expect(STATUS.STOP).toBe(14);
      expect(STATUS.MUSHROOM).toBe(15);
      expect(STATUS.MIA).toBe(16);
      expect(STATUS.QUICK).toBe(17);
      expect(STATUS.BERSERK).toBe(18);
      expect(STATUS.SLEEP).toBe(19);
      expect(STATUS.VIRUS).toBe(20);
      expect(STATUS.CPU_WAIT).toBe(21);
      expect(STATUS.HIT_RATE).toBe(22);
      expect(STATUS.BARRIER).toBe(23);
      expect(STATUS.M_BARRIER).toBe(24);
      expect(STATUS.BLESS).toBe(25);
      expect(STATUS.CURSE).toBe(26);
      expect(STATUS.CHARM).toBe(27);
      expect(STATUS.PMS).toBe(28);
      expect(STATUS.ZOMBIE).toBe(29);
      expect(STATUS.HAMEDO).toBe(30);
      expect(MAX_STATUS).toBe(32);
    });
  });

  describe('TARGET', () => {
    it('maps VB6 target constants', () => {
      expect(TARGET.ALL_FRIEND).toBe(1);
      expect(TARGET.ENEMY).toBe(2);
      expect(TARGET.ALLY).toBe(3);
      expect(TARGET.ALL_TEAM).toBe(4);
      expect(TARGET.ALL_FOE).toBe(5);
      expect(TARGET.ALL_BUT_SELF).toBe(6);
      expect(TARGET.EVERYBODY).toBe(7);
      expect(TARGET.ONLY_SELF).toBe(8);
    });
  });

  describe('PLAYER_MOVE', () => {
    it('maps VB6 special move constants', () => {
      expect(PLAYER_MOVE.BLOCK).toBe(255);
      expect(PLAYER_MOVE.REST).toBe(254);
      expect(PLAYER_MOVE.ATT).toBe(253);
      expect(PLAYER_MOVE.TAUNT).toBe(252);
      expect(PLAYER_MOVE.FLEE).toBe(251);
      expect(PLAYER_MOVE.GET).toBe(250);
      expect(PLAYER_MOVE.FATAL).toBe(249);
      expect(PLAYER_MOVE.DEFECT).toBe(248);
      expect(PLAYER_MOVE.SLOT).toBe(245);
      expect(PLAYER_MOVE.CHARGE).toBe(244);
    });
  });

  describe('TIMING', () => {
    it('maps VB6 timing constants in game-seconds', () => {
      expect(TIMING.HASTE_HIT).toBe(-5);
      expect(TIMING.SLOW_HIT).toBe(5);
      expect(TIMING.NORMAL_MOVE_HIT).toBe(15);
      expect(TIMING.BLOCK_HIT).toBe(30);
      expect(TIMING.TAUNT_HIT).toBe(5);
      expect(TIMING.REST_HIT).toBe(10);
      expect(TIMING.FATAL_HIT).toBe(16);
      expect(TIMING.FLEE_HIT).toBe(15);
      expect(TIMING.SUMMON_CHARGE).toBe(20);
    });
  });

  it('has correct cheese limit', () => {
    expect(CHEESE_LIMIT).toBe(1100);
  });

  it('has correct max moves', () => {
    expect(MAX_MOVES).toBe(12);
  });

  describe('ELEMENT_BY_NAME', () => {
    it('maps lowercase element names to values', () => {
      expect(ELEMENT_BY_NAME['physical']).toBe(1);
      expect(ELEMENT_BY_NAME['fire']).toBe(24);
      expect(ELEMENT_BY_NAME['heal']).toBe(2);
      expect(ELEMENT_BY_NAME['']).toBe(0);
    });
  });
});
