/**
 * ChUB 2000 — Batch Turn-Based Playtest Runner
 *
 * Runs N turn-based games sequentially, collects all reports,
 * then generates a summary analysis with recommendations.
 *
 * Run: node test/e2e/batch-playtest.js [count] [port]
 * Output: test/e2e/playtest-reports/batch-summary-<timestamp>.txt
 */

import { io } from 'socket.io-client';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_COUNT = parseInt(process.argv[2]) || 20;
const PORT = process.argv[3] || 9012;
const BASE_URL = `http://localhost:${PORT}`;
const REPORT_DIR = join(__dirname, 'playtest-reports');
const MAX_TURNS = 30;

mkdirSync(REPORT_DIR, { recursive: true });

// ── Run a single game ───────────────────────────────────────────────────────

function runGame(gameNum) {
  return new Promise((resolve) => {
    const log = [];
    const state = {
      roomId: null,
      playerIndex: 0,
      players: [],
      myMoves: [],
      myChar: null,
      turn: 0,
      phase: 'connecting',
      itemOnGround: null,
      startTime: Date.now(),
    };

    const socket = io(BASE_URL, { transports: ['websocket'], forceNew: true, reconnection: false });
    const timeout = setTimeout(() => finish('timeout'), 45000);

    socket.on('error', () => finish('socket_error'));
    socket.on('disconnect', () => { if (state.phase !== 'done') finish('disconnect'); });

    function finish(reason) {
      if (state.phase === 'done') return;
      state.phase = 'done';
      clearTimeout(timeout);
      try { socket.disconnect(); } catch {};

      const duration = Date.now() - state.startTime;
      const messages = log.filter(e => e.cat === 'msg');
      const attacks = messages.filter(e => e.text.match(/\[\d+HP\]/));
      const kills = messages.filter(e => e.text.match(/defeated|killed|slain/i));
      const misses = messages.filter(e => e.text.match(/miss|dodge/i));
      const heals = messages.filter(e => e.text.match(/heal|recover|regenerat/i));
      const items = messages.filter(e => e.text.match(/picks up|grabs|gets the|scarfs/i));
      const templateBugs = messages.filter(e => e.text.includes('%SN') || e.text.includes('%T'));

      const dmgNums = [];
      for (const a of attacks) {
        const m = a.text.match(/\[(\d+)HP\]/);
        if (m) dmgNums.push(parseInt(m[1]));
      }

      // Check for repeated messages
      const msgCounts = {};
      for (const m of messages) {
        const key = m.text.replace(/\d+/g, 'N'); // normalize numbers
        msgCounts[key] = (msgCounts[key] || 0) + 1;
      }
      const repeats = Object.entries(msgCounts)
        .filter(([, c]) => c >= 5)
        .map(([msg, c]) => ({ msg: msg.slice(0, 80), count: c }));

      // Winner analysis
      const alive = state.players.filter(p => p.isAlive);
      const winTeam = alive.length > 0 ? alive[0].teamId : 0;
      const myTeamWon = state.players[state.playerIndex]?.teamId === winTeam;

      const issues = [];
      if (state.turn >= MAX_TURNS) issues.push('HIT_MAX_TURNS');
      if (attacks.length === 0) issues.push('NO_ATTACKS');
      if (kills.length === 0 && state.turn > 10) issues.push('NO_KILLS_AFTER_10_TURNS');
      if (templateBugs.length > 0) issues.push(`TEMPLATE_BUGS:${templateBugs.length}`);
      if (repeats.length > 0) issues.push(`REPEATED_MSGS:${repeats.length}`);
      if (reason === 'timeout') issues.push('GAME_TIMEOUT');
      if (dmgNums.length > 0 && dmgNums.every(d => d === 0)) issues.push('ALL_ZERO_DAMAGE');

      // Zero damage attacks
      const zeroDmg = dmgNums.filter(d => d === 0).length;

      resolve({
        gameNum,
        reason,
        turns: state.turn,
        duration,
        character: state.myChar || 'Unknown',
        playerCount: state.players.length,
        winTeam,
        myTeamWon,
        messageCount: messages.length,
        attackCount: attacks.length,
        killCount: kills.length,
        missCount: misses.length,
        healCount: heals.length,
        itemCount: items.length,
        zeroDmgCount: zeroDmg,
        totalDamage: dmgNums.reduce((a, b) => a + b, 0),
        avgDamage: dmgNums.length > 0 ? Math.round(dmgNums.reduce((a, b) => a + b, 0) / dmgNums.length) : 0,
        maxDamage: dmgNums.length > 0 ? Math.max(...dmgNums) : 0,
        minDamage: dmgNums.length > 0 ? Math.min(...dmgNums) : 0,
        templateBugCount: templateBugs.length,
        repeats,
        issues,
        players: state.players.map(p => ({
          name: p.scrNam, team: p.teamId, hp: p.hp, maxHp: p.maxHp,
          alive: p.isAlive, isCpu: p.isCpu,
        })),
      });
    }

    socket.on('connect', () => {
      socket.emit('lobby:create-room', {
        name: `Playtest ${gameNum}`,
        datasetId: 'default',
        screenName: `Bot${gameNum}`,
      });
    });

    socket.on('connect_error', () => finish('connect_error'));

    socket.on('lobby:room-created', (data) => {
      state.roomId = data.roomId;
      state.playerIndex = data.playerIndex || 0;

      fetch(`${BASE_URL}/api/characters`)
        .then(r => r.json())
        .then(chars => {
          // Pick random viable character
          const viable = chars.filter(c => c.moveCount >= 3);
          const pick = viable[Math.floor(Math.random() * viable.length)] || chars[0];
          state.myChar = pick.fullName;

          socket.emit('room:select-char', { roomId: state.roomId, commandKey: pick.senshiId || pick.fullName });
        })
        .catch(() => {
          socket.emit('room:select-char', { roomId: state.roomId, commandKey: 'Cloud' });
          state.myChar = 'Cloud Strife';
        });
    });

    socket.on('room:select-result', (data) => {
      if (data.success && data.character) {
        state.myMoves = data.character.moves || [];
        state.myChar = data.character.fullName;

        socket.emit('room:set-turn-based', { roomId: state.roomId, enabled: true });

        // Random number of CPUs (3-7)
        const cpuCount = 3 + Math.floor(Math.random() * 5);
        socket.emit('room:fill-cpus', { roomId: state.roomId, count: cpuCount });

        setTimeout(() => {
          socket.emit('room:ez-teams', { roomId: state.roomId });
          setTimeout(() => {
            socket.emit('host:begin', { roomId: state.roomId });
          }, 300);
        }, 300);
      }
    });

    socket.on('battle:message', (data) => {
      if (data.roomId && data.roomId !== state.roomId) return;
      log.push({ cat: 'msg', text: data.message || '', turn: state.turn, pi: data.playerIndex });
    });

    socket.on('battle:state-update', (data) => {
      if (data.roomId && data.roomId !== state.roomId) return;
      state.players = data.players || [];
      state.itemOnGround = data.currentItem || null;
      if (data.turnNumber) state.turn = data.turnNumber;
      // Fallback: pick up moves from state update if select-result didn't provide them
      if ((!state.myMoves || state.myMoves.length === 0) && state.playerIndex != null) {
        const me = data.players[state.playerIndex];
        if (me && me.moves && me.moves.length > 0) {
          state.myMoves = me.moves;
        }
      }
    });

    socket.on('turn:start', (data) => {
      if (data.roomId && data.roomId !== state.roomId) return;
      state.turn = data.turnNumber;
      state.itemOnGround = data.currentItem;

      if (state.turn > MAX_TURNS) {
        socket.emit('battle:command', { roomId: state.roomId, command: '/!end' });
        return;
      }

      const screenName = `Bot${gameNum}`;
      if (data.waitingFor?.includes(screenName)) {
        setTimeout(() => {
          // Simple AI: pick strongest attack on weakest enemy
          if (state.itemOnGround) {
            socket.emit('battle:command', { roomId: state.roomId, command: '/get' });
          }

          const me = state.players[state.playerIndex];
          if (!me || !me.isAlive) return;

          const enemies = state.players.filter(p => p.isAlive && p.teamId !== me.teamId && p.hp > 0);
          if (enemies.length === 0) {
            socket.emit('battle:command', { roomId: state.roomId, command: '/rest' });
            return;
          }

          const target = enemies.sort((a, b) => a.hp - b.hp)[0];
          const atkMoves = state.myMoves.filter(m => m && m.strength > 0 && m.element !== 2 && m.element !== 17);

          if (atkMoves.length === 0) {
            socket.emit('battle:command', { roomId: state.roomId, command: '/rest' });
            return;
          }

          // Mix it up - sometimes use different moves
          const move = atkMoves[Math.floor(Math.random() * Math.min(3, atkMoves.length))];
          socket.emit('battle:command', { roomId: state.roomId, command: `/${move.cmdKey} ${target.scrNam}` });
        }, 200);
      }
    });

    socket.on('phase:ended', () => finish('ended'));
    socket.on('phase:battle', () => { state.phase = 'battle'; });
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const PARALLEL = parseInt(process.argv[4]) || 10;
  console.log(`Running ${GAME_COUNT} turn-based playtests on ${BASE_URL} (${PARALLEL} parallel)...\n`);

  const results = [];
  let completed = 0;

  // Run games in parallel batches
  for (let batch = 0; batch < GAME_COUNT; batch += PARALLEL) {
    const batchSize = Math.min(PARALLEL, GAME_COUNT - batch);
    const promises = [];

    for (let j = 0; j < batchSize; j++) {
      const gameNum = batch + j + 1;
      promises.push(
        runGame(gameNum)
          .then(result => {
            completed++;
            console.log(`Game ${gameNum} done (${completed}/${GAME_COUNT}): ${result.turns}T ${result.attackCount}atk ${result.issues.length} issues [${result.reason}]`);
            return result;
          })
          .catch(e => {
            completed++;
            console.log(`Game ${gameNum} ERROR (${completed}/${GAME_COUNT}): ${e.message}`);
            return { gameNum, reason: 'crash', turns: 0, attackCount: 0, killCount: 0, missCount: 0, healCount: 0, itemCount: 0, zeroDmgCount: 0, totalDamage: 0, avgDamage: 0, maxDamage: 0, minDamage: 0, templateBugCount: 0, repeats: [], issues: ['CRASH'], players: [], character: 'Unknown', playerCount: 0, winTeam: 0, myTeamWon: false, messageCount: 0, duration: 0 };
          })
      );
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Short delay between batches
    await new Promise(r => setTimeout(r, 500));
  }

  // ── Generate Summary ────────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const summaryPath = join(REPORT_DIR, `batch-summary-${timestamp}.txt`);
  const jsonPath = join(REPORT_DIR, `batch-summary-${timestamp}.json`);

  const totalGames = results.length;
  const completedGames = results.filter(r => r.reason === 'ended').length;
  const timedOut = results.filter(r => r.reason === 'timeout').length;
  const avgTurns = Math.round(results.reduce((a, r) => a + r.turns, 0) / totalGames);
  const avgAttacks = Math.round(results.reduce((a, r) => a + r.attackCount, 0) / totalGames);
  const avgDmg = Math.round(results.reduce((a, r) => a + r.avgDamage, 0) / totalGames);
  const totalKills = results.reduce((a, r) => a + r.killCount, 0);
  const totalMisses = results.reduce((a, r) => a + r.missCount, 0);
  const totalZeroDmg = results.reduce((a, r) => a + r.zeroDmgCount, 0);
  const totalTemplateBugs = results.reduce((a, r) => a + r.templateBugCount, 0);
  const allIssues = {};
  for (const r of results) {
    for (const issue of r.issues) {
      const key = issue.split(':')[0];
      allIssues[key] = (allIssues[key] || 0) + 1;
    }
  }

  // Character frequency
  const charCounts = {};
  for (const r of results) {
    charCounts[r.character] = (charCounts[r.character] || 0) + 1;
  }

  // Damage distribution
  const dmgBuckets = { '0': 0, '1-50': 0, '51-100': 0, '101-200': 0, '201-300': 0, '300+': 0 };
  for (const r of results) {
    if (r.avgDamage === 0) dmgBuckets['0']++;
    else if (r.avgDamage <= 50) dmgBuckets['1-50']++;
    else if (r.avgDamage <= 100) dmgBuckets['51-100']++;
    else if (r.avgDamage <= 200) dmgBuckets['101-200']++;
    else if (r.avgDamage <= 300) dmgBuckets['201-300']++;
    else dmgBuckets['300+']++;
  }

  // Turn distribution
  const turnBuckets = { '1-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '21-30': 0, '30+': 0 };
  for (const r of results) {
    if (r.turns <= 5) turnBuckets['1-5']++;
    else if (r.turns <= 10) turnBuckets['6-10']++;
    else if (r.turns <= 15) turnBuckets['11-15']++;
    else if (r.turns <= 20) turnBuckets['16-20']++;
    else if (r.turns <= 30) turnBuckets['21-30']++;
    else turnBuckets['30+']++;
  }

  // Most repeated messages across all games
  const globalRepeats = {};
  for (const r of results) {
    for (const rep of r.repeats) {
      globalRepeats[rep.msg] = (globalRepeats[rep.msg] || 0) + rep.count;
    }
  }

  const lines = [];
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║  ChUB 2000 — BATCH PLAYTEST SUMMARY                       ║');
  lines.push('║  ' + new Date().toISOString().padEnd(58) + '║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Games played: ${totalGames}`);
  lines.push(`Completed: ${completedGames} | Timed out: ${timedOut} | Errors: ${totalGames - completedGames - timedOut}`);
  lines.push('');
  lines.push('── AVERAGES ──');
  lines.push(`  Turns per game: ${avgTurns}`);
  lines.push(`  Attacks per game: ${avgAttacks}`);
  lines.push(`  Average damage per hit: ${avgDmg}`);
  lines.push(`  Total kills across all games: ${totalKills}`);
  lines.push(`  Total misses/dodges: ${totalMisses}`);
  lines.push(`  Zero-damage attacks: ${totalZeroDmg}`);
  lines.push(`  Template variable bugs: ${totalTemplateBugs}`);
  lines.push('');
  lines.push('── TURN DISTRIBUTION ──');
  for (const [bucket, count] of Object.entries(turnBuckets)) {
    const bar = '█'.repeat(Math.ceil(count / totalGames * 40));
    lines.push(`  ${bucket.padEnd(6)} ${String(count).padStart(3)} ${bar}`);
  }
  lines.push('');
  lines.push('── DAMAGE DISTRIBUTION ──');
  for (const [bucket, count] of Object.entries(dmgBuckets)) {
    const bar = '█'.repeat(Math.ceil(count / totalGames * 40));
    lines.push(`  ${bucket.padEnd(8)} ${String(count).padStart(3)} ${bar}`);
  }
  lines.push('');
  lines.push('── ISSUES FREQUENCY ──');
  if (Object.keys(allIssues).length === 0) {
    lines.push('  No issues detected!');
  } else {
    for (const [issue, count] of Object.entries(allIssues).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${issue}: ${count}/${totalGames} games (${Math.round(count/totalGames*100)}%)`);
    }
  }
  lines.push('');
  lines.push('── CHARACTERS PLAYED ──');
  for (const [char, count] of Object.entries(charCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    lines.push(`  ${char}: ${count}`);
  }
  lines.push('');

  if (Object.keys(globalRepeats).length > 0) {
    lines.push('── MOST REPEATED MESSAGES (possible loops) ──');
    for (const [msg, count] of Object.entries(globalRepeats).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      lines.push(`  [${count}x] ${msg}`);
    }
    lines.push('');
  }

  lines.push('── PER-GAME RESULTS ──');
  for (const r of results) {
    const issues = r.issues.length > 0 ? ' [' + r.issues.join(', ') + ']' : '';
    lines.push(`  Game ${r.gameNum}: ${r.character} | ${r.turns}T ${r.attackCount}atk ${r.killCount}kill avg${r.avgDamage}dmg${issues}`);
  }

  const summary = lines.join('\n');
  writeFileSync(summaryPath, summary);
  writeFileSync(jsonPath, JSON.stringify({ timestamp: new Date().toISOString(), results, allIssues }, null, 2));

  console.log('\n' + summary);
  console.log(`\nSummary saved to: ${summaryPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
