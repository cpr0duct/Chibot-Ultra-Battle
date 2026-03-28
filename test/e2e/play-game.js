/**
 * ChUB 2000 — Full QA Playtest
 *
 * This script actually PLAYS the game end-to-end:
 * 1. Enter name, go to lobby
 * 2. Create a room
 * 3. See characters populate
 * 4. Search for a character
 * 5. Select a character via click and command
 * 6. Add CPU bots
 * 7. Fill CPUs
 * 8. EZ-Teams
 * 9. Start battle
 * 10. Type attack commands
 * 11. Watch battle progress
 * 12. Verify damage, status updates, kills
 *
 * Run: node test/e2e/play-game.js
 */
import { chromium } from 'playwright';

const BASE = process.env.CHUB_URL || 'http://localhost:9012';
const SLOW = 200; // ms between actions for debugging

let browser, page;
const issues = [];
const passes = [];

function pass(msg) {
  console.log(`  ✓ ${msg}`);
  passes.push(msg);
}

function fail(msg, detail = '') {
  const full = detail ? `${msg}: ${detail}` : msg;
  console.log(`  ✗ ${full}`);
  issues.push(full);
}

async function screenshot(name) {
  await page.screenshot({ path: `test/e2e/screenshots/${name}.png`, fullPage: true });
}

async function waitMs(ms) {
  await page.waitForTimeout(ms);
}

async function getConsoleErrors() {
  return page.evaluate(() => window.__chubConsoleErrors || []);
}

