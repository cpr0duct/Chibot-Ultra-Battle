/**
 * ChUB 2000 — MIDI Jukebox (Winamp-style)
 *
 * Loads MIDI files from the server, parses them with MidiPlayer.js,
 * and synthesises audio via Soundfont-player.  Falls back to HTML5
 * Audio for .mp3/.ogg/.wav files.
 */

(function () {
  /* ── CDN URLs ──────────────────────────────────────────────────────── */
  var MIDI_PLAYER_CDN = 'https://cdn.jsdelivr.net/npm/midi-player-js@2.0.16/browser/midiplayer.min.js';
  var SOUNDFONT_CDN   = 'https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js';
  var SOUNDFONT_URL   = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';

  var MIDI_EXT  = /\.(mid|midi)$/i;
  var AUDIO_EXT = /\.(mp3|ogg|wav)$/i;

  /* ── State ─────────────────────────────────────────────────────────── */
  var tracks      = [];
  var currentIdx  = -1;
  var audioCtx    = null;
  var gainNode    = null;
  var instrument  = null;
  var midiPlayer  = null;
  var htmlAudio   = null;
  var playing     = false;
  var volume      = 0.7;
  var activeNotes = {};

  /* ── DOM refs (resolved in init) ───────────────────────────────────── */
  var els = {};

  /* ── Helpers ───────────────────────────────────────────────────────── */

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s   = document.createElement('script');
      s.src   = url;
      s.async = true;
      s.onload  = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function setTrackName(name) {
    if (!els.trackName) return;
    els.trackName.textContent = name;
    els.trackName.classList.add('playing');
  }

  function stopAll() {
    playing = false;
    Object.keys(activeNotes).forEach(function (k) {
      if (activeNotes[k]) activeNotes[k].stop();
      delete activeNotes[k];
    });
    if (midiPlayer && midiPlayer.isPlaying()) midiPlayer.stop();
    if (htmlAudio) { htmlAudio.pause(); htmlAudio.src = ''; }
    if (els.trackName) els.trackName.classList.remove('playing');
  }

  /* ── MIDI playback ─────────────────────────────────────────────────── */

  function ensureInstrument() {
    if (instrument) return Promise.resolve(instrument);
    ensureAudioCtx();
    return window.Soundfont.instrument(audioCtx, 'acoustic_grand_piano', {
      soundfont: 'MusyngKite',
      from: SOUNDFONT_URL
    }).then(function (inst) { instrument = inst; return inst; });
  }

  function playMidi(url) {
    return ensureInstrument().then(function () {
      return fetch(url);
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var bytes = new Uint8Array(buf);
      midiPlayer = new MidiPlayer.Player(function (ev) {
        if (ev.name === 'Note on' && ev.velocity > 0) {
          var note = instrument.play(ev.noteName, audioCtx.currentTime, {
            gain: (ev.velocity / 127) * volume,
            destination: gainNode
          });
          activeNotes[ev.noteNumber] = note;
        }
        if (ev.name === 'Note off' || (ev.name === 'Note on' && ev.velocity === 0)) {
          if (activeNotes[ev.noteNumber]) {
            activeNotes[ev.noteNumber].stop();
            delete activeNotes[ev.noteNumber];
          }
        }
      });
      midiPlayer.on('endOfFile', function () { advance(); });
      midiPlayer.loadArrayBuffer(buf);
      midiPlayer.play();
      playing = true;
    });
  }

  /* ── HTML5 Audio playback ──────────────────────────────────────────── */

  function playAudioFile(url) {
    htmlAudio = new Audio(url);
    htmlAudio.volume = volume;
    htmlAudio.addEventListener('ended', function () { advance(); });
    htmlAudio.play().then(function () { playing = true; }).catch(function () {});
  }

  /* ── Transport controls ────────────────────────────────────────────── */

  function playTrack(idx) {
    stopAll();
    if (!tracks.length) return;
    currentIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
    var track = tracks[currentIdx];
    setTrackName((track.name || track.path || '').replace(/\.[^.]+$/, ''));
    var url = '/data/audio/' + encodeURIComponent(track.path || track.name);

    if (MIDI_EXT.test(track.name)) {
      playMidi(url).catch(function (e) { console.warn('[Jukebox] MIDI error', e); advance(); });
    } else {
      playAudioFile(url);
    }
  }

  function advance() {
    if (!tracks.length) return;
    playTrack(currentIdx + 1);
  }

  /* ── Public API ────────────────────────────────────────────────────── */

  window.MidiJukebox = {
    init: function () {
      els.container = document.getElementById('midi-player');
      els.trackName = document.getElementById('midi-track-name');
      els.playBtn   = document.getElementById('midi-play-btn');
      els.pauseBtn  = document.getElementById('midi-pause-btn');
      els.nextBtn   = document.getElementById('midi-next-btn');
      els.volume    = document.getElementById('midi-volume');

      if (!els.container) return;

      if (els.playBtn)  els.playBtn.addEventListener('click',  function () { MidiJukebox.play(); });
      if (els.pauseBtn) els.pauseBtn.addEventListener('click', function () { MidiJukebox.pause(); });
      if (els.nextBtn)  els.nextBtn.addEventListener('click',  function () { MidiJukebox.next(); });
      if (els.volume) {
        els.volume.value = volume;
        els.volume.addEventListener('input', function () { MidiJukebox.setVolume(parseFloat(this.value)); });
      }

      /* Load CDN libs, then fetch track list */
      var cdnReady = Promise.all([loadScript(MIDI_PLAYER_CDN), loadScript(SOUNDFONT_CDN)]);

      fetch('/api/editor/audio')
        .then(function (r) { return r.json(); })
        .then(function (list) {
          if (!Array.isArray(list)) list = list.files || [];
          /* Normalize: API returns {name, path} objects or plain strings */
          var normalized = list.map(function (f) {
            if (typeof f === 'string') return { name: f, path: f };
            return { name: f.name || f.path, path: f.path || f.name };
          });
          var midi  = normalized.filter(function (f) { return MIDI_EXT.test(f.name); });
          var audio = normalized.filter(function (f) { return AUDIO_EXT.test(f.name); });
          var pool  = midi.length ? midi : audio;
          tracks = shuffle(pool);
          if (tracks.length && els.trackName) {
            els.trackName.textContent = tracks.length + ' tracks loaded';
          }
        })
        .catch(function (e) { console.warn('[Jukebox] Could not load track list', e); });

      cdnReady.catch(function (e) { console.warn('[Jukebox] CDN load failed', e); });
    },

    play: function () {
      ensureAudioCtx();
      if (midiPlayer && midiPlayer.isPlaying && !midiPlayer.isPlaying() && currentIdx >= 0) {
        /* Resume paused MIDI */
        midiPlayer.play();
        playing = true;
        if (els.trackName) els.trackName.classList.add('playing');
        return;
      }
      if (htmlAudio && htmlAudio.paused && currentIdx >= 0) {
        htmlAudio.play();
        playing = true;
        if (els.trackName) els.trackName.classList.add('playing');
        return;
      }
      playTrack(currentIdx < 0 ? 0 : currentIdx);
    },

    pause: function () {
      if (midiPlayer && midiPlayer.isPlaying && midiPlayer.isPlaying()) midiPlayer.pause();
      if (htmlAudio && !htmlAudio.paused) htmlAudio.pause();
      playing = false;
      if (els.trackName) els.trackName.classList.remove('playing');
    },

    next: function () {
      ensureAudioCtx();
      advance();
    },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (gainNode) gainNode.gain.value = volume;
      if (htmlAudio) htmlAudio.volume = volume;
    }
  };
})();
