import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BattleRoom } from '../../engine/battle-room.js';
import { PLAYER_MOVE } from '../../engine/constants.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    maxPlayersPerRoom: 20,
    moveLoopInterval: 500,
    cpuTickInterval: 750,
    miscLoopInterval: 1000,
    ...overrides,
  };
}

function makeDataset(overrides = {}) {
  return {
    characters: [
      {
        fullName: 'TestChar',
        senshiId: 'testchar',
        physStr: 50,
        physDef: 50,
        magStr: 50,
        magDef: 50,
        taunts: ['Ha!'],
        moves: [
          null, // index 0 is unused
          { name: 'Punch', cmdKey: 'punch', element: 1, strength: 10, target: 2, canSuper: 0, status: new Array(33).fill(0), mpReq: 0, beginAttack: '%SN punches %T!', hit: '%SN hits %T!', miss: '%SN misses %T.' },
        ],
        fatality: { cmdKey: 'finish', preFatal: '', fatalMove: '' },
      },
      {
        fullName: 'OtherChar',
        senshiId: 'otherchar',
        physStr: 40,
        physDef: 40,
        magStr: 40,
        magDef: 40,
        taunts: [],
        moves: [],
        fatality: { cmdKey: '', preFatal: '', fatalMove: '' },
      },
    ],
    arenas: [
      {
        name: 'Test Arena',
        elements: new Array(31).fill(1),
        restLowHp: 10,
        restHighHp: 30,
        restLowMp: 5,
        restHighMp: 15,
        hpPerSecond: 0,
        mpPerSecond: 0,
        events: [],
      },
    ],
    items: [
      { name: 'Potion', spawnStr: 'A potion appears!', telefragStr: '', playerGet: '%P gets a potion!', playerHp: 50, playerMp: 0, playerStat: new Array(33).fill(0) },
    ],
    weapons: [],
    ...overrides,
  };
}

function makeRoom(overrides = {}) {
  const emitSpy = vi.fn();
  const config = makeConfig(overrides.config);
  const dataset = makeDataset(overrides.dataset);
  const room = new BattleRoom('room-1', dataset, config, emitSpy);
  return { room, emitSpy };
}

// ── Constructor ──────────────────────────────────────────────────────────────

describe('BattleRoom constructor', () => {
  it('creates a room in waiting phase', () => {
    const { room } = makeRoom();
    expect(room.phase).toBe('waiting');
    expect(room.id).toBe('room-1');
    expect(room.players).toEqual([]);
    expect(room.gameTime).toBe(0);
    expect(room.timers.move).toBeNull();
    expect(room.timers.cpu).toBeNull();
    expect(room.timers.misc).toBeNull();
    expect(room.battleType).toBe('teams');
  });
});

// ── Player management ────────────────────────────────────────────────────────

describe('addPlayer', () => {
  it('adds a player to the players array', () => {
    const { room, emitSpy } = makeRoom();
    const idx = room.addPlayer('Alice', 'socket-1');
    expect(idx).toBe(0);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].scrNam).toBe('Alice');
    expect(room.players[0].socketId).toBe('socket-1');
    expect(room.players[0].isCpu).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith('room:player-joined', expect.objectContaining({ scrNam: 'Alice' }));
  });

  it('returns -1 when room is full', () => {
    const { room } = makeRoom({ config: { maxPlayersPerRoom: 2 } });
    room.addPlayer('A', 's1');
    room.addPlayer('B', 's2');
    const idx = room.addPlayer('C', 's3');
    expect(idx).toBe(-1);
    expect(room.players).toHaveLength(2);
  });

  it('adds a CPU player', () => {
    const { room } = makeRoom();
    room.addPlayer('CpuBot', 'cpu-1', true, { wrath: 80 });
    expect(room.players[0].isCpu).toBe(true);
    expect(room.players[0].cpuPersonality.wrath).toBe(80);
  });
});

