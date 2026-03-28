/**
 * Tests for GET /api/status endpoint.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import { setupStatusRoute } from '../../server/routes/status.js';

/** Minimal gameState for testing */
function makeGameState() {
  return {
    rooms: new Map(),
    datasets: new Map(),
    config: {
      charactersDir: './data/characters',
      arenasDir: './data/arenas',
      itemsDir: './data/items',
      weaponsDir: './data/weapons',
      datasetsDir: './data/datasets',
    },
    startTime: Date.now(),
    _peakPlayers: 0,
    _totalRoomsCreated: 0,
  };
}

/** Helper: make a GET request to the test server */
async function fetchStatus(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/status`);
  return { status: res.status, body: await res.json() };
}

describe('GET /api/status', () => {
  let server;
  let port;

  beforeAll(async () => {
    const app = express();
    const gameState = makeGameState();
    setupStatusRoute(app, gameState);

    server = createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns 200 with correct shape', async () => {
    const { status, body } = await fetchStatus(port);

    expect(status).toBe(200);
    expect(body.status).toBe('online');
    expect(typeof body.uptime).toBe('number');
    expect(body.rooms).toHaveProperty('active');
    expect(body.rooms).toHaveProperty('total_created');
    expect(body.players).toHaveProperty('online');
    expect(body.players).toHaveProperty('peak');
    expect(body.content).toHaveProperty('characters');
    expect(body.content).toHaveProperty('arenas');
    expect(body.content).toHaveProperty('items');
    expect(body.content).toHaveProperty('weapons');
    expect(body.content).toHaveProperty('datasets');
  });

  it('reports uptime >= 0', async () => {
    const { body } = await fetchStatus(port);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('reports zero active rooms initially', async () => {
    const { body } = await fetchStatus(port);
    expect(body.rooms.active).toBe(0);
    expect(body.players.online).toBe(0);
  });
});
