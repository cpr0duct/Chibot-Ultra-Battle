import { describe, it, expect } from 'vitest';
import { parseCommand } from '../../engine/command-parser.js';

describe('parseCommand', () => {
  // ── Select ─────────────────────────────────────────────────────────────────
  describe('select commands', () => {
    it('/cloud → select cloud', () => {
      expect(parseCommand('/cloud')).toEqual({ type: 'select', key: 'cloud' });
    });
  });

  // ── Move ───────────────────────────────────────────────────────────────────
  describe('move commands', () => {
    it('/braver cloud2 → move braver targeting cloud2', () => {
      expect(parseCommand('/braver cloud2')).toEqual({
        type: 'move', key: 'braver', target: 'cloud2', isSuper: false
      });
    });
  });

  // ── Super moves ────────────────────────────────────────────────────────────
  describe('super moves', () => {
    it('/s-braver cloud2 → super level 1', () => {
      expect(parseCommand('/s-braver cloud2')).toEqual({
        type: 'move', key: 'braver', target: 'cloud2', isSuper: true, superLevel: 1
      });
    });

    it('/3-braver cloud2 → super level 3', () => {
      expect(parseCommand('/3-braver cloud2')).toEqual({
        type: 'move', key: 'braver', target: 'cloud2', isSuper: true, superLevel: 3
      });
    });
  });

  // ── Move by number ─────────────────────────────────────────────────────────
  describe('move by number', () => {
    it('/1 → moveByNumber 1, no target', () => {
      expect(parseCommand('/1')).toEqual({
        type: 'moveByNumber', number: 1, target: undefined, isSuper: false
      });
    });

    it('/1 cloud2 → moveByNumber 1, target cloud2', () => {
      expect(parseCommand('/1 cloud2')).toEqual({
        type: 'moveByNumber', number: 1, target: 'cloud2', isSuper: false
      });
    });

    it('/12 → moveByNumber 12', () => {
      expect(parseCommand('/12')).toEqual({
        type: 'moveByNumber', number: 12, target: undefined, isSuper: false
      });
    });
  });

  // ── Block ──────────────────────────────────────────────────────────────────
  describe('block', () => {
    it('/block → block with no counter move', () => {
      expect(parseCommand('/block')).toEqual({ type: 'block' });
    });

    it('/block braver → block with counter move', () => {
      expect(parseCommand('/block braver')).toEqual({
        type: 'block', counterMove: 'braver'
      });
    });
  });

  // ── Rest ───────────────────────────────────────────────────────────────────
  describe('rest', () => {
    it('/rest → rest', () => {
      expect(parseCommand('/rest')).toEqual({ type: 'rest' });
    });
  });

  // ── Taunt ──────────────────────────────────────────────────────────────────
  describe('taunt', () => {
    it('/taunt → taunt', () => {
      expect(parseCommand('/taunt')).toEqual({ type: 'taunt' });
    });
  });

  // ── Divert ─────────────────────────────────────────────────────────────────
  describe('divert', () => {
    it('/divert 50 → divert amount 50', () => {
      expect(parseCommand('/divert 50')).toEqual({ type: 'divert', amount: 50 });
    });
  });

  // ── Info commands ──────────────────────────────────────────────────────────
  describe('info commands', () => {
    it('/moves → info moves', () => {
      expect(parseCommand('/moves')).toEqual({ type: 'info', subtype: 'moves' });
    });

    it('/status → info status', () => {
      expect(parseCommand('/status')).toEqual({ type: 'info', subtype: 'status' });
    });
  });

  // ── Get ────────────────────────────────────────────────────────────────────
  describe('get', () => {
    it('/get → get', () => {
      expect(parseCommand('/get')).toEqual({ type: 'get' });
    });
  });

  // ── Flee ───────────────────────────────────────────────────────────────────
  describe('flee', () => {
    it('/flee → flee', () => {
      expect(parseCommand('/flee')).toEqual({ type: 'flee' });
    });
  });

  // ── Defect ─────────────────────────────────────────────────────────────────
  describe('defect', () => {
    it('/defect player2 → defect targeting player2', () => {
      expect(parseCommand('/defect player2')).toEqual({
        type: 'defect', target: 'player2'
      });
    });
  });

  // ── Host commands ──────────────────────────────────────────────────────────
  describe('host commands', () => {
    it('~begin → host begin', () => {
      expect(parseCommand('~begin')).toEqual({ type: 'host', command: 'begin' });
    });

    it('~pause → host pause', () => {
      expect(parseCommand('~pause')).toEqual({ type: 'host', command: 'pause' });
    });

    it('~end → host end', () => {
      expect(parseCommand('~end')).toEqual({ type: 'host', command: 'end' });
    });

    it('~kick player2 → host kick with target', () => {
      expect(parseCommand('~kick player2')).toEqual({
        type: 'host', command: 'kick', target: 'player2'
      });
    });

    it('~hostboot player2 → host hostboot with target', () => {
      expect(parseCommand('~hostboot player2')).toEqual({
        type: 'host', command: 'hostboot', target: 'player2'
      });
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('extra whitespace is trimmed', () => {
      expect(parseCommand('  /cloud  ')).toEqual({ type: 'select', key: 'cloud' });
      expect(parseCommand('/braver   cloud2')).toEqual({
        type: 'move', key: 'braver', target: 'cloud2', isSuper: false
      });
    });

    it('empty input returns unknown', () => {
      expect(parseCommand('')).toEqual({ type: 'unknown', raw: '' });
      expect(parseCommand('   ')).toEqual({ type: 'unknown', raw: '   ' });
    });

    it('input without / or ~ prefix returns unknown', () => {
      expect(parseCommand('hello')).toEqual({ type: 'unknown', raw: 'hello' });
      expect(parseCommand('braver cloud2')).toEqual({ type: 'unknown', raw: 'braver cloud2' });
    });

    it('case insensitivity for command keys', () => {
      expect(parseCommand('/Cloud')).toEqual({ type: 'select', key: 'cloud' });
      expect(parseCommand('/BRAVER cloud2')).toEqual({
        type: 'move', key: 'braver', target: 'cloud2', isSuper: false
      });
      expect(parseCommand('/BLOCK')).toEqual({ type: 'block' });
      expect(parseCommand('/REST')).toEqual({ type: 'rest' });
      expect(parseCommand('/MOVES')).toEqual({ type: 'info', subtype: 'moves' });
      expect(parseCommand('~BEGIN')).toEqual({ type: 'host', command: 'begin' });
    });
  });
});
