import { describe, it, expect } from 'vitest';
import { spawnItem, pickupItem } from '../../engine/items.js';
import { STATUS, MAX_STATUS } from '../../engine/constants.js';
import { createPlayer, createItem } from '../../engine/types.js';

/** Helper: create a player for testing */
function makePlayer(overrides = {}) {
  const p = createPlayer();
  p.hp = 300;
  p.maxHp = 500;
  p.mp = 50;
  p.maxMp = 200;
  p.scrNam = 'TestPlayer';
  Object.assign(p, overrides);
  return p;
}

/** Helper: create an item with known properties */
function makeItem(overrides = {}) {
  const item = createItem();
  Object.assign(item, overrides);
  return item;
}

// ── spawnItem ─────────────────────────────────────────────────────────────

describe('spawnItem', () => {
  it('spawns an item when no current item exists', () => {
    const items = [
      makeItem({ name: 'Potion', spawnStr: 'A potion appears!' }),
      makeItem({ name: 'Ether', spawnStr: 'An ether appears!' }),
    ];
    const rand = () => 0; // picks first item

    const result = spawnItem(items, null, { rand });
    expect(result.item.name).toBe('Potion');
    expect(result.messages).toEqual(['A potion appears!']);
  });

  it('includes telefrag message when replacing an existing item', () => {
    const oldItem = makeItem({ name: 'OldItem', telefragStr: 'OldItem was destroyed!' });
    const items = [
      makeItem({ name: 'NewItem', spawnStr: 'NewItem spawns!' }),
    ];
    const rand = () => 0;

    const result = spawnItem(items, oldItem, { rand });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe('OldItem was destroyed!');
    expect(result.messages[1]).toBe('NewItem spawns!');
    expect(result.item.name).toBe('NewItem');
  });

  it('returns null item when available items is empty', () => {
    const result = spawnItem([], null);
    expect(result.item).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it('picks a random item from the list', () => {
    const items = [
      makeItem({ name: 'A', spawnStr: 'A!' }),
      makeItem({ name: 'B', spawnStr: 'B!' }),
      makeItem({ name: 'C', spawnStr: 'C!' }),
    ];
    const rand = (min, max) => 2; // picks third item

    const result = spawnItem(items, null, { rand });
    expect(result.item.name).toBe('C');
  });

  it('does not include telefrag when current item has no name', () => {
    const oldItem = makeItem({ name: '', telefragStr: 'Should not appear' });
    const items = [makeItem({ name: 'Item', spawnStr: 'Item spawns!' })];
    const rand = () => 0;

    const result = spawnItem(items, oldItem, { rand });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toBe('Item spawns!');
  });
});

// ── pickupItem ────────────────────────────────────────────────────────────

describe('pickupItem', () => {
  it('applies HP from item', () => {
    const p = makePlayer({ hp: 300, maxHp: 500 });
    const item = makeItem({ name: 'Potion', playerGet: '%P picked up a Potion!', playerHp: 100 });

    const result = pickupItem(p, item);
    expect(p.hp).toBe(400);
    expect(result.messages).toContain('TestPlayer picked up a Potion!');
  });

  it('applies MP from item', () => {
    const p = makePlayer({ mp: 50, maxMp: 200 });
    const item = makeItem({ name: 'Ether', playerGet: '%P got Ether!', playerMp: 80 });

    const result = pickupItem(p, item);
    expect(p.mp).toBe(130);
  });

  it('caps HP at maxHp', () => {
    const p = makePlayer({ hp: 450, maxHp: 500 });
    const item = makeItem({ name: 'MegaPotion', playerHp: 200 });

    pickupItem(p, item);
    expect(p.hp).toBe(500);
  });

  it('caps MP at maxMp', () => {
    const p = makePlayer({ mp: 190, maxMp: 200 });
    const item = makeItem({ name: 'MegaEther', playerMp: 100 });

    pickupItem(p, item);
    expect(p.mp).toBe(200);
  });

  it('applies status effects by percentage chance — succeeds', () => {
    const p = makePlayer();
    const item = makeItem({ name: 'StatusItem' });
    item.playerStat[STATUS.HASTE] = 100; // 100% chance

    // rand returns 1 (always <= 100%)
    pickupItem(p, item, { rand: () => 1, gameTime: 50 });
    expect(p.status[STATUS.HASTE]).toBe(50);
  });

  it('applies status effects by percentage chance — fails', () => {
    const p = makePlayer();
    const item = makeItem({ name: 'StatusItem' });
    item.playerStat[STATUS.POISON] = 30; // 30% chance

    // rand returns 50 (> 30%), should not apply
    pickupItem(p, item, { rand: () => 50 });
    expect(p.status[STATUS.POISON]).toBe(0);
  });

  it('applies multiple status effects independently', () => {
    const p = makePlayer();
    const item = makeItem({ name: 'MultiItem' });
    item.playerStat[STATUS.HASTE] = 100;
    item.playerStat[STATUS.REGEN] = 100;

    pickupItem(p, item, { rand: () => 1, gameTime: 10 });
    expect(p.status[STATUS.HASTE]).toBe(10);
    expect(p.status[STATUS.REGEN]).toBe(10);
  });

  it('substitutes %P in playerGet message', () => {
    const p = makePlayer({ scrNam: 'Alice' });
    const item = makeItem({ playerGet: '%P found the treasure!' });

    const result = pickupItem(p, item);
    expect(result.messages[0]).toBe('Alice found the treasure!');
  });
});
