/**
 * Socket.IO lobby handler — manages room creation, joining, listing,
 * and spectating. Wires up per-socket room and battle handlers.
 */

import { BattleRoom } from '../../engine/battle-room.js';
import { setupRoomHandlers } from './room.js';
import { setupBattleHandlers } from './battle.js';

let roomCounter = 0;

/**
 * Build a serialisable list of rooms for the lobby display.
 *
 * @param {object} gameState
 * @returns {object[]}
 */
function getRoomList(gameState) {
  const list = [];
  for (const [id, room] of gameState.rooms) {
    list.push({
      id,
      name: room._roomName || id,
      phase: room.phase,
      players: room.players.length,
      maxPlayers: room.config.maxPlayersPerRoom || 20,
      hasPassword: !!room._password,
      spectators: room.spectators.length,
    });
  }
  return list;
}

/**
 * Set up the Socket.IO lobby namespace on the default `/` namespace.
 *
 * @param {import('socket.io').Server} io
 * @param {object} gameState
 */
function getOnlineUsers(io) {
  const users = [];
  for (const [, s] of io.sockets.sockets) {
    const name = s.data.screenName;
    if (name) {
      users.push({
        screenName: name,
        roomId: s.data.roomId || null,
        isSpectator: !!s.data.isSpectator,
      });
    }
  }
  return users;
}

function broadcastUsers(io) {
  io.emit('lobby:users', getOnlineUsers(io));
}

