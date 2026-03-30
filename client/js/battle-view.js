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
  var lastKnownPlayers = [];
  var userScrolledUp = false;
  var playerMoves = [];

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

  function appendMessage(text, cssClass, msgPlayerIndex) {
    var logEl = document.getElementById('battle-log');
    var div = document.createElement('div');
    var cls = 'msg ' + (cssClass || classifyMessage(text));

    // Player attribution styling
    if (msgPlayerIndex !== undefined && msgPlayerIndex !== null && msgPlayerIndex >= 0) {
      if (msgPlayerIndex === playerIndex) {
        cls += ' msg-self';
      } else if (lastKnownPlayers && lastKnownPlayers[msgPlayerIndex] && lastKnownPlayers[msgPlayerIndex].isCpu) {
        cls += ' msg-cpu';
      }
    }

    div.className = cls;
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
    var cssClass = null;
    if (data.type === 'chat') cssClass = 'msg-chat';
    else if (data.type === 'whisper') cssClass = 'msg-whisper';
    appendMessage(data.message || '', cssClass, data.playerIndex);
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
    lastKnownPlayers = playerStates;
    renderStatusPanel(data);

    // Update arena display
    if (data.arenaName) {
      var arenaText = 'Arena: ' + data.arenaName;
      if (data.currentItem) arenaText += ' | Item: ' + data.currentItem;
      var arenaEl = document.getElementById('arena-info');
      if (arenaEl) arenaEl.textContent = arenaText;
    }

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
    var players = data.players || [];
    var existing = panel.querySelectorAll('.player-status-card');

    // Create cards only if count changed
    if (existing.length !== players.length) {
      for (var i = 0; i < existing.length; i++) existing[i].remove();
      for (var j = 0; j < players.length; j++) {
        var card = document.createElement('div');
        card.className = 'player-status-card';
        card.setAttribute('data-pi', j);
        card.innerHTML =
          '<div class="player-status-header">' +
            '<img class="player-portrait" src="" alt="" style="display:none">' +
            '<span class="player-name"></span>' +
            '<span class="team-badge"></span>' +
          '</div>' +
          '<div class="resource-bar">' +
            '<span class="bar-label bar-label-hp">HP</span>' +
            '<div class="bar-track"><div class="bar-fill bar-fill-hp" style="width:0%"></div></div>' +
            '<span class="bar-value hp-val"></span>' +
          '</div>' +
          '<div class="resource-bar">' +
            '<span class="bar-label bar-label-mp">MP</span>' +
            '<div class="bar-track"><div class="bar-fill bar-fill-mp" style="width:0%"></div></div>' +
            '<span class="bar-value mp-val"></span>' +
          '</div>' +
          '<div class="resource-bar">' +
            '<span class="bar-label bar-label-sp">SP</span>' +
            '<div class="bar-track"><div class="bar-fill bar-fill-sp" style="width:0%"></div></div>' +
            '<span class="bar-value sp-val"></span>' +
          '</div>' +
          '<div class="status-effects"></div>';
        panel.insertBefore(card, arenaInfo);
      }
      existing = panel.querySelectorAll('.player-status-card');
    }

    // Update each card in-place (no DOM rebuild = smooth CSS transitions)
    for (var k = 0; k < players.length; k++) {
      var p = players[k];
      var el = existing[k];
      if (!el) continue;

      // Dead state
      if (p.isAlive) el.classList.remove('dead');
      else el.classList.add('dead');

      // Portrait (set once)
      var portrait = el.querySelector('.player-portrait');
      if (portrait && p.charId !== undefined && p.charId >= 0) {
        var src = 'img/chars/' + p.charId + '.png';
        if (portrait.getAttribute('src') !== src) {
          portrait.setAttribute('src', src);
          portrait.style.display = '';
          portrait.onerror = function () { this.style.display = 'none'; };
        }
      }

      // Name + team (set once)
      var nameEl = el.querySelector('.player-name');
      if (nameEl && nameEl.textContent !== p.scrNam) nameEl.textContent = p.scrNam;

      var badge = el.querySelector('.team-badge');
      if (badge) {
        var teamLetter = TEAM_LETTERS[p.teamId] || '?';
        var teamClass = TEAM_CLASSES[p.teamId] || 'team-a';
        badge.textContent = teamLetter;
        badge.className = 'team-badge ' + teamClass;
      }

      // HP bar (update width + value only)
      var hpPct = p.maxHp > 0 ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0;
      var hpFill = el.querySelector('.bar-fill-hp');
      if (hpFill) {
        hpFill.style.width = hpPct + '%';
        hpFill.className = 'bar-fill bar-fill-hp' + (hpPct <= 25 ? ' hp-low' : hpPct <= 50 ? ' hp-mid' : '');
      }
      var hpVal = el.querySelector('.hp-val');
      if (hpVal) hpVal.textContent = Math.floor(p.hp) + '/' + Math.floor(p.maxHp);

      // MP bar
      var mpPct = p.maxMp > 0 ? Math.max(0, Math.min(100, (p.mp / p.maxMp) * 100)) : 0;
      var mpFill = el.querySelector('.bar-fill-mp');
      if (mpFill) mpFill.style.width = mpPct + '%';
      var mpVal = el.querySelector('.mp-val');
      if (mpVal) mpVal.textContent = Math.floor(p.mp) + '/' + Math.floor(p.maxMp);

      // SP bar
      var spMax = 300;
      var spPct = Math.max(0, Math.min(100, (p.sp / spMax) * 100));
      var spFill = el.querySelector('.bar-fill-sp');
      if (spFill) spFill.style.width = spPct + '%';
      var spVal = el.querySelector('.sp-val');
      if (spVal) spVal.textContent = Math.floor(p.sp) + '/' + spMax;

      // Status effects
      var statusEl = el.querySelector('.status-effects');
      if (statusEl) {
        var statusHtml = '';
        if (p.status) {
          for (var s = 1; s <= 30; s++) {
            if (p.status[s] && p.status[s] > 0 && STATUS_NAMES[s]) {
              statusHtml += '<span class="status-badge">' + STATUS_NAMES[s] + '</span>';
            }
          }
        }
        if (statusEl.innerHTML !== statusHtml) statusEl.innerHTML = statusHtml;
      }
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

  function setPlayerMoves(moves) {
    playerMoves = moves || [];
    renderMoveChips();
  }

  var pendingCmd = '';

  function renderMoveChips() {
    var container = document.getElementById('move-chips');
    if (!container) return;
    container.innerHTML = '';
    hideTargetPicker();
    if (!playerMoves.length) return;

    for (var i = 0; i < playerMoves.length; i++) {
      var m = playerMoves[i];
      if (!m || !m.cmdKey) continue;
      var btn = document.createElement('button');
      btn.className = 'move-btn';
      var label = (m.name || m.cmdKey);
      if (label.length > 22) label = label.substring(0, 20) + '..';
      btn.textContent = label;
      btn.title = (m.strength ? 'STR ' + m.strength : '') + (m.mpReq ? '  MP ' + m.mpReq : '');
      btn.setAttribute('data-cmd', '/' + m.cmdKey);
      btn.setAttribute('data-needs-target', m.target === 2 ? 'yes' : 'no');
      btn.addEventListener('click', onMoveClick);
      container.appendChild(btn);
    }

    // Utility buttons
    var utils = [
      { cmd: '/rest', label: 'Rest', target: false },
      { cmd: '/block', label: 'Block', target: false },
      { cmd: '/get', label: 'Get Item', target: false },
    ];
    for (var u = 0; u < utils.length; u++) {
      var ub = document.createElement('button');
      ub.className = 'move-btn move-btn-util';
      ub.textContent = utils[u].label;
      ub.setAttribute('data-cmd', utils[u].cmd);
      ub.setAttribute('data-needs-target', 'no');
      ub.addEventListener('click', onMoveClick);
      container.appendChild(ub);
    }
  }

  function onMoveClick(e) {
    var cmd = e.currentTarget.getAttribute('data-cmd');
    var needsTarget = e.currentTarget.getAttribute('data-needs-target') === 'yes';

    // Highlight selected button
    var allBtns = document.querySelectorAll('.move-btn');
    for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('selected');
    e.currentTarget.classList.add('selected');

    if (needsTarget) {
      pendingCmd = cmd;
      showTargetPicker();
    } else {
      // No target needed — put in input and send
      var input = document.getElementById('command-input');
      if (input) {
        input.value = cmd;
        input.focus();
      }
      hideTargetPicker();
    }
  }

  function showTargetPicker() {
    var picker = document.getElementById('target-picker');
    var list = document.getElementById('target-list');
    if (!picker || !list) return;

    list.innerHTML = '';

    // Get my team to show enemies
    var me = playerStates[playerIndex];
    var myTeam = me ? me.teamId : 0;

    for (var i = 0; i < playerStates.length; i++) {
      var p = playerStates[i];
      if (!p || !p.isAlive || p.hp <= 0) continue;
      if (p.teamId === myTeam) continue; // Skip allies

      var btn = document.createElement('button');
      btn.className = 'target-btn';

      // Portrait
      if (p.charId !== undefined && p.charId >= 0) {
        var img = document.createElement('img');
        img.src = 'img/chars/' + p.charId + '.png';
        img.alt = '';
        img.onerror = function () { this.style.display = 'none'; };
        btn.appendChild(img);
      }

      var nameSpan = document.createElement('span');
      nameSpan.textContent = p.scrNam;
      btn.appendChild(nameSpan);

      btn.setAttribute('data-name', p.scrNam);
      btn.addEventListener('click', function () {
        var targetName = this.getAttribute('data-name');
        var input = document.getElementById('command-input');
        if (input) {
          input.value = pendingCmd + ' ' + targetName;
          input.focus();
        }
        hideTargetPicker();
        // Clear button selection
        var allBtns = document.querySelectorAll('.move-btn');
        for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('selected');
      });

      list.appendChild(btn);
    }

    picker.classList.remove('hidden');
  }

  function hideTargetPicker() {
    var picker = document.getElementById('target-picker');
    if (picker) picker.classList.add('hidden');
    pendingCmd = '';
  }

  // Wire cancel button
  setTimeout(function () {
    var cancelBtn = document.getElementById('target-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      hideTargetPicker();
      var allBtns = document.querySelectorAll('.move-btn');
      for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('selected');
    });
  }, 100);

  function showMoves() {
    appendMessage('--- Your Moves ---', 'msg-system');
    if (playerMoves.length === 0) {
      appendMessage('  (No moves available — select a character first)', 'msg-system');
      return;
    }
    for (var i = 0; i < playerMoves.length; i++) {
      var m = playerMoves[i];
      var line = '  ' + (i + 1) + '. ' + (m.name || '???');
      if (m.cmdKey) line += '  /' + m.cmdKey;
      if (m.element) line += '  [' + m.element + ']';
      if (m.strength) line += '  str:' + m.strength;
      if (m.mpReq) line += '  mp:' + m.mpReq;
      if (m.canSuper) line += '  (super)';
      appendMessage(line, 'msg-system');
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
      var rowStyle = isWinner ? ' style="background:rgba(76,175,80,0.2);font-weight:bold;"' : '';
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
    setPlayerMoves: setPlayerMoves,
    showMoves: showMoves,
    showChars: showChars,
    showTeams: showTeams,
    showStats: showStats,
    showResults: showResults,
    updateArena: updateArena,
    getPlayerStates: function () { return playerStates; },
  };
})();
