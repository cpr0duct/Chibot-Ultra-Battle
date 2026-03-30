/**
 * Socket.IO room selection handlers — character selection, team assignment,
 * CPU management, voting.
 */

/**
 * Register room-phase event handlers on a socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {object} gameState
 */
export function setupRoomHandlers(socket, gameState) {

  // ── Select character ────────────────────────────────────────────────────
  socket.on('room:select-char', (data) => {
    const { roomId, commandKey } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    const playerIndex = socket.data.playerIndex;
    if (playerIndex === undefined) return;

    const ok = room.selectCharacter(playerIndex, commandKey);

    // Get character data including moves so the client can display them
    let charData = null;
    if (ok) {
      const player = room.players[playerIndex];
      if (player && player.character) {
        charData = {
          fullName: player.character.fullName,
          moves: (player.character.moves || [])
            .filter(m => m && m.name && m.name !== '')
            .map(m => ({
              name: m.name,
              cmdKey: m.cmdKey,
              element: m.element,
              strength: m.strength,
              target: m.target,
              canSuper: m.canSuper,
              mpReq: m.mpReq,
            })),
          fatality: player.character.fatality?.cmdKey ? {
            cmdKey: player.character.fatality.cmdKey,
          } : null,
        };
      }
    }

    socket.emit('room:select-result', { success: ok, commandKey, character: charData });
  });

  // ── Set team ────────────────────────────────────────────────────────────
  socket.on('room:set-team', (data) => {
    const { roomId, teamId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    const playerIndex = socket.data.playerIndex;
    if (playerIndex === undefined) return;

    room.setTeam(playerIndex, teamId);
  });

  // ── Add CPU bot ─────────────────────────────────────────────────────────
  socket.on('room:add-cpu', (data) => {
    const { roomId, charKey, teamId, personality } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    // Only host can add CPUs
    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can add CPUs.' });
      return;
    }

    // charKey is a character index into dataset.characters
    const charId = typeof charKey === 'number' ? charKey : 0;
    room.addCpuBot(charId, teamId || 1, personality || null);
  });

  // ── Remove CPU bot ──────────────────────────────────────────────────────
  socket.on('room:remove-cpu', (data) => {
    const { roomId, playerIndex } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can remove CPUs.' });
      return;
    }

    const player = room.players[playerIndex];
    if (player && player.isCpu) {
      room.removePlayer(player.socketId);
    }
  });

  // ── Set any player's team (host only) ───────────────────────────────────
  socket.on('room:set-player-team', (data) => {
    const { roomId, playerIndex, teamId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can change teams.' });
      return;
    }

    room.setTeam(playerIndex, teamId);
  });

  // ── Change CPU character (host only) ────────────────────────────────────
  socket.on('room:set-cpu-char', (data) => {
    const { roomId, playerIndex, commandKey } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can change CPU characters.' });
      return;
    }

    const player = room.players[playerIndex];
    if (!player || !player.isCpu) {
      socket.emit('room:error', { message: 'Not a CPU player.' });
      return;
    }

    room.selectCharacter(playerIndex, commandKey);
  });

  // ── EZ Teams ────────────────────────────────────────────────────────────
  socket.on('room:ez-teams', (data) => {
    const { roomId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can auto-assign teams.' });
      return;
    }

    room.ezTeams();
  });

  // ── Toggle turn-based mode ──────────────────────────────────────────────
  socket.on('room:set-turn-based', (data) => {
    const { roomId, enabled } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can change battle mode.' });
      return;
    }

    room.turnBased = !!enabled;
    room.emit('battle:message', {
      roomId: room.id,
      message: `Turn-based mode: ${room.turnBased ? 'ON' : 'OFF'}`,
    });
  });

  // ── Fill CPUs ───────────────────────────────────────────────────────────
  socket.on('room:fill-cpus', (data) => {
    const { roomId, count } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can fill CPUs.' });
      return;
    }

    room.fillWithCpus(count || 1);
  });

  // ── Vote ────────────────────────────────────────────────────────────────
  socket.on('room:vote', (data) => {
    const { roomId, battleType, arenaIndex } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    const playerIndex = socket.data.playerIndex;
    if (playerIndex === undefined) return;

    room.vote(playerIndex, { battleType, arenaIndex });
  });
}
