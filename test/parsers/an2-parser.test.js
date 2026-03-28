import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAn2, serializeAn2 } from '../../parsers/an2-parser.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', '0.an2');
const raw = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseAn2', () => {
  const arena = parseAn2(raw);

  it('parses the arena name', () => {
    expect(arena.name).toBe('Grassy Field');
  });

  it('parses description lines', () => {
    expect(arena.description).toHaveLength(10);
    expect(arena.description[0]).toBe(
      'There is nothing but grass as far as the eye can see. This arena is',
    );
    expect(arena.description[1]).toBe(
      'perfect for fighting. There are no distractions in sight, and all',
    );
    expect(arena.description[2]).toBe('elements are well-balanced here.');
    // Remaining lines are empty
    for (let i = 3; i < 10; i++) {
      expect(arena.description[i]).toBe('');
    }
  });

  it('parses all 31 elements as 1 (neutral arena)', () => {
    expect(arena.elements).toHaveLength(31);
    for (let i = 0; i < 31; i++) {
      expect(arena.elements[i]).toBe(1);
    }
  });

  it('elements[0] is the allAttacks global multiplier', () => {
    expect(arena.elements[0]).toBe(1);
  });

  it('parses restoration values', () => {
    expect(arena.restLowHp).toBe(3);
    expect(arena.restHighHp).toBe(10);
    expect(arena.restLowMp).toBe(3);
    expect(arena.restHighMp).toBe(10);
    expect(arena.hpPerSecond).toBe(0);
    expect(arena.mpPerSecond).toBe(1);
  });

  it('parses "Sun beating" event', () => {
    const evt = arena.events[0];
    expect(evt.name).toBe('Sun beating');
    expect(evt.frequency).toBe(2);
    expect(evt.hpDamage).toBe(0);
    expect(evt.hitStr).toBe('');
    expect(evt.missStr).toBe('The sun beats overhead.');
    expect(evt.hitsAll).toBe(false);
  });

  it('parses "Cloud sighting" event', () => {
    const evt = arena.events[1];
    expect(evt.name).toBe('Cloud sighting');
    expect(evt.frequency).toBe(0);
    expect(evt.hpDamage).toBe(0);
    expect(evt.hitStr).toBe('');
    expect(evt.missStr).toBe('A solitary cloud can be seen in the sky.');
    expect(evt.hitsAll).toBe(false);
  });

  it('parses "Bird flight" event', () => {
    const evt = arena.events[2];
    expect(evt.name).toBe('Bird flight');
    expect(evt.frequency).toBe(0);
    expect(evt.hpDamage).toBe(0);
    expect(evt.hitStr).toBe('');
    expect(evt.missStr).toBe('A bird flies by overhead.');
    expect(evt.hitsAll).toBe(false);
  });

  it('remaining events are empty', () => {
    for (let i = 3; i < 10; i++) {
      expect(arena.events[i].name).toBe('');
      expect(arena.events[i].frequency).toBe(0);
      expect(arena.events[i].hpDamage).toBe(0);
    }
  });
});

describe('serializeAn2', () => {
  it('produces valid output that round-trips', () => {
    const arena = parseAn2(raw);
    const serialized = serializeAn2(arena);
    const reparsed = parseAn2(serialized);

    expect(reparsed.name).toBe(arena.name);
    expect(reparsed.description).toEqual(arena.description);
    expect(reparsed.elements).toEqual(arena.elements);
    expect(reparsed.restLowHp).toBe(arena.restLowHp);
    expect(reparsed.restHighHp).toBe(arena.restHighHp);
    expect(reparsed.restLowMp).toBe(arena.restLowMp);
    expect(reparsed.restHighMp).toBe(arena.restHighMp);
    expect(reparsed.hpPerSecond).toBe(arena.hpPerSecond);
    expect(reparsed.mpPerSecond).toBe(arena.mpPerSecond);

    for (let i = 0; i < 10; i++) {
      expect(reparsed.events[i].name).toBe(arena.events[i].name);
      expect(reparsed.events[i].frequency).toBe(arena.events[i].frequency);
      expect(reparsed.events[i].hpDamage).toBe(arena.events[i].hpDamage);
      expect(reparsed.events[i].hitStr).toBe(arena.events[i].hitStr);
      expect(reparsed.events[i].missStr).toBe(arena.events[i].missStr);
      expect(reparsed.events[i].hitsAll).toBe(arena.events[i].hitsAll);
    }
  });
});
