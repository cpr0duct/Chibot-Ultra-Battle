/**
 * Socket.IO battle handlers — in-battle commands and host controls.
 */

/**
 * Register battle-phase event handlers on a socket.
 *
 * @param {import('socket.io').Socket} socket
 * @param {object} gameState
 * @param {import('socket.io').Server} io
 */
export function setupBattleHandlers(socket, gameState, io) {

  // ── Player command (move, block, rest, etc.) or chat ─────────────────────
  socket.on('battle:command', (data) => {
    const { roomId, command } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    const playerIndex = socket.data.playerIndex;
    if (playerIndex === undefined) return;

    const trimmed = (command || '').trim();
    if (!trimmed) return;

    // Whisper: /msg <name> <message> or /t <name> <message>
    const whisperMatch = trimmed.match(/^\/(msg|t|tell|whisper)\s+(\S+)\s+(.+)$/i);
    if (whisperMatch) {
      const targetName = whisperMatch[2].toLowerCase();
      const whisperText = whisperMatch[3];
      const senderName = room.players[playerIndex]?.scrNam || 'Unknown';

      // Find target player's socket
      for (const p of room.players) {
        if (p && !p.isCpu && p.scrNam?.toLowerCase().includes(targetName)) {
          const targetSocket = io.sockets.sockets.get(p.socketId);
          if (targetSocket) {
            targetSocket.emit('battle:message', {
              roomId, message: `[whisper from ${senderName}]: ${whisperText}`, type: 'whisper'
            });
          }
          socket.emit('battle:message', {
            roomId, message: `[whisper to ${p.scrNam}]: ${whisperText}`, type: 'whisper'
          });
          return;
        }
      }
      socket.emit('battle:command-result', { success: false, message: 'Player not found.' });
      return;
    }

    // Plain chat (no slash prefix)
    if (!trimmed.startsWith('/')) {
      const senderName = room.players[playerIndex]?.scrNam || 'Player';
      io.to(roomId).emit('battle:message', {
        roomId, message: `${senderName}: ${trimmed}`, type: 'chat', playerIndex
      });
      return;
    }

    // Slash command
    const result = room.processCommand(playerIndex, command);
    socket.emit('battle:command-result', result);
  });

  // ── Host: begin battle ──────────────────────────────────────────────────
  socket.on('host:begin', (data) => {
    const { roomId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can start the battle.' });
      return;
    }

    room.startBattle();
  });

  // ── Host: pause ─────────────────────────────────────────────────────────
  socket.on('host:pause', (data) => {
    const { roomId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can pause.' });
      return;
    }

    room.pause();
  });

  // ── Host: unpause ───────────────────────────────────────────────────────
  socket.on('host:unpause', (data) => {
    const { roomId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can unpause.' });
      return;
    }

    room.unpause();
  });

  // ── Host: end battle ────────────────────────────────────────────────────
  socket.on('host:end', (data) => {
    const { roomId } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can end the battle.' });
      return;
    }

    room.endBattle();
  });

  // ── Host: kick player ──────────────────────────────────────────────────
  socket.on('host:kick', (data) => {
    const { roomId, playerIndex: targetIndex } = data || {};
    const room = gameState.rooms.get(roomId);
    if (!room) return;

    if (socket.data.playerIndex !== room.hostIndex) {
      socket.emit('room:error', { message: 'Only the host can kick players.' });
      return;
    }

    const target = room.players[targetIndex];
    if (!target) {
      socket.emit('room:error', { message: 'Player not found.' });
      return;
    }

    // Notify the kicked player's socket if they're not a CPU
    if (!target.isCpu) {
      const kickedSocket = io.sockets.sockets.get(target.socketId);
      if (kickedSocket) {
        kickedSocket.emit('room:kicked', { roomId });
        kickedSocket.leave(roomId);
        kickedSocket.data.roomId = null;
        kickedSocket.data.playerIndex = null;
      }
    }

    room.removePlayer(target.socketId);
  });
}
