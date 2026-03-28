/**
 * Game constants ported from ChiSource/ConstDeclares.bas
 * These values MUST match the original VB6 source exactly.
 */

// ── Elements ────────────────────────────────────────────────────────────────

export const ELEMENT = Object.freeze({
  NO_DMG:          0,   // No Damage -- Effect Only
  PHYSICAL:        1,   // Physical Hit
  HEAL:            2,   // Healing Power
  MORPH:           3,   // Not-So-Secret Morph
  HP_THEFT:       11,   // HP Theft
  MP_THEFT:       12,   // MP Theft
  LIFE:           17,   // Restore Life
  DEMI:           19,   // Cuts enemy's HP in half
  MOON:           20,   // Moon Power
  SHADOW:         21,   // Shadow
  WATER:          22,   // Water
  REVEAL:         23,   // Scan
  FIRE:           24,   // Fire
  LIGHTNING:      25,   // Lightning
  HEART:          26,   // Heart
  EARTH:          27,   // Earth
  WIND:           28,   // Random Elemental
  KI:             29,   // Ki Power
  LUMINOUS:       30,   // Luminous Energy
  STEAL_MOVE:     42,
  INVINCIBLE:     66,   // Temporary Invincibility
  POISON:         70,   // Poison Elemental
  GRASS:          71,
  ROCK:           72,
  DIRT:           73,
  PSYCHIC:        74,
  GHOST:          75,
  SP_THEFT:       92,
  SLOT:          100,
  HP_BASED:      101,
  DISABLER:      250,   // Remove effects of 251 and fully restores all allies
  SUPER_P_BARRIER: 251, // Protects self from physical attacks
  WEAPON_BREAK:  252,   // Destroy's opponent's weapon
  CLONE:         253,   // Clones enemy
  BARRIER_LORE:  254,   // Targeted people get bad status if they have PBarr/MBarr
  STEAL_STAT:    255,   // Take good status away from enemy
  MAX:            75,   // MaxEle - The Highest Element
});

// ── Status Effects ──────────────────────────────────────────────────────────

export const STATUS = Object.freeze({
  MUTE:        1,   // Phys Moves Only
  CHAOS:       2,   // Random moves @ Random Targets
  FREEZE:      3,   // Frozen
  POISON:      4,   // HP reduces
  BLIND:       5,   // Attack = 0
  INVINCIBLE:  6,   // Shielded
  HASTE:       7,   // Speed Up
  MORPH:       8,   // Morph
  SCARECROW:   9,   // Scarecrow
  SLOW:       10,   // Speed Down
  STUN:       11,   // Unconscious
  RERAISE:    12,   // Reraise
  REGEN:      13,   // HP restores
  STOP:       14,   // Time Stopped
  MUSHROOM:   15,   // Mushroomied!
  MIA:        16,   // Missing in Action
  QUICK:      17,   // Quick
  BERSERK:    18,   // Random attacks @ random enemies
  SLEEP:      19,   // Zzzzzzzzzz
  VIRUS:      20,
  CPU_WAIT:   21,   // R1
  HIT_RATE:   22,   // R2
  BARRIER:    23,   // Barriers
  M_BARRIER:  24,   // MBarriers
  BLESS:      25,   // Attack Up
  CURSE:      26,   // Attack Down
  CHARM:      27,   // Charm
  PMS:        28,   // Pissed Off!
  ZOMBIE:     29,   // Zombie Mode
  HAMEDO:     30,   // Chibot Counter
});

export const MAX_STATUS = 32; // sMaxStatus

// ── Targeting Modes ─────────────────────────────────────────────────────────

export const TARGET = Object.freeze({
  ALL_FRIEND:   1,  // Hits all friends + default target = self
  ENEMY:        2,  // Default target = GetTarget(TeamID)
  ALLY:         3,  // Default target = self
  ALL_TEAM:     4,  // Hits all enemies on a team
  ALL_FOE:      5,  // Hits all people not on your team
  ALL_BUT_SELF: 6,  // Hits everyone but self
  EVERYBODY:    7,  // Hits EVERYBODY, no questions asked
  ONLY_SELF:    8,  // Targets Self only
});

// ── Player Move Constants ───────────────────────────────────────────────────

