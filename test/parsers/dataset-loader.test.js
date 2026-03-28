import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadDataset, reloadDataset } from '../../parsers/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal .CH2 file (just enough for parseCh2 not to crash). */
function minimalCh2(name) {
  // parseCh2 reads: fullName, senshiId, rx, pickMe, selectStr, selectJoin,
  // physStr, physDef, magStr, magDef, blockYes, rest, block, blockFail,
  // 5 taunts, fatal cmdKey/preFatal/fatalMove,
  // 12 moves × 44 lines each, 5 deathStr, 5 killStr, 4 desc
  const lines = [];
  lines.push(`"${name}"`);   // fullName
  lines.push(`"${name}ID"`); // senshiId
  lines.push('0');            // rx
  lines.push('"Pick me!"');   // pickMe
  lines.push('"Select"');     // selectStr
  lines.push('"Join"');       // selectJoin
  lines.push('10');           // physStr
  lines.push('8');            // physDef
  lines.push('5');            // magStr
  lines.push('6');            // magDef
  lines.push('"Block!"');     // blockYes
  lines.push('"Rest"');       // rest
  lines.push('"Block"');      // block
  lines.push('"BlockFail"');  // blockFail
  for (let i = 0; i < 5; i++) lines.push('""'); // taunts
  lines.push('""'); // fatal cmdKey
  lines.push('""'); // fatal preFatal
  lines.push('""'); // fatal fatalMove
  // 12 moves × 44 lines each (all zeros/empty)
  for (let m = 0; m < 12; m++) {
    lines.push('""');  // name
    lines.push('""');  // cmdKey
    lines.push('0');   // canSuper
    lines.push('""');  // beginAttack
    lines.push('""');  // beginSuperAttack
    lines.push('""');  // beginHealSelf
    lines.push('""');  // hit
    lines.push('""');  // superHit
    lines.push('0');   // maxSuperHits
    lines.push('""');  // healSelf
    lines.push('""');  // critHit
    lines.push('""');  // healMeld
    lines.push('""');  // miss
    // 10 status values
    for (let s = 0; s < 10; s++) lines.push('0');
    lines.push('""');  // superMiss
    // 17 more status values
    for (let s = 0; s < 17; s++) lines.push('0');
    lines.push('0');   // element
    lines.push('0');   // strength
    lines.push('0');   // target
  }
  // 5 deathStr, 5 killStr, 4 desc
  for (let i = 0; i < 14; i++) lines.push('""');
  return lines.join('\n');
}

/** Create a minimal .AN2 file. */
function minimalAn2(name) {
  const lines = [];
  lines.push(`"${name}"`); // name
  for (let i = 0; i < 10; i++) lines.push('""'); // desc
  lines.push('1'); // AllAttacks
  for (let i = 0; i < 30; i++) lines.push('0'); // elements
  lines.push('0'); // restLowHp
  lines.push('0'); // restHighHp
  lines.push('0'); // restLowMp
  lines.push('0'); // restHighMp
  lines.push('0'); // hpPerSecond
  lines.push('0'); // mpPerSecond
  // 10 events × 6 lines each
  for (let e = 0; e < 10; e++) {
    lines.push('""'); // name
    lines.push('0');  // frequency
    lines.push('0');  // hpDamage
    lines.push('""'); // hit
    lines.push('""'); // miss
    lines.push('0');  // hitsAll
  }
  return lines.join('\n');
}

/** Create a minimal .ITM file. */
function minimalItm(name) {
  const lines = [];
  lines.push(`"${name}"`);   // name
  lines.push('"Spawn"');      // spawnStr
  lines.push('"Telefrag"');   // telefragStr
  lines.push('"PlayerGet"');  // playerGet
  lines.push('"YoumaGet"');   // youmaGet
  lines.push('50');           // playerHp
  lines.push('10');           // playerMp
  for (let i = 0; i < 26; i++) lines.push('0'); // status
  return lines.join('\n');
}

