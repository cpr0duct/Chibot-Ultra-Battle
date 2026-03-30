/**
 * Combat system — ported from VB6 DOMOVE.BAS and DECLARE.BAS.
 *
 * This module contains the move execution pipeline: queueing moves,
 * resolving them when their timer expires, handling blocks, rests,
 * fatalities, targeting, and battle-end detection.
 */

import { ELEMENT, STATUS, TARGET, PLAYER_MOVE, TIMING, CHEESE_LIMIT, MAX_SUPER_POINTS } from './constants.js';
import { projectDamage, calculateHitChance } from './damage-calc.js';
import { canAct, getMoveTimeModifier, applyStatus } from './status.js';
import { substituteVars } from '../parsers/string-vars.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function isPhysicalElement(element) {
  return element === ELEMENT.PHYSICAL;
}

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

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function defaultRng() {
  return Math.random();
}

// ── getTargets ─────────────────────────────────────────────────────────────

/**
 * Given a move's target type, return array of target player indices.
 *
 * @param {number} playerIndex   - Index of the attacking player
 * @param {object} move          - The move being used (needs move.target, move.element)
 * @param {object[]} allPlayers  - Array of all player objects
 * @param {number} [selectedTarget] - The player-selected target index
 * @returns {number[]} Array of target indices
 */
export function getTargets(playerIndex, move, allPlayers, selectedTarget) {
  const player = allPlayers[playerIndex];
  const targetType = move.target;
  const targets = [];

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    // Skip empty slots
    if (!p || p.charId < 0) continue;
    // Skip MIA players
    if (p.status[STATUS.MIA]) continue;

    // For Life element, allow targeting dead players; otherwise skip dead
    if (move.element !== ELEMENT.LIFE && p.hp <= 0) continue;

    let ok = false;

    switch (targetType) {
      case TARGET.ENEMY:
        ok = (i === selectedTarget);
        break;
      case TARGET.ALL_FOE:
        ok = (p.teamId !== player.teamId);
        break;
      case TARGET.ALL_FRIEND:
        ok = (p.teamId === player.teamId);
        break;
      case TARGET.ALLY:
        ok = (i === selectedTarget);
        break;
      case TARGET.ALL_TEAM:
        if (selectedTarget !== undefined && allPlayers[selectedTarget]) {
          ok = (p.teamId === allPlayers[selectedTarget].teamId);
        }
        break;
      case TARGET.ALL_BUT_SELF:
        ok = (i !== playerIndex);
        break;
      case TARGET.EVERYBODY:
        ok = true;
        break;
      case TARGET.ONLY_SELF:
        ok = (i === playerIndex);
        break;
      default:
        ok = (i === selectedTarget);
        break;
    }

    if (ok) targets.push(i);
  }

  return targets;
}

// ── queueMove ──────────────────────────────────────────────────────────────

/**
 * Validate and queue a move for execution.
 *
 * @param {object} player      - The player attempting the move
 * @param {number} playerIndex - Index of the player in allPlayers
 * @param {number} moveIndex   - Index into player.moves[]
 * @param {number} targetIndex - Index of target player
 * @param {object} gameState   - { gameTime, allPlayers, arena }
 * @returns {{ success: boolean, message: string }}
 */
