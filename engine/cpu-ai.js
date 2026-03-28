/**
 * CPU AI decision-making system — ported from VB6 CPU.bas BehNormal().
 *
 * Implements the priority chain with personality weights:
 *   1. Block/Counter when targeted by an incoming threat
 *   2. Super Attack when SP >= 100 (weighted by arrogance)
 *   3. Buff allies with Regen/Haste/Barrier (weighted by goodwill)
 *   4. Heal low-HP allies (weighted by goodwill)
 *   5. Attack strongest enemy (weighted by wrath)
 *   6. Divert HP → SP when comfortable (weighted by greed)
 *   7. Rest as fallback
 */

import { ELEMENT, STATUS, TARGET, PLAYER_MOVE, MAX_MOVES, MAX_SUPER_POINTS } from './constants.js';
import { projectDamage } from './damage-calc.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function doesDamage(element) {
  switch (element) {
    case ELEMENT.PHYSICAL:
    case ELEMENT.MOON:
    case ELEMENT.SHADOW:
    case ELEMENT.WATER:
    case ELEMENT.FIRE:
    case ELEMENT.LIGHTNING:
    case ELEMENT.HEART:
    case ELEMENT.EARTH:
    case ELEMENT.WIND:
    case ELEMENT.KI:
    case ELEMENT.LUMINOUS:
    case ELEMENT.HP_THEFT:
    case ELEMENT.MP_THEFT:
    case ELEMENT.DEMI:
    case ELEMENT.POISON:
    case ELEMENT.GRASS:
    case ELEMENT.ROCK:
    case ELEMENT.DIRT:
    case ELEMENT.PSYCHIC:
    case ELEMENT.GHOST:
    case ELEMENT.HP_BASED:
      return true;
    default:
      return false;
  }
}

function isAliveAndActive(p) {
  return p && p.charId !== 0 && p.hp > 0 && p.isAlive && !p.status[STATUS.MIA];
}

function defaultRng() {
  return Math.random();
}

function makeRng(seed) {
  if (seed === undefined || seed === null) return defaultRng;
  // Simple seeded PRNG (mulberry32)
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── isBeingTargeted ────────────────────────────────────────────────────────

/**
 * Check if any enemy has a pending move targeting this player.
 * Mirrors VB6 ShouldIStop / the X6 detection in BehNormal.
 *
 * @param {number} playerIndex
 * @param {object[]} allPlayers
 * @returns {boolean}
 */
export function isBeingTargeted(playerIndex, allPlayers) {
  const player = allPlayers[playerIndex];
  if (!player) return false;

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    if (!p || i === playerIndex || p.hp <= 0 || p.charId === 0) continue;
    if (p.teamId === player.teamId) continue; // allies don't threaten
    if (p.curMove <= 0) continue;

    // Check if the move targets us
    const move = p.moves[p.curMove];
    if (!move) continue;

    const tgtType = move.target;
    let targetsUs = false;

    if (p.target === playerIndex && (tgtType === TARGET.ENEMY || tgtType === TARGET.ALLY)) {
      targetsUs = true;
    }
    if (tgtType === TARGET.ALL_FOE && p.teamId !== player.teamId) {
      targetsUs = true;
    }
    if (tgtType === TARGET.ALL_BUT_SELF) {
      targetsUs = true;
    }
    if (tgtType === TARGET.EVERYBODY) {
      targetsUs = true;
    }
    if (tgtType === TARGET.ALL_TEAM && allPlayers[p.target] &&
        allPlayers[p.target].teamId === player.teamId) {
      targetsUs = true;
    }

    if (targetsUs) return true;
  }
  return false;
}

// ── getStrongestEnemy ──────────────────────────────────────────────────────

/**
 * Find the living enemy with the highest HP.
 *
 * @param {object} player
 * @param {object[]} allPlayers
 * @returns {number} index or -1
 */
