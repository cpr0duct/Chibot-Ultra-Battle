import { describe, it, expect } from 'vitest';
import { substituteVars, stripQuotes, parseQuotedString } from '../../parsers/string-vars.js';

describe('string-vars', () => {
  describe('substituteVars', () => {
    it('replaces %SN with player name', () => {
      expect(substituteVars('%SN casts Cure on %T', { SN: 'MrNough38', T: 'ChiPol4' }))
        .toBe('MrNough38 casts Cure on ChiPol4');
    });

    it('replaces %S2 and %Y', () => {
      expect(substituteVars('%SN defects to %Y team %S2 (Team %T)', {
        SN: 'Player1', Y: 'Player2', S2: 'Alpha', T: 'A'
      })).toBe('Player1 defects to Player2 team Alpha (Team A)');
    });

    it('handles missing vars by replacing with empty string', () => {
      expect(substituteVars('%SN attacks %T', { SN: 'Cloud' }))
        .toBe('Cloud attacks ');
    });

    it('handles empty template', () => {
      expect(substituteVars('', { SN: 'test' })).toBe('');
    });

    it('handles no vars in template', () => {
      expect(substituteVars('No variables here', {})).toBe('No variables here');
    });

    it('handles multiple occurrences of same var', () => {
      expect(substituteVars('%SN hits %T and %SN laughs', { SN: 'Cloud', T: 'Tifa' }))
        .toBe('Cloud hits Tifa and Cloud laughs');
    });
  });

  describe('stripQuotes', () => {
    it('removes surrounding double quotes', () => {
      expect(stripQuotes('"Cloud Strife"')).toBe('Cloud Strife');
    });

    it('leaves unquoted strings unchanged', () => {
      expect(stripQuotes('Cloud Strife')).toBe('Cloud Strife');
    });

    it('handles empty quoted string', () => {
      expect(stripQuotes('""')).toBe('');
    });

    it('handles empty string', () => {
      expect(stripQuotes('')).toBe('');
    });

    it('handles string with internal quotes', () => {
      expect(stripQuotes('"He said ""hello"""')).toBe('He said ""hello""');
    });
  });

  describe('parseQuotedString', () => {
    it('parses a line from a VB6 data file', () => {
      expect(parseQuotedString('"Cloud Strife"')).toBe('Cloud Strife');
    });

    it('trims whitespace before parsing', () => {
      expect(parseQuotedString('  "Cloud Strife"  ')).toBe('Cloud Strife');
    });

    it('handles bare number as string', () => {
      expect(parseQuotedString('50')).toBe('50');
    });
  });
});
