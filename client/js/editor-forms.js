/**
 * ChUB 2000 — Shared Editor Logic
 *
 * Provides CRUD operations, form utilities, collapsible sections,
 * and status-effect grid rendering used by all editor pages.
 */

/* global fetch */

// ── Element definitions (by numeric id) ─────────────────────────────────────

const ELEMENTS = [
  { id: 0,   name: 'No Damage / Effect Only' },
  { id: 1,   name: 'Physical' },
  { id: 2,   name: 'Heal' },
  { id: 3,   name: 'Morph' },
  { id: 11,  name: 'HP Theft' },
  { id: 12,  name: 'MP Theft' },
  { id: 17,  name: 'Life' },
  { id: 19,  name: 'Demi' },
  { id: 20,  name: 'Moon' },
  { id: 21,  name: 'Shadow' },
  { id: 22,  name: 'Water' },
  { id: 23,  name: 'Reveal / Scan' },
  { id: 24,  name: 'Fire' },
  { id: 25,  name: 'Lightning' },
  { id: 26,  name: 'Heart' },
  { id: 27,  name: 'Earth' },
  { id: 28,  name: 'Wind / Random' },
  { id: 29,  name: 'Ki' },
  { id: 30,  name: 'Luminous' },
  { id: 42,  name: 'Steal Move' },
  { id: 66,  name: 'Invincible' },
  { id: 70,  name: 'Poison Elemental' },
  { id: 71,  name: 'Grass' },
  { id: 72,  name: 'Rock' },
  { id: 73,  name: 'Dirt' },
  { id: 74,  name: 'Psychic' },
  { id: 75,  name: 'Ghost' },
  { id: 92,  name: 'SP Theft' },
  { id: 100, name: 'Slot' },
  { id: 101, name: 'HP Based' },
  { id: 250, name: 'Disabler' },
  { id: 251, name: 'Super PBarrier' },
  { id: 252, name: 'Weapon Break' },
  { id: 253, name: 'Clone' },
  { id: 254, name: 'Barrier Lore' },
  { id: 255, name: 'Steal Stat' },
];

// ── Status effects (index into status[] array) ─────────────────────────────

const STATUS_EFFECTS = [
  { idx: 1,  name: 'Mute' },
  { idx: 2,  name: 'Chaos' },
  { idx: 3,  name: 'Freeze' },
  { idx: 4,  name: 'Poison' },
  { idx: 5,  name: 'Blind' },
  { idx: 7,  name: 'Haste' },
  { idx: 9,  name: 'Scarecrow' },
  { idx: 10, name: 'Slow' },
  { idx: 11, name: 'Stun' },
  { idx: 12, name: 'Reraise' },
  { idx: 13, name: 'Regen' },
  { idx: 14, name: 'Stop' },
  { idx: 15, name: 'Mushroom' },
  { idx: 16, name: 'MIA' },
  { idx: 17, name: 'Quick' },
  { idx: 18, name: 'Berserk' },
  { idx: 19, name: 'Sleep' },
  { idx: 21, name: 'R1 (CPU Wait)' },
  { idx: 22, name: 'R2 (Hit Rate)' },
  { idx: 23, name: 'Barrier' },
  { idx: 24, name: 'MBarrier' },
  { idx: 25, name: 'Bless' },
  { idx: 26, name: 'Curse' },
  { idx: 27, name: 'Charm' },
];

// ── Target modes ────────────────────────────────────────────────────────────

const TARGETS = [
  { id: 1, name: 'All Friends' },
  { id: 2, name: 'Enemy' },
  { id: 3, name: 'Ally / Self' },
  { id: 4, name: 'All Team (enemy)' },
  { id: 5, name: 'All Foes' },
  { id: 6, name: 'All But Self' },
  { id: 7, name: 'Everybody' },
  { id: 8, name: 'Only Self' },
];

// ── Arena element labels (indices 0..30) ────────────────────────────────────

