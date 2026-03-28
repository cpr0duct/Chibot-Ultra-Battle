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
    socket.emit('room:select-result', { success: ok, commandKey });
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
