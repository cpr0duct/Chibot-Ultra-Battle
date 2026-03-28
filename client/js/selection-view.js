/**
 * ChUB 2000 — Selection Phase View
 *
 * Shows character list (searchable), player slots with team assignments,
 * and host controls for CPU bots and team assignment.
 */

(function () {
  var roomId = null;
  var playerIndex = 0;
  var isSpectator = false;
  var characters = [];
  var selectedCharKey = null;

  var CPU_PERSONALITIES = {
    '': null,
    aggressive: { goodwill: 20, greed: 30, wrath: 90, arrogance: 80 },
    defensive: { goodwill: 70, greed: 40, wrath: 20, arrogance: 30 },
    greedy: { goodwill: 30, greed: 90, wrath: 40, arrogance: 60 },
    random: { goodwill: 50, greed: 50, wrath: 50, arrogance: 50 },
  };

  function init(_roomId, _playerIndex, _isSpectator) {
    roomId = _roomId;
    playerIndex = _playerIndex;
    isSpectator = _isSpectator;

    // Bind search
    var searchInput = document.getElementById('char-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterCharacters(searchInput.value);
      });
    }

    // Bind control buttons
    bindButton('btn-add-cpu', handleAddCpu);
    bindButton('btn-fill-cpus', handleFillCpus);
    bindButton('btn-ez-teams', handleEzTeams);
    bindButton('btn-ready', handleReady);

    // Listen for room state events to populate character list
    ChubSocket.on('room:player-joined', updateSlots);
    ChubSocket.on('room:player-left', updateSlots);
    ChubSocket.on('room:cpu-added', updateSlots);
    ChubSocket.on('room:teams-assigned', updateSlots);
    ChubSocket.on('selection:character-chosen', onCharChosen);
    ChubSocket.on('selection:team-set', updateSlots);
    ChubSocket.on('room:select-result', onSelectResult);
    ChubSocket.on('battle:state-update', onStateForSlots);

    // Fetch character list from server status endpoint
    loadCharacterList();
  }

  function bindButton(id, handler) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', handler);
  }

  // ── Character List ───────────────────────────────────────────────────────

  function loadCharacterList() {
    fetch('api/characters')
      .then(function (res) { return res.json(); })
      .then(function (list) {
        if (Array.isArray(list)) {
          characters = list;
        }
        renderCharacterGrid();
      })
      .catch(function () {
        // Fallback: render empty grid with instruction
        renderCharacterGrid();
      });
  }

  function renderCharacterGrid() {
    var grid = document.getElementById('char-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (characters.length === 0) {
      grid.innerHTML = '<div class="text-muted" style="grid-column:1/-1;text-align:center;padding:20px;">Type /charname in the command bar to select a character</div>';
      return;
    }

    for (var i = 0; i < characters.length; i++) {
      var ch = characters[i];
      var card = document.createElement('div');
      card.className = 'char-card';
      card.setAttribute('data-index', i);
      card.setAttribute('data-name', (ch.fullName || '').toLowerCase());
      card.setAttribute('data-id', ch.senshiId || '');

      card.innerHTML =
        '<div class="char-name">' + escapeHtml(ch.fullName || 'Unknown') + '</div>' +
        '<div class="char-species">' + escapeHtml(ch.species || '') + '</div>';

      card.addEventListener('click', handleCharClick);
      grid.appendChild(card);
    }
  }

  function filterCharacters(query) {
    var grid = document.getElementById('char-grid');
    if (!grid) return;

    var cards = grid.querySelectorAll('.char-card');
    var q = (query || '').toLowerCase();

    for (var i = 0; i < cards.length; i++) {
      var name = cards[i].getAttribute('data-name') || '';
      var id = cards[i].getAttribute('data-id') || '';
      var visible = q === '' || name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      cards[i].style.display = visible ? '' : 'none';
    }
  }

  function handleCharClick(e) {
    var card = e.target.closest('.char-card');
    if (!card) return;

    // Deselect previous
    var grid = document.getElementById('char-grid');
    var prev = grid.querySelector('.char-card.selected');
    if (prev) prev.classList.remove('selected');

    card.classList.add('selected');

    var idx = parseInt(card.getAttribute('data-index'), 10);
    var charId = card.getAttribute('data-id');
    selectedCharKey = charId || card.querySelector('.char-name').textContent;

    // Send selection to server
    ChubSocket.emit('room:select-char', {
      roomId: roomId,
      commandKey: selectedCharKey,
    });
  }

  function onSelectResult(data) {
    if (data.success) {
      BattleView.appendMessage('Character selected: ' + (selectedCharKey || ''), 'msg-system');
      // Update move names for autocomplete
      if (characters.length > 0 && selectedCharKey) {
        var ch = characters.find(function (c) {
          return c.senshiId === selectedCharKey || c.fullName === selectedCharKey;
        });
        if (ch && ch.moves) {
          var names = [];
          for (var i = 0; i < ch.moves.length; i++) {
            if (ch.moves[i] && ch.moves[i].cmdKey) {
              names.push(ch.moves[i].cmdKey);
            }
          }
          CommandInput.setMoveNames(names);
        }
      }
    } else {
      BattleView.appendMessage('Character not found. Try another name.', 'msg-system');
    }
  }

  function onCharChosen(data) {
    // Another player chose a character
  }

  // ── Player Slots ─────────────────────────────────────────────────────────

  function onStateForSlots(data) {
    if (data.roomId && data.roomId !== roomId) return;
    renderPlayerSlots(data.players || []);
  }

  function updateSlots(data) {
    // Slots are refreshed via state-update, nothing extra needed here
  }

  function renderPlayerSlots(players) {
    var container = document.getElementById('player-slots');
    if (!container) return;

    container.innerHTML = '';

    var TEAM_LETTERS = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
    var TEAM_CLASSES = ['', 'team-a', 'team-b', 'team-c', 'team-d', 'team-a', 'team-b'];

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var slot = document.createElement('div');
      slot.className = 'player-slot';

      var teamLetter = TEAM_LETTERS[p.teamId] || '?';
      var teamClass = TEAM_CLASSES[p.teamId] || 'team-a';

      slot.innerHTML =
        '<div>' +
          '<div class="slot-name">' + escapeHtml(p.scrNam) + '</div>' +
          '<div class="slot-char text-muted">' + (p.charName || '') + '</div>' +
        '</div>' +
        '<span class="team-badge ' + teamClass + ' slot-team">' + teamLetter + '</span>';

      container.appendChild(slot);
    }
  }

  // ── Host Controls ────────────────────────────────────────────────────────

  function handleAddCpu() {
    var personalityKey = document.getElementById('cpu-personality').value;
    var personality = CPU_PERSONALITIES[personalityKey] || null;

    // Add one CPU with a random character
    ChubSocket.emit('room:add-cpu', {
      roomId: roomId,
      charKey: Math.floor(Math.random() * Math.max(1, characters.length)),
      teamId: 0, // Server will assign
      personality: personality,
    });
  }

  function handleFillCpus() {
    var count = parseInt(prompt('How many CPUs to add?', '4'), 10);
    if (!count || count < 1) return;
    ChubSocket.emit('room:fill-cpus', {
      roomId: roomId,
      count: count,
    });
  }

  function handleEzTeams() {
    ChubSocket.emit('room:ez-teams', {
      roomId: roomId,
    });
  }

  function handleReady() {
    // Host clicks Ready/Begin to start the battle
    ChubSocket.emit('host:begin', { roomId: roomId });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // Expose API
  window.SelectionView = {
    init: init,
  };
})();
