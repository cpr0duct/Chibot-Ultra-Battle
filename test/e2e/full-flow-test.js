/**
 * Full-flow E2E test for ChUB 2000 Web.
 *
 * Covers:
 *  - Landing page -> enter name -> navigate to lobby
 *  - Create room -> navigate to battle page
 *  - Character list populates from /api/characters
 *  - Click a character to select it
 *  - Add CPU bots
 *  - Fill CPUs
 *  - EZ-Teams
 *  - Type a command and verify it is sent
 *  - Second browser context sees the room in the lobby
 *  - Verify sessionStorage has correct roomId / playerIndex
 *
 * Run:  node test/e2e/full-flow-test.js
 */
import { chromium } from 'playwright';

const BASE = process.env.CHUB_URL || 'http://localhost:9012';
const results = [];
let browser;

function log(label, pass, detail = '') {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${label}${detail ? ' -- ' + detail : ''}`);
  results.push({ label, pass, detail });
}

async function run() {
  browser = await chromium.launch({ headless: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: First player enters the lobby and creates a room
  // ═══════════════════════════════════════════════════════════════════════════
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const errors1 = [];
  page1.on('console', msg => { if (msg.type() === 'error') errors1.push(msg.text()); });
  page1.on('pageerror', err => errors1.push(err.message));

  // -- Landing page --
  try {
    await page1.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const title = await page1.title();
    log('1.1 Landing page loads', title.includes('ChUB'), 'title=' + title);
  } catch (e) {
    log('1.1 Landing page loads', false, e.message);
  }

  // -- Enter screen name and go to lobby --
  try {
    await page1.fill('#screen-name', 'Alice');
    await page1.click('#enter-lobby');
    await page1.waitForURL('**/lobby.html', { timeout: 5000 });
    log('1.2 Navigate to lobby', true);
  } catch (e) {
    log('1.2 Navigate to lobby', false, e.message);
  }

  // -- Wait for socket and room list --
  try {
    await page1.waitForTimeout(1500);
    const connected = await page1.evaluate(() => ChubSocket.socket?.connected ?? false);
    log('1.3 Socket connected in lobby', connected);
  } catch (e) {
    log('1.3 Socket connected in lobby', false, e.message);
  }

  // -- Create a room --
  try {
    await page1.click('#open-create-room-btn');
    await page1.waitForTimeout(300);
    await page1.fill('#room-name', 'Test Battle');
    await page1.click('#confirm-create');
    await page1.waitForURL('**/battle.html', { timeout: 5000 });
    log('1.4 Room created, navigated to battle', true);
  } catch (e) {
    log('1.4 Room created, navigated to battle', false, e.message);
  }

  // -- Verify sessionStorage has roomId and playerIndex --
  try {
    const session = await page1.evaluate(() => ({
      roomId: sessionStorage.getItem('chub-roomId'),
      playerIndex: sessionStorage.getItem('chub-playerIndex'),
      isSpectator: sessionStorage.getItem('chub-isSpectator'),
    }));
    log('1.5 sessionStorage.roomId set', !!session.roomId, 'roomId=' + session.roomId);
    log('1.6 sessionStorage.playerIndex set', session.playerIndex != null, 'playerIndex=' + session.playerIndex);
    log('1.7 isSpectator is false', session.isSpectator === 'false');
  } catch (e) {
    log('1.5-7 sessionStorage', false, e.message);
  }

  // -- Wait for socket to connect on battle page --
  try {
    await page1.waitForTimeout(2000);
    const connected = await page1.evaluate(() => ChubSocket.socket?.connected ?? false);
    log('1.8 Socket connected on battle page', connected);
  } catch (e) {
    log('1.8 Socket connected on battle page', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: Character list populates
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    // Wait for character grid to populate
    await page1.waitForTimeout(2000);
    const charCards = await page1.$$('#char-grid .char-card');
    log('2.1 Character grid populated', charCards.length > 0, 'count=' + charCards.length);

    // Verify character cards have names
    if (charCards.length > 0) {
      const firstName = await charCards[0].textContent();
      log('2.2 First character has name', firstName.length > 0, 'name=' + firstName.trim().substring(0, 40));
    } else {
      log('2.2 First character has name', false, 'no cards');
    }
  } catch (e) {
    log('2.1-2 Character grid', false, e.message);
  }

  // -- Search filter --
  try {
    const searchInput = await page1.$('#char-search');
    if (searchInput) {
      await searchInput.fill('aeris');
      await page1.waitForTimeout(300);
      const visible = await page1.$$eval('#char-grid .char-card', cards =>
        cards.filter(c => c.style.display !== 'none').length
      );
      log('2.3 Search filter works', visible >= 1 && visible < 516, 'visible=' + visible);
      // Clear search
      await searchInput.fill('');
      await page1.waitForTimeout(200);
    } else {
      log('2.3 Search filter works', false, 'no search input');
    }
  } catch (e) {
    log('2.3 Search filter', false, e.message);
  }

  // -- Click a character to select it --
  try {
    const firstCard = await page1.$('#char-grid .char-card');
    if (firstCard) {
      await firstCard.click();
      await page1.waitForTimeout(500);
      const selected = await page1.$('#char-grid .char-card.selected');
      log('2.4 Character card selected (CSS class)', !!selected);
    } else {
      log('2.4 Character card selected', false, 'no cards to click');
    }
  } catch (e) {
    log('2.4 Character selection', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: CPU bot controls
  // ═══════════════════════════════════════════════════════════════════════════

  // -- Add CPU --
  try {
    await page1.click('#btn-add-cpu');
    await page1.waitForTimeout(1000);
    // The server should emit room:cpu-added; check battle log or player slots
    const logText = await page1.textContent('body');
    log('3.1 Add CPU clicked (no crash)', true);
  } catch (e) {
    log('3.1 Add CPU', false, e.message);
  }

  // -- Fill CPUs (uses prompt, we need to handle dialog) --
  try {
    page1.once('dialog', async dialog => {
      await dialog.accept('3');
    });
    await page1.click('#btn-fill-cpus');
    await page1.waitForTimeout(1000);
    log('3.2 Fill CPUs clicked (no crash)', true);
  } catch (e) {
    log('3.2 Fill CPUs', false, e.message);
  }

  // -- EZ Teams --
  try {
    await page1.click('#btn-ez-teams');
    await page1.waitForTimeout(500);
    log('3.3 EZ Teams clicked (no crash)', true);
  } catch (e) {
    log('3.3 EZ Teams', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4: Command input
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const cmdInput = await page1.$('#command-input');
    if (cmdInput) {
      await cmdInput.fill('/block');
      await page1.keyboard.press('Enter');
      await page1.waitForTimeout(500);

      // Check that the command appeared in the battle log
      const logContent = await page1.textContent('#battle-log');
      const commandSent = logContent.includes('/block');
      log('4.1 Command typed and sent', commandSent, 'log contains /block');
    } else {
      log('4.1 Command input', false, 'no input element');
    }
  } catch (e) {
    log('4.1 Command input', false, e.message);
  }

  // -- Send button works --
  try {
    const cmdInput = await page1.$('#command-input');
    if (cmdInput) {
      await cmdInput.fill('/rest');
      await page1.click('#btn-send');
      await page1.waitForTimeout(500);
      const logContent = await page1.textContent('#battle-log');
      log('4.2 Send button works', logContent.includes('/rest'));
    } else {
      log('4.2 Send button', false, 'no input');
    }
  } catch (e) {
    log('4.2 Send button', false, e.message);
  }

  // -- Autocomplete shows for /bl --
  try {
    const cmdInput = await page1.$('#command-input');
    if (cmdInput) {
      await cmdInput.fill('/bl');
      await page1.waitForTimeout(300);
      const autoList = await page1.$('#autocomplete-list.active');
      log('4.3 Autocomplete appears for /bl', !!autoList);
      // Clear
      await cmdInput.fill('');
      await page1.waitForTimeout(200);
    }
  } catch (e) {
    log('4.3 Autocomplete', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 5: Second device sees the room
  // ═══════════════════════════════════════════════════════════════════════════
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  const errors2 = [];
  page2.on('console', msg => { if (msg.type() === 'error') errors2.push(msg.text()); });
  page2.on('pageerror', err => errors2.push(err.message));

  try {
    await page2.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page2.fill('#screen-name', 'Bob');
    await page2.click('#enter-lobby');
    await page2.waitForURL('**/lobby.html', { timeout: 5000 });
    log('5.1 Second user reaches lobby', true);
  } catch (e) {
    log('5.1 Second user reaches lobby', false, e.message);
  }

  // -- Room list shows the created room --
  try {
    await page2.waitForTimeout(2000);
    const roomCards = await page2.$$('.room-card');
    log('5.2 Room list shows rooms', roomCards.length > 0, 'count=' + roomCards.length);

    if (roomCards.length > 0) {
      const roomText = await roomCards[0].textContent();
      log('5.3 Room name visible', roomText.includes('Test Battle'), 'text=' + roomText.substring(0, 60));
    } else {
      log('5.3 Room name visible', false, 'no room cards');
    }
  } catch (e) {
    log('5.2-3 Room visibility', false, e.message);
  }

  // -- Join the room --
  try {
    const joinBtn = await page2.$('.join-btn');
    if (joinBtn) {
      await joinBtn.click();
      await page2.waitForURL('**/battle.html', { timeout: 5000 });
      const session2 = await page2.evaluate(() => ({
        roomId: sessionStorage.getItem('chub-roomId'),
        playerIndex: sessionStorage.getItem('chub-playerIndex'),
      }));
      log('5.4 Second user joined room', !!session2.roomId, 'roomId=' + session2.roomId + ' idx=' + session2.playerIndex);
    } else {
      log('5.4 Second user joined room', false, 'no join button');
    }
  } catch (e) {
    log('5.4 Join room', false, e.message);
  }

  // -- Second user sees character grid --
  try {
    await page2.waitForTimeout(2000);
    const charCards2 = await page2.$$('#char-grid .char-card');
    log('5.5 Second user sees character grid', charCards2.length > 0, 'count=' + charCards2.length);
  } catch (e) {
    log('5.5 Character grid on second user', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 6: API endpoints
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const charResp = await page1.evaluate(async () => {
      const r = await fetch('/api/characters');
      const body = await r.json();
      return { ok: r.ok, count: body.length };
    });
    log('6.1 GET /api/characters returns data', charResp.ok && charResp.count > 0, 'count=' + charResp.count);
  } catch (e) {
    log('6.1 /api/characters', false, e.message);
  }

  try {
    const statusResp = await page1.evaluate(async () => {
      const r = await fetch('/api/status');
      return await r.json();
    });
    log('6.2 GET /api/status online', statusResp.status === 'online');
    log('6.3 Status shows active rooms', statusResp.rooms.active >= 1, 'active=' + statusResp.rooms.active);
  } catch (e) {
    log('6.2-3 /api/status', false, e.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 7: Console errors check
  // ═══════════════════════════════════════════════════════════════════════════
  log('7.1 No console errors (player 1)', errors1.length === 0,
    errors1.length > 0 ? errors1.join(' | ') : '');
  log('7.2 No console errors (player 2)', errors2.length === 0,
    errors2.length > 0 ? errors2.join(' | ') : '');

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  await browser.close();

  console.log('\n' + '='.repeat(60));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('Full Flow E2E Results: ' + passed + ' passed, ' + failed + ' failed out of ' + results.length + ' checks');

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.pass).forEach(r => {
      console.log('  FAIL ' + r.label + ': ' + r.detail);
    });
  }

  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error('Fatal error:', e.message);
  if (browser) await browser.close();
  process.exit(1);
});