const ARENA_ELEMENT_LABELS = [
  'All Attacks', 'Physical', 'Heal', 'Morph', 'Elem 4', 'Elem 5',
  'Elem 6', 'Elem 7', 'Elem 8', 'Elem 9', 'Elem 10',
  'HP Theft', 'MP Theft', 'Elem 13', 'Elem 14', 'Elem 15',
  'Elem 16', 'Life', 'Elem 18', 'Demi', 'Moon',
  'Shadow', 'Water', 'Reveal', 'Fire', 'Lightning',
  'Heart', 'Earth', 'Wind', 'Ki', 'Luminous',
];

// ── Dataset message field labels ────────────────────────────────────────────

const DATASET_MESSAGE_LABELS = {
  loadStr: 'Dataset Display Name',
  beginSelect: 'Entries Open',
  endSelect: 'Entries Closed',
  battleBegin: 'Battle Started',
  battlePause: 'Battle Paused',
  battleUnPause: 'Battle Unpaused',
  battleEnd: 'Battle Over',
  clearChars: 'Characters Cleared',
  charsNotCleared: 'Characters Not Cleared',
  gameAborted: 'Game Aborted',
  acceptDefects: 'Accept Defects (%SN)',
  declineDefects: 'Decline Defects (%SN)',
  wantDraw: 'Vote Draw (%SN)',
  dontWantDraw: 'Vote No Draw (%SN)',
  unMorphMsg: 'Un-Morph',
  goCharge: 'Continue Charging',
  counter: 'Counter',
  fleeFail: 'Flee Failed',
  noGetItem: 'Nothing to Get',
  hpDivert: 'HP Divert to Super',
  notEnoughMP: 'Not Enough MP',
  allDead: 'All Dead / Mutual KO',
  draw: 'Draw / Agreement',
  x1HrLeft: '1 Hour Left',
  x30MinsLeft: '30 Minutes Left',
  x20MinsLeft: '20 Minutes Left',
  x10MinsLeft: '10 Minutes Left',
  x5MinsLeft: '5 Minutes Left',
  x2MinsLeft: '2-Minute Warning',
  suddenDeath: 'Sudden Death',
  x1MinsLeft: '1 Minute Left',
  x30SecsLeft: '30 Seconds Left',
  x15SecsLeft: '15 Seconds Left',
  x5SecsLeft: '5 Seconds Left',
  timeExpired: 'Time Expired',
  beatYouma: 'You Win',
  youLose: 'You Lose',
  respawn: 'Respawn',
  beginVote: 'Voting Start',
  commieVote: '(Reserved)',
  remove: 'Player Removes Self',
  random: 'Random Character',
  taken: 'Character Taken',
  defectSucc: 'Defect Success',
  defectFail: 'Defect Failed',
  fleeAttempt: 'Flee Attempt',
  superKill: 'Super Kill Banner',
};

const DATASET_MESSAGE_FIELDS = [
  'loadStr', 'beginSelect', 'endSelect', 'battleBegin', 'battlePause',
  'battleUnPause', 'battleEnd', 'clearChars', 'charsNotCleared',
  'gameAborted', 'acceptDefects', 'declineDefects', 'wantDraw',
  'dontWantDraw', 'unMorphMsg', 'goCharge', 'counter', 'fleeFail',
  'noGetItem', 'hpDivert', 'notEnoughMP', 'allDead', 'draw',
  'x1HrLeft', 'x30MinsLeft', 'x20MinsLeft', 'x10MinsLeft',
  'x5MinsLeft', 'x2MinsLeft', 'suddenDeath', 'x1MinsLeft',
  'x30SecsLeft', 'x15SecsLeft', 'x5SecsLeft', 'timeExpired',
  'beatYouma', 'youLose', 'respawn', 'beginVote', 'commieVote',
  'remove', 'random', 'taken', 'defectSucc', 'defectFail',
  'fleeAttempt', 'superKill',
];

// ── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetch the list of files for a content type.
 * @param {string} type - 'characters', 'arenas', 'items', 'weapons', 'datasets'
 * @returns {Promise<{name: string, path: string}[]>}
 */
async function loadFileList(type) {
  const res = await fetch('/api/editor/' + type);
  if (!res.ok) throw new Error('Failed to load file list: ' + res.statusText);
  return res.json();
}

/**
 * Load and parse a single file.
 * @param {string} type
 * @param {string} filename
 * @returns {Promise<object>}
 */