describe('removePlayer', () => {
  it('removes a player by socket id', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 'socket-1');
    room.addPlayer('Bob', 'socket-2');

    const removed = room.removePlayer('socket-1');
    expect(removed).toBe(true);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].scrNam).toBe('Bob');
    expect(emitSpy).toHaveBeenCalledWith('room:player-left', expect.objectContaining({ scrNam: 'Alice' }));
  });

  it('returns false for unknown socket id', () => {
    const { room } = makeRoom();
    const removed = room.removePlayer('nonexistent');
    expect(removed).toBe(false);
  });

  it('adjusts host index when host is removed', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.addPlayer('Bob', 's2');
    room.hostIndex = 1;

    room.removePlayer('s2');
    expect(room.hostIndex).toBe(0);
  });
});

describe('addCpuBot', () => {
  it('creates a CPU player with character data', () => {
    const { room, emitSpy } = makeRoom();
    const idx = room.addCpuBot(0, 2, { greed: 90 });
    expect(idx).toBe(0);
    expect(room.players[0].isCpu).toBe(true);
    expect(room.players[0].charId).toBe(0);
    expect(room.players[0].teamId).toBe(2);
    expect(room.players[0].cpuPersonality.greed).toBe(90);
    expect(room.players[0].character.fullName).toBe('TestChar');
    expect(emitSpy).toHaveBeenCalledWith('room:cpu-added', expect.objectContaining({ playerIndex: 0 }));
  });
});

describe('fillWithCpus', () => {
  it('adds the specified number of CPU bots', () => {
    const { room } = makeRoom();
    room.fillWithCpus(4);
    expect(room.players).toHaveLength(4);
    expect(room.players.every(p => p.isCpu)).toBe(true);
  });
});

describe('ezTeams', () => {
  it('distributes players evenly across two teams', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('A', 's1');
    room.addPlayer('B', 's2');
    room.addPlayer('C', 's3');
    room.addPlayer('D', 's4');

    room.ezTeams();

    expect(room.players[0].teamId).toBe(1);
    expect(room.players[1].teamId).toBe(2);
    expect(room.players[2].teamId).toBe(1);
    expect(room.players[3].teamId).toBe(2);
    expect(emitSpy).toHaveBeenCalledWith('room:teams-assigned', expect.any(Object));
  });
});

// ── Phase transitions ────────────────────────────────────────────────────────

describe('startSelection', () => {
  it('transitions from waiting to selection', () => {
    const { room, emitSpy } = makeRoom();
    room.startSelection();
    expect(room.phase).toBe('selection');
    expect(emitSpy).toHaveBeenCalledWith('phase:selection', expect.any(Object));
  });

  it('does nothing if not in waiting phase', () => {
    const { room } = makeRoom();
    room.phase = 'battle';
    room.startSelection();
    expect(room.phase).toBe('battle');
  });
});

describe('selectCharacter', () => {
  it('assigns character to player during selection phase', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.startSelection();

    const ok = room.selectCharacter(0, 'testchar');
    expect(ok).toBe(true);
    expect(room.players[0].charId).toBe(0);
    expect(room.players[0].character.fullName).toBe('TestChar');
    expect(emitSpy).toHaveBeenCalledWith('selection:character-chosen', expect.objectContaining({ charName: 'TestChar' }));
  });

  it('returns false if not in selection phase', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    const ok = room.selectCharacter(0, 'testchar');
    expect(ok).toBe(false);
  });

  it('returns false for unknown character key', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.startSelection();
    const ok = room.selectCharacter(0, 'nonexistent');
    expect(ok).toBe(false);
  });
});

// ── Battle lifecycle with fake timers ────────────────────────────────────────

describe('startBattle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('transitions to battle phase and starts timer intervals', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.addPlayer('Bob', 's2');
    room.phase = 'selection';

    room.startBattle();

    expect(room.phase).toBe('battle');
    expect(room.gameTime).toBe(0);
    expect(room.timers.move).not.toBeNull();
    expect(room.timers.cpu).not.toBeNull();
    expect(room.timers.misc).not.toBeNull();
    expect(emitSpy).toHaveBeenCalledWith('phase:battle', expect.any(Object));
  });

  it('does not start from ended phase', () => {
    const { room } = makeRoom();
    room.phase = 'ended';
    room.startBattle();
    expect(room.phase).toBe('ended');
  });

  it('initializes player HP if not set', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.players[0].maxHp = 500;
    room.players[0].hp = 0;
    room.phase = 'selection';

    room.startBattle();

    expect(room.players[0].hp).toBe(500);
  });

  it('assigns default arena if none selected', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';

    room.startBattle();
    expect(room.arena).not.toBeNull();
    expect(room.arena.name).toBe('Test Arena');
  });
});

