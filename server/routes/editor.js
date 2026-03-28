/**
 * Editor REST API — CRUD for all content types.
 *
 * Routes:
 *   GET    /api/editor/:type          → list files
 *   GET    /api/editor/:type/:file    → parse and return JSON
 *   POST   /api/editor/:type/:file    → save (JSON body → file)
 *   DELETE /api/editor/:type/:file    → delete file
 *   POST   /api/editor/reload         → re-scan data directories
 */

import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join, extname } from 'path';

import { parseCh2, serializeCh2 } from '../../parsers/ch2-parser.js';
import { parseAn2, serializeAn2 } from '../../parsers/an2-parser.js';
import { parseItm, serializeItm } from '../../parsers/itm-parser.js';
import { parseW2k, serializeW2k } from '../../parsers/w2k-parser.js';
import { parseIni, serializeIni } from '../../parsers/ini-parser.js';

// ── Content type configuration ──────────────────────────────────────────────

const CONTENT_TYPES = {
  characters: {
    extensions: ['.ch2', '.che'],
    defaultExt: '.CH2',
    parse: parseCh2,
    serialize: serializeCh2,
    dirKey: 'charactersDir',
  },
  arenas: {
    extensions: ['.an2', '.ana'],
    defaultExt: '.AN2',
    parse: parseAn2,
    serialize: serializeAn2,
    dirKey: 'arenasDir',
  },
  items: {
    extensions: ['.itm'],
    defaultExt: '.ITM',
    parse: parseItm,
    serialize: serializeItm,
    dirKey: 'itemsDir',
  },
  weapons: {
    extensions: ['.w2k'],
    defaultExt: '.W2K',
    parse: parseW2k,
    serialize: serializeW2k,
    dirKey: 'weaponsDir',
  },
  datasets: {
    extensions: ['.ini'],
    defaultExt: '.ini',
    parse: parseIni,
    serialize: serializeIni,
    dirKey: 'datasetsDir',
  },
};

// ── Filename sanitisation ───────────────────────────────────────────────────

/**
 * Validate and sanitise a filename to prevent path traversal.
 * Only allows alphanumeric characters, dashes, underscores, and dots.
 * Rejects paths containing `..` or any slash.
 *
 * @param {string} name - Raw filename from the URL
 * @returns {string|null} Sanitised filename, or null if invalid
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return null;
  if (name.includes('..')) return null;
  if (name.includes('/') || name.includes('\\')) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  return name;
}

// ── Route setup ─────────────────────────────────────────────────────────────

/**
 * Register all editor routes on the Express app.
 *
 * @param {import('express').Application} app
 * @param {object} config - Server config (from default.json)
 */
export function setupEditorRoutes(app, config) {

  // POST /api/editor/reload — re-scan data directories (placeholder)
  app.post('/api/editor/reload', (req, res) => {
    // In a full implementation this would re-scan and reload datasets.
    // For now, return success to indicate the endpoint exists.
    res.json({ success: true, message: 'Data directories rescanned.' });
  });

  // GET /api/editor/audio — list audio files for jukebox
  app.get('/api/editor/audio', (req, res) => {
    const audioDir = config.audioDir;
    try {
      const entries = readdirSync(audioDir, { withFileTypes: true });
      const audioExts = ['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a', '.mid', '.midi', '.spc'];
      const files = entries
        .filter(e => {
          if (!e.isFile()) return false;
          const ext = extname(e.name).toLowerCase();
          return audioExts.includes(ext);
        })
        .map(e => ({ name: e.name, path: e.name }));
      res.json(files);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.json([]);
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Register CRUD routes for each content type
  for (const [typeName, typeCfg] of Object.entries(CONTENT_TYPES)) {
    const baseDir = config[typeCfg.dirKey];

    // GET /api/editor/:type — list files
    app.get(`/api/editor/${typeName}`, (req, res) => {
      try {
        const entries = readdirSync(baseDir, { withFileTypes: true });
        const files = entries
          .filter(e => {
            if (!e.isFile()) return false;
            const ext = extname(e.name).toLowerCase();
            return typeCfg.extensions.includes(ext);
          })
          .map(e => ({ name: e.name, path: e.name }));
        res.json(files);
      } catch (err) {
        // Directory may not exist yet
        if (err.code === 'ENOENT') {
          res.json([]);
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    });

    // GET /api/editor/:type/:file — parse and return JSON
    app.get(`/api/editor/${typeName}/:file`, (req, res) => {
      const filename = sanitizeFilename(req.params.file);
      if (!filename) {
        return res.status(400).json({ error: 'Invalid filename.' });
      }

      const filePath = join(baseDir, filename);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = typeCfg.parse(content);
        res.json(parsed);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.status(404).json({ error: 'File not found.' });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    });

    // POST /api/editor/:type/:file — save (JSON body → file)
    app.post(`/api/editor/${typeName}/:file`, (req, res) => {
      const filename = sanitizeFilename(req.params.file);
      if (!filename) {
        return res.status(400).json({ error: 'Invalid filename.' });
      }

      try {
        const serialized = typeCfg.serialize(req.body);
        const filePath = join(baseDir, filename);
        writeFileSync(filePath, serialized, 'utf-8');
        res.json({ success: true, file: filename });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // DELETE /api/editor/:type/:file — delete file
    app.delete(`/api/editor/${typeName}/:file`, (req, res) => {
      const filename = sanitizeFilename(req.params.file);
      if (!filename) {
        return res.status(400).json({ error: 'Invalid filename.' });
      }

      const filePath = join(baseDir, filename);
      try {
        unlinkSync(filePath);
        res.json({ success: true, file: filename });
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.status(404).json({ error: 'File not found.' });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    });
  }
}