async function loadFile(type, filename) {
  const res = await fetch('/api/editor/' + type + '/' + encodeURIComponent(filename));
  if (!res.ok) throw new Error('Failed to load file: ' + res.statusText);
  return res.json();
}

/**
 * Save (create or overwrite) a file.
 * @param {string} type
 * @param {string} filename
 * @param {object} data
 * @returns {Promise<object>}
 */
async function saveFile(type, filename, data) {
  const res = await fetch('/api/editor/' + type + '/' + encodeURIComponent(filename), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(function () { return {}; });
    throw new Error(err.error || 'Save failed: ' + res.statusText);
  }
  return res.json();
}

/**
 * Delete a file.
 * @param {string} type
 * @param {string} filename
 * @returns {Promise<object>}
 */
async function deleteFile(type, filename) {
  const res = await fetch('/api/editor/' + type + '/' + encodeURIComponent(filename), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(function () { return {}; });
    throw new Error(err.error || 'Delete failed: ' + res.statusText);
  }
  return res.json();
}

/**
 * Request server to re-scan data directories.
 * @returns {Promise<object>}
 */
async function reloadData() {
  const res = await fetch('/api/editor/reload', { method: 'POST' });
  return res.json();
}

// ── Form Utilities ──────────────────────────────────────────────────────────

/**
 * Clear all inputs in a form element.
 * @param {HTMLFormElement|HTMLElement} formEl
 */
function clearForm(formEl) {
  var inputs = formEl.querySelectorAll('input, textarea, select');
  inputs.forEach(function (el) {
    if (el.type === 'checkbox') {
      el.checked = false;
    } else if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
    } else if (el.type === 'range') {
      el.value = el.min || 0;
      el.dispatchEvent(new Event('input'));
    } else {
      el.value = '';
    }
  });
}

/**
 * Show a flash notification message.
 * @param {string} text
 * @param {'success'|'error'|'info'} type
 */
function showMessage(text, type) {
  type = type || 'info';
  var el = document.createElement('div');
  el.className = 'flash-message ' + type;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3000);
}

/**
 * Populate a <select> with file names from loadFileList.
 * @param {HTMLSelectElement} selectEl
 * @param {string} type
 */
async function populateFileSelect(selectEl, type) {
  try {
    var files = await loadFileList(type);
    // Keep only the placeholder option
    selectEl.innerHTML = '<option value="">-- Select File --</option>';
    files.forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      selectEl.appendChild(opt);
    });
  } catch (e) {
    showMessage('Error loading file list: ' + e.message, 'error');
  }
}

// ── Collapsible Sections ────────────────────────────────────────────────────

/**
 * Wire up all collapsible sections on the page.
 * Expected markup: .collapsible-header + .collapsible-body pairs.
 */
function initCollapsibles() {
  var headers = document.querySelectorAll('.collapsible-header');
  headers.forEach(function (header) {
    header.addEventListener('click', function () {
      header.classList.toggle('open');
      var body = header.nextElementSibling;
      if (body && body.classList.contains('collapsible-body')) {
        body.classList.toggle('open');
      }
    });
  });
}

/**
 * Wire up all move cards (expandable).
 */
function initMoveCards() {
  var headers = document.querySelectorAll('.move-card-header');
  headers.forEach(function (header) {
    header.addEventListener('click', function () {
      var body = header.nextElementSibling;
      if (body && body.classList.contains('move-card-body')) {
        body.classList.toggle('open');
      }
    });
  });
}

// ── Element <select> builder ────────────────────────────────────────────────

/**
 * Populate an element dropdown.
 * @param {HTMLSelectElement} selectEl
 * @param {number} [selected=0]
 */