describe('pause / unpause', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('pause clears timers and sets phase to paused', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    room.pause();

    expect(room.phase).toBe('paused');
    expect(room.timers.move).toBeNull();
    expect(room.timers.cpu).toBeNull();
    expect(room.timers.misc).toBeNull();
    expect(emitSpy).toHaveBeenCalledWith('phase:paused', expect.any(Object));
  });

  it('unpause restarts timers and sets phase to battle', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();
    room.pause();

    room.unpause();

    expect(room.phase).toBe('battle');
    expect(room.timers.move).not.toBeNull();
    expect(room.timers.cpu).not.toBeNull();
    expect(room.timers.misc).not.toBeNull();
  });

  it('pause does nothing if not in battle', () => {
    const { room } = makeRoom();
    room.pause();
    expect(room.phase).toBe('waiting');
  });

  it('unpause does nothing if not paused', () => {
    const { room } = makeRoom();
    room.unpause();
    expect(room.phase).toBe('waiting');
  });
});

describe('endBattle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('stops timers and transitions to ended', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    const results = room.endBattle();

    expect(room.phase).toBe('ended');
    expect(room.timers.move).toBeNull();
    expect(room.timers.cpu).toBeNull();
    expect(room.timers.misc).toBeNull();
    expect(results.roomId).toBe('room-1');
    expect(results.players).toHaveLength(1);
    expect(emitSpy).toHaveBeenCalledWith('phase:ended', expect.any(Object));
  });
});

// ── Timer loops ──────────────────────────────────────────────────────────────

describe('timer loops', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('moveLoop increments gameTime each tick', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    expect(room.gameTime).toBe(0);

    vi.advanceTimersByTime(500);
    expect(room.gameTime).toBe(1);

    vi.advanceTimersByTime(500);
    expect(room.gameTime).toBe(2);
  });

  it('moveLoop emits state-update events', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    emitSpy.mockClear();
    vi.advanceTimersByTime(500);

    expect(emitSpy).toHaveBeenCalledWith('battle:state-update', expect.objectContaining({
      roomId: 'room-1',
      gameTime: 1,
    }));
  });

  it('miscLoop emits state-update events', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    emitSpy.mockClear();
    vi.advanceTimersByTime(1000);

    const miscUpdates = emitSpy.mock.calls.filter(
      c => c[0] === 'battle:state-update'
    );
    // At 1000ms: 2 move ticks (500, 1000) + 1 misc tick
    expect(miscUpdates.length).toBeGreaterThanOrEqual(2);
  });

  it('timers stop after pause', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    vi.advanceTimersByTime(500);
    expect(room.gameTime).toBe(1);

    room.pause();
    vi.advanceTimersByTime(2000);
    // gameTime should not advance after pause
    expect(room.gameTime).toBe(1);
  });

  it('timers resume after unpause', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.phase = 'selection';
    room.startBattle();

    vi.advanceTimersByTime(500);
    expect(room.gameTime).toBe(1);

    room.pause();
    room.unpause();

    vi.advanceTimersByTime(500);
    expect(room.gameTime).toBe(2);
  });
});

// ── processCommand ───────────────────────────────────────────────────────────