export function queueMove(player, playerIndex, moveIndex, targetIndex, gameState) {
  const { gameTime } = gameState;

  // Player must be alive
  if (player.hp <= 0 || !player.isAlive) {
    return { success: false, message: `${player.scrNam} is dead and cannot act.` };
  }

  // Check disabling statuses
  if (!canAct(player)) {
    return { success: false, message: `${player.scrNam} cannot act due to a status effect.` };
  }

  // Already executing a move
  if (player.curMove !== 0) {
    return { success: false, message: `${player.scrNam} is already performing an action.` };
  }

  const move = player.moves[moveIndex];
  if (!move) {
    return { success: false, message: `${player.scrNam}: invalid move index.` };
  }

  // Mute check: non-physical moves blocked
  if (player.status[STATUS.MUTE] && move.element !== ELEMENT.PHYSICAL) {
    return { success: false, message: `${player.scrNam}, you cannot do this move while Mute.` };
  }

  // Scarecrow check: physical moves blocked
  if (player.status[STATUS.SCARECROW] && move.element === ELEMENT.PHYSICAL) {
    return { success: false, message: `${player.scrNam}, you can't do physical attacks as a scarecrow.` };
  }

  // Super requirements
  if (move.canSuper >= 6) {
    return { success: false, message: `${player.scrNam}, this move must be used as a counterattack.` };
  }
  if (move.canSuper > 1 && player.superNum < move.canSuper - 1 && move.canSuper < 6) {
    if (move.canSuper === 2) {
      return { success: false, message: `${player.scrNam}, this move must be done as a Super.` };
    }
    return { success: false, message: `${player.scrNam}, this move must be Supered to a minimum of Level ${move.canSuper - 1}.` };
  }
  if (player.superNum > 0 && move.canSuper === 0) {
    return { success: false, message: `${player.scrNam}, that move cannot be Supered.` };
  }

  // Super: check SP requirement (need >= 100)
  if (player.superNum > 0) {
    if (player.sp < 100) {
      return { success: false, message: `${player.scrNam}, not enough SP for a Super attack.` };
    }
  }

  // Cheese limit check (VB6: ProjectedTotalDamage + cheese > MaxCheeseLimit)
  if (doesDamage(move.element) && player.superNum === 0) {
    const projected = projectDamage(
      player,
      gameState.allPlayers[targetIndex] || player,
      move,
      gameState.arena,
      { seed: 0.5 }
    );
    const projectedCheese = Math.floor(projected.damage * (move.status[STATUS.HIT_RATE] || 100) / 100);
    if (player.cheese + projectedCheese > CHEESE_LIMIT &&
        !player.status[STATUS.PMS] && !player.status[STATUS.BERSERK] && !player.status[STATUS.CHAOS]) {
      return {
        success: false,
        message: `Slow down, ${player.scrNam}! Don't be too cheezy! (Projected Damage: ${projected.damage}. Current Cheese: ${player.cheese}.)`,
      };
    }
  }

  // MP warning (VB6 allows the move but warns)
  let mpWarning = '';
  if (move.mpReq > player.mp) {
    mpWarning = ` WARNING: Not enough MP required to complete move. (has ${player.mp}, requires ${move.mpReq})`;
  }

  // Set move state (store as 1-based index; curMove=0 means idle)
  player.curMove = moveIndex + 1;
  player.target = targetIndex;
  player.moveStart = gameTime;

  // Quick status: instant move
  if (player.status[STATUS.QUICK] && !move.status[STATUS.QUICK]) {
    player.moveStart = gameTime - 9999;
    player.status[STATUS.QUICK] = 0;
  }

  // Build begin-attack message
  const targetPlayer = gameState.allPlayers[targetIndex];
  const targetName = targetPlayer ? targetPlayer.scrNam : '';
  let beginStr = move.beginAttack;

  if (move.element === ELEMENT.HEAL) {
    if (targetIndex === playerIndex && move.beginHealSelf) {
      beginStr = move.beginHealSelf;
    }
  }

  // Super prefix
  if (player.superNum > 0 && (move.canSuper === 1 || player.superNum >= move.canSuper - 1) && move.canSuper <= 5) {
    const superPrefix = `Lev${player.superNum}/${targetName}: `;
    beginStr = superPrefix + (move.beginSuperAttack || beginStr);
  }

  const message = substituteVars(beginStr, {
    SN: player.scrNam,
    T: targetName,
  }) + mpWarning;

  return { success: true, message };
}

// ── resolveMove ────────────────────────────────────────────────────────────

/**
 * Check if a pending move should resolve, and if so, execute it.
 *
 * @param {object}   player     - The attacking player
 * @param {number}   playerIndex - Index of player in allPlayers
 * @param {object[]} allPlayers - All players in the game
 * @param {object}   arena      - Current arena
 * @param {number}   gameTime   - Current game time in seconds
 * @param {object}   [opts]     - { rng: () => 0-1 }
 * @returns {{ resolved: boolean, messages?: string[], kills?: Array<{attacker: number, target: number}>, statusChanges?: Array<{player: number, status: number, applied: boolean}> }}
 */
