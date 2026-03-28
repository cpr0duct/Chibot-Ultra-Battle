/**
 * BattleRoom — central game room class that ties together the state machine,
 * timer loops, and player management for a single battle instance.
 *
 * BattleRoom owns ALL game state for a battle. The `emit` callback is
 * the ONLY way it communicates with the outside world (Socket.IO layer).
 */

import { PLAYER_MOVE, TIMING } from './constants.js';
import { createPlayer, createArena } from './types.js';
import { parseCommand } from './command-parser.js';
import { resolveMove, resolveBlock, resolveRest, resolveFatality, checkBattleEnd, queueMove } from './combat.js';
import { tickStatuses, canAct } from './status.js';
import { rollArenaEvent } from './arena.js';
import { spawnItem, pickupItem } from './items.js';

// ── Valid phase transitions ──────────────────────────────────────────────────

const PHASES = ['waiting', 'selection', 'voting', 'battle', 'paused', 'ended'];

// ── BattleRoom ───────────────────────────────────────────────────────────────

export class BattleRoom {
  /**
   * @param {string}   id      - Unique room identifier
   * @param {object}   dataset - { config, characters, arenas, items, weapons } from loadDataset
   * @param {object}   config  - From default.json
   * @param {function} emit    - Callback (eventName, data) for broadcasting to Socket.IO
   */
  constructor(id, dataset, config, emit) {
    this.id = id;
    this.phase = 'waiting';
    this.players = [];
    this.dataset = dataset;
    this.config = config;
    this.emit = emit;
    this.arena = null;
    this.battleType = 'teams';
    this.gameTime = 0;
    this.timers = { move: null, cpu: null, misc: null };
    this.currentItem = null;
    this.hostIndex = 0;
    this.spectators = [];
    this.startTime = 0;
  }

  // ── Player management ────────────────────────────────────────────────────

  /**
   * Add a human player to the room.
   * @param {string}  scrNam         - Screen name
   * @param {string}  socketId       - Socket.IO socket id
   * @param {boolean} [isCpu=false]  - Whether this is a CPU player
   * @param {object}  [cpuPersonality=null] - CPU personality traits
   * @returns {number} Player index, or -1 if room is full
   */
  addPlayer(scrNam, socketId, isCpu = false, cpuPersonality = null) {
    const max = this.config.maxPlayersPerRoom || 20;
    if (this.players.length >= max) return -1;

    const player = createPlayer();
    player.scrNam = scrNam;
    player.socketId = socketId;
    player.isCpu = isCpu;
    if (cpuPersonality) {
      player.cpuPersonality = { ...player.cpuPersonality, ...cpuPersonality };
    }

    const idx = this.players.length;
    this.players.push(player);

    this.emit('room:player-joined', { roomId: this.id, playerIndex: idx, scrNam });
    this._emitRoomState();
    return idx;
  }

  /**
   * Remove a player by socket id.
   * @param {string} socketId
   * @returns {boolean} Whether a player was removed
   */
  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return false;

    const player = this.players[idx];
    this.players.splice(idx, 1);

    // Adjust host index if needed
    if (this.hostIndex >= this.players.length && this.players.length > 0) {
      this.hostIndex = 0;
    }

