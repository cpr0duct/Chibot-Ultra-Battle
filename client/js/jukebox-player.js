/**
 * ChUB 2000 — Jukebox Audio Engine
 *
 * Supports:
 *   - MP3: HTML5 Audio element (works everywhere)
 *   - MIDI (.mid): detected, shows "MIDI not yet supported"
 *   - SPC (.spc): detected, shows "SPC not yet supported"
 *
 * Socket.IO integration for synced playback in rooms:
 *   - jukebox:track-change → switch track
 *   - jukebox:sync → sync position
 */

(function () {
  'use strict';

  var audio = new Audio();
  var playlist = [];
  var currentIndex = -1;
  var isPlaying = false;
  var isLooping = false;
  var isShuffling = false;
  var socket = null;

  // Supported extensions for direct playback
  var PLAYABLE_EXT = ['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a'];
  var UNSUPPORTED_EXT = ['.mid', '.midi', '.spc'];

  function getExtension(filename) {
    var dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.substring(dot).toLowerCase() : '';
  }

  function isPlayable(filename) {
    return PLAYABLE_EXT.indexOf(getExtension(filename)) >= 0;
  }

  function isUnsupported(filename) {
    return UNSUPPORTED_EXT.indexOf(getExtension(filename)) >= 0;
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  function play(index) {
    if (index < 0 || index >= playlist.length) return;
    var track = playlist[index];

    if (!isPlayable(track.name)) {
      var ext = getExtension(track.name).toUpperCase().replace('.', '');
      fire('unsupported', { track: track, format: ext });
      // Auto-skip to next
      next();
      return;
    }

    currentIndex = index;
    audio.src = '/data/audio/' + encodeURIComponent(track.name);
    audio.play().catch(function () { /* autoplay blocked */ });
    isPlaying = true;
    fire('track-change', { index: currentIndex, track: track });
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    fire('paused', {});
  }

  function resume() {
    if (currentIndex < 0 && playlist.length > 0) {
      play(0);
      return;
    }
    audio.play().catch(function () {});
    isPlaying = true;
    fire('resumed', {});
  }

  function togglePlay() {
    if (isPlaying) pause();
    else resume();
  }

  function stop() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    fire('stopped', {});
  }

  function next() {
    if (playlist.length === 0) return;
    var nextIdx;
    if (isShuffling) {
      nextIdx = Math.floor(Math.random() * playlist.length);
    } else {
      nextIdx = (currentIndex + 1) % playlist.length;
    }
    play(nextIdx);
  }

  function prev() {
    if (playlist.length === 0) return;
    var prevIdx;
    if (isShuffling) {
      prevIdx = Math.floor(Math.random() * playlist.length);
    } else {
      prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
    }
    play(prevIdx);
  }

  function setVolume(vol) {
    audio.volume = Math.max(0, Math.min(1, vol));
  }

  function setLoop(val) {
    isLooping = !!val;
    audio.loop = isLooping;
  }

  function setShuffle(val) {
    isShuffling = !!val;
  }

  // Handle track end
  audio.addEventListener('ended', function () {
    if (!isLooping) {
      next();
    }
  });

  // ── Playlist ──────────────────────────────────────────────────────────────

  function setPlaylist(tracks) {
    playlist = tracks || [];
    currentIndex = -1;
    fire('playlist-loaded', { tracks: playlist });
  }

  async function loadPlaylistFromServer() {
    try {
      var res = await fetch('api/editor/audio');
      if (res.ok) {
        var files = await res.json();
        setPlaylist(files);
        return files;
      }
    } catch (e) {
      // Audio listing endpoint may not exist, fail gracefully
    }
    return [];
  }

  // ── Events ────────────────────────────────────────────────────────────────

  var listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function fire(event, data) {
    (listeners[event] || []).forEach(function (fn) { fn(data); });
  }

  // ── Socket.IO Sync ────────────────────────────────────────────────────────

  function connectSocket(io) {
    if (!io) return;
    socket = io;
    socket.on('jukebox:track-change', function (data) {
      if (data && typeof data.index === 'number') {
        play(data.index);
      }
    });
    socket.on('jukebox:sync', function (data) {
      if (data && typeof data.position === 'number') {
        audio.currentTime = data.position;
      }
    });
  }

  // ── State getters ─────────────────────────────────────────────────────────

  function getState() {
    return {
      currentIndex: currentIndex,
      currentTrack: currentIndex >= 0 ? playlist[currentIndex] : null,
      isPlaying: isPlaying,
      isLooping: isLooping,
      isShuffling: isShuffling,
      volume: audio.volume,
      currentTime: audio.currentTime,
      duration: audio.duration || 0,
      playlist: playlist,
    };
  }

  // ── Expose globally ───────────────────────────────────────────────────────

  window.JukeboxPlayer = {
    play: play,
    pause: pause,
    resume: resume,
    togglePlay: togglePlay,
    stop: stop,
    next: next,
    prev: prev,
    setVolume: setVolume,
    setLoop: setLoop,
    setShuffle: setShuffle,
    setPlaylist: setPlaylist,
    loadPlaylistFromServer: loadPlaylistFromServer,
    connectSocket: connectSocket,
    getState: getState,
    getAudio: function () { return audio; },
    on: on,
    isPlayable: isPlayable,
    isUnsupported: isUnsupported,
    getExtension: getExtension,
  };
})();