describe('processCommand', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('routes select command during selection phase', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.startSelection();

    const result = room.processCommand(0, '/testchar');
    expect(result.success).toBe(true);
    expect(room.players[0].character.fullName).toBe('TestChar');
  });

  it('routes block command during battle phase', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.players[0].hp = 500;
    room.players[0].maxHp = 500;
    room.players[0].isAlive = true;
    room.phase = 'selection';
    room.startBattle();

    const result = room.processCommand(0, '/block');
    expect(result.success).toBe(true);
    expect(room.players[0].curMove).toBe(PLAYER_MOVE.BLOCK);
  });

  it('routes rest command during battle phase', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.players[0].hp = 500;
    room.players[0].maxHp = 500;
    room.phase = 'selection';
    room.startBattle();

    const result = room.processCommand(0, '/rest');
    expect(result.success).toBe(true);
    expect(room.players[0].curMove).toBe(PLAYER_MOVE.REST);
  });

  it('routes host begin command', () => {
    const { room } = makeRoom();
    room.addPlayer('Host', 's1');
    room.hostIndex = 0;
    room.phase = 'selection';

    const result = room.processCommand(0, '~begin');
    expect(result.success).toBe(true);
    expect(room.phase).toBe('battle');
  });

  it('rejects host commands from non-host', () => {
    const { room } = makeRoom();
    room.addPlayer('Host', 's1');
    room.addPlayer('Guest', 's2');
    room.hostIndex = 0;

    const result = room.processCommand(1, '~begin');
    expect(result.success).toBe(false);
    expect(result.message).toContain('host');
  });

  it('routes host pause and unpause', () => {
    const { room } = makeRoom();
    room.addPlayer('Host', 's1');
    room.hostIndex = 0;
    room.phase = 'selection';
    room.startBattle();

    const pauseResult = room.processCommand(0, '~pause');
    expect(pauseResult.success).toBe(true);
    expect(room.phase).toBe('paused');

    const unpauseResult = room.processCommand(0, '~unpause');
    expect(unpauseResult.success).toBe(true);
    expect(room.phase).toBe('battle');
  });

  it('routes host end command', () => {
    const { room } = makeRoom();
    room.addPlayer('Host', 's1');
    room.hostIndex = 0;
    room.phase = 'selection';
    room.startBattle();

    const result = room.processCommand(0, '~end');
    expect(result.success).toBe(true);
    expect(room.phase).toBe('ended');
  });

  it('routes get command to pick up item', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.players[0].hp = 300;
    room.players[0].maxHp = 500;
    room.phase = 'selection';
    room.startBattle();
    room.currentItem = {
      name: 'Potion',
      playerGet: '%P gets a potion!',
      playerHp: 50,
      playerMp: 0,
      playerStat: new Array(33).fill(0),
    };

    const result = room.processCommand(0, '/get');
    expect(result.success).toBe(true);
    expect(room.players[0].hp).toBe(350);
    expect(room.currentItem).toBeNull();
  });

  it('returns error for invalid player index', () => {
    const { room } = makeRoom();
    const result = room.processCommand(99, '/block');
    expect(result.success).toBe(false);
  });

  it('returns error for commands in wrong phase', () => {
    const { room } = makeRoom();
    room.addPlayer('Alice', 's1');
    // Still in 'waiting' phase
    const result = room.processCommand(0, '/block');
    expect(result.success).toBe(false);
  });

  it('routes taunt command', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.players[0].character = { taunts: ['Ha ha!'] };
    room.players[0].hp = 500;
    room.players[0].maxHp = 500;
    room.phase = 'selection';
    room.startBattle();

    const result = room.processCommand(0, '/taunt');
    expect(result.success).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('battle:message', expect.objectContaining({ message: 'Ha ha!' }));
  });
});

// ── Vote ─────────────────────────────────────────────────────────────────────

describe('vote', () => {
  it('transitions to voting phase and stores preferences', () => {
    const { room, emitSpy } = makeRoom();
    room.addPlayer('Alice', 's1');
    room.startSelection();

    room.vote(0, { battleType: 'ffa', arenaIndex: 0 });

    expect(room.phase).toBe('voting');
    expect(room.battleType).toBe('ffa');
    expect(room.arena.name).toBe('Test Arena');
    expect(emitSpy).toHaveBeenCalledWith('vote:cast', expect.any(Object));
  });
});

// ── Host kick command ────────────────────────────────────────────────────────

describe('host kick command', () => {
  it('removes a player by name', () => {
    const { room } = makeRoom();
    room.addPlayer('Host', 's1');
    room.addPlayer('Victim', 's2');
    room.hostIndex = 0;

    const result = room.processCommand(0, '~kick Victim');
    expect(result.success).toBe(true);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].scrNam).toBe('Host');
  });
});
