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

  // ── GET /api/characters — lightweight character list for selection grid ────
  app.get('/api/characters', (req, res) => {
    const datasetId = req.query.dataset || 'default';
    const dataset = gameState.datasets.get(datasetId);
    if (!dataset || !dataset.characters) {
      return res.json([]);
    }
    const list = dataset.characters
      .map((ch, i) => ({ ...ch, _origIndex: i }))
      .filter(ch => {
        // Filter out corrupted/encrypted characters
        const name = ch.fullName || '';
        if (name.includes('Encrypted ChUB') || name.includes('\u0000')) return false;
        if (!name.trim()) return false;
        return true;
      })
      .map((ch) => ({
      index: ch._origIndex,
      fullName: ch.fullName || '',
      senshiId: ch.senshiId || '',
      species: ch.species || '',
      pickMe: ch.pickMe || '',
      desc: (ch.desc || []).filter(d => d && d.trim()).join(' '),
      selectStr: (ch.selectStr || '').replace(/%SN/g, '').trim(),
      physStr: ch.physStr || 0,
      magStr: ch.magStr || 0,
      physDef: ch.physDef || 0,
      magDef: ch.magDef || 0,
      maxHp: ch.maxHp || 500,
      moveCount: (ch.moves || []).filter(m => m && m.name).length,
    }));
    res.json(list);
  });

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
