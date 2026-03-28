/**
 * ChUB 2000 — Battle Display
 *
 * Listens for Socket.IO events and updates the battle text log,
 * player status bars, arena info, and results overlay.
 */

(function () {
  var roomId = null;
  var playerIndex = 0;
  var isSpectator = false;
  var currentPhase = 'waiting';
  var playerStates = [];
  var userScrolledUp = false;

  // Status name lookup (matches engine/constants.js STATUS enum)
  var STATUS_NAMES = {
    1: 'MUTE', 2: 'CHAOS', 3: 'FREEZE', 4: 'POISON', 5: 'BLIND',
    6: 'INVINCIBLE', 7: 'HASTE', 8: 'MORPH', 9: 'SCARECROW',
    10: 'SLOW', 11: 'STUN', 12: 'RERAISE', 13: 'REGEN', 14: 'STOP',
    15: 'MUSHROOM', 16: 'MIA', 17: 'QUICK', 18: 'BERSERK', 19: 'SLEEP',
    20: 'VIRUS', 23: 'BARRIER', 24: 'M-BARRIER', 25: 'BLESS',
    26: 'CURSE', 27: 'CHARM', 28: 'PMS', 29: 'ZOMBIE', 30: 'HAMEDO'
  };

  // Team letters and CSS classes
  var TEAM_LETTERS = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
  var TEAM_CLASSES = ['', 'team-a', 'team-b', 'team-c', 'team-d', 'team-a', 'team-b'];

  function init(_roomId, _playerIndex, _isSpectator) {
    roomId = _roomId;
    playerIndex = _playerIndex;
    isSpectator = _isSpectator;

    var logEl = document.getElementById('battle-log');

    // Detect user scroll
    logEl.addEventListener('scroll', function () {
      var el = logEl;
      userScrolledUp = (el.scrollTop + el.clientHeight) < (el.scrollHeight - 30);
    });

    // Register socket events
    ChubSocket.on('battle:message', onMessage);
    ChubSocket.on('battle:state-update', onStateUpdate);
    ChubSocket.on('battle:command-result', onCommandResult);
    ChubSocket.on('room:player-joined', function (data) { onPlayerEvent(data, 'joined'); });
    ChubSocket.on('room:player-left', function (data) { onPlayerEvent(data, 'left'); });
    ChubSocket.on('room:cpu-added', function (data) { onPlayerEvent(data, 'cpu-added'); });
    ChubSocket.on('room:teams-assigned', onTeamsAssigned);
    ChubSocket.on('room:error', onRoomError);
    ChubSocket.on('selection:character-chosen', onCharChosen);
    ChubSocket.on('selection:team-set', onTeamSet);
  }

  // ── Message Log ──────────────────────────────────────────────────────────

  function classifyMessage(text) {
    var lower = text.toLowerCase();
    if (lower.indexOf('killed') >= 0 || lower.indexOf('has died') >= 0 || lower.indexOf('has been killed') >= 0) return 'msg-kill';
    if (lower.indexOf('fatality') >= 0) return 'msg-fatal';
    if (lower.indexOf('heals') >= 0 || lower.indexOf('regenerat') >= 0 || lower.indexOf('restore') >= 0 || lower.indexOf('heal') >= 0) return 'msg-heal';
    if (lower.indexOf('item') >= 0 || lower.indexOf('picked up') >= 0 || lower.indexOf('spawned') >= 0 || lower.indexOf('quad') >= 0) return 'msg-item';
    if (lower.indexOf('arena') >= 0 || lower.indexOf('earthquake') >= 0 || lower.indexOf('nuclear') >= 0 || lower.indexOf('lava') >= 0 || lower.indexOf('storm') >= 0) return 'msg-arena';
    if (lower.indexOf('damage') >= 0 || lower.indexOf('hits') >= 0 || lower.indexOf('attack') >= 0 || lower.indexOf('strikes') >= 0 || lower.indexOf('slash') >= 0) return 'msg-attack';
    if (lower.indexOf('poison') >= 0 || lower.indexOf('stun') >= 0 || lower.indexOf('frozen') >= 0 || lower.indexOf('haste') >= 0 || lower.indexOf('slow') >= 0) return 'msg-status';
    if (lower.indexOf('battle') >= 0 || lower.indexOf('started') >= 0 || lower.indexOf('paused') >= 0 || lower.indexOf('waiting') >= 0) return 'msg-system';
    return 'msg-default';
  }

  function appendMessage(text, cssClass) {
    var logEl = document.getElementById('battle-log');
    var div = document.createElement('div');
    div.className = 'msg ' + (cssClass || classifyMessage(text));
    div.textContent = text;
    logEl.appendChild(div);

    // Auto-scroll unless user scrolled up
    if (!userScrolledUp) {
      logEl.scrollTop = logEl.scrollHeight;
    }

    // Cap at 500 messages
    while (logEl.children.length > 500) {
      logEl.removeChild(logEl.firstChild);
    }
  }

  function onMessage(data) {
    if (data.roomId && data.roomId !== roomId) return;
    appendMessage(data.message || '');
  }

  function onCommandResult(data) {
    if (!data.success && data.message) {
      appendMessage(data.message, 'msg-system');
    }
  }

  function onRoomError(data) {
    appendMessage('Error: ' + (data.message || 'Unknown error'), 'msg-system');
  }

  // ── State Updates ────────────────────────────────────────────────────────

  function onStateUpdate(data) {
    if (data.roomId && data.roomId !== roomId) return;

    playerStates = data.players || [];
    renderStatusPanel(data);

    // Update status bar time
    var gameTime = data.gameTime || 0;
    var minutes = Math.floor(gameTime / 120);
    var seconds = Math.floor((gameTime % 120) / 2);
    document.getElementById('sb-time').textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    document.getElementById('sb-players').textContent = playerStates.length + ' players';
  }

  function renderStatusPanel(data) {
    var panel = document.getElementById('status-panel');
    var arenaInfo = document.getElementById('arena-info');

    // Remove existing player cards (not the arena info)
    var existing = panel.querySelectorAll('.player-status-card');
    for (var i = 0; i < existing.length; i++) {
      existing[i].remove();
    }

    var players = data.players || [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var card = document.createElement('div');
      card.className = 'player-status-card' + (p.isAlive ? '' : ' dead');

      var teamLetter = TEAM_LETTERS[p.teamId] || '?';
      var teamClass = TEAM_CLASSES[p.teamId] || 'team-a';

      // HP percentage and color class
      var hpPct = p.maxHp > 0 ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0;
      var hpColorClass = 'bar-fill-hp';
      if (hpPct <= 25) hpColorClass += ' hp-low';
      else if (hpPct <= 50) hpColorClass += ' hp-mid';

      var mpPct = p.maxMp > 0 ? Math.max(0, Math.min(100, (p.mp / p.maxMp) * 100)) : 0;
      var spMax = 300; // maxSuperPoints from config
      var spPct = Math.max(0, Math.min(100, (p.sp / spMax) * 100));

      // Status effects
      var statusHtml = '';
      if (p.status) {
        for (var s = 1; s <= 30; s++) {
          if (p.status[s] && p.status[s] > 0 && STATUS_NAMES[s]) {
            statusHtml += '<span class="status-badge">' + STATUS_NAMES[s] + '</span>';
          }
        }
      }

      card.innerHTML =
        '<div class="player-status-header">' +
          '<span class="player-name">' + escapeHtml(p.scrNam) + '</span>' +
          '<span class="team-badge ' + teamClass + '">' + teamLetter + '</span>' +
        '</div>' +
        '<div class="resource-bar">' +
          '<span class="bar-label bar-label-hp">HP</span>' +
          '<div class="bar-track"><div class="bar-fill ' + hpColorClass + '" style="width:' + hpPct + '%"></div></div>' +
          '<span class="bar-value">' + Math.floor(p.hp) + '/' + Math.floor(p.maxHp) + '</span>' +
        '</div>' +
        '<div class="resource-bar">' +
          '<span class="bar-label bar-label-mp">MP</span>' +
          '<div class="bar-track"><div class="bar-fill bar-fill-mp" style="width:' + mpPct + '%"></div></div>' +
          '<span class="bar-value">' + Math.floor(p.mp) + '/' + Math.floor(p.maxMp) + '</span>' +
        '</div>' +
        '<div class="resource-bar">' +
          '<span class="bar-label bar-label-sp">SP</span>' +
          '<div class="bar-track"><div class="bar-fill bar-fill-sp" style="width:' + spPct + '%"></div></div>' +
          '<span class="bar-value">' + Math.floor(p.sp) + '/' + spMax + '</span>' +
        '</div>' +
        (statusHtml ? '<div class="status-effects">' + statusHtml + '</div>' : '');

      panel.insertBefore(card, arenaInfo);
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Player Events (selection phase) ──────────────────────────────────────

  function onPlayerEvent(data, eventType) {
    if (data.roomId && data.roomId !== roomId) return;
    if (data.scrNam) {
      var verb = 'joined';
      if (eventType === 'left') verb = 'left the room';
      else if (eventType === 'cpu-added') verb = 'entered (CPU)';
      else verb = 'joined';
      appendMessage(data.scrNam + ' ' + verb, 'msg-system');
    }
  }

  function onTeamsAssigned(data) {
    if (data.roomId && data.roomId !== roomId) return;
    appendMessage('Teams auto-assigned!', 'msg-system');
  }

  function onCharChosen(data) {
    if (data.roomId && data.roomId !== roomId) return;
    appendMessage(data.charName + ' has entered the arena!', 'msg-system');
  }

  function onTeamSet(data) {
    if (data.roomId && data.roomId !== roomId) return;
  }

  // ── Info Panels (toolbar buttons) ────────────────────────────────────────

  function showMoves() {
    // Show the current player's moves in the log
    if (playerStates[playerIndex]) {
      appendMessage('--- Your Moves ---', 'msg-system');
      // Moves would be populated from character data sent by server
      appendMessage('(Move list requires character data from server)', 'msg-system');
    }
  }

  function showChars() {
    appendMessage('--- Characters in Battle ---', 'msg-system');
    for (var i = 0; i < playerStates.length; i++) {
      var p = playerStates[i];
      appendMessage('  [' + (TEAM_LETTERS[p.teamId] || '?') + '] ' + p.scrNam + (p.isAlive ? '' : ' (DEAD)'), 'msg-system');
    }
  }

  function showTeams() {
    appendMessage('--- Teams ---', 'msg-system');
    var teams = {};
    for (var i = 0; i < playerStates.length; i++) {
      var p = playerStates[i];
      var t = p.teamId || 0;
      if (!teams[t]) teams[t] = [];
      teams[t].push(p.scrNam);
    }
    for (var tid in teams) {
      appendMessage('  Team ' + (TEAM_LETTERS[tid] || tid) + ': ' + teams[tid].join(', '), 'msg-system');
    }
  }

  function showStats() {
    appendMessage('--- Battle Stats ---', 'msg-system');
    for (var i = 0; i < playerStates.length; i++) {
      var p = playerStates[i];
      appendMessage('  ' + p.scrNam + ' - HP: ' + Math.floor(p.hp) + '/' + Math.floor(p.maxHp), 'msg-system');
    }
  }

  function showResults(data) {
    var overlay = document.getElementById('results-overlay');
    var content = document.getElementById('results-content');

    var html = '';
    if (data.message) {
      html += '<p style="text-align:center;margin-bottom:12px;color:var(--accent-green);">' + escapeHtml(data.message) + '</p>';
    }

    html += '<table class="results-table">';
    html += '<tr><th>Player</th><th>Team</th><th>K</th><th>D</th><th>F</th><th>Dmg</th><th>Status</th></tr>';

    var players = data.players || [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var teamLetter = TEAM_LETTERS[p.teamId] || '?';
      var isWinner = data.winners && data.winners.indexOf(i) >= 0;
      var rowStyle = isWinner ? ' style="color:var(--accent-yellow);"' : '';
      html += '<tr' + rowStyle + '>' +
        '<td>' + escapeHtml(p.scrNam) + '</td>' +
        '<td>' + teamLetter + '</td>' +
        '<td>' + p.kills + '</td>' +
        '<td>' + p.deaths + '</td>' +
        '<td>' + p.fatalities + '</td>' +
        '<td>' + Math.floor(p.damageDealt) + '</td>' +
        '<td>' + (p.isAlive ? 'Alive' : 'Dead') + '</td>' +
      '</tr>';
    }
    html += '</table>';

    if (data.gameTime) {
      var minutes = Math.floor(data.gameTime / 120);
      var seconds = Math.floor((data.gameTime % 120) / 2);
      html += '<p style="text-align:center;margin-top:12px;color:var(--text-muted);font-size:0.8rem;">Duration: ' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds + '</p>';
    }

    content.innerHTML = html;
    overlay.classList.add('active');
  }

  // ── Phase Management ─────────────────────────────────────────────────────

  function setPhase(phase) {
    currentPhase = phase;
  }

  function getPhase() {
    return currentPhase;
  }

  // ── Arena Info ───────────────────────────────────────────────────────────

  function updateArena(name, item) {
    document.getElementById('arena-name').textContent = 'Arena: ' + (name || '---');
    document.getElementById('sb-arena').textContent = name || '---';
    if (item) {
      document.getElementById('item-name').textContent = 'Item: ' + item;
    } else {
      document.getElementById('item-name').textContent = '';
    }
  }

  // Expose API
  window.BattleView = {
    init: init,
    appendMessage: appendMessage,
    setPhase: setPhase,
    getPhase: getPhase,
    showMoves: showMoves,
    showChars: showChars,
    showTeams: showTeams,
    showStats: showStats,
    showResults: showResults,
    updateArena: updateArena,
    getPlayerStates: function () { return playerStates; },
  };
})();
