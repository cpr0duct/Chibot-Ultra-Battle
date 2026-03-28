/**
 * Factory functions for game data types.
 * Ported from VB6: CH1.BAS (MoveType, FatalType, SenshiType),
 * ARENA1.BAS (ArenaType, RanHappening), and DECLARE.BAS (PlayerType, etc.)
 *
 * Every factory returns a plain object with VB6-matching defaults.
 */

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
} from './constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a zero-filled Int array of length n. */
const zeros = (n) => new Array(n).fill(0);

/** Create an array of n empty strings. */
const emptyStrings = (n) => new Array(n).fill('');

/** Create an array of n items using a factory fn. */
const arrayOf = (n, fn) => Array.from({ length: n }, () => fn());

// ── MoveType (CH1.BAS) ────────────────────────────────────────────────────

export function createMove() {
  return {
    name: '',
    cmdKey: '',
    canSuper: 0,
    beginAttack: '',
    beginSuperAttack: '',
    beginHealSelf: '',
    mpReq: 0,
    hit: '',
    superHit: '',
    maxSuperHits: 0,
    healSelf: '',
    critHit: '',
    healMeld: '',
    miss: '',
    superMiss: '',
    status: zeros(MAX_STATUS + 1),
    element: 0,
    strength: 0,
    target: TARGET.ENEMY,
    weaponEffect: 0,
    instantHit: false,
    reqAllUses: false,
  };
}

// ── SenshiType / CharType (CH1.BAS) ───────────────────────────────────────

export function createCharacter() {
  return {
    fullName: '',
    senshiId: '',
    species: '',
    pickMe: '',
    selectStr: '',
    selectJoin: '',
    physStr: 0,
    physDef: 0,
    magStr: 0,
    magDef: 0,
    weakTo: 0,
    resist: 0,
    rest: '',
    block: '',
    blockFail: '',
    blockYes: '',
    taunts: emptyStrings(MAX_TAUNTS),
    fatality: { cmdKey: '', preFatal: '', fatalMove: '' },
    moves: arrayOf(MAX_MOVES, createMove),
    deathStr: emptyStrings(MAX_DEATH_STRINGS),
    killStr: emptyStrings(MAX_KILL_STRINGS),
    desc: emptyStrings(4),
  };
}

// ── PlayerType (battle-time state) ─────────────────────────────────────────

export function createPlayer() {
  return {
    scrNam: '',
    charId: 0,
    character: null,
    teamId: 0,
    hp: 0,
    maxHp: 0,
    mp: 0,
    maxMp: 0,
    sp: 0,
    curMove: 0,
    moveStart: 0,
    target: 0,
    superNum: 0,
    cheese: 0,
    isCpu: false,
    isAlive: true,
    connected: true,
    disconnectTime: 0,
    socketId: null,
    status: zeros(MAX_STATUS + 1),
    rune: 0,
    weapon: 0,
    wpnUsesLeft: 0,
    defect: false,
    kills: 0,
    deaths: 0,
    fatalities: 0,
    damageDealt: 0,
    damageTaken: 0,
    moves: [],
    cpuPersonality: { goodwill: 50, greed: 50, wrath: 50, arrogance: 50 },
    runeTemp: 0,
  };
}

// ── RanHappening / ArenaEvent (ARENA1.BAS) ─────────────────────────────────

export function createArenaEvent() {
  return {
    name: '',
    frequency: 0,
    hpDamage: 0,
    hitStr: '',
    missStr: '',
    hitsAll: false,
  };
}

// ── ArenaType (ARENA1.BAS) ─────────────────────────────────────────────────

export function createArena() {
  return {
    name: '',
    description: emptyStrings(MAX_ARENA_DESCRIPTION_LINES),
    elements: new Array(MAX_ARENA_ELEMENTS).fill(1),
    restLowHp: 0,
    restHighHp: 0,
    restLowMp: 0,
    restHighMp: 0,
    hpPerSecond: 0,
    mpPerSecond: 0,
    events: arrayOf(MAX_ARENA_EVENTS, createArenaEvent),
  };
}

// ── ItemType ───────────────────────────────────────────────────────────────

export function createItem() {
  return {
    name: '',
    spawnStr: '',
    telefragStr: '',
    playerGet: '',
    youmaGet: '',
    playerHp: 0,
    playerMp: 0,
    playerStat: zeros(MAX_STATUS + 1),
  };
}

// ── WeaponType ─────────────────────────────────────────────────────────────

export function createWeapon() {
  return {
    name: '',
    shortName: '',
    equipStr: '',
    description: '',
    dropStr: '',
    numUses: 0,
    moves: arrayOf(MAX_WEAPON_MOVES, createMove),
  };
}
