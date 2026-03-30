/**
 * BattleRoom — central game room class that ties together the state machine,
 * timer loops, and player management for a single battle instance.
 *
 * BattleRoom owns ALL game state for a battle. The `emit` callback is
 * the ONLY way it communicates with the outside world (Socket.IO layer).
 */

import { PLAYER_MOVE, TIMING, MAX_SUPER_POINTS } from './constants.js';
import { createPlayer, createArena } from './types.js';
import { parseCommand } from './command-parser.js';
import { resolveMove, resolveBlock, resolveRest, resolveFatality, checkBattleEnd, queueMove } from './combat.js';
import { cpuDecide } from './cpu-ai.js';
import { tickStatuses, canAct } from './status.js';
import { rollArenaEvent } from './arena.js';
import { spawnItem, pickupItem } from './items.js';
import { substituteVars } from '../parsers/string-vars.js';
import { getMoveTimeModifier } from './status.js';

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
    this._lastActivity = Date.now();
    // Turn-based mode
    this.turnBased = false;
    this.turnNumber = 0;
    this.turnMoves = new Map(); // playerIndex -> queued command
    this._ezTeamCount = 0;
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
    this._lastActivity = Date.now();

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
    const idx = this.players.findIndex(p => p && p.socketId === socketId);
    if (idx === -1) return false;

    const player = this.players[idx];

    // During battle, null out the slot to preserve indices (splice would corrupt
    // all target references held by other players and pending CPU decisions).
    if (this.phase === 'battle' || this.phase === 'paused') {
      player.isAlive = false;
      player.hp = 0;
      player.connected = false;
      player.curMove = 0;
    } else {
      // Safe to splice during selection/waiting — no pending moves reference indices
      this.players.splice(idx, 1);

      // Adjust host index if needed
      if (this.hostIndex >= this.players.length && this.players.length > 0) {
        this.hostIndex = 0;
      }
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
      player.moves = char.moves ? char.moves.map(m => m ? { ...m, status: [...(m.status || [])] } : null) : [];
      player.physStr = char.physStr || 0;
      player.physDef = char.physDef || 0;
      player.magStr = char.magStr || 0;
      player.magDef = char.magDef || 0;
      player.maxHp = char.maxHp || 500;
      player.maxMp = char.maxMp || 0;
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
    if (chars.length === 0) return;
    // Pick random characters, avoiding duplicates with existing players
    const usedIds = new Set(this.players.map(p => p.charId).filter(id => id >= 0));
    const available = chars.map((_, i) => i).filter(i => !usedIds.has(i));
    // Shuffle available pool
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    for (let i = 0; i < count; i++) {
      const charId = available.length > 0 ? available[i % available.length] : Math.floor(Math.random() * chars.length);
      const teamId = (this.players.length % 2) + 1;
      this.addCpuBot(charId, teamId, null);
    }
    this._emitRoomState();
  }

  /**
   * Distribute players across two teams. First call does A-B-A-B, subsequent calls shuffle.
   */
  ezTeams() {
    if (!this._ezTeamCount) this._ezTeamCount = 0;
    this._ezTeamCount++;

    if (this._ezTeamCount === 1) {
      // First press: alternating A-B-A-B
      for (let i = 0; i < this.players.length; i++) {
        this.players[i].teamId = (i % 2) + 1;
      }
    } else {
      // Subsequent presses: random shuffle into two balanced teams
      const indices = this.players.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const half = Math.ceil(indices.length / 2);
      for (let k = 0; k < indices.length; k++) {
        this.players[indices[k]].teamId = k < half ? 1 : 2;
      }
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
    player.moves = char.moves ? char.moves.map(m => m ? { ...m, status: [...(m.status || [])] } : null) : [];

    // Apply base stats from character
    player.physStr = char.physStr || 0;
    player.physDef = char.physDef || 0;
    player.magStr = char.magStr || 0;
    player.magDef = char.magDef || 0;
    player.maxHp = char.maxHp || 500;
    player.maxMp = char.maxMp || 0;

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
    this._lastActivity = Date.now();

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

    if (this.turnBased) {
      // Turn-based: no timer loops, start first turn
      this.turnNumber = 0;
      this._startTurn();
    } else {
      // Real-time: start timer loops
      this._startTimers();
    }

    this.emit('phase:battle', { roomId: this.id, gameTime: this.gameTime, turnBased: this.turnBased });
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
    this._lastActivity = Date.now();
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
      // Allow host commands during selection (e.g., /!turnbased)
      if (cmd.type === 'host' && playerIndex === this.hostIndex) {
        return this._handleHostCommand(cmd);
      }
      return { success: false, message: 'Use /charname to select a character.' };
    }

    // Battle phase commands
    if (this.phase === 'battle') {
      // Turn-based: route combat commands to turn queue
      if (this.turnBased && !player.isCpu) {
        return this._handleTurnBasedCommand(playerIndex, cmd);
      }
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
        // Find target by name (exact match first, then starts-with, then includes)
        const targetIdx = cmd.target
          ? this._findTargetByName(cmd.target)
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
          this.emit('battle:message', { roomId: this.id, message: result.message, playerIndex });
        }
        return result;
      }

      case 'moveByNumber': {
        const moveIdx = cmd.number - 1; // Convert 1-based user input to 0-based index
        const targetIdx = cmd.target
          ? this._findTargetByName(cmd.target)
          : this._getDefaultTarget(playerIndex);

        const result = queueMove(player, playerIndex, moveIdx, targetIdx, {
          gameTime: this.gameTime,
          allPlayers: this.players,
          arena: this.arena,
        });

        if (result.success) {
          this.emit('battle:message', { roomId: this.id, message: result.message, playerIndex });
        }
        return result;
      }

      case 'block': {
        player.curMove = PLAYER_MOVE.BLOCK;
        player.moveStart = this.gameTime;
        if (cmd.counterMove) {
          const counterIdx = player.moves.findIndex(m =>
            m && m.cmdKey && m.cmdKey.toLowerCase() === cmd.counterMove.toLowerCase()
          );
          player.target = counterIdx;
        } else {
          player.target = -1;
        }
        this.emit('battle:message', {
          roomId: this.id, playerIndex,
          message: `${player.scrNam} assumes a blocking stance.`,
        });
        return { success: true, message: 'Blocking.' };
      }

      case 'rest': {
        player.curMove = PLAYER_MOVE.REST;
        player.moveStart = this.gameTime;
        this.emit('battle:message', {
          roomId: this.id, playerIndex,
          message: `${player.scrNam} begins to rest.`,
        });
        return { success: true, message: 'Resting.' };
      }

      case 'taunt': {
        const taunts = player.character?.taunts || [];
        const nonEmpty = taunts.filter(t => t && t.length > 0);
        let taunt;
        if (nonEmpty.length > 0) {
          taunt = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
          taunt = substituteVars(taunt, { SN: player.scrNam });
        } else {
          taunt = `${player.scrNam} taunts!`;
        }
        this.emit('battle:message', { roomId: this.id, message: taunt, playerIndex });
        return { success: true, message: 'Taunted.' };
      }

      case 'get': {
        if (!this.currentItem) {
          return { success: false, message: 'No item on the field.' };
        }
        const pickup = pickupItem(player, this.currentItem, { gameTime: this.gameTime });
        for (const msg of pickup.messages) {
          this.emit('battle:message', { roomId: this.id, message: msg, playerIndex });
        }
        this.currentItem = null;
        return { success: true, message: 'Item picked up.' };
      }

      case 'flee': {
        player.curMove = PLAYER_MOVE.FLEE;
        player.moveStart = this.gameTime;
        this.emit('battle:message', {
          roomId: this.id, playerIndex,
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
              roomId: this.id, playerIndex,
              message: `${player.scrNam} defects to ${targetPlayer.scrNam}'s team!`,
            });
            return { success: true, message: 'Defected.' };
          }
        }
        return { success: false, message: 'Invalid defect target.' };
      }

      case 'select': {
        // During battle, /word is treated as a move with auto-target
        const moveIdx = player.moves.findIndex(m =>
          m && m.cmdKey && m.cmdKey.toLowerCase() === cmd.key?.toLowerCase()
        );
        if (moveIdx === -1) {
          return { success: false, message: 'Unknown command.' };
        }
        const targetIdx = this._getDefaultTarget(playerIndex);
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
      case 'turnbased':
        this.turnBased = !this.turnBased;
        return { success: true, message: `Turn-based mode: ${this.turnBased ? 'ON' : 'OFF'}` };
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

  /** @private Find target by name: exact match, then starts-with, then includes */
  _findTargetByName(name) {
    const needle = name.toLowerCase();
    // Exact match
    let idx = this.players.findIndex(p => p.scrNam?.toLowerCase() === needle);
    if (idx !== -1) return idx;
    // Starts-with match
    idx = this.players.findIndex(p => p.scrNam?.toLowerCase().startsWith(needle));
    if (idx !== -1) return idx;
    // Includes match
    idx = this.players.findIndex(p => p.scrNam?.toLowerCase().includes(needle));
    return idx; // -1 if nothing found
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
      } else if (player.curMove === PLAYER_MOVE.TAUNT) {
        // Taunt resolves after TAUNT_HIT time
        const elapsed = this.gameTime - player.moveStart;
        if (elapsed >= TIMING.TAUNT_HIT + getMoveTimeModifier(player)) {
          player.curMove = 0;
          result = { resolved: true, messages: [] };
        }
      } else if (player.curMove === PLAYER_MOVE.FLEE) {
        // Flee resolves after FLEE_HIT time — remove player from battle
        const elapsed = this.gameTime - player.moveStart;
        if (elapsed >= TIMING.FLEE_HIT + getMoveTimeModifier(player)) {
          player.curMove = 0;
          player.isAlive = false;
          player.hp = 0;
          player.status[16] = 1; // MIA
          result = { resolved: true, messages: [`${player.scrNam} has fled the battle!`] };
        }
      } else if (player.curMove === PLAYER_MOVE.GET) {
        // Item pickup resolves quickly
        player.curMove = 0;
        result = { resolved: true, messages: [] };
      } else if (player.curMove === PLAYER_MOVE.DEFECT) {
        // Defect resolves instantly (already handled in command)
        player.curMove = 0;
        result = { resolved: true, messages: [] };
      } else if (player.curMove === PLAYER_MOVE.CHARGE) {
        // Charge resolves after CHARGE_HIT time
        const elapsed = this.gameTime - player.moveStart;
        if (elapsed >= TIMING.CHARGE_HIT + getMoveTimeModifier(player)) {
          player.curMove = 0;
          result = { resolved: true, messages: [`${player.scrNam} finishes charging.`] };
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
          this.emit('battle:message', { roomId: this.id, message: msg, playerIndex: i });
        }
      }
    }

    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      players: this._getPlayerStates(),
      arenaName: this.arena?.name || '',
      currentItem: this.currentItem?.name || '',
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

      // CPU item pickup — idle CPUs have a chance to grab items
      if (this.currentItem && player.curMove === 0 && Math.random() < 0.25) {
        const pickup = pickupItem(player, this.currentItem, { gameTime: this.gameTime });
        for (const msg of pickup.messages) {
          this.emit('battle:message', { roomId: this.id, message: msg, playerIndex: i });
        }
        this.currentItem = null;
        continue; // Skip attack this tick
      }

      if (player.curMove !== 0) continue;
      if (!canAct(player)) continue;

      // CPU AI decision
      const decision = cpuDecide(player, i, this.players, this.arena, this.gameTime);
      if (decision) {
        this._applyCpuDecision(i, player, decision);
      }
    }
  }

  /**
   * Apply a CPU AI decision (from cpuDecide).
   * @private
   */
  _applyCpuDecision(playerIndex, player, decision) {
    switch (decision.action) {
      case 'attack':
      case 'buff':
      case 'heal':
      case 'super': {
        if (decision.superNum) {
          player.superNum = decision.superNum;
        }
        const result = queueMove(player, playerIndex, decision.moveIndex, decision.targetIndex, {
          gameTime: this.gameTime,
          allPlayers: this.players,
          arena: this.arena,
        });
        if (result.success) {
          this.emit('battle:message', { roomId: this.id, message: result.message, playerIndex });
        }
        break;
      }
      case 'block': {
        player.curMove = PLAYER_MOVE.BLOCK;
        player.moveStart = this.gameTime;
        player.target = decision.targetIndex || 0;
        this.emit('battle:message', {
          roomId: this.id, playerIndex,
          message: decision.message || `${player.scrNam} assumes a blocking stance.`,
        });
        break;
      }
      case 'rest': {
        player.curMove = PLAYER_MOVE.REST;
        player.moveStart = this.gameTime;
        this.emit('battle:message', {
          roomId: this.id, playerIndex,
          message: decision.message || `${player.scrNam} begins to rest.`,
        });
        break;
      }
      case 'divert': {
        const amt = decision.divertAmount || 0;
        if (amt > 0) {
          player.hp -= amt;
          player.sp = Math.min(player.sp + amt, MAX_SUPER_POINTS);
          player.curMove = PLAYER_MOVE.REST;
          player.moveStart = this.gameTime;
          this.emit('battle:message', {
            roomId: this.id, playerIndex,
            message: decision.message || `${player.scrNam} diverts ${amt} HP to SP.`,
          });
        }
        break;
      }
      default: {
        // Fallback: rest
        player.curMove = PLAYER_MOVE.REST;
        player.moveStart = this.gameTime;
        break;
      }
    }
  }

  /**
   * Simple CPU fallback: pick a random move or rest.
   * @private
   */
  _cpuFallbackAction(playerIndex, player) {
    const availableMoves = player.moves.filter(m => m && m.name);
    if (availableMoves.length === 0) {
      player.curMove = PLAYER_MOVE.REST;
      player.moveStart = this.gameTime;
      return;
    }

    const moveIdx = player.moves.findIndex(m => m && m.name);
    if (moveIdx >= 0) {
      const targetIdx = this._getDefaultTarget(playerIndex);
      const result = queueMove(player, playerIndex, moveIdx, targetIdx, {
        gameTime: this.gameTime,
        allPlayers: this.players,
        arena: this.arena,
      });
      if (result.success) {
        this.emit('battle:message', { roomId: this.id, message: result.message, playerIndex });
      }
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
      return; // Don't emit state update after ending
    }

    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      players: this._getPlayerStates(),
      arenaName: this.arena?.name || '',
      currentItem: this.currentItem?.name || '',
    });
  }

  /** Handle commands during turn-based battle. Converts to turn actions. */
  _handleTurnBasedCommand(playerIndex, cmd) {
    const player = this.players[playerIndex];

    // /get is first-come-first-served, even in turn-based
    if (cmd.type === 'get') {
      if (!this.currentItem) return { success: false, message: 'No item on the field.' };
      const pickup = pickupItem(player, this.currentItem, { gameTime: this.gameTime });
      for (const msg of pickup.messages) {
        this.emit('battle:message', { roomId: this.id, message: msg, playerIndex });
      }
      this.currentItem = null;
      return { success: true, message: 'Item picked up!' };
    }

    // Already queued?
    if (this.turnMoves.has(playerIndex)) {
      return { success: false, message: 'You already locked in this turn. Wait for resolution.' };
    }

    // Convert command to turn action
    switch (cmd.type) {
      case 'move': {
        const moveIdx = player.moves.findIndex(m =>
          m && m.cmdKey && m.cmdKey.toLowerCase() === cmd.key?.toLowerCase()
        );
        if (moveIdx === -1) return { success: false, message: 'Move not found.' };
        const targetIdx = cmd.target
          ? this._findTargetByName(cmd.target)
          : this._getDefaultTarget(playerIndex);
        const action = {
          action: 'attack',
          moveIndex: moveIdx,
          targetIndex: targetIdx,
        };
        if (cmd.isSuper) {
          action.action = 'super';
          action.superNum = cmd.superLevel || 1;
        }
        this.queueTurnAction(playerIndex, action);
        return { success: true, message: 'Action queued.' };
      }
      case 'moveByNumber': {
        const moveIdx = cmd.number - 1;
        const targetIdx = cmd.target
          ? this._findTargetByName(cmd.target)
          : this._getDefaultTarget(playerIndex);
        this.queueTurnAction(playerIndex, {
          action: 'attack',
          moveIndex: moveIdx,
          targetIndex: targetIdx,
        });
        return { success: true, message: 'Action queued.' };
      }
      case 'block':
        this.queueTurnAction(playerIndex, { action: 'block', moveIndex: -1, targetIndex: -1 });
        return { success: true, message: 'Block queued.' };
      case 'rest':
        this.queueTurnAction(playerIndex, { action: 'rest', moveIndex: -1, targetIndex: -1 });
        return { success: true, message: 'Rest queued.' };
      case 'taunt':
        this.queueTurnAction(playerIndex, { action: 'rest', moveIndex: -1, targetIndex: -1 });
        // Emit taunt immediately for flavor
        const taunts = player.character?.taunts || [];
        const nonEmpty = taunts.filter(t => t && t.length > 0);
        if (nonEmpty.length > 0) {
          const taunt = substituteVars(nonEmpty[Math.floor(Math.random() * nonEmpty.length)], { SN: player.scrNam });
          this.emit('battle:message', { roomId: this.id, message: taunt, playerIndex });
        }
        return { success: true, message: 'Taunted and resting.' };
      default:
        return { success: false, message: 'Use /movename <target>, /block, /rest, or /get.' };
    }
  }

  // ── Turn-Based Mode ────────────────────────────────────────────────────

  /** Start a new turn. CPUs auto-decide, then wait for human input. */
  _startTurn() {
    this.turnNumber++;
    this.turnMoves = new Map();

    // Roll arena events and item spawns at start of each turn
    const turnMessages = [];
    if (this.arena) {
      const arenaResult = rollArenaEvent(this.arena, this.players, this.gameTime);
      turnMessages.push(...arenaResult.messages);
    }
    const items = this.dataset.items || [];
    if (items.length > 0 && !this.currentItem && Math.random() < 0.15) {
      const spawn = spawnItem(items, this.currentItem);
      this.currentItem = spawn.item;
      turnMessages.push(...spawn.messages);
    }

    for (const msg of turnMessages) {
      this.emit('battle:message', { roomId: this.id, message: msg });
    }

    // CPU players auto-decide
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || !player.isCpu || !player.isAlive || player.hp <= 0) continue;

      // CPU might grab an item
      if (this.currentItem && Math.random() < 0.3) {
        const pickup = pickupItem(player, this.currentItem, { gameTime: this.gameTime });
        for (const msg of pickup.messages) {
          this.emit('battle:message', { roomId: this.id, message: msg, playerIndex: i });
        }
        this.currentItem = null;
        this.turnMoves.set(i, { action: 'item' });
        continue;
      }

      if (!canAct(player)) {
        this.turnMoves.set(i, { action: 'skip' });
        continue;
      }

      const decision = cpuDecide(player, i, this.players, this.arena, this.gameTime);
      if (decision) {
        this.turnMoves.set(i, decision);
      } else {
        this.turnMoves.set(i, { action: 'rest', moveIndex: -1, targetIndex: -1 });
      }
    }

    // Figure out which humans still need to act
    const waiting = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p && !p.isCpu && p.isAlive && p.hp > 0) {
        waiting.push(p.scrNam);
      }
    }

    this.emit('turn:start', {
      roomId: this.id,
      turnNumber: this.turnNumber,
      waitingFor: waiting,
      currentItem: this.currentItem?.name || null,
    });

    // Only announce turn if there are human players to wait for
    if (waiting.length > 0) {
      this.emit('battle:message', {
        roomId: this.id,
        message: `--- TURN ${this.turnNumber} --- Waiting for: ${waiting.join(', ')}`,
      });
    }

    // Emit state update
    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      players: this._getPlayerStates(),
      arenaName: this.arena?.name || '',
      currentItem: this.currentItem?.name || '',
      turnNumber: this.turnNumber,
    });

    // If no humans need to act, resolve immediately
    if (waiting.length === 0) {
      this._resolveTurn();
    }
  }

  /** Queue a human player's turn action. */
  queueTurnAction(playerIndex, action) {
    if (!this.turnBased || this.phase !== 'battle') return;
    const player = this.players[playerIndex];
    if (!player || player.isCpu || !player.isAlive) return;

    this.turnMoves.set(playerIndex, action);

    this.emit('turn:player-ready', {
      roomId: this.id,
      playerIndex,
      scrNam: player.scrNam,
    });

    // Check if all humans have acted
    let allReady = true;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p && !p.isCpu && p.isAlive && p.hp > 0 && !this.turnMoves.has(i)) {
        allReady = false;
        break;
      }
    }

    if (allReady) {
      this._resolveTurn();
    }
  }

  /** Resolve all queued moves for this turn. */
  _resolveTurn() {
    this.gameTime += 15; // Simulate enough time for moves to resolve

    // Apply all moves
    for (const [i, decision] of this.turnMoves) {
      const player = this.players[i];
      if (!player || !player.isAlive || player.hp <= 0) continue;
      if (decision.action === 'item' || decision.action === 'skip') continue;

      this._applyCpuDecision(i, player, decision);
    }

    // Resolve all pending moves immediately
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || player.curMove <= 0) continue;

      let result;
      if (player.curMove === PLAYER_MOVE.BLOCK) {
        result = resolveBlock(player, i, this.players, this.gameTime);
      } else if (player.curMove === PLAYER_MOVE.REST) {
        result = resolveRest(player, i, this.arena, this.gameTime);
      } else if (player.curMove > 0 && player.curMove < PLAYER_MOVE.CHARGE) {
        // Force immediate resolution by advancing moveStart
        player.moveStart = this.gameTime - 9999;
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
          this.emit('battle:message', { roomId: this.id, message: msg, playerIndex: i });
        }
      }

      // Reset move state for next turn
      player.curMove = 0;
    }

    // Tick statuses
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || !player.isAlive) continue;
      const events = tickStatuses(player, this.gameTime);
      if (events.poisonDmg > 0) {
        this.emit('battle:message', { roomId: this.id, message: `${player.scrNam} takes ${events.poisonDmg} poison damage!` });
      }
      if (events.regenHeal > 0) {
        this.emit('battle:message', { roomId: this.id, message: `${player.scrNam} regenerates ${events.regenHeal} HP.` });
      }
      if (player.hp <= 0 && player.isAlive) {
        player.isAlive = false;
        player.hp = 0;
        player.deaths++;
        this.emit('battle:message', { roomId: this.id, message: `${player.scrNam} has been defeated!` });
      }
    }

    // Passive MP regen: 10% of maxMp per turn (prevents MP-starved stalemates)
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i];
      if (!player || !player.isAlive || player.maxMp <= 0) continue;
      const mpRegen = Math.max(1, Math.floor(player.maxMp * 0.10));
      player.mp = Math.min(player.mp + mpRegen, player.maxMp);
    }

    // Sudden death: chip damage after turn 20 to prevent stalemates
    if (this.turnNumber > 20) {
      const chipPct = this.turnNumber > 30 ? 0.15 : this.turnNumber > 25 ? 0.10 : 0.05;
      for (let i = 0; i < this.players.length; i++) {
        const player = this.players[i];
        if (!player || !player.isAlive || player.hp <= 0) continue;
        const chipDmg = Math.max(1, Math.floor(player.maxHp * chipPct));
        player.hp -= chipDmg;
        if (this.turnNumber === 21) {
          this.emit('battle:message', { roomId: this.id, message: '*** SUDDEN DEATH! The arena crumbles around the fighters! ***' });
        }
        this.emit('battle:message', { roomId: this.id, message: `${player.scrNam} takes ${chipDmg} arena damage!` });
        if (player.hp <= 0 && player.isAlive) {
          player.isAlive = false;
          player.hp = 0;
          player.deaths++;
          this.emit('battle:message', { roomId: this.id, message: `${player.scrNam} has been defeated by the arena!` });
        }
      }
    }

    // Check battle end
    const endCheck = checkBattleEnd(this.players, this.battleType);
    if (endCheck.ended) {
      this.endBattle();
      return;
    }

    // Emit state update after resolution
    this.emit('battle:state-update', {
      roomId: this.id,
      gameTime: this.gameTime,
      turnNumber: this.turnNumber,
      players: this._getPlayerStates(),
      arenaName: this.arena?.name || '',
      currentItem: this.currentItem?.name || '',
    });

    // Start next turn after a short delay
    setTimeout(() => this._startTurn(), 1000);
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
      isCpu: p.isCpu,
      charId: p.charId,
      curMove: p.curMove,
      status: p.status ? [...p.status] : [],
      moves: (p.character?.moves || [])
        .filter(m => m && m.name && m.name !== '')
        .map(m => ({
          name: m.name,
          cmdKey: m.cmdKey,
          element: m.element,
          strength: m.strength,
          target: m.target,
          canSuper: m.canSuper,
          mpReq: m.mpReq,
        })),
    }));
  }
}
