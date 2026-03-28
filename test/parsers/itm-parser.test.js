import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseItm, serializeItm } from '../../parsers/itm-parser.js';
import { STATUS } from '../../engine/constants.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'CURE.ITM');
const raw = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseItm', () => {
  const item = parseItm(raw);

  it('parses the item name', () => {
    expect(item.name).toBe('A Cure CD');
  });

  it('parses the spawn string', () => {
    expect(item.spawnStr).toBe('A Cure CD pops up on the ground.');
  });

  it('parses the telefrag string', () => {
    expect(item.telefragStr).toBe(
      'The CD is used as a frisbee and Sparky gets it.',
    );
  });

  it('parses the player-get string with %SN variable', () => {
    expect(item.playerGet).toBe('%SN grabs it....sweet!');
  });

  it('parses the youma-get string with %Y variable', () => {
    expect(item.youmaGet).toBe('%Y gets it...he is annoyed by it!');
  });

  it('parses HP value', () => {
    expect(item.playerHp).toBe(30);
  });

  it('parses MP value', () => {
    expect(item.playerMp).toBe(10);
  });

  it('parses haste status as 100%', () => {
    expect(item.playerStat[STATUS.HASTE]).toBe(100);
  });

  it('parses barrier status as 100%', () => {
    expect(item.playerStat[STATUS.BARRIER]).toBe(100);
  });

  it('parses mbarrier status as 100%', () => {
    expect(item.playerStat[STATUS.M_BARRIER]).toBe(100);
  });

  it('parses zero statuses correctly', () => {
    expect(item.playerStat[STATUS.MUTE]).toBe(0);
    expect(item.playerStat[STATUS.CHAOS]).toBe(0);
    expect(item.playerStat[STATUS.FREEZE]).toBe(0);
    expect(item.playerStat[STATUS.POISON]).toBe(0);
    expect(item.playerStat[STATUS.BLIND]).toBe(0);
  });

  it('has all remaining statuses as zero', () => {
    expect(item.playerStat[STATUS.SLEEP]).toBe(0);
    expect(item.playerStat[STATUS.CURSE]).toBe(0);
    expect(item.playerStat[STATUS.BLESS]).toBe(0);
    expect(item.playerStat[STATUS.SLOW]).toBe(0);
    expect(item.playerStat[STATUS.STUN]).toBe(0);
    expect(item.playerStat[STATUS.STOP]).toBe(0);
    expect(item.playerStat[STATUS.RERAISE]).toBe(0);
    expect(item.playerStat[STATUS.QUICK]).toBe(0);
    expect(item.playerStat[STATUS.REGEN]).toBe(0);
    expect(item.playerStat[STATUS.MUSHROOM]).toBe(0);
    expect(item.playerStat[STATUS.MIA]).toBe(0);
    expect(item.playerStat[STATUS.BERSERK]).toBe(0);
    expect(item.playerStat[STATUS.SCARECROW]).toBe(0);
    expect(item.playerStat[STATUS.CHARM]).toBe(0);
    expect(item.playerStat[STATUS.CPU_WAIT]).toBe(0);
    expect(item.playerStat[STATUS.HIT_RATE]).toBe(0);
  });
});

describe('serializeItm', () => {
  const item = parseItm(raw);
  const serialized = serializeItm(item);

  it('produces correct number of lines', () => {
    const lines = serialized.split('\n');
    // 5 strings + 2 integers + 26 status = 33 lines
    expect(lines).toHaveLength(33);
  });

  it('quotes string fields', () => {
    const lines = serialized.split('\n');
    expect(lines[0]).toBe('"A Cure CD"');
    expect(lines[1]).toBe('"A Cure CD pops up on the ground."');
    expect(lines[3]).toBe('"%SN grabs it....sweet!"');
    expect(lines[4]).toBe('"%Y gets it...he is annoyed by it!"');
  });

  it('writes HP and MP as bare integers', () => {
    const lines = serialized.split('\n');
    expect(lines[5]).toBe('30');
    expect(lines[6]).toBe('10');
  });

  it('writes status values as bare integers', () => {
    const lines = serialized.split('\n');
    // Haste (file position 7+7=14) = 100
    expect(lines[14]).toBe('100');
    // Barrier (file position 7+8=15) = 100
    expect(lines[15]).toBe('100');
  });
});

describe('round-trip', () => {
  it('parse -> serialize -> parse produces identical item', () => {
    const item1 = parseItm(raw);
    const serialized = serializeItm(item1);
    const item2 = parseItm(serialized);

    expect(item2.name).toBe(item1.name);
    expect(item2.spawnStr).toBe(item1.spawnStr);
    expect(item2.telefragStr).toBe(item1.telefragStr);
    expect(item2.playerGet).toBe(item1.playerGet);
    expect(item2.youmaGet).toBe(item1.youmaGet);
    expect(item2.playerHp).toBe(item1.playerHp);
    expect(item2.playerMp).toBe(item1.playerMp);
    expect(item2.playerStat).toEqual(item1.playerStat);
  });

  it('serialize -> parse -> serialize produces identical content', () => {
    const item = parseItm(raw);
    const s1 = serializeItm(item);
    const s2 = serializeItm(parseItm(s1));
    expect(s2).toBe(s1);
  });
});

describe('edge cases', () => {
  it('handles negative status values', () => {
    // CURE.ITM has discarded Rx values at file positions 12-13
    // which contain -25 and 0 — these are padding and not stored
    // The parsed item should not have -25 in any real status field
    const item = parseItm(raw);
    // Verify no named status has -25
    const namedStatuses = [
      STATUS.MUTE, STATUS.CHAOS, STATUS.FREEZE, STATUS.POISON,
      STATUS.BLIND, STATUS.HASTE, STATUS.SCARECROW, STATUS.SLOW,
      STATUS.STUN, STATUS.RERAISE, STATUS.REGEN, STATUS.STOP,
      STATUS.MUSHROOM, STATUS.MIA, STATUS.QUICK, STATUS.BERSERK,
      STATUS.SLEEP, STATUS.CPU_WAIT, STATUS.HIT_RATE, STATUS.BARRIER,
      STATUS.M_BARRIER, STATUS.BLESS, STATUS.CURSE, STATUS.CHARM,
    ];
    for (const idx of namedStatuses) {
      expect(item.playerStat[idx]).not.toBe(-25);
    }
  });

  it('handles empty content gracefully', () => {
    const item = parseItm('');
    expect(item.name).toBe('');
    expect(item.playerHp).toBe(0);
    expect(item.playerMp).toBe(0);
  });
});
