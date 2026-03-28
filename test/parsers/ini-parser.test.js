import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIni, serializeIni, MESSAGE_FIELDS } from '../../parsers/ini-parser.js';

const ARCADE_PATH = join(import.meta.dirname, '..', 'fixtures', 'arcade.ini');
const arcadeContent = readFileSync(ARCADE_PATH, 'utf-8');

describe('ini-parser', () => {
  describe('parseIni — arcade.ini', () => {
    it('parses dataset name (loadStr) as first message', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.loadStr).toBe('BOTVGH Arcade Dataset');
    });

    it('parses beginSelect message', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.beginSelect).toContain('Entries open!');
    });

    it('parses battleEnd message', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.battleEnd).toContain("Battle's Over");
    });

    it('parses all 47 message fields', () => {
      const ds = parseIni(arcadeContent);
      expect(Object.keys(ds.messages)).toHaveLength(MESSAGE_FIELDS.length);
      for (const field of MESSAGE_FIELDS) {
        expect(ds.messages).toHaveProperty(field);
        expect(typeof ds.messages[field]).toBe('string');
      }
    });

    it('parses post-[more] messages correctly', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.clearChars).toBe('>> The Characters are CLEARED <<');
      expect(ds.messages.charsNotCleared).toBe('>> The Characters are *NOT* Cleared <<');
      expect(ds.messages.gameAborted).toBe('>>> Drawn Game -- Aborted by Host');
    });

    it('parses timer messages', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.x1HrLeft).toContain('one hour');
      expect(ds.messages.x5SecsLeft).toContain('5 seconds');
      expect(ds.messages.timeExpired).toContain('ran out of time');
    });

    it('parses superKill (last message before globs)', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.messages.superKill).toContain('%Y');
    });

    it('parses glob patterns', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.globs).toHaveLength(5);
      expect(ds.globs).toContain('smeb\\*.*');
      expect(ds.globs).toContain('xchars\\*.*');
      expect(ds.globs).toContain('arenas\\*.an?');
      expect(ds.globs).toContain('items\\*.itm');
      expect(ds.globs).toContain('weapons\\*.w2k');
    });

    it('has empty death and fatality strings (none in arcade.ini)', () => {
      const ds = parseIni(arcadeContent);
      expect(ds.deathStrings).toHaveLength(0);
      expect(ds.fatalityStrings).toHaveLength(0);
    });
  });

  describe('parseIni — [Death] and [Fatality] sections', () => {
    const contentWithSections = [
      '"Test Dataset"',
      '"begin select"',
      '"end select"',
      '"battle begin"',
      '"paused"',
      '"unpaused"',
      '"battle end"',
      '[more]',
      // 40 post-[more] strings
      ...Array(40).fill('"placeholder"'),
      // globs
      'chars\\*.*',
      // death section
      '[Death]',
      '"Kyle says, \'\'Oh my God! They killed %SN!\'\'"',
      '"%SN is quite dead."',
      '"%SN has been defeated."',
      // fatality section
      '[Fatality]',
      '"FATALITY! %SN obliterates %S2!"',
      '"%SN performs a finishing move on %S2!"',
    ].join('\n');

    it('parses [Death] strings', () => {
      const ds = parseIni(contentWithSections);
      expect(ds.deathStrings).toHaveLength(3);
      expect(ds.deathStrings[0]).toContain('killed %SN');
      expect(ds.deathStrings[1]).toBe('%SN is quite dead.');
      expect(ds.deathStrings[2]).toBe('%SN has been defeated.');
    });

    it('parses [Fatality] strings', () => {
      const ds = parseIni(contentWithSections);
      expect(ds.fatalityStrings).toHaveLength(2);
      expect(ds.fatalityStrings[0]).toContain('FATALITY');
      expect(ds.fatalityStrings[1]).toContain('finishing move');
    });

    it('parses glob patterns before [Death]', () => {
      const ds = parseIni(contentWithSections);
      expect(ds.globs).toContain('chars\\*.*');
    });

    it('parses messages correctly even with death/fatality sections', () => {
      const ds = parseIni(contentWithSections);
      expect(ds.messages.loadStr).toBe('Test Dataset');
      expect(ds.messages.battleEnd).toBe('battle end');
    });
  });

  describe('serializeIni', () => {
    it('produces valid output for arcade.ini round-trip', () => {
      const ds = parseIni(arcadeContent);
      const serialized = serializeIni(ds);
      const reparsed = parseIni(serialized);

      // Messages should match
      for (const field of MESSAGE_FIELDS) {
        expect(reparsed.messages[field]).toBe(ds.messages[field]);
      }

      // Globs should match
      expect(reparsed.globs).toEqual(ds.globs);

      // Death/fatality should match
      expect(reparsed.deathStrings).toEqual(ds.deathStrings);
      expect(reparsed.fatalityStrings).toEqual(ds.fatalityStrings);
    });

    it('round-trips content with [Death] and [Fatality] sections', () => {
      const original = {
        messages: Object.fromEntries(MESSAGE_FIELDS.map(f => [f, `msg_${f}`])),
        globs: ['chars\\*.*', 'items\\*.itm'],
        deathStrings: ['%SN is dead.', '%SN has fallen.'],
        fatalityStrings: ['FATALITY on %SN!'],
      };

      const serialized = serializeIni(original);
      const reparsed = parseIni(serialized);

      expect(reparsed.messages).toEqual(original.messages);
      expect(reparsed.globs).toEqual(original.globs);
      expect(reparsed.deathStrings).toEqual(original.deathStrings);
      expect(reparsed.fatalityStrings).toEqual(original.fatalityStrings);
    });

    it('includes [more] marker in output', () => {
      const ds = parseIni(arcadeContent);
      const serialized = serializeIni(ds);
      const lines = serialized.split('\n');
      expect(lines[7]).toBe('[more]');
    });

    it('includes [Death] header when death strings present', () => {
      const ds = {
        messages: {},
        globs: [],
        deathStrings: ['%SN died.'],
        fatalityStrings: [],
      };
      const serialized = serializeIni(ds);
      expect(serialized).toContain('[Death]');
      expect(serialized).toContain('"%SN died."');
    });

    it('includes [Fatality] header when fatality strings present', () => {
      const ds = {
        messages: {},
        globs: [],
        deathStrings: [],
        fatalityStrings: ['FATALITY!'],
      };
      const serialized = serializeIni(ds);
      expect(serialized).toContain('[Fatality]');
      expect(serialized).toContain('"FATALITY!"');
    });
  });
});
