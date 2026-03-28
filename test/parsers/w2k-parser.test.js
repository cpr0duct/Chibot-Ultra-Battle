import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseW2k, serializeW2k } from '../../parsers/w2k-parser.js';

const ARROWS_PATH = join(import.meta.dirname, '..', 'fixtures', 'Arrows.w2k');
const arrowsContent = readFileSync(ARROWS_PATH, 'utf-8');

describe('w2k-parser', () => {
  describe('parseW2k — header fields', () => {
    it('parses weapon name', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.name).toBe('StrataSphere Arrows...');
    });

    it('parses shortName', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.shortName).toBe('Arrows');
    });

    it('parses equipStr', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.equipStr).toBe('%SN loads up the Stratasphere Bow and Arrors..');
    });

    it('parses description', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.description).toBe(
        'The Stratasphere Bow and Arrors are powered by Wind and Moon Forces..',
      );
    });

    it('parses dropStr as empty', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.dropStr).toBe('');
    });

    it('parses numUses (charges)', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.numUses).toBe(5);
    });
  });

  describe('parseW2k — moves', () => {
    it('has 5 move slots', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.moves).toHaveLength(5);
    });

    it('parses move 1: Wind Arrow', () => {
      const wpn = parseW2k(arrowsContent);
      const m = wpn.moves[0];
      expect(m.name).toBe('Wind Arrow');
      expect(m.cmdKey).toBe('arrow');
      expect(m.canSuper).toBe(0);
      expect(m.beginAttack).toBe('%SN loads up a Stratasphere arrow');
      expect(m.hit).toBe(
        '%SN fires the wind powered arrow at %T, blasting him to a wall',
      );
      expect(m.miss).toBe('%T dodges it..');
      expect(m.maxSuperHits).toBe(1);
      expect(m.strength).toBe(50);
      expect(m.element).toBe(28);
      expect(m.target).toBe(2);
    });

    it('parses move 2: Comet Shot', () => {
      const wpn = parseW2k(arrowsContent);
      const m = wpn.moves[1];
      expect(m.name).toBe('Comet Shot');
      expect(m.cmdKey).toBe('Comet');
      expect(m.strength).toBe(110);
      expect(m.element).toBe(20);
      expect(m.target).toBe(2);
    });

    it('parses move 3: Super Metero Shower!', () => {
      const wpn = parseW2k(arrowsContent);
      const m = wpn.moves[2];
      expect(m.name).toBe('Super Metero Shower!');
      expect(m.cmdKey).toBe('Meteo');
      expect(m.strength).toBe(120);
      expect(m.element).toBe(20);
      expect(m.target).toBe(5);
      expect(m.maxSuperHits).toBe(3);
    });

    it('parses empty move slots (4 and 5)', () => {
      const wpn = parseW2k(arrowsContent);
      expect(wpn.moves[3].name).toBe('');
      expect(wpn.moves[4].name).toBe('');
    });
  });

  describe('round-trip', () => {
    it('serializeW2k(parseW2k(content)) reproduces the original', () => {
      const wpn = parseW2k(arrowsContent);
      const serialized = serializeW2k(wpn);
      const reparsed = parseW2k(serialized);

      // Header fields
      expect(reparsed.name).toBe(wpn.name);
      expect(reparsed.shortName).toBe(wpn.shortName);
      expect(reparsed.equipStr).toBe(wpn.equipStr);
      expect(reparsed.description).toBe(wpn.description);
      expect(reparsed.dropStr).toBe(wpn.dropStr);
      expect(reparsed.numUses).toBe(wpn.numUses);

      // All moves
      for (let i = 0; i < 5; i++) {
        expect(reparsed.moves[i].name).toBe(wpn.moves[i].name);
        expect(reparsed.moves[i].cmdKey).toBe(wpn.moves[i].cmdKey);
        expect(reparsed.moves[i].strength).toBe(wpn.moves[i].strength);
        expect(reparsed.moves[i].element).toBe(wpn.moves[i].element);
        expect(reparsed.moves[i].target).toBe(wpn.moves[i].target);
        expect(reparsed.moves[i].hit).toBe(wpn.moves[i].hit);
        expect(reparsed.moves[i].miss).toBe(wpn.moves[i].miss);
        expect(reparsed.moves[i].status).toEqual(wpn.moves[i].status);
      }
    });

    it('serialized output matches original line-by-line', () => {
      const wpn = parseW2k(arrowsContent);
      const serialized = serializeW2k(wpn);

      const originalLines = arrowsContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((l, i, arr) => i < arr.length - 1 || l !== ''); // trim trailing empty
      const serializedLines = serialized.split('\n');

      // Compare each line
      for (let i = 0; i < originalLines.length; i++) {
        expect(serializedLines[i]).toBe(originalLines[i]);
      }
    });
  });
});