    this.emit('room:player-left', { roomId: this.id, playerIndex: idx, scrNam: player.scrNam });
    this._emitRoomState();
    return true;
  }

  /**
   * Add a CPU bot with a specific character and team.
   * @param {number} charId      - Character index in dataset.characters
   * @param {number} teamId      - Team assignment
   * @param {object} personality - CPU personality traits
   * @returns {number} Player index
   */
  addCpuBot(charId, teamId, personality) {
    const char = this.dataset.characters?.[charId];
    const name = char ? char.fullName || `CPU-${charId}` : `CPU-${charId}`;

    const player = createPlayer();
    player.scrNam = name;
    player.isCpu = true;
    player.charId = charId;
    player.teamId = teamId;
    player.socketId = `cpu-${this.players.length}-${Date.now()}`;
    if (personality) {
      player.cpuPersonality = { ...player.cpuPersonality, ...personality };
    }
    if (char) {
      player.character = char;
      player.moves = char.moves ? [...char.moves] : [];
    }

    const idx = this.players.length;
    this.players.push(player);

    this.emit('room:cpu-added', { roomId: this.id, playerIndex: idx, scrNam: player.scrNam });
    this._emitRoomState();
    return idx;
  }

  /**
   * Fill remaining player slots with CPU bots.
   * @param {number} count - Number of CPUs to add
   */
  fillWithCpus(count) {
    const chars = this.dataset.characters || [];
    for (let i = 0; i < count; i++) {
      const charId = chars.length > 0 ? (i % chars.length) : 0;
      const teamId = (this.players.length % 2) + 1;
      this.addCpuBot(charId, teamId, null);
    }
    this._emitRoomState();
  }

  /**
   * Distribute players evenly across two teams.
   */
  ezTeams() {
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].teamId = (i % 2) + 1;
    }
    this.emit('room:teams-assigned', {
      roomId: this.id,
      teams: this.players.map((p, i) => ({ index: i, teamId: p.teamId })),
    });
    this._emitRoomState();
  }

  // ── Room state broadcast ───────────────────────────────────────────────

  /**
   * Emit the current room state (players list) to all clients in the room.
   * Called after any player change during selection phase.
   */
  _emitRoomState() {
    this.emit('room:state', {
      roomId: this.id,
      phase: this.phase,
      players: this.players.map((p, i) => ({
        index: i,
        scrNam: p.scrNam,
        isCpu: p.isCpu,
        teamId: p.teamId,
        charName: p.character?.fullName || '',
        charId: p.charId,
        moves: p.character ? (p.character.moves || [])
          .filter(m => m && m.name && m.name !== '')
          .map(m => ({
            name: m.name,
            cmdKey: m.cmdKey,
            element: m.element,
            strength: m.strength,
            target: m.target,
            canSuper: m.canSuper,
            mpReq: m.mpReq,
          })) : [],
      })),
    });
  }

  // ── Phase transitions ──────────────────────────────────────────────────

  /**
   * Transition from 'waiting' to 'selection' phase.
   */
  startSelection() {
    if (this.phase !== 'waiting') return;
    this.phase = 'selection';
    this.emit('phase:selection', { roomId: this.id });
  }

  /**
   * Assign a character to a player during selection phase.
   * @param {number} playerIndex - Index in players array
   * @param {string} commandKey  - Character command key to look up
   * @returns {boolean} Whether selection succeeded
   */
  selectCharacter(playerIndex, commandKey) {
    if (this.phase !== 'selection') return false;

    const player = this.players[playerIndex];
    if (!player) return false;

    // Find character by command key (senshiId or partial match)
    const chars = this.dataset.characters || [];
    const char = chars.find(c =>
      c.senshiId?.toLowerCase() === commandKey.toLowerCase() ||
      c.fullName?.toLowerCase() === commandKey.toLowerCase()
    );

    if (!char) return false;

    const charIndex = chars.indexOf(char);
    player.charId = charIndex;
    player.character = char;
    player.moves = char.moves ? [...char.moves] : [];

    // Apply base stats from character
    player.physStr = char.physStr || 0;
    player.physDef = char.physDef || 0;
    player.magStr = char.magStr || 0;
    player.magDef = char.magDef || 0;

    this.emit('selection:character-chosen', {
      roomId: this.id,
      playerIndex,
      charName: char.fullName,
    });
    this._emitRoomState();

    return true;
  }

  /**
   * Set a player's team.
   * @param {number} playerIndex
   * @param {number} teamId
   */
  setTeam(playerIndex, teamId) {
    const player = this.players[playerIndex];
    if (!player) return;
    player.teamId = teamId;
    this.emit('selection:team-set', { roomId: this.id, playerIndex, teamId });
    this._emitRoomState();
  }

  /**
   * Cast a vote for battle type and arena.
   * @param {number} playerIndex
   * @param {object} options - { battleType, arenaIndex }
   */
  vote(playerIndex, { battleType, arenaIndex } = {}) {
    if (this.phase !== 'selection' && this.phase !== 'voting') return;

    this.phase = 'voting';

    if (battleType) this.battleType = battleType;
    if (arenaIndex !== undefined) {
      const arenas = this.dataset.arenas || [];
      if (arenas[arenaIndex]) {
        this.arena = arenas[arenaIndex];
      }
    }

    this.emit('vote:cast', { roomId: this.id, playerIndex, battleType, arenaIndex });
  }

  /**
   * Start the battle. Transitions to 'battle' phase and starts 3 timer loops.
   */
  startBattle() {
    if (this.phase !== 'selection' && this.phase !== 'voting' && this.phase !== 'waiting') return;

    this.phase = 'battle';
    this.gameTime = 0;
    this.startTime = Date.now();

    // Default arena if none selected
    if (!this.arena) {
      const arenas = this.dataset.arenas || [];
      this.arena = arenas[0] || createArena();
    }

    // Initialize player HP/MP from config defaults if not set
    for (const player of this.players) {
      if (player.hp <= 0 && player.isAlive) {
        player.hp = player.maxHp || 500;
        player.maxHp = player.maxHp || 500;
      }
      if (player.maxMp > 0 && player.mp <= 0) {
        player.mp = player.maxMp;
      }
    }

    // Start timer loops
    this._startTimers();

    this.emit('phase:battle', { roomId: this.id, gameTime: this.gameTime });
  }

  /**
   * Pause the battle. Clears all timer intervals.
   */
  pause() {
    if (this.phase !== 'battle') return;
    this.phase = 'paused';
    this._stopTimers();
    this.emit('phase:paused', { roomId: this.id, gameTime: this.gameTime });
  }

  /**
   * Unpause the battle. Restarts all timer intervals.
   */
  unpause() {
    if (this.phase !== 'paused') return;
    this.phase = 'battle';
    this._startTimers();
    this.emit('phase:battle', { roomId: this.id, gameTime: this.gameTime });
  }

  /**
   * End the battle. Stops timers, transitions to 'ended'.
   * @returns {object} Battle results
   */
  endBattle() {
    this._stopTimers();
    this.phase = 'ended';

    const result = checkBattleEnd(this.players, this.battleType);
    const elapsed = Date.now() - this.startTime;

    const results = {
      roomId: this.id,
      winners: result.winners,
      message: result.message,
      gameTime: this.gameTime,
      realTime: elapsed,
      players: this.players.map((p, i) => ({
        index: i,
        scrNam: p.scrNam,
        teamId: p.teamId,
        kills: p.kills,
        deaths: p.deaths,
        fatalities: p.fatalities,
        damageDealt: p.damageDealt,
        damageTaken: p.damageTaken,
        isAlive: p.isAlive,
      })),
    };

    this.emit('phase:ended', results);
    return results;
  }

  // ── Command processing ─────────────────────────────────────────────────

  /**
   * Process a raw command string from a player.
   * Routes to the appropriate handler based on parsed command type.
   *
   * @param {number} playerIndex - Index of player who sent the command
   * @param {string} rawCommand  - Raw text input
   * @returns {object} Result of the command processing
   */
  processCommand(playerIndex, rawCommand) {
    const cmd = parseCommand(rawCommand);
    const player = this.players[playerIndex];

    if (!player) {
      return { success: false, message: 'Invalid player.' };
    }

    // Host commands (any phase)
    if (cmd.type === 'host') {
      if (playerIndex !== this.hostIndex) {
        return { success: false, message: 'Only the host can use this command.' };
      }
      return this._handleHostCommand(cmd);
    }

    // Selection phase commands
    if (this.phase === 'selection') {
      if (cmd.type === 'select') {
        const ok = this.selectCharacter(playerIndex, cmd.key);
        return { success: ok, message: ok ? 'Character selected.' : 'Character not found.' };
      }
      return { success: false, message: 'Use /charname to select a character.' };
    }

    // Battle phase commands
    if (this.phase === 'battle') {
      return this._handleBattleCommand(playerIndex, cmd);
    }

    return { success: false, message: `Cannot process commands in '${this.phase}' phase.` };
  }

  // ── Private: battle command routing ────────────────────────────────────

  /** @private */
  _handleBattleCommand(playerIndex, cmd) {
    const player = this.players[playerIndex];

    switch (cmd.type) {
      case 'move': {
        // Find move by key
        const moveIdx = player.moves.findIndex(m =>
          m && m.cmdKey && m.cmdKey.toLowerCase() === cmd.key?.toLowerCase()
        );
        if (moveIdx === -1) {
          return { success: false, message: 'Move not found.' };
        }
        // Find target by name
        const targetIdx = cmd.target
          ? this.players.findIndex(p => p.scrNam?.toLowerCase() === cmd.target?.toLowerCase())
          : this._getDefaultTarget(playerIndex);

        if (cmd.isSuper) {
          player.superNum = cmd.superLevel || 1;
        }

        const result = queueMove(player, playerIndex, moveIdx, targetIdx, {
          gameTime: this.gameTime,
          allPlayers: this.players,
          arena: this.arena,
        });

        if (result.success) {
          this.emit('battle:message', { roomId: this.id, message: result.message });
        }
        return result;
      }

      case 'moveByNumber': {
        const moveIdx = cmd.number - 1; // Convert 1-based user input to 0-based index
        const targetIdx = cmd.target
          ? this.players.findIndex(p => p.scrNam?.toLowerCase() === cmd.target?.toLowerCase())
          : this._getDefaultTarget(playerIndex);

        const result = queueMove(player, playerIndex, moveIdx, targetIdx, {
          gameTime: this.gameTime,
          allPlayers: this.players,
          arena: this.arena,
        });

        if (result.success) {
          this.emit('battle:message', { roomId: this.id, message: result.message });
        }
        return result;
      }

      case 'block': {
        player.curMove = PLAYER_MOVE.BLOCK;
        player.moveStart = this.gameTime;
        // Store counter move index if specified
        if (cmd.counterMove) {
          const counterIdx = player.moves.findIndex(m =>
            m && m.cmdKey && m.cmdKey.toLowerCase() === cmd.counterMove.toLowerCase()
          );
          player.target = counterIdx >= 0 ? counterIdx : 0;
        } else {
          player.target = 0;
        }
        this.emit('battle:message', {
          roomId: this.id,
          message: `${player.scrNam} assumes a blocking stance.`,
        });
        return { success: true, message: 'Blocking.' };
      }

      case 'rest': {
        player.curMove = PLAYER_MOVE.REST;
        player.moveStart = this.gameTime;
        this.emit('battle:message', {
          roomId: this.id,
          message: `${player.scrNam} begins to rest.`,
        });
        return { success: true, message: 'Resting.' };
      }

      case 'taunt': {
        const taunts = player.character?.taunts || [];
        const taunt = taunts.find(t => t && t.length > 0) || `${player.scrNam} taunts!`;
        this.emit('battle:message', { roomId: this.id, message: taunt });
        return { success: true, message: 'Taunted.' };
      }

      case 'get': {
        if (!this.currentItem) {
          return { success: false, message: 'No item on the field.' };
        }
        const pickup = pickupItem(player, this.currentItem, { gameTime: this.gameTime });
        for (const msg of pickup.messages) {
          this.emit('battle:message', { roomId: this.id, message: msg });
        }
        this.currentItem = null;
        return { success: true, message: 'Item picked up.' };
      }

      case 'flee': {
        player.curMove = PLAYER_MOVE.FLEE;
        player.moveStart = this.gameTime;
        this.emit('battle:message', {
          roomId: this.id,
          message: `${player.scrNam} attempts to flee!`,
        });
        return { success: true, message: 'Fleeing.' };
      }

      case 'defect': {
        if (cmd.target) {
          const targetPlayer = this.players.find(
            p => p.scrNam?.toLowerCase() === cmd.target.toLowerCase()
          );
          if (targetPlayer) {
            player.teamId = targetPlayer.teamId;
            player.defect = true;
            this.emit('battle:message', {
              roomId: this.id,
              message: `${player.scrNam} defects to ${targetPlayer.scrNam}'s team!`,
            });
            return { success: true, message: 'Defected.' };
          }
        }
        return { success: false, message: 'Invalid defect target.' };
      }

      default:
        return { success: false, message: 'Unknown command.' };
    }
  }

  /** @private */
  _handleHostCommand(cmd) {
    switch (cmd.command) {
      case 'begin':
        this.startBattle();
        return { success: true, message: 'Battle started.' };
      case 'pause':
        this.pause();
        return { success: true, message: 'Battle paused.' };
      case 'unpause':
        this.unpause();
        return { success: true, message: 'Battle unpaused.' };
      case 'end':
        this.endBattle();
        return { success: true, message: 'Battle ended.' };
      case 'kick':
        if (cmd.target) {
          const idx = this.players.findIndex(
            p => p.scrNam?.toLowerCase() === cmd.target.toLowerCase()
          );
          if (idx >= 0) {
            const kicked = this.players[idx];
            this.removePlayer(kicked.socketId);
            return { success: true, message: `${cmd.target} kicked.` };
          }
        }
        return { success: false, message: 'Player not found.' };
      default:
        return { success: false, message: 'Unknown host command.' };
    }
  }

  /** @private */
  _getDefaultTarget(playerIndex) {
    const player = this.players[playerIndex];
    // Find first living enemy
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (i !== playerIndex && p.teamId !== player.teamId && p.isAlive && p.hp > 0) {
        return i;
      }
    }
    return playerIndex; // fallback to self
  }

  // ── Timer loops (private) ──────────────────────────────────────────────

  /** @private */
  _startTimers() {
    const moveInterval = this.config.moveLoopInterval || 500;
    const cpuInterval = this.config.cpuTickInterval || 750;
    const miscInterval = this.config.miscLoopInterval || 1000;

    this.timers.move = setInterval(() => this._moveLoop(), moveInterval);
    this.timers.cpu = setInterval(() => this._cpuLoop(), cpuInterval);
    this.timers.misc = setInterval(() => this._miscLoop(), miscInterval);
  }

  /** @private */
  _stopTimers() {
    if (this.timers.move) { clearInterval(this.timers.move); this.timers.move = null; }
    if (this.timers.cpu) { clearInterval(this.timers.cpu); this.timers.cpu = null; }
    if (this.timers.misc) { clearInterval(this.timers.misc); this.timers.misc = null; }
  }

  /**
   * Move resolution loop (~500ms).
   * For each player with a pending move, attempt to resolve it.
   * Increments gameTime each tick.
   * @private
   */
  _moveLoop() {
    this.gameTime++;

    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || player.curMove <= 0) continue;

      let result;

      if (player.curMove === PLAYER_MOVE.BLOCK) {
        result = resolveBlock(player, i, this.players, this.gameTime);
      } else if (player.curMove === PLAYER_MOVE.REST) {
        result = resolveRest(player, i, this.arena, this.gameTime);
      } else if (player.curMove === PLAYER_MOVE.FATAL) {
        const target = this.players[player.target];
        if (target) {
          result = resolveFatality(player, i, target, player.target, this.gameTime);
          if (result.resolved && result.killed) {
            player.kills++;
            player.fatalities++;
            target.deaths++;
          }
        }
      } else if (player.curMove > 0 && player.curMove < PLAYER_MOVE.CHARGE) {
        result = resolveMove(player, i, this.players, this.arena, this.gameTime);
        if (result.resolved && result.kills) {
          for (const kill of result.kills) {
            this.players[kill.attacker].kills++;
            this.players[kill.target].deaths++;
          }
        }
      }

      if (result && result.resolved && result.messages) {
        for (const msg of result.messages) {
          this.emit('battle:message', { roomId: this.id, message: msg });
        }
      }
    }

    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      players: this._getPlayerStates(),
    });
  }

  /**
   * CPU AI decision loop (~750ms).
   * For each CPU player that can act and has no pending move, decide an action.
   * @private
   */
  _cpuLoop() {
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || !player.isCpu) continue;
      if (!player.isAlive || player.hp <= 0) continue;
      if (player.curMove !== 0) continue;
      if (!canAct(player)) continue;

      // CPU AI decision — cpuDecide not yet available, use simple fallback
      this._cpuFallbackAction(i, player);
    }
  }

  /**
   * Simple CPU fallback: pick a random move or rest.
   * @private
   */
  _cpuFallbackAction(playerIndex, player) {
    const availableMoves = player.moves.filter(m => m && m.name);
    if (availableMoves.length === 0) {
      // Rest if no moves available
      player.curMove = PLAYER_MOVE.REST;
      player.moveStart = this.gameTime;
      return;
    }

    // Pick a random move
    const moveIdx = player.moves.findIndex(m => m && m.name);
    if (moveIdx >= 0) {
      const targetIdx = this._getDefaultTarget(playerIndex);
      queueMove(player, playerIndex, moveIdx, targetIdx, {
        gameTime: this.gameTime,
        allPlayers: this.players,
        arena: this.arena,
      });
    }
  }

  /**
   * Miscellaneous loop (~1000ms).
   * Tick statuses, roll arena events, spawn items, check battle end.
   * @private
   */
  _miscLoop() {
    const messages = [];

    // Tick statuses for all players
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || !player.isAlive) continue;

      const events = tickStatuses(player, this.gameTime);
      if (events.poisonDmg > 0) {
        messages.push(`${player.scrNam} takes ${events.poisonDmg} poison damage!`);
      }
      if (events.regenHeal > 0) {
        messages.push(`${player.scrNam} regenerates ${events.regenHeal} HP.`);
      }

      // Check if player died from poison
      if (player.hp <= 0 && player.isAlive) {
        player.isAlive = false;
        player.hp = 0;
        player.deaths++;
        messages.push(`${player.scrNam} has been killed by poison!`);
      }
    }

    // Roll arena events
    if (this.arena) {
      const arenaResult = rollArenaEvent(this.arena, this.players, this.gameTime);
      messages.push(...arenaResult.messages);
    }

    // Item spawn check (roughly 1-in-10 chance per tick)
    const items = this.dataset.items || [];
    if (items.length > 0 && Math.random() < 0.1) {
      const spawn = spawnItem(items, this.currentItem);
      this.currentItem = spawn.item;
      messages.push(...spawn.messages);
    }

    // Emit accumulated messages
    for (const msg of messages) {
      this.emit('battle:message', { roomId: this.id, message: msg });
    }

    // Check battle end
    const endCheck = checkBattleEnd(this.players, this.battleType);
    if (endCheck.ended) {
      this.endBattle();
    }

    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      players: this._getPlayerStates(),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** @private */
  _getPlayerStates() {
    return this.players.map((p, i) => ({
      index: i,
      scrNam: p.scrNam,
      hp: p.hp,
      maxHp: p.maxHp,
      mp: p.mp,
      maxMp: p.maxMp,
      sp: p.sp,
      teamId: p.teamId,
      isAlive: p.isAlive,
      curMove: p.curMove,
    }));
  }
}