export function resolveMove(player, playerIndex, allPlayers, arena, gameTime, opts = {}) {
  if (player.curMove <= 0 || player.curMove > player.moves.length) {
    return { resolved: false };
  }

  // curMove is 1-based; convert back to 0-based array index
  const moveIndex = player.curMove - 1;
  const move = player.moves[moveIndex];
  if (!move) return { resolved: false };

  // Calculate time needed
  const baseTime = TIMING.NORMAL_MOVE_HIT;
  const timeMod = getMoveTimeModifier(player);
  const timeNeeded = baseTime + timeMod;
  const elapsed = gameTime - player.moveStart;

  if (elapsed < timeNeeded) {
    return { resolved: false };
  }

  // Move resolves!
  const rng = opts.rng || defaultRng;
  const messages = [];
  const kills = [];
  const statusChanges = [];

  // Check MP requirement at resolution time
  if (move.mpReq > 0) {
    if (player.mp < move.mpReq) {
      messages.push(`${player.scrNam}'s move fizzles — not enough MP!`);
      player.curMove = 0;
      return { resolved: true, messages, kills, statusChanges };
    }
    player.mp -= move.mpReq;
  }

  // Get targets
  const targetIndices = getTargets(playerIndex, move, allPlayers, player.target);

  // Determine if this is a super
  const isSuper = player.superNum > 0 && player.sp >= 100;
  if (isSuper) {
    player.sp -= 100;
    if (player.sp < 0) player.sp = 0;
  }

  // Process each target
  let totalDamage = 0;

  for (const ti of targetIndices) {
    const target = allPlayers[ti];
    if (!target) continue;

    // ── Special element handling ───────────────────────────────────────

    // HEAL
    if (move.element === ELEMENT.HEAL) {
      const result = projectDamage(player, target, move, arena, {
        seed: rng(),
        isSuper,
        superNum: player.superNum,
      });
      let healAmt = result.damage;
      // Don't overheal
      const room = target.maxHp - target.hp;
      if (healAmt > room) healAmt = room;
      if (healAmt < 0) healAmt = 0;
      target.hp += healAmt;
      const healStr = move.healSelf || move.hit || `%SN heals %T for ${healAmt} HP.`;
      messages.push(substituteVars(healStr, {
        SN: player.scrNam,
        T: target.scrNam,
      }) + ` [${healAmt}HP]`);
      totalDamage += healAmt;
      continue;
    }

    // LIFE (revive)
    if (move.element === ELEMENT.LIFE) {
      if (target.hp <= 0) {
        target.hp = Math.floor(target.maxHp / 4);
        target.isAlive = true;
        messages.push(`${player.scrNam} revives ${target.scrNam}! [${target.hp}HP]`);
      } else {
        messages.push(`${target.scrNam} is already alive.`);
      }
      continue;
    }

    // MORPH — handled externally (needs character lookup)
    if (move.element === ELEMENT.MORPH) {
      messages.push(`${player.scrNam} morphs!`);
      continue;
    }

    // REVEAL / Scan
    if (move.element === ELEMENT.REVEAL) {
      messages.push(`${player.scrNam} scans ${target.scrNam}: ${target.hp}/${target.maxHp} HP, ${target.mp}/${target.maxMp} MP, ${target.sp} SP.`);
      continue;
    }

    // ── Standard damage elements (including Demi, HP/MP Theft) ────────

    // Roll hit
    const defStat = isPhysicalElement(move.element) ? target.physDef : target.magDef;
    const hitSeed = rng();
    const hits = calculateHitChance(move.element, defStat, { seed: hitSeed });

    if (!hits) {
      // Miss
      const missStr = (isSuper && move.superMiss) ? move.superMiss : (move.miss || '%SN misses %T.');
      messages.push(substituteVars(missStr, {
        SN: player.scrNam,
        T: target.scrNam,
      }));
      continue;
    }

    // Calculate damage
    const dmgSeed = rng();
    const dmgResult = projectDamage(player, target, move, arena, {
      seed: dmgSeed,
      isSuper,
      superNum: player.superNum,
    });

    let damage = dmgResult.damage;

    // Invincible check — before barrier absorption so barriers aren't wasted
    if (target.status[STATUS.INVINCIBLE]) {
      messages.push(`${target.scrNam} is shielded! The attack has no effect.`);
      continue;
    }

    // Barrier / MBarrier absorption
    if (isPhysicalElement(move.element) && target.status[STATUS.BARRIER] > 0) {
      const absorbed = Math.min(damage, target.status[STATUS.BARRIER]);
      target.status[STATUS.BARRIER] -= absorbed;
      damage -= absorbed;
      if (absorbed > 0) {
        messages.push(`${target.scrNam}'s Barrier absorbs ${absorbed} damage.`);
      }
    }
    if (!isPhysicalElement(move.element) && doesDamage(move.element) && target.status[STATUS.M_BARRIER] > 0) {
      const absorbed = Math.min(damage, target.status[STATUS.M_BARRIER]);
      target.status[STATUS.M_BARRIER] -= absorbed;
      damage -= absorbed;
      if (absorbed > 0) {
        messages.push(`${target.scrNam}'s MBarrier absorbs ${absorbed} damage.`);
      }
    }

    // HP Theft: attacker gains HP
    if (move.element === ELEMENT.HP_THEFT) {
      const stolen = Math.min(damage, target.hp);
      target.hp -= stolen;
      player.hp = Math.min(player.hp + stolen, player.maxHp);
      totalDamage += stolen;
      messages.push(`${player.scrNam} steals ${stolen} HP from ${target.scrNam}!`);
    }
    // MP Theft: attacker gains MP
    else if (move.element === ELEMENT.MP_THEFT) {
      const stolen = Math.min(damage, target.mp);
      target.mp -= stolen;
      player.mp = Math.min(player.mp + stolen, player.maxMp);
      messages.push(`${player.scrNam} steals ${stolen} MP from ${target.scrNam}!`);
    }
    // Standard damage
    else {
      target.hp -= damage;
      totalDamage += damage;

      // Generate hit message (skip if barrier absorbed all damage)
      if (damage > 0) {
        let hitStr;
        if (dmgResult.isCrit) {
          hitStr = move.critHit || move.hit || '%SN critically hits %T!';
          messages.push(substituteVars(hitStr, {
            SN: player.scrNam,
            T: target.scrNam,
          }) + ` [${damage}HP]`);
        } else if (isSuper && move.superHit) {
          hitStr = move.superHit;
          messages.push(substituteVars(hitStr, {
            SN: player.scrNam,
            T: target.scrNam,
          }) + ` [${damage}HP]`);
        } else {
          hitStr = move.hit || '%SN hits %T!';
          messages.push(substituteVars(hitStr, {
            SN: player.scrNam,
            T: target.scrNam,
          }) + ` [${damage}HP]`);
        }
      }
    }

    // Apply move's status effects (% chance per status)
    for (let s = 1; s < move.status.length; s++) {
      if (s === STATUS.HIT_RATE) continue; // skip hit rate slot
      const chance = move.status[s];
      if (chance > 0) {
        const roll = Math.floor(rng() * 100) + 1;
        if (roll <= chance) {
          applyStatus(target, s, gameTime, gameTime);
          statusChanges.push({ player: ti, status: s, applied: true });
        }
      }
    }

    // Check if target died
    if (target.hp <= 0 && target.isAlive) {
      target.isAlive = false;
      target.hp = 0;
      // Reraise check
      if (target.status[STATUS.RERAISE] && target.status[STATUS.RERAISE] !== 42) {
        target.hp = Math.floor(target.maxHp / 4);
        target.isAlive = true;
        target.status[STATUS.RERAISE] = 42; // consumed
        messages.push(`${target.scrNam} is revived by Reraise! [${target.hp}HP]`);
      } else {
        kills.push({ attacker: playerIndex, target: ti });
        messages.push(`${target.scrNam} has been defeated by ${player.scrNam}!`);
      }
    }

    // Wake up sleeping target on hit (but not if they're dead)
    if (target.isAlive && target.status[STATUS.SLEEP] && damage > 0) {
      target.status[STATUS.SLEEP] = 0;
      messages.push(`${target.scrNam} wakes up!`);
    }
  }

  // SP gain for attacker (from dealing damage)
  if (totalDamage > 0 && doesDamage(move.element)) {
    const spGain = Math.min(Math.floor(totalDamage / 20) + 1, 20);
    player.sp = Math.min(player.sp + spGain, MAX_SUPER_POINTS);
  }

  // SP gain for targets (from taking damage)
  for (const ti of targetIndices) {
    const target = allPlayers[ti];
    if (!target || ti === playerIndex) continue;
    if (target.hp > 0 && target.isAlive && doesDamage(move.element)) {
      const spGain = Math.min(Math.floor(totalDamage / (targetIndices.length * 30)) + 1, 10);
      target.sp = Math.min(target.sp + spGain, MAX_SUPER_POINTS);
    }
  }

  // Track damage dealt/taken
  if (doesDamage(move.element) && totalDamage > 0) {
    player.damageDealt += totalDamage;
    for (const ti of targetIndices) {
      const target = allPlayers[ti];
      if (target && ti !== playerIndex) {
        target.damageTaken += Math.min(totalDamage, target.maxHp);
      }
    }
  }

  // Update cheese counter
  if (doesDamage(move.element)) {
    player.cheese += totalDamage;
  }

  // Clear move
  player.curMove = 0;

  return { resolved: true, messages, kills, statusChanges };
}

