/**
 * ChUB 2000 — Command Input
 *
 * Text input with:
 * - Send on Enter key
 * - Command history (up/down arrows)
 * - Autocomplete for move names
 * - Emits battle:command to server
 */

(function () {
  var roomId = null;
  var playerIndex = 0;
  var isSpectator = false;

  var history = [];
  var historyIndex = -1;
  var moveNames = [];
  var autoItems = [];
  var autoIndex = -1;

  function init(_roomId, _playerIndex, _isSpectator) {
    roomId = _roomId;
    playerIndex = _playerIndex;
    isSpectator = _isSpectator;

    var input = document.getElementById('command-input');
    var sendBtn = document.getElementById('btn-send');
    var autoList = document.getElementById('autocomplete-list');

    if (!input) return;

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommand();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateHistory(1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        completeAutocomplete();
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });

    input.addEventListener('input', function () {
      updateAutocomplete(input.value);
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', sendCommand);
    }

    // Click on autocomplete item
    if (autoList) {
      autoList.addEventListener('click', function (e) {
        var item = e.target.closest('.autocomplete-item');
        if (item) {
          input.value = '/' + item.textContent.trim();
          hideAutocomplete();
          input.focus();
        }
      });
    }

    // Close autocomplete when clicking elsewhere
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.command-bar')) {
        hideAutocomplete();
      }
    });
  }

  // ── Send Command ──────────────────────────────────────────────────────

  function sendCommand() {
    var input = document.getElementById('command-input');
    var text = input.value.trim();
    if (!text) return;

    // Add to history
    if (history.length === 0 || history[history.length - 1] !== text) {
      history.push(text);
      if (history.length > 50) history.shift();
    }
    historyIndex = -1;

    // Emit to server
    ChubSocket.emit('battle:command', {
      roomId: roomId,
      command: text,
    });

    // Show in log
    BattleView.appendMessage('> ' + text, 'msg-system');

    input.value = '';
    hideAutocomplete();
  }

  // ── Command History ───────────────────────────────────────────────────

  function navigateHistory(direction) {
    var input = document.getElementById('command-input');
    if (history.length === 0) return;

    if (direction < 0) {
      // Up arrow: go back in history
      if (historyIndex === -1) {
        historyIndex = history.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      }
    } else {
      // Down arrow: go forward
      if (historyIndex >= 0 && historyIndex < history.length - 1) {
        historyIndex++;
      } else {
        historyIndex = -1;
        input.value = '';
        return;
      }
    }

    if (historyIndex >= 0 && historyIndex < history.length) {
      input.value = history[historyIndex];
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────

  function setMoveNames(names) {
    moveNames = names || [];
  }

  function updateAutocomplete(text) {
    var autoList = document.getElementById('autocomplete-list');
    if (!autoList) return;

    autoItems = [];
    autoIndex = -1;

    // Only autocomplete if starts with /
    if (!text || text.charAt(0) !== '/') {
      hideAutocomplete();
      return;
    }

    var query = text.substring(1).toLowerCase();
    if (query.length === 0) {
      hideAutocomplete();
      return;
    }

    // Built-in commands
    var builtins = ['block', 'rest', 'taunt', 'get', 'flee', 'defect'];
    var allNames = builtins.concat(moveNames);

    var matches = [];
    for (var i = 0; i < allNames.length; i++) {
      if (allNames[i].toLowerCase().indexOf(query) === 0) {
        matches.push(allNames[i]);
      }
    }

    if (matches.length === 0) {
      hideAutocomplete();
      return;
    }

    autoItems = matches.slice(0, 10);
    autoList.innerHTML = '';
    for (var j = 0; j < autoItems.length; j++) {
      var div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = autoItems[j];
      autoList.appendChild(div);
    }
    autoList.classList.add('active');
  }

  function completeAutocomplete() {
    if (autoItems.length === 0) return;

    var input = document.getElementById('command-input');
    if (autoIndex < 0) autoIndex = 0;
    else autoIndex = (autoIndex + 1) % autoItems.length;

    input.value = '/' + autoItems[autoIndex];

    // Highlight current
    var autoList = document.getElementById('autocomplete-list');
    var items = autoList.querySelectorAll('.autocomplete-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('selected', i === autoIndex);
    }
  }

  function hideAutocomplete() {
    var autoList = document.getElementById('autocomplete-list');
    if (autoList) {
      autoList.classList.remove('active');
      autoList.innerHTML = '';
    }
    autoItems = [];
    autoIndex = -1;
  }

  // Expose API
  window.CommandInput = {
    init: init,
    setMoveNames: setMoveNames,
  };
})();