export function setupLobby(io, gameState) {
  io.on('connection', (socket) => {
    // Send current room list and user list on connect
    socket.emit('lobby:room-list', getRoomList(gameState));
    socket.emit('lobby:users', getOnlineUsers(io));

    // Store screen name when client identifies
    socket.on('lobby:set-name', (data) => {
      socket.data.screenName = (data?.screenName || '').slice(0, 20) || 'Anonymous';
      broadcastUsers(io);
      io.emit('lobby:chat', {
        screenName: 'System',
        message: socket.data.screenName + ' has entered the lobby.',
        timestamp: Date.now(),
        system: true,
      });
    });

    // ── Lobby Chat ────────────────────────────────────────────────────────
    socket.on('lobby:chat', (data) => {
      const { message, screenName } = data || {};
      if (!message || !message.trim()) return;
      const text = message.trim().slice(0, 300);
      const sender = screenName || 'Anonymous';

      // Whisper: /msg <name> <message> or /t <name> <message>
      const whisperMatch = text.match(/^\/(msg|t|tell|whisper)\s+(\S+)\s+(.+)$/i);
      if (whisperMatch) {
        const targetName = whisperMatch[2].toLowerCase();
        const whisperText = whisperMatch[3];

        // Find target socket by screen name
        for (const [, s] of io.sockets.sockets) {
          if (s.data.screenName?.toLowerCase().includes(targetName)) {
            s.emit('lobby:chat', {
              screenName: sender, message: whisperText, timestamp: Date.now(), whisper: 'from'
            });
            socket.emit('lobby:chat', {
              screenName: s.data.screenName, message: whisperText, timestamp: Date.now(), whisper: 'to'
            });
            return;
          }
        }
        socket.emit('lobby:chat', {
          screenName: 'System', message: 'Player not found.', timestamp: Date.now(), system: true
        });
        return;
      }

      io.emit('lobby:chat', {
        screenName: sender,
        message: text,
        timestamp: Date.now(),
      });
    });

    // ── Create room ───────────────────────────────────────────────────────
    socket.on('lobby:create-room', (data) => {
      const { name, datasetId, password } = data || {};
      const maxRooms = gameState.config.maxRooms || 10;

      if (gameState.rooms.size >= maxRooms) {
        socket.emit('lobby:error', { message: 'Maximum number of rooms reached.' });
        return;
      }

      roomCounter++;
      if (!gameState._totalRoomsCreated) gameState._totalRoomsCreated = 0;
      gameState._totalRoomsCreated++;

      const roomId = `room-${roomCounter}`;
      const dataset = gameState.datasets.get(datasetId || 'default') ||
                      gameState.datasets.values().next().value ||
                      { characters: [], arenas: [], items: [], weapons: [] };

      const emit = (event, eventData) => io.to(roomId).emit(event, eventData);
      const room = new BattleRoom(roomId, dataset, gameState.config, emit);
      room._roomName = name || `Room ${roomCounter}`;
      room._password = password || null;

      gameState.rooms.set(roomId, room);

      // Creator joins the room socket channel and becomes player 0
      socket.join(roomId);
      socket.data.roomId = roomId;

      const screenName = data.screenName || socket.data.screenName || 'Host';
      const playerIndex = room.addPlayer(screenName, socket.id);
      socket.data.playerIndex = playerIndex;

      room.startSelection();

      socket.emit('lobby:room-created', { roomId, name: room._roomName, playerIndex });
      io.emit('lobby:room-list', getRoomList(gameState));
    });

    // ── Join room ─────────────────────────────────────────────────────────
    socket.on('lobby:join-room', (data) => {
      const { roomId, screenName, password } = data || {};
      const room = gameState.rooms.get(roomId);

      if (!room) {
        socket.emit('lobby:error', { message: 'Room not found.' });
        return;
      }

      if (room._password && room._password !== password) {
        socket.emit('lobby:error', { message: 'Incorrect password.' });
        return;
      }

      const playerIndex = room.addPlayer(screenName || 'Player', socket.id);
      if (playerIndex === -1) {
        socket.emit('lobby:error', { message: 'Room is full.' });
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerIndex = playerIndex;

      socket.emit('lobby:joined', { roomId, playerIndex });
      io.emit('lobby:room-list', getRoomList(gameState));
    });

    // ── Rejoin room (after page navigation) ─────────────────────────────
    socket.on('lobby:rejoin-room', (data) => {
      const { roomId, screenName, playerIndex, isSpectator } = data || {};
      const room = gameState.rooms.get(roomId);

      if (!room) {
        socket.emit('lobby:error', { message: 'Room not found.' });
        return;
      }

      // Cancel any pending cleanup timer
      if (room._cleanupTimer) {
        clearTimeout(room._cleanupTimer);
        room._cleanupTimer = null;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;

      if (isSpectator) {
        if (!room.spectators.includes(socket.id)) {
          room.spectators.push(socket.id);
        }
        socket.data.isSpectator = true;
      } else {
        // Check if this player slot is still available (player was removed on disconnect)
        const existingIdx = room.players.findIndex(p => p.scrNam === screenName);
        if (existingIdx >= 0) {
          // Re-associate the socket with the existing player
          room.players[existingIdx].socketId = socket.id;
          socket.data.playerIndex = existingIdx;
        } else {
          // Re-add as a new player
          const idx = room.addPlayer(screenName || 'Player', socket.id);
          socket.data.playerIndex = idx >= 0 ? idx : playerIndex;
        }
      }

      socket.emit('lobby:rejoined', {
        roomId,
        playerIndex: socket.data.playerIndex,
        phase: room.phase,
      });
    });

    // ── List rooms ────────────────────────────────────────────────────────
    socket.on('lobby:list-rooms', () => {
      socket.emit('lobby:room-list', getRoomList(gameState));
    });

    // ── Spectate ──────────────────────────────────────────────────────────
    socket.on('lobby:spectate', (data) => {
      const { roomId } = data || {};
      const room = gameState.rooms.get(roomId);

      if (!room) {
        socket.emit('lobby:error', { message: 'Room not found.' });
        return;
      }

      room.spectators.push(socket.id);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.isSpectator = true;

      socket.emit('lobby:spectating', { roomId });
    });

    // ── Wire up room and battle handlers ──────────────────────────────────
    setupRoomHandlers(socket, gameState);
    setupBattleHandlers(socket, gameState, io);

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.data.screenName) {
        io.emit('lobby:chat', {
          screenName: 'System',
          message: socket.data.screenName + ' has left the lobby.',
          timestamp: Date.now(),
          system: true,
        });
      }
      // Defer user list broadcast so this socket is gone
      setTimeout(() => broadcastUsers(io), 100);

      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = gameState.rooms.get(roomId);
      if (!room) return;

      if (socket.data.isSpectator) {
        // Remove spectator
        const idx = room.spectators.indexOf(socket.id);
        if (idx >= 0) room.spectators.splice(idx, 1);
      } else {
        // Remove player; BattleRoom handles CPU takeover internally
        room.removePlayer(socket.id);

        // Clean up rooms with no human players after a grace period
        const hasHumans = room.players.some(p => p && !p.isCpu);
        if ((!hasHumans || room.players.length === 0) && room.spectators.length === 0) {
          const GRACE_MS = 10000; // 10 seconds
          if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
          room._cleanupTimer = setTimeout(() => {
            const r = gameState.rooms.get(roomId);
            if (!r) return;
            const stillHasHumans = r.players.some(p => p && !p.isCpu);
            if (!stillHasHumans && r.spectators.length === 0) {
              if (r.phase === 'battle' || r.phase === 'paused') {
                r._stopTimers();
              }
              gameState.rooms.delete(roomId);
              io.emit('lobby:room-list', getRoomList(gameState));
            }
          }, GRACE_MS);
        }
      }

      io.emit('lobby:room-list', getRoomList(gameState));
    });
  });
}