// ── resolveBlock ───────────────────────────────────────────────────────────

/**
 * Handle block resolution. If blocker has a counter move and SP >= 100, counter-attack.
 *
 * @param {object}   blocker     - The blocking player
 * @param {number}   blockerIndex - Index of blocker in allPlayers
 * @param {object[]} allPlayers  - All players
 * @param {number}   gameTime    - Current game time
 * @param {object}   [opts]      - { rng }
 * @returns {{ resolved: boolean, messages?: string[], counterTarget?: number }}
 */
export function resolveBlock(blocker, blockerIndex, allPlayers, gameTime, opts = {}) {
  if (blocker.curMove !== PLAYER_MOVE.BLOCK) {
    return { resolved: false };
  }

  const elapsed = gameTime - blocker.moveStart;
  if (elapsed < TIMING.BLOCK_HIT) {
    return { resolved: false };
  }

  const messages = [];

  // Check for counter-attack move
  const counterMoveIndex = blocker.target; // stored in target when blocking with counter
  const counterMove = counterMoveIndex >= 0 && counterMoveIndex < blocker.moves.length ? blocker.moves[counterMoveIndex] : null;

  if (counterMove && blocker.sp >= 100) {
    // Counter attack: find closest incoming attacker
    let closestAttacker = -1;
    let closestTime = Infinity;

    for (let i = 0; i < allPlayers.length; i++) {
      const p = allPlayers[i];
      if (!p || i === blockerIndex || p.hp <= 0) continue;
      if (p.curMove > 0 && p.target === blockerIndex) {
        const timeLeft = (p.moveStart + TIMING.NORMAL_MOVE_HIT) - gameTime;
        if (timeLeft < closestTime) {
          closestTime = timeLeft;
          closestAttacker = i;
        }
      }
    }

    if (closestAttacker >= 0) {
      blocker.sp -= 100;
      const target = allPlayers[closestAttacker];
      messages.push(`${blocker.scrNam} counter-attacks ${target.scrNam}!`);
      blocker.curMove = 0;
      return { resolved: true, messages, counterTarget: closestAttacker };
    }
  }

  // Normal block expiry
  blocker.curMove = 0;
  messages.push(`${blocker.scrNam} lowers their guard.`);
  return { resolved: true, messages };
}

