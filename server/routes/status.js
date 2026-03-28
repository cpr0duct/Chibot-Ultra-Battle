/**
 * Status API route — GET /api/status
 *
 * Returns server health information: uptime, room counts, player counts,
 * and content counts (characters, arenas, items, weapons, datasets).
 */

import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Count files in a directory matching given extensions (recursive).
 * Returns 0 if the directory does not exist.
 *
 * @param {string}   dir  - Absolute directory path
 * @param {string[]} exts - Uppercase extensions to match (e.g. ['.CH2', '.CHE'])
 * @returns {number}
 */
function countFiles(dir, exts) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    let count = 0;
    for (const e of entries) {
      if (e.isFile()) {
        const ext = e.name.slice(e.name.lastIndexOf('.')).toUpperCase();
        if (exts.includes(ext)) count++;
      } else if (e.isDirectory()) {
        count += countFiles(join(dir, e.name), exts);
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Count .INI dataset files in the datasets directory.
 */
function countDatasets(dir) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.ini')).length;
  } catch {
    return 0;
  }
}

/**
 * Register the GET /api/status route.
 *
 * @param {import('express').Application} app
 * @param {object} gameState - Shared server state
 */
export function setupStatusRoute(app, gameState) {
  // Track peak player count
  if (!gameState._peakPlayers) gameState._peakPlayers = 0;
  if (!gameState._totalRoomsCreated) gameState._totalRoomsCreated = 0;

  app.get('/api/status', (req, res) => {
    const config = gameState.config;

    // Count online players across all rooms
    let onlinePlayers = 0;
    for (const room of gameState.rooms.values()) {
      onlinePlayers += room.players.filter(p => !p.isCpu).length;
    }
    if (onlinePlayers > gameState._peakPlayers) {
      gameState._peakPlayers = onlinePlayers;
    }

    // Count content files
    const characters = countFiles(config.charactersDir, ['.CH2', '.CHE']);
    const arenas = countFiles(config.arenasDir, ['.AN2', '.ANA']);
    const items = countFiles(config.itemsDir, ['.ITM']);
    const weapons = countFiles(config.weaponsDir, ['.W2K']);
    const datasets = countDatasets(config.datasetsDir);

    res.json({
      status: 'online',
      uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
      rooms: {
        active: gameState.rooms.size,
        total_created: gameState._totalRoomsCreated,
      },
      players: {
        online: onlinePlayers,
        peak: gameState._peakPlayers,
      },
      content: {
        characters,
        arenas,
        items,
        weapons,
        datasets,
      },
    });
  });
}
