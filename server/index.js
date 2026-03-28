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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'client')));

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

// ── Register routes and socket handlers ─────────────────────────────────────

setupStatusRoute(app, gameState);
setupEditorRoutes(app, config);
setupLobby(io, gameState);

// ── Start server ────────────────────────────────────────────────────────────

const port = process.env.PORT || config.port;
httpServer.listen(port, () => {
  console.log(`ChUB 2000 Web running on port ${port}`);
});

export { app, httpServer, io, gameState };