// ── resolveRest ────────────────────────────────────────────────────────────

/**
 * Rest: recover HP/MP from arena restoration values, gain some SP.
 *
 * @param {object} player      - The resting player
 * @param {number} playerIndex - Index of player
 * @param {object} arena       - Current arena
 * @param {number} gameTime    - Current game time
 * @returns {{ resolved: boolean, messages?: string[], hpGain?: number, mpGain?: number }}
 */
export function resolveRest(player, playerIndex, arena, gameTime) {
  if (player.curMove !== PLAYER_MOVE.REST) {
    return { resolved: false };
  }

  const timeMod = getMoveTimeModifier(player);
  const timeNeeded = TIMING.REST_HIT + timeMod;
  const elapsed = gameTime - player.moveStart;

  if (elapsed < timeNeeded) {
    return { resolved: false };
  }

  const messages = [];

  // HP recovery from arena
  const lowHp = arena.restLowHp || 0;
  const highHp = arena.restHighHp || 0;
  let hpGain = 0;
  if (highHp > 0) {
    hpGain = Math.floor(Math.random() * (highHp - lowHp + 1)) + lowHp;
    const hpRoom = player.maxHp - player.hp;
    if (hpGain > hpRoom) hpGain = hpRoom;
    if (hpGain < 0) hpGain = 0;
    player.hp += hpGain;
  }

  // MP recovery from arena
  const lowMp = arena.restLowMp || 0;
  const highMp = arena.restHighMp || 0;
  let mpGain = 0;
  if (highMp > 0) {
    mpGain = Math.floor(Math.random() * (highMp - lowMp + 1)) + lowMp;
    const mpRoom = player.maxMp - player.mp;
    if (mpGain > mpRoom) mpGain = mpRoom;
    if (mpGain < 0) mpGain = 0;
    player.mp += mpGain;
  }

  // SP gain from resting
  const spGain = 5;
  player.sp = Math.min(player.sp + spGain, MAX_SUPER_POINTS);

  messages.push(`${player.scrNam} rests and recovers ${hpGain} HP and ${mpGain} MP.`);

  player.curMove = 0;
  return { resolved: true, messages, hpGain, mpGain };
}

