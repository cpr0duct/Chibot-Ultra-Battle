/**
 * Arena effects system — restoration and random events.
 * Ported from VB6: ARENA1.BAS
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultRand(min, max) {
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── applyRestoration ──────────────────────────────────────────────────────

/**
 * Apply HP/MP restoration during rest.
 * HP restored = random between arena.restLowHp and arena.restHighHp.
 * Same for MP. Also apply per-second gradual recovery.
 *
 * @param {object} player - A player object (createPlayer shape)
 * @param {object} arena  - An arena object (createArena shape)
 * @param {object} [opts] - Options
 * @param {function} [opts.rand] - RNG function rand(min, max) for testing
 * @returns {{ hpRestored: number, mpRestored: number }}
 */
export function applyRestoration(player, arena, opts = {}) {
  const rand = opts.rand || defaultRand;

  let hpRestored = 0;
  let mpRestored = 0;

  // Rest restoration (random range)
  if (arena.restHighHp > 0 || arena.restLowHp > 0) {
    hpRestored += rand(arena.restLowHp, arena.restHighHp);
  }
  if (arena.restHighMp > 0 || arena.restLowMp > 0) {
    mpRestored += rand(arena.restLowMp, arena.restHighMp);
  }

  // Per-second gradual recovery
  hpRestored += arena.hpPerSecond;
  mpRestored += arena.mpPerSecond;

  // Cap at max
  const hpRoom = player.maxHp - player.hp;
  const mpRoom = player.maxMp - player.mp;
  hpRestored = Math.min(hpRestored, hpRoom);
  mpRestored = Math.min(mpRestored, mpRoom);
  if (hpRestored < 0) hpRestored = 0;
  if (mpRestored < 0) mpRestored = 0;

  player.hp += hpRestored;
  player.mp += mpRestored;

  return { hpRestored, mpRestored };
}

// ── rollArenaEvent ────────────────────────────────────────────────────────

/**
 * Roll for arena events. For each event with a non-empty name, roll
 * probability based on frequency (1-5, where 5 is most frequent).
 * If triggered: pick random target from living players, apply damage,
 * return message.
 *
 * @param {object}   arena   - Arena object with events array
 * @param {object[]} players - Array of player objects
 * @param {number}   gameTime - Current game time (unused, reserved)
 * @param {object}   [opts]  - Options
 * @param {function} [opts.rand] - RNG function rand(min, max) for testing
 * @returns {{ triggered: object[], messages: string[] }}
 */
export function rollArenaEvent(arena, players, gameTime, opts = {}) {
  const rand = opts.rand || defaultRand;
  const triggered = [];
  const messages = [];

  for (const event of arena.events) {
    if (!event.name) continue;

    // Frequency 1-5: higher = more frequent
    // Roll 1-100; threshold = frequency * 20 (so freq 5 = 100% = always)
    const threshold = event.frequency * 20;
    const roll = rand(1, 100);
    if (roll > threshold) continue;

    // Event triggered — find targets
    const living = players.filter((p) => p.isAlive);
    if (living.length === 0) continue;

    if (event.hitsAll) {
      // Hit all living players
      for (const target of living) {
        target.hp -= event.hpDamage;
        const msg = event.hitStr.replace(/%T/g, target.scrNam);
        messages.push(msg);
      }
      triggered.push(event);
    } else {
      // Pick a random target
      const idx = rand(0, living.length - 1);
      const target = living[idx];
      if (target) {
        target.hp -= event.hpDamage;
        const msg = event.hitStr.replace(/%T/g, target.scrNam);
        messages.push(msg);
        triggered.push(event);
      } else {
        // No valid target — miss
        if (event.missStr) {
          messages.push(event.missStr);
        }
      }
    }
  }

  return { triggered, messages };
}
