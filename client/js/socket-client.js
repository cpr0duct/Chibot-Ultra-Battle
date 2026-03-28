/**
 * ChUB 2000 — Socket.IO Client Connection
 *
 * Connects to the server, handles reconnection, stores screen name.
 * Provides a simple API: ChubSocket.emit(), ChubSocket.on(), ChubSocket.socket
 */

(function () {
  var socket = null;
  var listeners = [];

  /** Get or set the player's screen name in sessionStorage */
  function getScreenName() {
    return sessionStorage.getItem('chub-screenName') || '';
  }

  function setScreenName(name) {
    sessionStorage.setItem('chub-screenName', name);
  }

  /** Connect to the server (auto-detect URL) */
  function connect() {
    if (socket && socket.connected) return socket;

    // io() is provided by /socket.io/socket.io.js
    socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', function () {
      console.log('[ChUB] Connected:', socket.id);
      // Re-fire any queued listeners
    });

    socket.on('disconnect', function (reason) {
      console.log('[ChUB] Disconnected:', reason);
    });

    socket.on('reconnect', function (attempt) {
      console.log('[ChUB] Reconnected after', attempt, 'attempts');
    });

    socket.on('connect_error', function (err) {
      console.warn('[ChUB] Connection error:', err.message);
    });

    // Re-register stored event listeners on the new socket
    for (var i = 0; i < listeners.length; i++) {
      socket.on(listeners[i].event, listeners[i].callback);
    }

    return socket;
  }

  /** Register a socket event listener (persists across reconnections) */
  function on(event, callback) {
    listeners.push({ event: event, callback: callback });
    if (socket) {
      socket.on(event, callback);
    }
  }

  /** Emit an event to the server */
  function emit(event, data) {
    if (!socket) connect();
    socket.emit(event, data);
  }

  /** Get the raw socket instance */
  function getSocket() {
    if (!socket) connect();
    return socket;
  }

  // Expose globally
  window.ChubSocket = {
    connect: connect,
    on: on,
    emit: emit,
    getSocket: getSocket,
    getScreenName: getScreenName,
    setScreenName: setScreenName,
  };
})();
