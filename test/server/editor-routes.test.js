/**
 * Tests for the editor REST API routes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { setupEditorRoutes } from '../../server/routes/editor.js';
import { parseCh2 } from '../../parsers/ch2-parser.js';

const TEST_DATA_DIR = join(process.cwd(), 'test', '_tmp_editor_data');

function makeConfig() {
  return {
    charactersDir: join(TEST_DATA_DIR, 'characters'),
    arenasDir: join(TEST_DATA_DIR, 'arenas'),
    itemsDir: join(TEST_DATA_DIR, 'items'),
    weaponsDir: join(TEST_DATA_DIR, 'weapons'),
    datasetsDir: join(TEST_DATA_DIR, 'datasets'),
  };
}

/** Helper: make HTTP requests to the test server */
async function req(port, method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, opts);
  const json = await res.json();
  return { status: res.status, body: json };
}

/**
 * Build a test character by parsing the real CLOUD.CH2 fixture.
 * This ensures the object has the full shape the serializer expects.
 */
function makeTestChar() {
  const fixturePath = join(process.cwd(), 'test', 'fixtures', 'CLOUD.CH2');
  const content = readFileSync(fixturePath, 'utf-8');
  const ch = parseCh2(content);
  ch.fullName = 'Test Fighter';
  ch.senshiId = 'testfighter';
  return ch;
}

describe('Editor REST API', () => {
  let server;
  let port;
  const config = makeConfig();

  beforeAll(async () => {
    // Create temp directories
    for (const dir of Object.values(config)) {
      mkdirSync(dir, { recursive: true });
    }

    const app = express();
    app.use(express.json());
    setupEditorRoutes(app, config);

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
    // Clean up temp data
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('GET /api/editor/characters', () => {
    it('returns an empty array when no files exist', async () => {
      const { status, body } = await req(port, 'GET', '/api/editor/characters');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe('POST + GET round-trip', () => {
    it('saves a character and reads it back', async () => {
      const char = makeTestChar();

      // Save
      const saveRes = await req(port, 'POST', '/api/editor/characters/TestFighter.CH2', char);
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);

      // File should exist on disk
      const filePath = join(config.charactersDir, 'TestFighter.CH2');
      expect(existsSync(filePath)).toBe(true);

      // Read back via API
      const getRes = await req(port, 'GET', '/api/editor/characters/TestFighter.CH2');
      expect(getRes.status).toBe(200);
      expect(getRes.body.fullName).toBe('Test Fighter');
      expect(getRes.body.senshiId).toBe('testfighter');

      // List should include the file
      const listRes = await req(port, 'GET', '/api/editor/characters');
      expect(listRes.status).toBe(200);
      expect(listRes.body.some(f => f.name === 'TestFighter.CH2')).toBe(true);
    });
  });

  describe('DELETE /api/editor/characters/:file', () => {
    it('deletes a file', async () => {
      // Ensure file exists first
      const char = makeTestChar();
      char.fullName = 'To Delete';
      await req(port, 'POST', '/api/editor/characters/ToDelete.CH2', char);

      const delRes = await req(port, 'DELETE', '/api/editor/characters/ToDelete.CH2');
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // File should be gone
      const filePath = join(config.charactersDir, 'ToDelete.CH2');
      expect(existsSync(filePath)).toBe(false);
    });

    it('returns 404 for non-existent file', async () => {
      const delRes = await req(port, 'DELETE', '/api/editor/characters/Nonexistent.CH2');
      expect(delRes.status).toBe(404);
    });
  });

  describe('Path traversal prevention', () => {
    it('rejects filenames with ..', async () => {
      const { status, body } = await req(port, 'GET', '/api/editor/characters/..%2F..%2Fetc%2Fpasswd');
      expect(status).toBe(400);
      expect(body.error).toMatch(/invalid/i);
    });

    it('rejects filenames with slashes', async () => {
      const { status } = await req(port, 'GET', '/api/editor/characters/sub%2Ffile.CH2');
      expect(status).toBe(400);
    });

    it('rejects filenames with special characters', async () => {
      const { status } = await req(port, 'GET', '/api/editor/characters/file%3Becho%20hi.CH2');
      expect(status).toBe(400);
    });
  });

  describe('POST /api/editor/reload', () => {
    it('returns success', async () => {
      const { status, body } = await req(port, 'POST', '/api/editor/reload');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