export function getStrongestEnemy(player, allPlayers) {
  let bestIndex = -1;
  let bestHp = -1;

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    if (!isAliveAndActive(p)) continue;
    if (p.teamId === player.teamId) continue;
    if (p.hp > bestHp) {
      bestHp = p.hp;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── getWeakestAlly ─────────────────────────────────────────────────────────

/**
 * Find living ally with lowest HP percentage (including self).
 *
 * @param {object} player
 * @param {object[]} allPlayers
 * @returns {number} index or -1
 */
export function getWeakestAlly(player, allPlayers) {
  let bestIndex = -1;
  let bestPct = Infinity;

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    if (!isAliveAndActive(p)) continue;
    if (p.teamId !== player.teamId) continue;
    const pct = p.hp / p.maxHp;
    if (pct < bestPct) {
      bestPct = pct;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── findHealMove ───────────────────────────────────────────────────────────

/**
 * Find a healing move (element = HEAL) in the player's move list.
 * Returns the move index with the highest strength, or -1 if none.
 *
 * @param {object} player
 * @returns {number} move index (0-based) or -1
 */
export function findHealMove(player) {
  let bestIndex = -1;
  let bestStrength = -1;

  for (let i = 0; i < player.moves.length; i++) {
    const move = player.moves[i];
    if (!move || !move.name) continue;
    if (move.element !== ELEMENT.HEAL) continue;
    if (move.canSuper > 1) continue; // skip super-only moves
    // Mute blocks non-physical
    if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) continue;
    if (move.strength > bestStrength) {
      bestStrength = move.strength;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── findBuffMove ───────────────────────────────────────────────────────────

/**
 * Find a move that applies a beneficial status (Regen, Haste, Barrier, MBarrier, Bless).
 * Returns the move index, or -1 if none suitable.
 *
 * @param {object} player
 * @param {number} targetStatus - The status ID we want to apply
 * @returns {number} move index or -1
 */
export function findBuffMove(player, targetStatus) {
  let bestIndex = -1;
  let bestChance = 75; // Minimum threshold (from VB6 FindMoveByStatus)

  for (let i = 0; i < player.moves.length; i++) {
    const move = player.moves[i];
    if (!move || !move.name) continue;
    if (move.canSuper > 1) continue; // skip super-only moves
    // Mute blocks non-physical
    if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) continue;
    // Scarecrow blocks physical
    if (player.status[STATUS.SCARECROW] && move.element === ELEMENT.PHYSICAL) continue;

    const chance = move.status[targetStatus];
    if (chance > bestChance) {
      bestChance = chance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── findBestAttackMove ─────────────────────────────────────────────────────

/**
 * Evaluate all damage-dealing moves and return the one with highest projected damage.
 * Mirrors VB6 StrongestPossibleMove.
 *
 * @param {object} player
 * @param {object} target
 * @param {object} arena
 * @returns {number} move index or -1
 */
export function findBestAttackMove(player, target, arena) {
  let bestIndex = -1;
  let bestDamage = -1;

  for (let i = 0; i < player.moves.length; i++) {
    const move = player.moves[i];
    if (!move || !move.name) continue;
    if (!doesDamage(move.element)) continue;
    if (move.element === ELEMENT.MP_THEFT || move.element === ELEMENT.HP_THEFT) continue;
    if (move.canSuper > 1) continue; // skip super-only moves
    // Mute blocks non-physical
    if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) continue;
    // Scarecrow blocks physical
    if (player.status[STATUS.SCARECROW] && move.element === ELEMENT.PHYSICAL) continue;

    const result = projectDamage(player, target, move, arena, { seed: 0.5 });
    const hitRate = move.status[STATUS.HIT_RATE] || 100;
    const effective = Math.floor(result.damage * hitRate / 100);

    if (effective > bestDamage) {
      bestDamage = effective;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── findSuperableMove ──────────────────────────────────────────────────────

/**
 * Find the best move that can be used as a Super attack.
 *
 * @param {object} player
 * @param {object} target
 * @param {object} arena
 * @returns {number} move index or -1
 */
function findSuperableMove(player, target, arena) {
  let bestIndex = -1;
  let bestDamage = -1;

  for (let i = 0; i < player.moves.length; i++) {
    const move = player.moves[i];
    if (!move || !move.name) continue;
    if (!doesDamage(move.element)) continue;
    if (move.canSuper <= 0) continue; // must be superable
    if (move.canSuper >= 6) continue; // counter-only
    // Mute blocks non-physical
    if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) continue;
    // Scarecrow blocks physical
    if (player.status[STATUS.SCARECROW] && move.element === ELEMENT.PHYSICAL) continue;

    const result = projectDamage(player, target, move, arena, {
      seed: 0.5,
      isSuper: true,
      superNum: player.sp,
    });

    if (result.damage > bestDamage) {
      bestDamage = result.damage;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// ── cpuDecide ──────────────────────────────────────────────────────────────

/**
 * Main CPU AI decision function. Implements the BehNormal priority chain
 * with personality-weighted thresholds.
 *
 * @param {object}   player      - The CPU player making a decision
 * @param {number}   playerIndex - Index in allPlayers
 * @param {object[]} allPlayers  - All players in the battle
 * @param {object}   arena       - Current arena
 * @param {number}   gameTime    - Current game time in seconds
 * @param {object}   [opts]      - { seed } for deterministic testing
 * @returns {{ action: string, moveIndex: number, targetIndex: number, message: string } | null}
 */
export function cpuDecide(player, playerIndex, allPlayers, arena, gameTime, opts = {}) {
  // Dead or unable to act
  if (!player || player.hp <= 0 || !player.isAlive) return null;
  // Already executing a move
  if (player.curMove > 0) return null;

  const rng = makeRng(opts.seed);
  const personality = player.cpuPersonality || { goodwill: 50, greed: 50, wrath: 50, arrogance: 50 };
  const { goodwill, greed, wrath, arrogance } = personality;

  // ── Priority 1: Block/Counter when being targeted ────────────────────

  if (isBeingTargeted(playerIndex, allPlayers) && player.sp >= 100) {
    // Find a counter move (best damaging move usable as counter)
    let counterMoveIndex = -1;
    let bestDmg = -1;
    const targetingEnemy = getStrongestEnemy(player, allPlayers);

    for (let i = 0; i < player.moves.length; i++) {
      const move = player.moves[i];
      if (!move || !move.name) continue;
      if (!doesDamage(move.element)) continue;
      // Counter moves: canSuper <= 1 or canSuper >= 6 (VB6 FindCounter logic)
      if (move.canSuper > 1 && move.canSuper < 6) continue;
      if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) continue;
      if (player.status[STATUS.SCARECROW] && move.element === ELEMENT.PHYSICAL) continue;

      if (targetingEnemy >= 0) {
        const result = projectDamage(player, allPlayers[targetingEnemy], move, arena, { seed: 0.5 });
        if (result.damage > bestDmg) {
          bestDmg = result.damage;
          counterMoveIndex = i;
        }
      } else if (move.name) {
        counterMoveIndex = i;
        break;
      }
    }

    if (counterMoveIndex >= 0) {
      return {
        action: 'block',
        moveIndex: PLAYER_MOVE.BLOCK,
        targetIndex: counterMoveIndex, // VB6 stores counter move in target slot
        message: `${player.scrNam} blocks with a counter ready!`,
      };
    }

    // Block without counter if HP is comfortable
    if (player.hp >= player.maxHp * 2 / 5) {
      return {
        action: 'block',
        moveIndex: PLAYER_MOVE.BLOCK,
        targetIndex: 0,
        message: `${player.scrNam} takes a defensive stance.`,
      };
    }
  }

  // ── Priority 2: Super Attack when SP >= 100 ─────────────────────────

  // Arrogance >= 80 means use supers more freely (even at exactly 100 SP)
  // Default threshold: SP >= 300 for super (VB6 BehNormal line ~182)
  // High arrogance lowers the threshold
  const superThreshold = arrogance >= 80 ? 100 : (arrogance >= 60 ? 200 : 300);

  if (player.sp >= superThreshold && player.sp >= 100) {
    const targetIdx = getStrongestEnemy(player, allPlayers);
    if (targetIdx >= 0) {
      const superMoveIdx = findSuperableMove(player, allPlayers[targetIdx], arena);
      if (superMoveIdx >= 0) {
        // Compare super damage vs normal damage
        const superResult = projectDamage(
          player, allPlayers[targetIdx], player.moves[superMoveIdx], arena,
          { seed: 0.5, isSuper: true, superNum: player.sp }
        );
        const normalIdx = findBestAttackMove(player, allPlayers[targetIdx], arena);
        let normalDmg = 0;
        if (normalIdx >= 0) {
          const normalResult = projectDamage(
            player, allPlayers[targetIdx], player.moves[normalIdx], arena,
            { seed: 0.5 }
          );
          normalDmg = normalResult.damage;
        }

        if (superResult.damage > normalDmg || arrogance >= 80) {
          // Set superNum based on SP
          const superNum = Math.min(Math.floor(player.sp / 100), 5);
          return {
            action: 'super',
            moveIndex: superMoveIdx,
            targetIndex: targetIdx,
            superNum,
            message: `${player.scrNam} unleashes a Super attack!`,
          };
        }
      }
    }
  }

  // ── Priority 3: Buff allies ─────────────────────────────────────────

  // Goodwill >= 80 means buff proactively
  const shouldBuff = (rng() * 100) <= goodwill;
  const buffStatuses = [STATUS.REGEN, STATUS.HASTE, STATUS.BARRIER, STATUS.M_BARRIER, STATUS.BLESS];

  if (shouldBuff) {
    // Self-buffs first
    for (const stat of buffStatuses) {
      if (!player.status[stat]) {
        const moveIdx = findBuffMove(player, stat);
        if (moveIdx >= 0) {
          const move = player.moves[moveIdx];
          // Determine target based on move target type
          const targetIdx = (move.target === TARGET.ONLY_SELF || move.target === TARGET.ALLY)
            ? playerIndex : playerIndex;
          return {
            action: 'buff',
            moveIndex: moveIdx,
            targetIndex: targetIdx,
            message: `${player.scrNam} applies a buff!`,
          };
        }
      }
    }

    // Buff allies (goodwill-weighted)
    if (goodwill >= 50) {
      for (let i = 0; i < allPlayers.length; i++) {
        const ally = allPlayers[i];
        if (!isAliveAndActive(ally) || ally.teamId !== player.teamId || i === playerIndex) continue;
        for (const stat of buffStatuses) {
          if (!ally.status[stat]) {
            const moveIdx = findBuffMove(player, stat);
            if (moveIdx >= 0) {
              const move = player.moves[moveIdx];
              // Must be able to target ally (not ONLY_SELF)
              if (move.target === TARGET.ONLY_SELF) continue;
              return {
                action: 'buff',
                moveIndex: moveIdx,
                targetIndex: i,
                message: `${player.scrNam} buffs ${ally.scrNam}!`,
              };
            }
          }
        }
      }
    }
  }

  // ── Priority 4: Heal ────────────────────────────────────────────────

  // Goodwill affects healing threshold:
  //   High goodwill (80+): heal at 70% HP
  //   Normal: heal at 50% HP (VB6: HP < MaxHP * 3/5)
  const healThreshold = goodwill >= 80 ? 0.70 : 0.50;

  // Self-heal
  if (player.hp < player.maxHp * healThreshold) {
    const healIdx = findHealMove(player);
    if (healIdx >= 0) {
      return {
        action: 'heal',
        moveIndex: healIdx,
        targetIndex: playerIndex,
        message: `${player.scrNam} heals themselves!`,
      };
    }
  }

  // Heal allies (goodwill check)
  if ((rng() * 100) <= goodwill) {
    const weakestIdx = getWeakestAlly(player, allPlayers);
    if (weakestIdx >= 0 && weakestIdx !== playerIndex) {
      const ally = allPlayers[weakestIdx];
      const allyPct = ally.hp / ally.maxHp;
      if (allyPct < healThreshold) {
        const healIdx = findHealMove(player);
        if (healIdx >= 0) {
          const move = player.moves[healIdx];
          if (move.target !== TARGET.ONLY_SELF) {
            return {
              action: 'heal',
              moveIndex: healIdx,
              targetIndex: weakestIdx,
              message: `${player.scrNam} heals ${ally.scrNam}!`,
            };
          }
        }
      }
    }
  }

  // ── Priority 5: Attack ──────────────────────────────────────────────

  // Wrath >= 80 means always attack (even when healing might be better)
  const shouldAttack = wrath >= 80 || (rng() * 100) <= wrath;
  const targetIdx = getStrongestEnemy(player, allPlayers);

  if (shouldAttack && targetIdx >= 0) {
    const atkIdx = findBestAttackMove(player, allPlayers[targetIdx], arena);
    if (atkIdx >= 0) {
      return {
        action: 'attack',
        moveIndex: atkIdx,
        targetIndex: targetIdx,
        message: `${player.scrNam} attacks ${allPlayers[targetIdx].scrNam}!`,
      };
    }
  }

  // If attack didn't fire due to personality roll but there IS a target, attack anyway
  // (fallback — VB6 always attacks if there's a target and a move)
  if (targetIdx >= 0) {
    const atkIdx = findBestAttackMove(player, allPlayers[targetIdx], arena);
    if (atkIdx >= 0) {
      return {
        action: 'attack',
        moveIndex: atkIdx,
        targetIndex: targetIdx,
        message: `${player.scrNam} attacks ${allPlayers[targetIdx].scrNam}!`,
      };
    }
  }

  // ── Priority 6: Divert HP → SP ──────────────────────────────────────

  // VB6: If HP > MaxHP * 5/6 And SP < MaxSP, divert
  // High greed (80+): divert more aggressively (at HP > 50%)
  const divertHpThreshold = greed >= 80 ? 0.50 : (5 / 6);

  if (player.hp > player.maxHp * divertHpThreshold && player.sp < MAX_SUPER_POINTS) {
    // Calculate divert amount (VB6: HP - MaxHP * 4/6, capped at remaining SP room)
    const safeHp = greed >= 80
      ? Math.floor(player.maxHp * 0.40)
      : Math.floor(player.maxHp * 4 / 6);
    let divertAmt = player.hp - safeHp;
    const spRoom = MAX_SUPER_POINTS - player.sp;
    if (divertAmt > spRoom) divertAmt = spRoom;

    if (divertAmt > 0) {
      return {
        action: 'divert',
        moveIndex: -1,
        targetIndex: playerIndex,
        divertAmount: divertAmt,
        message: `${player.scrNam} diverts ${divertAmt} HP to SP!`,
      };
    }
  }

  // ── Priority 7: Rest ────────────────────────────────────────────────

  return {
    action: 'rest',
    moveIndex: PLAYER_MOVE.REST,
    targetIndex: playerIndex,
    message: `${player.scrNam} rests.`,
  };
}
