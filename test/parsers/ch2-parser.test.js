import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCh2, serializeCh2 } from '../../parsers/ch2-parser.js';
import { ELEMENT, TARGET } from '../../engine/constants.js';

const CLOUD_PATH = join(import.meta.dirname, '..', 'fixtures', 'CLOUD.CH2');
const cloudContent = readFileSync(CLOUD_PATH, 'utf-8');

describe('ch2-parser', () => {
  describe('parseCh2 — identity fields', () => {
    it('parses fullName', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.fullName).toBe('Cloud Strife');
    });

    it('parses senshiId', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.senshiId).toBe('cloud');
    });

    it('parses pickMe', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.pickMe).toBe('cloud');
    });

    it('parses species as empty', () => {
      const ch = parseCh2(cloudContent);
      // Species is not stored in CH2 format; weakTo/resist line is "" = 0
      expect(ch.weakTo).toBe(0);
    });
  });

  describe('parseCh2 — stats', () => {
    it('parses physStr=50', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.physStr).toBe(50);
    });

    it('parses physDef=60', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.physDef).toBe(60);
    });

    it('parses magStr=50', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.magStr).toBe(50);
    });

    it('parses magDef=60', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.magDef).toBe(60);
    });
  });

  describe('parseCh2 — strings', () => {
    it('parses selectStr containing "Ultima Weapon"', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.selectStr).toContain('Ultima Weapon');
    });

    it('parses rest string containing "Nibelheim"', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.rest).toContain('Nibelheim');
    });

    it('parses block string', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.block).toContain('Ultima Weapon');
    });

    it('parses blockFail string', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.blockFail).toContain('clumsily');
    });

    it('parses blockYes as empty (Cloud has no blockYes)', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.blockYes).toBe('');
    });

    it('parses first taunt as "%SN shrugs."', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.taunts[0]).toContain('shrugs');
    });
  });

  describe('parseCh2 — fatality', () => {
    it('parses fatal cmdKey', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.fatality.cmdKey).toBe('ch');
    });

    it('parses preFatal containing "Climhazzard"', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.fatality.preFatal).toContain('Climhazzard');
    });

    it('parses fatalMove string', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.fatality.fatalMove).toContain('stabs');
    });
  });

  describe('parseCh2 — moves', () => {
    it('parses first move as "Braver"', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.moves[0].name).toBe('Braver');
      expect(ch.moves[0].cmdKey).toBe('braver');
    });

    it('parses Braver element=PHYSICAL(1), strength=65, target=ENEMY(2)', () => {
      const ch = parseCh2(cloudContent);
      const braver = ch.moves[0];
      expect(braver.element).toBe(ELEMENT.PHYSICAL);
      expect(braver.strength).toBe(65);
      expect(braver.target).toBe(TARGET.ENEMY);
    });

    it('finds Omnislash with canSuper=1 and strength=100', () => {
      const ch = parseCh2(cloudContent);
      const omni = ch.moves.find(m => m.name === 'Omnislash');
      expect(omni).toBeDefined();
      expect(omni.canSuper).toBe(1);
      expect(omni.strength).toBe(100);
    });

    it('finds Restore Materia / cure with element=HEAL(2)', () => {
      const ch = parseCh2(cloudContent);
      const cure = ch.moves.find(m => m.cmdKey === 'cure');
      expect(cure).toBeDefined();
      expect(cure.name).toBe('Restore Materia');
      expect(cure.element).toBe(ELEMENT.HEAL);
    });

    it('parses Cross Slash with stun=100', () => {
      const ch = parseCh2(cloudContent);
      const cs = ch.moves.find(m => m.name === 'Cross Slash');
      expect(cs).toBeDefined();
      expect(cs.status[11]).toBe(100); // STATUS.STUN = 11
    });

    it('parses Blade Beam as ALL_TEAM target', () => {
      const ch = parseCh2(cloudContent);
      const bb = ch.moves.find(m => m.name === 'Blade Beam');
      expect(bb).toBeDefined();
      expect(bb.target).toBe(TARGET.ALL_TEAM);
    });

    it('parses Finishing Touch with MIA status', () => {
      const ch = parseCh2(cloudContent);
      const ft = ch.moves.find(m => m.name === 'Finishing Touch');
      expect(ft).toBeDefined();
      expect(ft.status[16]).toBe(100); // STATUS.MIA = 16
    });

    it('parses move 12 (Summon Materia II) — all slots filled', () => {
      const ch = parseCh2(cloudContent);
      const last = ch.moves[11];
      expect(last.name).toBe('Summon Materia II');
      expect(last.cmdKey).toBe('~kotr');
    });

    it('parses all 12 move slots', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.moves).toHaveLength(12);
    });

    it('parses Summon Materia II (Knights of the Round)', () => {
      const ch = parseCh2(cloudContent);
      const kotr = ch.moves.find(m => m.cmdKey === '~kotr');
      expect(kotr).toBeDefined();
      expect(kotr.element).toBe(ELEMENT.SHADOW); // 21
      expect(kotr.strength).toBe(200);
    });

    it('parses Destruct Materia with negative barrier/mbarrier status', () => {
      const ch = parseCh2(cloudContent);
      const destruct = ch.moves.find(m => m.cmdKey === 'destruct');
      expect(destruct).toBeDefined();
      expect(destruct.status[23]).toBe(-1); // barrier
      expect(destruct.status[24]).toBe(-1); // mbarrier
    });

    it('parses Regen move with regen status=100', () => {
      const ch = parseCh2(cloudContent);
      const regen = ch.moves.find(m => m.cmdKey === 'regen');
      expect(regen).toBeDefined();
      expect(regen.status[13]).toBe(100); // regen
    });

    it('parses Shiva summon with freeze status=100', () => {
      const ch = parseCh2(cloudContent);
      const shiva = ch.moves.find(m => m.cmdKey === 'shiva');
      expect(shiva).toBeDefined();
      expect(shiva.status[3]).toBe(100); // freeze
    });
  });

  describe('parseCh2 — trailing sections', () => {
    it('parses desc lines', () => {
      const ch = parseCh2(cloudContent);
      expect(ch.desc[0]).toContain('screwed up');
      expect(ch.desc[1]).toContain('Climhazzard');
    });
  });

  describe('serializeCh2', () => {
    it('produces a string', () => {
      const ch = parseCh2(cloudContent);
      const output = serializeCh2(ch);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('round-trip', () => {
    it('parse -> serialize -> parse produces equivalent character', () => {
      const ch1 = parseCh2(cloudContent);
      const serialized = serializeCh2(ch1);
      const ch2 = parseCh2(serialized);

      // Identity
      expect(ch2.fullName).toBe(ch1.fullName);
      expect(ch2.senshiId).toBe(ch1.senshiId);
      expect(ch2.pickMe).toBe(ch1.pickMe);

      // Stats
      expect(ch2.physStr).toBe(ch1.physStr);
      expect(ch2.physDef).toBe(ch1.physDef);
      expect(ch2.magStr).toBe(ch1.magStr);
      expect(ch2.magDef).toBe(ch1.magDef);
      expect(ch2.weakTo).toBe(ch1.weakTo);
      expect(ch2.resist).toBe(ch1.resist);

      // Strings
      expect(ch2.selectStr).toBe(ch1.selectStr);
      expect(ch2.rest).toBe(ch1.rest);
      expect(ch2.block).toBe(ch1.block);
      expect(ch2.blockFail).toBe(ch1.blockFail);
      expect(ch2.blockYes).toBe(ch1.blockYes);

      // Taunts
      for (let i = 0; i < 5; i++) {
        expect(ch2.taunts[i]).toBe(ch1.taunts[i]);
      }

      // Fatality
      expect(ch2.fatality.cmdKey).toBe(ch1.fatality.cmdKey);
      expect(ch2.fatality.preFatal).toBe(ch1.fatality.preFatal);
      expect(ch2.fatality.fatalMove).toBe(ch1.fatality.fatalMove);

      // Moves
      for (let m = 0; m < 12; m++) {
        const m1 = ch1.moves[m];
        const m2 = ch2.moves[m];
        expect(m2.name).toBe(m1.name);
        expect(m2.cmdKey).toBe(m1.cmdKey);
        expect(m2.canSuper).toBe(m1.canSuper);
        expect(m2.element).toBe(m1.element);
        expect(m2.strength).toBe(m1.strength);
        expect(m2.target).toBe(m1.target);
        expect(m2.hit).toBe(m1.hit);
        expect(m2.miss).toBe(m1.miss);
        expect(m2.superMiss).toBe(m1.superMiss);

        // Status array
        for (let s = 0; s < m1.status.length; s++) {
          expect(m2.status[s]).toBe(m1.status[s]);
        }
      }

      // Trailing sections
      for (let i = 0; i < 5; i++) {
        expect(ch2.deathStr[i]).toBe(ch1.deathStr[i]);
        expect(ch2.killStr[i]).toBe(ch1.killStr[i]);
      }
      for (let i = 0; i < 4; i++) {
        expect(ch2.desc[i]).toBe(ch1.desc[i]);
      }
    });
  });
});