// ── resolveFatality ────────────────────────────────────────────────────────

/**
 * Fatality: instant kill if target HP <= maxHP/6. Ignores Life3/Reraise.
 *
 * @param {object}   player      - The player doing the fatality
 * @param {number}   playerIndex - Index of player
 * @param {object}   target      - Target player
 * @param {number}   targetIndex - Index of target
 * @param {number}   gameTime    - Current game time
 * @returns {{ resolved: boolean, messages?: string[], killed?: boolean }}
 */
export function resolveFatality(player, playerIndex, target, targetIndex, gameTime) {
  if (player.curMove !== PLAYER_MOVE.FATAL) {
    return { resolved: false };
  }

  const timeMod = getMoveTimeModifier(player);
  const timeNeeded = TIMING.FATAL_HIT + timeMod;
  const elapsed = gameTime - player.moveStart;

  if (elapsed < timeNeeded) {
    return { resolved: false };
  }

  const messages = [];
  let killed = false;

  if (target.hp > 0 && target.hp <= Math.floor(target.maxHp / 6)) {
    // Fatality succeeds — ignores Reraise
    target.hp = 0;
    target.isAlive = false;
    target.status[STATUS.RERAISE] = 0; // Fatality overrides reraise
    killed = true;

    const fatalStr = player.character?.fatality?.fatalMove ||
                     `${player.scrNam} performs a fatality on ${target.scrNam}!`;
    messages.push(substituteVars(fatalStr, {
      SN: player.scrNam,
      T: target.scrNam,
    }));
  } else if (target.hp <= 0) {
    messages.push(`${target.scrNam} is already dead.`);
  } else {
    messages.push(`${player.scrNam}'s fatality fails — ${target.scrNam} is not weak enough!`);
  }

  player.curMove = 0;
  return { resolved: true, messages, killed };
}

// ── checkBattleEnd ─────────────────────────────────────────────────────────

/**
 * Check if battle should end.
 *
 * @param {object[]} players    - All players
 * @param {string}   battleType - 'teams' or 'ffa'
 * @returns {{ ended: boolean, winners: number[], message: string }}
 */
export function checkBattleEnd(players, battleType) {
  const alive = [];
  const teamsAlive = new Set();

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p || p.charId < 0) continue;
    if (p.hp > 0 && p.isAlive) {
      alive.push(i);
      teamsAlive.add(p.teamId);
    }
  }

  if (battleType === 'teams') {
    if (teamsAlive.size <= 1 && alive.length > 0) {
      return {
        ended: true,
        winners: alive,
        message: `Team ${players[alive[0]].teamId} wins!`,
      };
    }
    if (alive.length === 0) {
      return {
        ended: true,
        winners: [],
        message: 'Everyone is dead! Draw!',
      };
    }
  } else {
    // FFA
    if (alive.length <= 1) {
      if (alive.length === 1) {
        return {
          ended: true,
          winners: alive,
          message: `${players[alive[0]].scrNam} wins!`,
        };
      }
      return {
        ended: true,
        winners: [],
        message: 'Everyone is dead! Draw!',
      };
    }
  }

  return { ended: false, winners: [], message: '' };
}
