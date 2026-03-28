/**
 * Unified dataset loader for ChUB 2000 Web.
 *
 * Reads an .INI dataset file, expands all glob patterns to find data files,
 * parses each file with the appropriate parser, and returns a complete
 * dataset object.
 *
 * Authoritative reference: ChiSource/DATASET.BAS — InitFromDisk
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join, basename, extname } from 'path';
import { parseIni } from './ini-parser.js';
import { parseCh2 } from './ch2-parser.js';
import { parseAn2 } from './an2-parser.js';
import { parseItm } from './itm-parser.js';
import { parseW2k } from './w2k-parser.js';

// ── Extension → parser mapping ──────────────────────────────────────────────

/** Map of uppercase extensions to { parser, category } */
const EXTENSION_MAP = {
  '.CH2': { parser: parseCh2, category: 'characters' },
  '.CHE': { parser: parseCh2, category: 'characters' },
  '.AN2': { parser: parseAn2, category: 'arenas' },
  '.ANA': { parser: parseAn2, category: 'arenas' },
  '.ITM': { parser: parseItm, category: 'items' },
  '.W2K': { parser: parseW2k, category: 'weapons' },
};

/** All supported extensions (uppercase) */
const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_MAP);

// ── DOS wildcard → file matcher ─────────────────────────────────────────────

/**
 * Translate a DOS-style glob pattern into a matcher function.
 *
 * Supports:
 *   - `*` matches any sequence of characters (within the name or extension)
 *   - `?` matches exactly one character
 *   - Backslash path separators are normalised to forward slashes
 *
 * Examples:
 *   - `*.CH?`  → matches .CH2, .CHE, etc.
 *   - `*.*`    → matches all files with an extension
 */
function dosGlobToRegex(pattern) {
  // Normalise path separators
  const normalised = pattern.replace(/\\/g, '/');

  // Escape regex special chars except * and ?
  const escaped = normalised.replace(/([.+^${}()|[\]])/g, '\\$1');

  // Translate DOS wildcards
  const regexStr = escaped
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');

  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Given a DOS glob pattern and a base directory, find all matching files.
 *
 * The pattern may include subdirectory prefixes (e.g. `smeb\*.*`).
 * The subdirectory portion is used to locate the target directory,
 * and the filename portion is matched against directory entries.
 *
 * @param {string} pattern  DOS-style glob (e.g. `smeb\*.*`)
 * @param {string} baseDir  Directory the INI file lives in
 * @returns {string[]}  Array of absolute file paths
 */
function expandDosGlob(pattern, baseDir) {
  // Normalise to forward slashes
  const normalised = pattern.replace(/\\/g, '/');

  // Split into directory prefix and filename pattern
  const lastSlash = normalised.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? normalised.slice(0, lastSlash) : '';
  const filePart = lastSlash >= 0 ? normalised.slice(lastSlash + 1) : normalised;

  const targetDir = dirPart ? join(baseDir, dirPart) : baseDir;
  const fileRegex = dosGlobToRegex(filePart);

  let entries;
  try {
    entries = readdirSync(targetDir, { withFileTypes: true });
  } catch {
    // Directory doesn't exist — return empty (dataset may reference
    // directories that aren't present in this deployment)
    return [];
  }

  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    // Only match files with supported extensions
    const ext = extname(entry.name).toUpperCase();
    if (!EXTENSION_MAP[ext]) continue;

    if (fileRegex.test(entry.name)) {
      matches.push(join(targetDir, entry.name));
    }
  }

  // Sort for deterministic ordering
  matches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return matches;
}

// ── Dataset loader ──────────────────────────────────────────────────────────

/**
 * Load a complete dataset from an .INI file.
 *
 * @param {string} iniPath  Absolute or relative path to the .INI file
 * @returns {Promise<{
 *   config: { messages: object, deathStrings: string[], fatalityStrings: string[] },
 *   characters: object[],
 *   arenas: object[],
 *   items: object[],
 *   weapons: object[]
 * }>}
 */
export async function loadDataset(iniPath) {
  const iniContent = readFileSync(iniPath, 'utf-8');
  const ini = parseIni(iniContent);

  const baseDir = dirname(iniPath);

  const dataset = {
    config: {
      ...ini.messages,
      deathStrings: ini.deathStrings,
      fatalityStrings: ini.fatalityStrings,
    },
    characters: [],
    arenas: [],
    items: [],
    weapons: [],
  };

  // Expand each glob pattern and parse matching files
  for (const glob of ini.globs) {
    const files = expandDosGlob(glob, baseDir);

    for (const filePath of files) {
      const ext = extname(filePath).toUpperCase();
      const mapping = EXTENSION_MAP[ext];
      if (!mapping) continue;

      const content = readFileSync(filePath, 'utf-8');
      const parsed = mapping.parser(content);
      dataset[mapping.category].push(parsed);
    }
  }

  return dataset;
}

/**
 * Reload a dataset (alias for loadDataset, intended for hot-reload endpoint).
 */
export const reloadDataset = loadDataset;
