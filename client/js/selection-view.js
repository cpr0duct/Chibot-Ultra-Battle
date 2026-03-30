/**
 * ChUB 2000 — Selection Phase View
 *
 * Shows character list (searchable, filterable by franchise), player slots
 * with team assignments, and host controls for CPU bots and team assignment.
 */

(function () {
  var roomId = null;
  var playerIndex = 0;
  var isSpectator = false;
  var characters = [];
  var selectedCharKey = null;
  var activeCategory = 'All';
  var isHost = false;
  var descriptionMap = {}; // index → description string

  var CPU_PERSONALITIES = {
    '': null,
    aggressive: { goodwill: 20, greed: 30, wrath: 90, arrogance: 80 },
    defensive: { goodwill: 70, greed: 40, wrath: 20, arrogance: 30 },
    greedy: { goodwill: 30, greed: 90, wrath: 40, arrogance: 60 },
    random: { goodwill: 50, greed: 50, wrath: 50, arrogance: 50 },
  };

  // ── Franchise Detection ─────────────────────────────────────────────────

  var FRANCHISE_RULES = [
    // ── Sailor Moon (largest — civvie names, villains, Stars, SuperS, movies) ──
    { name: 'Sailor Moon', test: function(n) {
      return /sailor|senshi|tuxedo|chibi|moon|SailorStar|Sailorcoronis|Sailorchuu/i.test(n) ||
        /^(Ami$|Rei$|Usagi|Setsuna|Seiya|Taiki|Yaten|Sanjouin|Zoisite|Wiseman|Zirconia|Rubeus|Saffiru|Esmeraude|Beruche|Cooan|Ail$|Jadeite|CereCere|VesVes|JunJun|Cyprine|Ptilol|Tellu|Eudial|Viluy|Mimete|Kunzite|Black Lady|Galaxia)/i.test(n) ||
        /^(Queen Beryl|Queen Metallia|Queen Nehelenia|Queen Vadiana|Queen Serenity|Neo-Queen)/i.test(n) ||
        /^(Princess Snow Kaguya|Prince Dimando|Prince Endymion|Evil Prince Endymion)/i.test(n) ||
        /^(Haruka|Hotaru|Michiru|Minako|Makoto|Makato|Mamoru)$/i.test(n) ||
        /^(Helios|Pegasus|Peruru|Kaitou Ace|Kaolinite|Mistress 9)$/i.test(n) ||
        /^(Miss Haruna|Osaka Naru|Naoko Takeuchi|ParaPara|Petz|Phobos|Nephrite)$/i.test(n) ||
        /^(Fiore|Fish Eye|Tiger Eye|Hawk Eye|Luna$|Artemis$|Diana$)/i.test(n) ||
        /^(Tetis|The Makaiju|Tsukikage no Knight|The Dream Princess|Veena$)/i.test(n) ||
        /^(Angel CrsisMoon|Aquarias|ChibChib|Techniclon|Ririka)/i.test(n);
    }},
    // ── Dragon Ball Z (Androids, Majin, movies, GT) ──
    { name: 'Dragon Ball', test: function(n) {
      return /^(Goku|Gohan|Vegeta|Trunks|Piccolo|Krillin|Cell|Frieza|Freeza|Gotenks|Goten)/i.test(n) ||
        /^(Buu|Raditz|Nappa|Yamcha|Tien|Chaozu|Puar|Kaioushin|Kibito|Dabura)/i.test(n) ||
        /^(Tapion|Bojack|Brolli|Zarbon|Recoom|Baata|Ginyu|Jees|Nail$)/i.test(n) ||
        /^(SSJ|Super Goku|Super Vegeta|Super Buu|Super #17|Ultimate Gojiita)/i.test(n) ||
        /^(Nicky|Koola|Kooler|Turles|Ubuu|Vegetto|Vegeta-Bebi|Bebi)/i.test(n) ||
        /^(Zangya|Mirai|Mister Satan|Master Roshi|Videl|Great Saiyaman)/i.test(n) ||
        /^(Lord Slug|Dende|The Eldest Namek|Garlic Jr|Hildegarn)/i.test(n) ||
        /^(Janesha|Janemba|Janenba|Kaiou-bit|Pan$)/i.test(n) ||
        /^(Majin Babidi|Majin Buu|#14|#15|Artificial \d)/i.test(n) ||
        /^(Zanryutyou|Buburan|Guld)/i.test(n);
    }},
    // ── Pokemon ──
    { name: 'Pokemon', test: function(n) {
      return /^(Ash Ketchum|Pikachu|Bulbasaur|Charmander|Squirtle|Caterpie|Weedle)/i.test(n) ||
        /^(Pidgey|Pidgeotto|Rattata|Fearow|Spearow|Ekans|Arbok)/i.test(n) ||
        /^(Nidoran|Nidoking|Nidoqueen|Nidorina|Nidorino)/i.test(n) ||
        /^(Clefairy|Clefable|Sandshrew|Sandslash|Meowth|Persian)/i.test(n) ||
        /^(Metapod|Butterfree|Beedrill|Kakuna|Ivysaur|Charmeleon|Charizard)/i.test(n) ||
        /^(Wartortle|Blastoise|Venusaur|Pidgeot|Sabrina|Raichu)/i.test(n) ||
        /^(Mew$|Mewtwo|Missingno|Lapras|Team Rocket|Eevee)/i.test(n);
    }},
    // ── Capcom (Street Fighter, Darkstalkers, Rival Schools, Mega Man, RE) ──
    { name: 'Capcom', test: function(n) {
      return /^(Chun Li|Ryu$|Akuma|Zangief|Ken Masters|Sakura$|Gill$)/i.test(n) ||
        /^(Roll$|Strider|Captin Commando|Mega Man|MegaMan|Shadow Lady)/i.test(n) ||
        /^(Anakaris|Aulbath|Bishamon|Bulleta|Donovan|Felicia|Galion)/i.test(n) ||
        /^(Jedah|Lilith|Morrigan|Pyron|Sasquatch|Victor Gerdenheim)/i.test(n) ||
        /^(Demitri Maximoff|Gallon|Lei-Lei|Lord Zabel)/i.test(n) ||
        /^(Jin$|Batsu|Hayato|Kyosuke|Hinata$|Natsu$)/i.test(n) ||
        /^(Claire Redfield|Leon$|Legendary Zero|M\.Bison)/i.test(n);
    }},
    // ── Mario + Super Mario RPG ──
    { name: 'Mario', test: function(n) {
      return /^(Mario|Luigi|Bowser|Baby Bowser|Princess Toadstool|bigbowser)/i.test(n) ||
        /^(shy guy|sumo brother|TryClyde|A Magikoopa|Kamek|Neo-Kamek)/i.test(n) ||
        /^(Geno|Mallow|Mack$|Exor|Jinx|Johnathan Jones|King Calimari|Dodo$)/i.test(n) ||
        /^(Culex|Croco|Valentina|Bowyer|Yaridovich|Smithy|belome|Raspberry)/i.test(n);
    }},
    // ── Final Fantasy (7, 6, Tactics) ──
    { name: 'Final Fantasy', test: function(n) {
      return /^(Aeris|Barret|Bizzaro\*Seph|Cait Sith|Chocobo|Cid Highwind|Cloud Strife)/i.test(n) ||
        /^(Red XIII|Safer\*Seph|Jenova|Tifa Lockhart|Yuffie Kisaragi|Mog$)/i.test(n) ||
        /^(Galian Beast|Midgar Zolom)/i.test(n) ||
        /^(Cyan Garamonde|Relm|Supa Gau$)/i.test(n) ||
        /^(Olan$|Gafgarion|Dalton)/i.test(n);
    }},
    // ── Zelda ──
    { name: 'Zelda', test: function(n) {
      return /^(Adult Link|Young Link|Link$|Princess Zelda|Sheik$|Ganon|Sheikah)/i.test(n) ||
        /^(Darunia|Saria|Nabooru|Impa$|ReDead|Stalfos)/i.test(n) ||
        /^(Gerudo Guard|Kaepora Gaebora|Moblin|Poe$|Wort$)/i.test(n) ||
        /^(The Cucco Lady|The Running Man|Princess Ruto)/i.test(n);
    }},
    // ── Marvel ──
    { name: 'Marvel', test: function(n) {
      return /^(Iron Man|Wolverine|Spiderman|Cyclops|Storm$|Psylocke|Gambit)/i.test(n) ||
        /^(Havok|Sentinel|Captin America|Venom$|War Machine|Polaris)/i.test(n) ||
        /^(Hulk|Jubilee|Callisto|Darkchild|Mystique|spawn$|AntiSpawn)/i.test(n);
    }},
    // ── Record of Lodoss War ──
    { name: 'Lodoss War', test: function(n) {
      return /^(Deedlit|Emperor Beld|Etoh|Ghim|Karla$|King Fahn|King Kashue)/i.test(n) ||
        /^(Leylia|Lord Ashram|Neese|Orson|Parn|Pirotessa)/i.test(n) ||
        /^(Shiris|Slayn|Wagnard|Woodchuck)/i.test(n);
    }},
    // ── Ronin Warriors ──
    { name: 'Ronin Warriors', test: function(n) {
      return /^(Ryo of|Rowen of|Sage of|Sai of|Cye$|Kento of)/i.test(n) ||
        /^(Anubis of|Dais of|Sekhmet of|Cale of|Kale of|Lady Kayura)/i.test(n) ||
        /^(Hariel of|Mukara of|RoNiN|Kaos)/i.test(n);
    }},
    // ── Star Wars ──
    { name: 'Star Wars', test: function(n) {
      return /^(Death Star|Princess Leia|Chewbacca|R2-D2|C-3P0|Obi-Wan|Chadra-Fan|Luke Skywalker)/i.test(n);
    }},
    // ── Wrestling ──
    { name: 'Wrestling', test: function(n) {
      return /^(Gangrel|Kane$|Mankind|Undertaker)/i.test(n);
    }},
    // ── Undertale ──
    { name: 'Undertale', test: function(n) {
      return /^(Sans|Papyrus|Undyne|Alphys|Mettaton|Toriel|Asgore|Flowey|Asriel|Napstablook|Muffet|Mad Dummy|Temmie|Greater Dog|Lesser Dog|Frisk|Chara|W\.D\. Gaster)/i.test(n);
    }},
  ];

  function detectFranchise(name) {
    for (var i = 0; i < FRANCHISE_RULES.length; i++) {
      if (FRANCHISE_RULES[i].test(name)) return FRANCHISE_RULES[i].name;
    }
    return 'Other';
  }

  function init(_roomId, _playerIndex, _isSpectator) {
    roomId = _roomId;
    playerIndex = _playerIndex;
    isSpectator = _isSpectator;
    isHost = (playerIndex === 0);

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
    ChubSocket.on('room:state', onRoomState);

    // Load character descriptions then fetch character list
    loadDescriptions().then(function () {
      loadCharacterList();
    });
  }

  function bindButton(id, handler) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', handler);
  }

  // ── Character Descriptions ───────────────────────────────────────────────

  function loadDescriptions() {
    return fetch('data/descriptions.json')
      .then(function (res) { return res.json(); })
      .then(function (list) {
        if (Array.isArray(list)) {
          for (var i = 0; i < list.length; i++) {
            if (list[i] && typeof list[i].index === 'number' && list[i].description) {
              descriptionMap[list[i].index] = list[i].description;
            }
          }
        }
      })
      .catch(function () {
        // Descriptions are optional; continue without them
      });
  }

  // ── Character List ───────────────────────────────────────────────────────

  function loadCharacterList() {
    fetch('api/characters')
      .then(function (res) { return res.json(); })
      .then(function (list) {
        if (Array.isArray(list)) {
          characters = list;
          // Tag each character with franchise
          for (var i = 0; i < characters.length; i++) {
            characters[i]._franchise = detectFranchise(characters[i].fullName || '');
          }
        }
        renderCategoryTabs();
        renderCharacterGrid();
      })
      .catch(function () {
        renderCharacterGrid();
      });
  }

  function renderCategoryTabs() {
    var container = document.getElementById('char-categories');
    if (!container) return;

    // Count characters per franchise
    var counts = { All: characters.length };
    for (var i = 0; i < characters.length; i++) {
      var f = characters[i]._franchise || 'Other';
      counts[f] = (counts[f] || 0) + 1;
    }

    // Build ordered tab list
    var order = ['All', 'Sailor Moon', 'Dragon Ball', 'Pokemon', 'Capcom', 'Mario', 'Final Fantasy', 'Zelda', 'Marvel', 'Lodoss War', 'Ronin Warriors', 'Star Wars', 'Wrestling', 'Undertale', 'Other'];
    container.innerHTML = '';

    for (var j = 0; j < order.length; j++) {
      var cat = order[j];
      if (!counts[cat]) continue;

      var tab = document.createElement('button');
      tab.className = 'category-tab' + (cat === activeCategory ? ' active' : '');
      tab.textContent = cat + ' (' + counts[cat] + ')';
      tab.setAttribute('data-category', cat);
      tab.addEventListener('click', function () {
        activeCategory = this.getAttribute('data-category');
        // Update active tab styling
        var tabs = container.querySelectorAll('.category-tab');
        for (var k = 0; k < tabs.length; k++) tabs[k].classList.remove('active');
        this.classList.add('active');
        filterCharacters(document.getElementById('char-search').value);
      });
      container.appendChild(tab);
    }
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
      card.setAttribute('data-franchise', ch._franchise || 'Other');

      var statLine = 'HP:' + (ch.maxHp || 500) + ' STR:' + (ch.physStr || 0) + ' MAG:' + (ch.magStr || 0);
      var desc = descriptionMap[i] || ch.desc || ch.selectStr || '';
      var imgSrc = 'img/chars/' + i + '.png?v=2';

      card.innerHTML =
        '<div class="char-portrait"><img src="' + imgSrc + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></div>' +
        '<div class="char-info">' +
          '<div class="char-name">' + escapeHtml(ch.fullName || 'Unknown') + '</div>' +
          '<div class="char-stats">' + statLine + '</div>' +
          (desc ? '<div class="char-desc">' + escapeHtml(desc) + '</div>' : '') +
        '</div>';

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
      var franchise = cards[i].getAttribute('data-franchise') || '';
      var matchesSearch = q === '' || name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      var matchesCategory = activeCategory === 'All' || franchise === activeCategory;
      cards[i].style.display = (matchesSearch && matchesCategory) ? '' : 'none';
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

  // Franchise name → background image filename key
  var FRANCHISE_BG_MAP = {
    'Sailor Moon': 'sailor-moon',
    'Dragon Ball': 'dragon-ball',
    'Pokemon': 'pokemon',
    'Capcom': 'capcom',
    'Mario': 'mario',
    'Final Fantasy': 'final-fantasy',
    'Zelda': 'zelda',
    'Marvel': 'marvel',
    'Lodoss War': 'lodoss-war',
    'Ronin Warriors': 'ronin-warriors',
    'Star Wars': 'star-wars',
    'Wrestling': 'wrestling',
    'Undertale': 'undertale',
    'Other': 'default',
  };

  function applyFranchiseBackground(charName) {
    var franchise = detectFranchise(charName);
    var bgKey = FRANCHISE_BG_MAP[franchise] || 'default';
    var bgUrl = 'img/bg/' + bgKey + '.png';
    document.body.style.backgroundImage = 'url(' + bgUrl + ')';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  }

  function onSelectResult(data) {
    if (data.success) {
      var charName = (data.character && data.character.fullName) || selectedCharKey || '';
      BattleView.appendMessage('Character selected: ' + charName, 'msg-system');

      // Apply franchise-themed background
      applyFranchiseBackground(charName);

      // Use moves returned from server for autocomplete and display
      if (data.character && data.character.moves) {
        var moves = data.character.moves;
        var names = [];
        for (var i = 0; i < moves.length; i++) {
          if (moves[i] && moves[i].cmdKey) {
            names.push(moves[i].cmdKey);
          }
        }
        CommandInput.setMoveNames(names);
        BattleView.setPlayerMoves(moves);
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

  function onRoomState(data) {
    if (data.roomId && data.roomId !== roomId) return;
    renderPlayerSlots(data.players || []);

    // Restore moves for current player on reconnect
    var players = data.players || [];
    if (players[playerIndex] && players[playerIndex].moves && players[playerIndex].moves.length > 0) {
      var moves = players[playerIndex].moves;
      var names = [];
      for (var i = 0; i < moves.length; i++) {
        if (moves[i] && moves[i].cmdKey) names.push(moves[i].cmdKey);
      }
      CommandInput.setMoveNames(names);
      BattleView.setPlayerMoves(moves);
    }
  }

  function updateSlots(data) {
    // Slots are refreshed via room:state event, nothing extra needed here
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

      var removeBtn = '';
      if (isHost && p.isCpu) {
        removeBtn = '<button class="slot-remove" data-player-index="' + i + '" title="Remove CPU">X</button>';
      }

      var cpuLabel = p.isCpu ? ' <span class="text-muted">(CPU)</span>' : '';
      var nameStyle = (isHost && p.isCpu) ? ' style="cursor:pointer;text-decoration:underline dotted;" data-cpu-index="' + i + '" title="Click to change character"' : '';

      var slotDesc = '';
      if (p.charName) {
        // Find description by matching character index
        var charIdx = -1;
        for (var ci = 0; ci < characters.length; ci++) {
          if (characters[ci].fullName === p.charName || characters[ci].senshiId === p.charName) {
            charIdx = ci;
            break;
          }
        }
        if (charIdx >= 0 && descriptionMap[charIdx]) {
          slotDesc = descriptionMap[charIdx];
        }
      }

      slot.innerHTML =
        '<div style="flex:1;min-width:0;">' +
          '<div class="slot-name"' + nameStyle + '>' + escapeHtml(p.scrNam) + cpuLabel + '</div>' +
          '<div class="slot-char text-muted">' + (p.charName || '') + '</div>' +
          (slotDesc ? '<div class="slot-desc text-muted" style="font-size:0.75em;margin-top:2px;">' + escapeHtml(slotDesc) + '</div>' : '') +
        '</div>' +
        '<span class="team-badge ' + teamClass + ' slot-team" data-player-index="' + i + '" title="Click to change team">' + teamLetter + '</span>' +
        removeBtn;

      container.appendChild(slot);
    }

    // Bind remove buttons
    var removeBtns = container.querySelectorAll('.slot-remove');
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener('click', function () {
        var pi = parseInt(this.getAttribute('data-player-index'), 10);
        ChubSocket.emit('room:remove-cpu', { roomId: roomId, playerIndex: pi });
      });
    }

    // Bind team badge clicks (host only)
    if (isHost) {
      var badges = container.querySelectorAll('.slot-team');
      for (var b = 0; b < badges.length; b++) {
        badges[b].addEventListener('click', function () {
          var pi = parseInt(this.getAttribute('data-player-index'), 10);
          var currentTeam = parseInt(this.textContent === 'A' ? 1 : this.textContent === 'B' ? 2 : 0);
          var newTeam = currentTeam === 1 ? 2 : 1;
          ChubSocket.emit('room:set-player-team', { roomId: roomId, playerIndex: pi, teamId: newTeam });
        });
      }

      // Bind CPU name clicks to change character
      var cpuNames = container.querySelectorAll('[data-cpu-index]');
      for (var c = 0; c < cpuNames.length; c++) {
        cpuNames[c].addEventListener('click', function () {
          var pi = parseInt(this.getAttribute('data-cpu-index'), 10);
          var name = prompt('Enter character name for this CPU:');
          if (name && name.trim()) {
            ChubSocket.emit('room:set-cpu-char', { roomId: roomId, playerIndex: pi, commandKey: name.trim() });
          }
        });
      }
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