export const PLAYER_MOVE = Object.freeze({
  BLOCK:   255,  // /block
  REST:    254,  // /rest
  ATT:     253,  // /att
  TAUNT:   252,  // /taunt
  FLEE:    251,  // /flee
  GET:     250,  // /get
  FATAL:   249,  // Fatality
  DEFECT:  248,  // /defect
  SAVE:    247,  // Dummied out
  ROCK:    246,
  SLOT:    245,
  CHARGE:  244,
});

// ── Timing (game-seconds) ───────────────────────────────────────────────────

export const TIMING = Object.freeze({
  HASTE_HIT:       -5,
  SLOW_HIT:         5,
  PMS_HIT:        -10,
  BLOCK_HIT:       30,
  TAUNT_HIT:        5,
  REST_HIT:        10,
  SLOT_HIT:        15,
  FATAL_HIT:       16,
  FLEE_HIT:        15,
  CHARGE_HIT:      15,
  NORMAL_MOVE_HIT: 15,
  OTHER_HIT:       15,
  SUMMON_CHARGE:   20,
  ARMORY_WAIT:     20,
  MIMIC_CHARGE:    20,
});

// ── Rune placeholder ────────────────────────────────────────────────────────

export const RUNE = Object.freeze({});

// ── Scalar Limits ───────────────────────────────────────────────────────────

export const CHEESE_LIMIT = 1100;  // MaxCheeseLimit
export const MAX_MOVES = 12;       // Max moves per character (player-usable)
export const MAX_WEAPON_MOVES = 30; // MaxMoves in VB6 (total move slots)

// Buffer sizes from VB6
export const MAX_RAY = 250;  // # of lines for input buffer
export const OUT_MAX = 250;  // # of lines for output buffer
export const SND_MAX = 50;   // # of sounds for sound buffer

// Game limits — not all are in ConstDeclares.bas but needed by the engine
export const MAX_ARENA_EVENTS = 20;
export const MAX_ARENA_ELEMENTS = 30;
export const MAX_ARENA_DESCRIPTION_LINES = 10;
export const MAX_TAUNTS = 10;
export const MAX_KILL_STRINGS = 10;
export const MAX_DEATH_STRINGS = 10;
export const MAX_SUPER_POINTS = 100;
export const MAX_STAT_TOTAL = 999;
export const MAX_INI_STRINGS = 200;

// ── Element Name Lookup ─────────────────────────────────────────────────────

/** Maps lowercase element name -> numeric element id */
export const ELEMENT_BY_NAME = Object.freeze({
  '':          ELEMENT.NO_DMG,
  'nodmg':     ELEMENT.NO_DMG,
  'physical':  ELEMENT.PHYSICAL,
  'heal':      ELEMENT.HEAL,
  'morph':     ELEMENT.MORPH,
  'hptheft':   ELEMENT.HP_THEFT,
  'mptheft':   ELEMENT.MP_THEFT,
  'life':      ELEMENT.LIFE,
  'demi':      ELEMENT.DEMI,
  'moon':      ELEMENT.MOON,
  'shadow':    ELEMENT.SHADOW,
  'water':     ELEMENT.WATER,
  'reveal':    ELEMENT.REVEAL,
  'fire':      ELEMENT.FIRE,
  'lightning': ELEMENT.LIGHTNING,
  'heart':     ELEMENT.HEART,
  'earth':     ELEMENT.EARTH,
  'wind':      ELEMENT.WIND,
  'ki':        ELEMENT.KI,
  'luminous':  ELEMENT.LUMINOUS,
  'stealmove': ELEMENT.STEAL_MOVE,
  'invincible': ELEMENT.INVINCIBLE,
  'poison':    ELEMENT.POISON,
  'grass':     ELEMENT.GRASS,
  'rock':      ELEMENT.ROCK,
  'dirt':      ELEMENT.DIRT,
  'psychic':   ELEMENT.PSYCHIC,
  'ghost':     ELEMENT.GHOST,
  'sptheft':   ELEMENT.SP_THEFT,
  'slot':      ELEMENT.SLOT,
  'hpbased':   ELEMENT.HP_BASED,
  'disabler':  ELEMENT.DISABLER,
  'superpbarrier': ELEMENT.SUPER_P_BARRIER,
  'weaponbreak':   ELEMENT.WEAPON_BREAK,
  'clone':     ELEMENT.CLONE,
  'barrierlore':   ELEMENT.BARRIER_LORE,
  'stealstat': ELEMENT.STEAL_STAT,
});
