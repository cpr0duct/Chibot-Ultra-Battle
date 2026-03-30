/**
 * ChUB 2000 Web — Express + Socket.IO entry point.
 *
 * Serves the static client, the editor REST API, the status API,
 * and the real-time Socket.IO lobby/battle layer.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { setupStatusRoute } from './routes/status.js';
import { setupEditorRoutes } from './routes/editor.js';
import { setupLobby } from './sockets/lobby.js';
import { loadDataset } from '../parsers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'default.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'client')));
app.use('/data/audio', express.static(join(__dirname, '..', config.audioDir)));

// ── Shared game state ───────────────────────────────────────────────────────

const gameState = {
  rooms: new Map(),
  datasets: new Map(),
  config,
  startTime: Date.now(),
  _peakPlayers: 0,
  _totalRoomsCreated: 0,
};

// ── Load default dataset ────────────────────────────────────────────────────

try {
  const defaultDataset = await loadDataset(join(config.datasetsDir, config.defaultDataset));
  gameState.datasets.set('default', defaultDataset);
  console.log(`Loaded default dataset: ${defaultDataset.config?.loadStr || config.defaultDataset}`);
} catch (e) {
  console.warn('Could not load default dataset:', e.message);
}

// ── Version endpoint ────────────────────────────────────────────────────────

app.get('/api/version', (_req, res) => res.json({ version: pkg.version }));

// ── Register routes and socket handlers ─────────────────────────────────────

setupStatusRoute(app, gameState);
setupEditorRoutes(app, config);
setupLobby(io, gameState);

// ── Room cleanup: expire stale rooms ────────────────────────────────────────

const ROOM_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes of inactivity or ended phase

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of gameState.rooms) {
    const hasHumans = room.players.some(p => p && !p.isCpu && p.connected);
    const age = now - (room._lastActivity || room.startTime || now);

    // Delete rooms that: have ended, OR have no human players for 2 minutes, OR inactive 5+ minutes
    const isEnded = room.phase === 'ended' && age > 30_000;
    const noHumans = !hasHumans && age > 2 * 60_000;
    const stale = age > ROOM_EXPIRY_MS;

    if (isEnded || noHumans || stale) {
      if (room.phase === 'battle' || room.phase === 'paused') {
        room._stopTimers();
      }
      gameState.rooms.delete(roomId);
      io.emit('lobby:room-list', getRoomList(gameState));
      console.log(`[cleanup] Deleted stale room ${roomId} (ended=${isEnded}, noHumans=${noHumans}, stale=${stale})`);
    }
  }
}, 30_000); // Check every 30 seconds

function getRoomList(gs) {
  const list = [];
  for (const [id, room] of gs.rooms) {
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

// ── Admin: manual room deletion ─────────────────────────────────────────────

app.delete('/api/rooms/:roomId', (req, res) => {
  const room = gameState.rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.phase === 'battle' || room.phase === 'paused') {
    room._stopTimers();
  }
  gameState.rooms.delete(req.params.roomId);
  io.emit('lobby:room-list', getRoomList(gameState));
  res.json({ deleted: req.params.roomId });
});

app.delete('/api/rooms', (_req, res) => {
  for (const [roomId, room] of gameState.rooms) {
    if (room.phase === 'battle' || room.phase === 'paused') room._stopTimers();
    gameState.rooms.delete(roomId);
  }
  io.emit('lobby:room-list', getRoomList(gameState));
  res.json({ deleted: 'all' });
});

// ── Start server ────────────────────────────────────────────────────────────

const port = process.env.PORT || config.port;
httpServer.listen(port, () => {
  console.log(`ChUB 2000 Web running on port ${port}`);
});

export { app, httpServer, io, gameState };
