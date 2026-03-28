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
export function setupLobby(io, gameState) {
  io.on('connection', (socket) => {
    // Send current room list on connect
    socket.emit('lobby:room-list', getRoomList(gameState));

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

      // Creator joins the room socket channel
      socket.join(roomId);
      socket.data.roomId = roomId;

      socket.emit('lobby:room-created', { roomId, name: room._roomName });
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

        // Clean up empty rooms
        if (room.players.length === 0 && room.spectators.length === 0) {
          // Stop any running timers
          if (room.phase === 'battle' || room.phase === 'paused') {
            room._stopTimers();
          }
          gameState.rooms.delete(roomId);
        }
      }

      io.emit('lobby:room-list', getRoomList(gameState));
    });
  });
}