function populateElementSelect(selectEl, selected) {
  selected = selected || 0;
  selectEl.innerHTML = '';
  ELEMENTS.forEach(function (el) {
    var opt = document.createElement('option');
    opt.value = el.id;
    opt.textContent = el.id + ' - ' + el.name;
    if (el.id === selected) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

/**
 * Populate a target dropdown.
 * @param {HTMLSelectElement} selectEl
 * @param {number} [selected=2]
 */
function populateTargetSelect(selectEl, selected) {
  selected = (selected !== undefined) ? selected : 2;
  selectEl.innerHTML = '';
  TARGETS.forEach(function (t) {
    var opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.id + ' - ' + t.name;
    if (t.id === selected) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

// ── Status Grid Builder ─────────────────────────────────────────────────────

/**
 * Build a status effects grid inside a container element.
 * @param {HTMLElement} container
 * @param {string} prefix - Input name prefix (e.g. 'move0_status')
 * @returns {void}
 */
function buildStatusGrid(container, prefix) {
  container.innerHTML = '';
  container.className = 'status-grid';
  STATUS_EFFECTS.forEach(function (se) {
    var grp = document.createElement('div');
    grp.className = 'form-group';
    var lbl = document.createElement('label');
    lbl.textContent = se.name;
    lbl.setAttribute('for', prefix + '_' + se.idx);
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.id = prefix + '_' + se.idx;
    inp.name = prefix + '_' + se.idx;
    inp.min = '0';
    inp.max = '100';
    inp.value = '0';
    inp.setAttribute('data-status-idx', se.idx);
    grp.appendChild(lbl);
    grp.appendChild(inp);
    container.appendChild(grp);
  });
}

/**
 * Read values from a status grid back into an array.
 * @param {HTMLElement} container
 * @returns {number[]} status array (indices 0..32)
 */
function readStatusGrid(container) {
  var arr = new Array(33).fill(0);
  var inputs = container.querySelectorAll('input[data-status-idx]');
  inputs.forEach(function (inp) {
    var idx = parseInt(inp.getAttribute('data-status-idx'), 10);
    arr[idx] = parseInt(inp.value, 10) || 0;
  });
  return arr;
}

/**
 * Populate a status grid with values from an array.
 * @param {HTMLElement} container
 * @param {number[]} statusArr
 */
function populateStatusGrid(container, statusArr) {
  var inputs = container.querySelectorAll('input[data-status-idx]');
  inputs.forEach(function (inp) {
    var idx = parseInt(inp.getAttribute('data-status-idx'), 10);
    inp.value = (statusArr && statusArr[idx]) || 0;
  });
}

// ── Move Block Builder ──────────────────────────────────────────────────────

/**
 * Generate HTML for a single move editing block.
 * @param {number} index - Move index (0-based)
 * @param {string} prefix - e.g. 'char_move' or 'wpn_move'
 * @returns {string} HTML
 */
function buildMoveCardHTML(index, prefix) {
  var id = prefix + index;
  return '' +
    '<div class="move-card" id="' + id + '">' +
    '  <div class="move-card-header">' +
    '    <span class="move-title">Move ' + (index + 1) +
    '      <span class="move-name-preview" id="' + id + '_preview"></span>' +
    '    </span>' +
    '    <span class="collapsible-arrow">&#9654;</span>' +
    '  </div>' +
    '  <div class="move-card-body">' +
    '    <div class="form-row form-row-3">' +
    '      <div class="form-group"><label>Name</label>' +
    '        <input type="text" name="' + id + '_name" data-field="name"></div>' +
    '      <div class="form-group"><label>Command Key</label>' +
    '        <input type="text" name="' + id + '_cmdKey" data-field="cmdKey"></div>' +
    '      <div class="form-group"><label>Can Super</label>' +
    '        <input type="checkbox" name="' + id + '_canSuper" data-field="canSuper"></div>' +
    '    </div>' +
    '    <div class="form-row form-row-3">' +
    '      <div class="form-group"><label>Begin Attack</label>' +
    '        <input type="text" name="' + id + '_beginAttack" data-field="beginAttack"></div>' +
    '      <div class="form-group"><label>Super Begin</label>' +
    '        <input type="text" name="' + id + '_beginSuperAttack" data-field="beginSuperAttack"></div>' +
    '      <div class="form-group"><label>Heal Self Begin</label>' +
    '        <input type="text" name="' + id + '_beginHealSelf" data-field="beginHealSelf"></div>' +
    '    </div>' +
    '    <div class="form-row form-row-2">' +
    '      <div class="form-group"><label>Hit</label>' +
    '        <input type="text" name="' + id + '_hit" data-field="hit"></div>' +
    '      <div class="form-group"><label>Miss</label>' +
    '        <input type="text" name="' + id + '_miss" data-field="miss"></div>' +
    '    </div>' +
    '    <div class="form-row form-row-2">' +
    '      <div class="form-group"><label>Crit Hit</label>' +
    '        <input type="text" name="' + id + '_critHit" data-field="critHit"></div>' +
    '      <div class="form-group"><label>Super Hit</label>' +
    '        <input type="text" name="' + id + '_superHit" data-field="superHit"></div>' +
    '    </div>' +
    '    <div class="form-row form-row-2">' +
    '      <div class="form-group"><label>Super Miss</label>' +
    '        <input type="text" name="' + id + '_superMiss" data-field="superMiss"></div>' +
    '      <div class="form-group"><label>Heal Self</label>' +
    '        <input type="text" name="' + id + '_healSelf" data-field="healSelf"></div>' +
    '    </div>' +
    '    <div class="form-row form-row-3">' +
    '      <div class="form-group"><label>Element</label>' +
    '        <select name="' + id + '_element" data-field="element"></select></div>' +
    '      <div class="form-group"><label>Strength</label>' +
    '        <input type="number" name="' + id + '_strength" data-field="strength" min="0"></div>' +
    '      <div class="form-group"><label>Target</label>' +
    '        <select name="' + id + '_target" data-field="target"></select></div>' +
    '    </div>' +
    '    <div class="form-group"><label>MP Required</label>' +
    '      <input type="number" name="' + id + '_mpReq" data-field="mpReq" min="0" style="width:100px"></div>' +
    '    <div class="collapsible-header" onclick="this.classList.toggle(\'open\');this.nextElementSibling.classList.toggle(\'open\')">' +
    '      <h3>Status Effects</h3><span class="collapsible-arrow">&#9654;</span>' +
    '    </div>' +
    '    <div class="collapsible-body">' +
    '      <div id="' + id + '_statusGrid"></div>' +
    '    </div>' +
    '  </div>' +
    '</div>';
}

/**
 * Initialize element/target selects and status grids for all move cards
 * under a container element.
 * @param {HTMLElement} container
 * @param {number} count
 * @param {string} prefix
 */
function initMoveCards2(container, count, prefix) {
  for (var i = 0; i < count; i++) {
    var id = prefix + i;
    var card = document.getElementById(id);
    if (!card) continue;
    // Wire header toggle
    var header = card.querySelector('.move-card-header');
    header.addEventListener('click', (function (cardEl) {
      return function () {
        var body = cardEl.querySelector('.move-card-body');
        if (body) body.classList.toggle('open');
      };
    })(card));
    // Populate element/target selects
    var elSel = card.querySelector('[data-field="element"]');
    if (elSel) populateElementSelect(elSel);
    var tgtSel = card.querySelector('[data-field="target"]');
    if (tgtSel) populateTargetSelect(tgtSel);
    // Build status grid
    var gridEl = document.getElementById(id + '_statusGrid');
    if (gridEl) buildStatusGrid(gridEl, id + '_status');
    // Wire name preview
    var nameInput = card.querySelector('[data-field="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (function (prevEl) {
        return function () {
          prevEl.textContent = this.value ? '- ' + this.value : '';
        };
      })(document.getElementById(id + '_preview')));
    }
  }
}

/**
 * Populate a move card with data.
 * @param {string} prefix - e.g. 'char_move'
 * @param {number} index
 * @param {object} moveData - a move object from parsed file
 */
function populateMoveCard(prefix, index, moveData) {
  var id = prefix + index;
  var card = document.getElementById(id);
  if (!card || !moveData) return;
  var fields = ['name', 'cmdKey', 'beginAttack', 'beginSuperAttack',
    'beginHealSelf', 'hit', 'miss', 'critHit', 'superHit',
    'superMiss', 'healSelf'];
  fields.forEach(function (f) {
    var el = card.querySelector('[data-field="' + f + '"]');
    if (el) el.value = moveData[f] || '';
  });
  var canSuperEl = card.querySelector('[data-field="canSuper"]');
  if (canSuperEl) canSuperEl.checked = !!moveData.canSuper;
  var strengthEl = card.querySelector('[data-field="strength"]');
  if (strengthEl) strengthEl.value = moveData.strength || 0;
  var mpReqEl = card.querySelector('[data-field="mpReq"]');
  if (mpReqEl) mpReqEl.value = moveData.mpReq || 0;
  var elSel = card.querySelector('[data-field="element"]');
  if (elSel) elSel.value = moveData.element || 0;
  var tgtSel = card.querySelector('[data-field="target"]');
  if (tgtSel) tgtSel.value = (moveData.target !== undefined) ? moveData.target : 2;
  // Status grid
  var gridEl = document.getElementById(id + '_statusGrid');
  if (gridEl) populateStatusGrid(gridEl, moveData.status);
  // Preview
  var prevEl = document.getElementById(id + '_preview');
  if (prevEl) prevEl.textContent = moveData.name ? '- ' + moveData.name : '';
}

/**
 * Read move card data into an object.
 * @param {string} prefix
 * @param {number} index
 * @returns {object} move object
 */
function readMoveCard(prefix, index) {
  var id = prefix + index;
  var card = document.getElementById(id);
  if (!card) return null;
  var move = {
    name: '', cmdKey: '', canSuper: 0,
    beginAttack: '', beginSuperAttack: '', beginHealSelf: '',
    hit: '', superHit: '', maxSuperHits: 0, healSelf: '',
    critHit: '', healMeld: '', miss: '', superMiss: '',
    status: new Array(33).fill(0),
    element: 0, strength: 0, target: 2, mpReq: 0,
    weaponEffect: 0, instantHit: false, reqAllUses: false,
  };
  var textFields = ['name', 'cmdKey', 'beginAttack', 'beginSuperAttack',
    'beginHealSelf', 'hit', 'miss', 'critHit', 'superHit',
    'superMiss', 'healSelf'];
  textFields.forEach(function (f) {
    var el = card.querySelector('[data-field="' + f + '"]');
    if (el) move[f] = el.value;
  });
  var canSuperEl = card.querySelector('[data-field="canSuper"]');
  if (canSuperEl) move.canSuper = canSuperEl.checked ? 1 : 0;
  var strengthEl = card.querySelector('[data-field="strength"]');
  if (strengthEl) move.strength = parseInt(strengthEl.value, 10) || 0;
  var mpReqEl = card.querySelector('[data-field="mpReq"]');
  if (mpReqEl) move.mpReq = parseInt(mpReqEl.value, 10) || 0;
  var elSel = card.querySelector('[data-field="element"]');
  if (elSel) move.element = parseInt(elSel.value, 10) || 0;
  var tgtSel = card.querySelector('[data-field="target"]');
  if (tgtSel) move.target = parseInt(tgtSel.value, 10) || 2;
  var gridEl = document.getElementById(id + '_statusGrid');
  if (gridEl) move.status = readStatusGrid(gridEl);
  return move;
}

// ── Expose globally ─────────────────────────────────────────────────────────

window.ChubEditor = {
  // API
  loadFileList: loadFileList,
  loadFile: loadFile,
  saveFile: saveFile,
  deleteFile: deleteFile,
  reloadData: reloadData,
  // Form utils
  clearForm: clearForm,
  showMessage: showMessage,
  populateFileSelect: populateFileSelect,
  initCollapsibles: initCollapsibles,
  initMoveCards: initMoveCards,
  // Selects / grids
  populateElementSelect: populateElementSelect,
  populateTargetSelect: populateTargetSelect,
  buildStatusGrid: buildStatusGrid,
  readStatusGrid: readStatusGrid,
  populateStatusGrid: populateStatusGrid,
  // Move card
  buildMoveCardHTML: buildMoveCardHTML,
  initMoveCards2: initMoveCards2,
  populateMoveCard: populateMoveCard,
  readMoveCard: readMoveCard,
  // Data
  ELEMENTS: ELEMENTS,
  STATUS_EFFECTS: STATUS_EFFECTS,
  TARGETS: TARGETS,
  ARENA_ELEMENT_LABELS: ARENA_ELEMENT_LABELS,
  DATASET_MESSAGE_LABELS: DATASET_MESSAGE_LABELS,
  DATASET_MESSAGE_FIELDS: DATASET_MESSAGE_FIELDS,
};