/** Create a minimal .W2K file. */
function minimalW2k(name) {
  const lines = [];
  lines.push(`"${name}"`);      // name
  lines.push(`"${name[0]}"`);   // shortName
  lines.push('"Equip"');         // equipStr
  lines.push('"Desc"');          // description
  lines.push('"Drop"');          // dropStr
  lines.push('3');               // numUses
  // 5 moves × 44 lines each
  for (let m = 0; m < 5; m++) {
    lines.push('""');  // name
    lines.push('""');  // cmdKey
    lines.push('0');   // canSuper
    lines.push('""');  // beginAttack
    lines.push('""');  // beginSuperAttack
    lines.push('""');  // beginHealSelf
    lines.push('""');  // hit
    lines.push('""');  // superHit
    lines.push('0');   // maxSuperHits
    lines.push('""');  // healSelf
    lines.push('""');  // critHit
    lines.push('""');  // healMeld
    lines.push('""');  // miss
    for (let s = 0; s < 10; s++) lines.push('0');
    lines.push('""');  // superMiss
    for (let s = 0; s < 17; s++) lines.push('0');
    lines.push('0');   // element
    lines.push('0');   // strength
    lines.push('0');   // target
  }
  return lines.join('\n');
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('loadDataset', () => {
  const tmpBase = join(tmpdir(), `chub-test-${Date.now()}`);
  const charsDir = join(tmpBase, 'chars');
  const arenasDir = join(tmpBase, 'arenas');
  const itemsDir = join(tmpBase, 'items');
  const weaponsDir = join(tmpBase, 'weapons');
  const iniPath = join(tmpBase, 'test.ini');

  beforeAll(() => {
    // Create directory structure
    mkdirSync(charsDir, { recursive: true });
    mkdirSync(arenasDir, { recursive: true });
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(weaponsDir, { recursive: true });

    // Write data files
    writeFileSync(join(charsDir, 'HERO.CH2'), minimalCh2('Hero'));
    writeFileSync(join(charsDir, 'VILLAIN.CHE'), minimalCh2('Villain'));
    writeFileSync(join(arenasDir, 'FIELD.AN2'), minimalAn2('Grassy Field'));
    writeFileSync(join(arenasDir, 'CAVE.ANA'), minimalAn2('Dark Cave'));
    writeFileSync(join(itemsDir, 'POTION.ITM'), minimalItm('Potion'));
    writeFileSync(join(weaponsDir, 'SWORD.W2K'), minimalW2k('Sword'));

    // Write INI file
    const ini = [
      '"Test Dataset"',
      '"Entries open"',
      '"Entries closed"',
      '"Battle begun"',
      '"Paused"',
      '"Unpaused"',
      '"Battle over"',
      '[more]',
      // 40 post-more strings
      ...Array(40).fill('""'),
      // Glob patterns (DOS-style backslash paths)
      'chars\\*.CH?',
      'arenas\\*.*',
      'items\\*.itm',
      'weapons\\*.w2k',
      '[Death]',
      '"So and so has died"',
      '[Fatality]',
      '"Fatality!!"',
    ].join('\n');

    writeFileSync(iniPath, ini);
  });

  afterAll(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns the expected dataset structure', async () => {
    const ds = await loadDataset(iniPath);

    // Config should have messages spread in
    expect(ds.config.loadStr).toBe('Test Dataset');
    expect(ds.config.beginSelect).toBe('Entries open');
    expect(ds.config.battleEnd).toBe('Battle over');

    // Death/fatality strings
    expect(ds.config.deathStrings).toEqual(['So and so has died']);
    expect(ds.config.fatalityStrings).toEqual(['Fatality!!']);

    // Characters: 2 (one .CH2, one .CHE)
    expect(ds.characters).toHaveLength(2);
    const names = ds.characters.map((c) => c.fullName).sort();
    expect(names).toEqual(['Hero', 'Villain']);

    // Arenas: 2 (one .AN2, one .ANA)
    expect(ds.arenas).toHaveLength(2);
    const arenaNames = ds.arenas.map((a) => a.name).sort();
    expect(arenaNames).toEqual(['Dark Cave', 'Grassy Field']);

    // Items: 1
    expect(ds.items).toHaveLength(1);
    expect(ds.items[0].name).toBe('Potion');
    expect(ds.items[0].playerHp).toBe(50);

    // Weapons: 1
    expect(ds.weapons).toHaveLength(1);
    expect(ds.weapons[0].name).toBe('Sword');
    expect(ds.weapons[0].numUses).toBe(3);
  });

  it('reloadDataset is an alias for loadDataset', () => {
    expect(reloadDataset).toBe(loadDataset);
  });

  it('handles missing directories gracefully', async () => {
    // Create an INI that references a non-existent directory
    const missingIniPath = join(tmpBase, 'missing.ini');
    const missingIni = [
      '"Missing Dataset"',
      '"open"', '"closed"', '"begun"', '"paused"', '"unpaused"', '"over"',
      '[more]',
      ...Array(40).fill('""'),
      'nonexistent\\*.*',
    ].join('\n');
    writeFileSync(missingIniPath, missingIni);

    const ds = await loadDataset(missingIniPath);
    expect(ds.characters).toEqual([]);
    expect(ds.arenas).toEqual([]);
    expect(ds.items).toEqual([]);
    expect(ds.weapons).toEqual([]);
  });
});

describe('loadDataset with real fixtures', () => {
  const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

  it('loads the arcade.ini fixture and parses referenced fixture files', async () => {
    // The arcade.ini references directories like smeb\*.* which don't exist
    // in our fixture dir, but we can still test that the INI is parsed and
    // the structure is correct (just with empty arrays since subdirs are missing)
    const ds = await loadDataset(join(fixturesDir, 'arcade.ini'));

    expect(ds.config.loadStr).toBe('BOTVGH Arcade Dataset');
    expect(ds.config).toHaveProperty('deathStrings');
    expect(ds.config).toHaveProperty('fatalityStrings');
    expect(Array.isArray(ds.characters)).toBe(true);
    expect(Array.isArray(ds.arenas)).toBe(true);
    expect(Array.isArray(ds.items)).toBe(true);
    expect(Array.isArray(ds.weapons)).toBe(true);
  });
});