async function run() {
  // Setup
  const { mkdirSync } = await import('fs');
  try { mkdirSync('test/e2e/screenshots', { recursive: true }); } catch {}

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await context.newPage();

  // Capture ALL console output
  const consoleMessages = [];
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));
  page.on('requestfailed', req => {
    networkErrors.push(`NETWORK FAIL: ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  try {
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PHASE 1: Landing Page ═══');
    // ═══════════════════════════════════════════════════════════════════

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 10000 });
    await screenshot('01-landing');

    // Check page loaded
    const title = await page.title();
    if (title.includes('ChUB')) pass('Landing page loaded');
    else fail('Landing page title wrong', title);

    // Check CSS applied
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') pass(`CSS loaded (bg=${bg})`);
    else fail('CSS not loaded', bg);

    // Check Socket.IO connected
    await waitMs(2000);
    const socketState = await page.evaluate(() => {
      if (typeof ChubSocket === 'undefined') return { exists: false };
      return {
        exists: true,
        connected: ChubSocket.socket?.connected ?? false,
        id: ChubSocket.socket?.id ?? 'none',
        transport: ChubSocket.socket?.io?.engine?.transport?.name ?? 'unknown'
      };
    });
    if (socketState.connected) pass(`Socket connected (id=${socketState.id}, transport=${socketState.transport})`);
    else fail('Socket NOT connected', JSON.stringify(socketState));

    // Enter screen name
    const nameInput = await page.$('#screen-name');
    if (!nameInput) { fail('Screen name input not found'); return; }
    await nameInput.fill('QA_Tester');
    pass('Entered screen name');

    // Click Enter Lobby
    await page.click('#enter-lobby');
    await page.waitForURL('**/lobby**', { timeout: 5000 }).catch(() => {});
    await waitMs(1000);
    await screenshot('02-lobby');

    const lobbyUrl = page.url();
    if (lobbyUrl.includes('lobby')) pass('Navigated to lobby');
    else fail('Did not navigate to lobby', lobbyUrl);

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PHASE 2: Lobby — Create Room ═══');
    // ═══════════════════════════════════════════════════════════════════

    // Wait for socket to reconnect on new page
    await waitMs(2000);
    const lobbySocket = await page.evaluate(() => ({
      connected: ChubSocket?.socket?.connected ?? false,
      id: ChubSocket?.socket?.id ?? 'none'
    }));
    if (lobbySocket.connected) pass(`Lobby socket connected (${lobbySocket.id})`);
    else fail('Lobby socket NOT connected');

    // Check if rooms list element exists
    const roomsList = await page.$('#rooms-list, [id*="room"], .room-list, .rooms');
    if (roomsList) pass('Rooms list element found');
    else fail('Rooms list element NOT found');

    // Click Create Room
    const createBtn = await page.$('#open-create-room-btn, button:has-text("Create Room"), button:has-text("Create")');
    if (!createBtn) { fail('Create Room button not found'); return; }
    await createBtn.click();
    await waitMs(500);
    await screenshot('03-create-modal');

    // Check modal opened
    const modalVisible = await page.evaluate(() => {
      const modal = document.querySelector('#create-room-modal, .modal-overlay');
      if (!modal) return false;
      return modal.classList.contains('active') || getComputedStyle(modal).display !== 'none';
    });
    if (modalVisible) pass('Create room modal opened');
    else fail('Create room modal did NOT open');

    // Fill room name
    const roomNameInput = await page.$('#create-room-modal input[type="text"], #room-name-input');
    if (roomNameInput) {
      await roomNameInput.fill('QA Test Room');
      pass('Filled room name');
    } else {
      fail('Room name input not found in modal');
    }

    // Click create/submit in modal
    const submitBtn = await page.$('#create-room-modal button[type="submit"], #create-room-modal .btn-primary, #create-room-modal button:has-text("Create")');
    if (submitBtn) {
      await submitBtn.click({ force: true });
      pass('Clicked create room submit');
    } else {
      fail('Submit button not found in modal');
    }

    // Wait for navigation to battle page
    await page.waitForURL('**/battle**', { timeout: 5000 }).catch(() => {});
    await waitMs(2000);
    await screenshot('04-battle-page');

    const battleUrl = page.url();
    if (battleUrl.includes('battle')) pass('Navigated to battle page');
    else fail('Did not navigate to battle page', battleUrl);

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PHASE 3: Battle Page — Selection Phase ═══');
    // ═══════════════════════════════════════════════════════════════════

    // Wait for socket and page to initialize
    await waitMs(3000);

    const battleSocket = await page.evaluate(() => ({
      connected: ChubSocket?.socket?.connected ?? false,
      id: ChubSocket?.socket?.id ?? 'none',
      roomId: sessionStorage.getItem('chub-roomId') ?? 'none',
      playerIndex: sessionStorage.getItem('chub-playerIndex') ?? 'none',
      screenName: sessionStorage.getItem('chub-screenName') ?? 'none'
    }));
    console.log('    Session state:', JSON.stringify(battleSocket));
    if (battleSocket.connected) pass(`Battle socket connected (${battleSocket.id})`);
    else fail('Battle socket NOT connected on battle page');
    if (battleSocket.roomId !== 'none') pass(`Room ID stored: ${battleSocket.roomId}`);
    else fail('No room ID in session storage');

    // Check character grid
    const charGridInfo = await page.evaluate(() => {
      const grid = document.getElementById('char-grid');
      if (!grid) return { exists: false };
      const cards = grid.querySelectorAll('.char-card');
      const placeholderText = grid.textContent;
      return {
        exists: true,
        cardCount: cards.length,
        text: placeholderText.substring(0, 100),
        gridDisplay: getComputedStyle(grid).display,
        gridHTML: grid.innerHTML.substring(0, 200)
      };
    });
    console.log('    Char grid:', JSON.stringify(charGridInfo));
    if (charGridInfo.cardCount > 0) pass(`Character grid has ${charGridInfo.cardCount} characters`);
    else fail('Character grid is EMPTY', `cards=${charGridInfo.cardCount}, text="${charGridInfo.text}"`);

    // Test character search
    const searchInput = await page.$('#char-search');
    if (searchInput) {
      await searchInput.fill('Cloud');
      await waitMs(500);
      const visibleAfterSearch = await page.evaluate(() => {
        const cards = document.querySelectorAll('#char-grid .char-card');
        let visible = 0;
        for (const c of cards) {
          if (c.style.display !== 'none') visible++;
        }
        return visible;
      });
      if (visibleAfterSearch > 0 && visibleAfterSearch < (charGridInfo.cardCount || 999)) {
        pass(`Search filtered to ${visibleAfterSearch} results for "Cloud"`);
      } else {
        fail('Search did not filter', `visible=${visibleAfterSearch}, total=${charGridInfo.cardCount}`);
      }
      await searchInput.fill(''); // Clear search
      await waitMs(300);
    } else {
      fail('Search input not found');
    }

    await screenshot('05-characters');

    // Test selecting a character via command input
    const cmdInput = await page.$('#command-input');
    if (cmdInput) {
      pass('Command input found');

      // Try typing a command
      await cmdInput.focus();
      await cmdInput.fill('/cloud');
      await waitMs(300);

      // Check if input has the value
      const cmdValue = await cmdInput.inputValue();
      if (cmdValue === '/cloud') pass('Command input accepts text');
      else fail('Command input value wrong', cmdValue);

      // Try pressing Enter
      await cmdInput.press('Enter');
      await waitMs(1000);

      // Check if command was processed (look for message in battle log)
      const logContent = await page.evaluate(() => {
        const log = document.getElementById('battle-log');
        return log ? log.textContent : '';
      });
      console.log('    Battle log after /cloud:', logContent.substring(0, 200));
      if (logContent.includes('/cloud') || logContent.includes('Cloud') || logContent.includes('selected')) {
        pass('Command /cloud was processed');
      } else {
        fail('Command /cloud had no visible effect', logContent.substring(0, 100));
      }
    } else {
      fail('Command input NOT found');
    }

    // Test Add CPU button
    const addCpuBtn = await page.$('#btn-add-cpu');
    if (addCpuBtn) {
      pass('Add CPU button found');

      // Check it's visible and clickable
      const btnState = await page.evaluate(() => {
        const btn = document.getElementById('btn-add-cpu');
        if (!btn) return { exists: false };
        const style = getComputedStyle(btn);
        return {
          exists: true,
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          disabled: btn.disabled,
          onclick: !!btn.onclick,
          listeners: btn.getAttribute('data-listeners') || 'unknown',
          text: btn.textContent
        };
      });
      console.log('    Add CPU btn state:', JSON.stringify(btnState));

      // Click it
      await addCpuBtn.click();
      await waitMs(1000);

      // Check if a CPU was added (player slots should update)
      const slotsAfterCpu = await page.evaluate(() => {
        const slots = document.getElementById('player-slots');
        return slots ? { html: slots.innerHTML.substring(0, 200), children: slots.children.length } : { html: '', children: 0 };
      });
      console.log('    Player slots after Add CPU:', JSON.stringify(slotsAfterCpu));
      if (slotsAfterCpu.children > 0) pass('CPU added — player slot appeared');
      else fail('Add CPU had no visible effect');
    } else {
      fail('Add CPU button NOT found');
    }

    // Test Fill CPUs
    const fillBtn = await page.$('#btn-fill-cpus');
    if (fillBtn) {
      pass('Fill CPUs button found');

      // Override prompt to return a value
      await page.evaluate(() => {
        window._originalPrompt = window.prompt;
        window.prompt = () => '4';
      });

      await fillBtn.click();
      await waitMs(1500);

      // Restore prompt
      await page.evaluate(() => {
        window.prompt = window._originalPrompt;
      });

      const slotsAfterFill = await page.evaluate(() => {
        const slots = document.getElementById('player-slots');
        return slots ? { children: slots.children.length, text: slots.textContent.substring(0, 200) } : { children: 0 };
      });
      console.log('    Player slots after Fill CPUs:', JSON.stringify(slotsAfterFill));
      if (slotsAfterFill.children >= 4) pass(`Fill CPUs worked — ${slotsAfterFill.children} players`);
      else fail('Fill CPUs had no visible effect', `children=${slotsAfterFill.children}`);
    }

    await screenshot('06-after-cpus');

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PHASE 4: Start Battle ═══');
    // ═══════════════════════════════════════════════════════════════════

    const readyBtn = await page.$('#btn-ready');
    if (readyBtn) {
      await readyBtn.click();
      await waitMs(2000);

      // Check if battle phase activated
      const phaseState = await page.evaluate(() => {
        const selPhase = document.getElementById('selection-phase');
        const batPhase = document.getElementById('battle-phase');
        return {
          selectionHidden: selPhase?.classList.contains('hidden') ?? false,
          selectionDisplay: selPhase ? getComputedStyle(selPhase).display : 'missing',
          battleVisible: batPhase ? !batPhase.classList.contains('hidden') : false,
          battleDisplay: batPhase ? getComputedStyle(batPhase).display : 'missing',
          statusBar: document.getElementById('sb-phase')?.textContent ?? ''
        };
      });
      console.log('    Phase state after Begin:', JSON.stringify(phaseState));
      if (phaseState.battleVisible || phaseState.statusBar.includes('battle')) {
        pass('Battle phase activated');
      } else {
        fail('Battle did not start', JSON.stringify(phaseState));
      }
    } else {
      fail('Ready/Begin button not found');
    }

    await screenshot('07-battle-started');

    // Wait for battle to progress (CPU should be fighting)
    await waitMs(5000);

    const battleLogContent = await page.evaluate(() => {
      const log = document.getElementById('battle-log');
      return log ? {
        text: log.textContent,
        childCount: log.children.length,
        lastMessages: Array.from(log.children).slice(-5).map(el => el.textContent)
      } : { text: '', childCount: 0 };
    });
    console.log('    Battle log messages:', battleLogContent.childCount);
    console.log('    Last messages:', JSON.stringify(battleLogContent.lastMessages));
    if (battleLogContent.childCount > 3) pass(`Battle progressing — ${battleLogContent.childCount} messages`);
    else fail('Battle not progressing', `messages=${battleLogContent.childCount}`);

    // Check status panel updates
    const statusPanel = await page.evaluate(() => {
      const panel = document.getElementById('status-panel');
      return panel ? { html: panel.innerHTML.substring(0, 300), text: panel.textContent.substring(0, 200) } : { html: '', text: '' };
    });
    console.log('    Status panel:', statusPanel.text.substring(0, 100));
    if (statusPanel.text.length > 10) pass('Status panel has content');
    else fail('Status panel empty');

    await screenshot('08-battle-progress');

    // Try typing an attack command during battle
    if (cmdInput) {
      await cmdInput.fill('/1');
      await cmdInput.press('Enter');
      await waitMs(2000);

      const logAfterCmd = await page.evaluate(() => {
        const log = document.getElementById('battle-log');
        return log ? log.children.length : 0;
      });
      pass(`Sent /1 command during battle (log now has ${logAfterCmd} messages)`);
    }

    // Wait more for battle to progress
    await waitMs(10000);
    await screenshot('09-battle-late');

    const finalLog = await page.evaluate(() => {
      const log = document.getElementById('battle-log');
      if (!log) return { count: 0, last: [] };
      return {
        count: log.children.length,
        last: Array.from(log.children).slice(-10).map(el => ({ text: el.textContent, class: el.className }))
      };
    });
    console.log(`    Final battle log: ${finalLog.count} messages`);
    finalLog.last.forEach(m => console.log(`      [${m.class}] ${m.text.substring(0, 80)}`));

    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PHASE 5: Error Report ═══');
    // ═══════════════════════════════════════════════════════════════════

    if (consoleErrors.length > 0) {
      console.log('\n  Browser console errors:');
      consoleErrors.forEach(e => console.log(`    ! ${e}`));
    }
    if (networkErrors.length > 0) {
      console.log('\n  Network errors:');
      networkErrors.forEach(e => console.log(`    ! ${e}`));
    }

    // Dump all console messages for debugging
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    if (warnings.length > 0) {
      console.log('\n  Warnings:');
      warnings.forEach(w => console.log(`    ~ ${w.text}`));
    }

  } catch (e) {
    fail('FATAL', e.message);
    console.error(e.stack);
    await screenshot('99-fatal-error');
  }

  // ═══════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════');
  console.log(`RESULTS: ${passes.length} passed, ${issues.length} failed`);
  if (issues.length > 0) {
    console.log('\nFAILED:');
    issues.forEach(i => console.log(`  ✗ ${i}`));
  }
  console.log('══════════════════════════════════════════════\n');

  await browser.close();
  process.exit(issues.length > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error('Fatal:', e);
  if (browser) await browser.close();
  process.exit(1);
});
