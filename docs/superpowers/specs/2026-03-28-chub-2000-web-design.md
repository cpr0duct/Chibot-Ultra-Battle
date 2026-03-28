# ChUB 2000 Web — Design Specification

A faithful web recreation of Chibot Ultra Battle (ChUB 2000), originally a Visual Basic 6 text-based turn-based battle simulation engine created for AOL chatrooms in the late 1990s. Hosted on a Raspberry Pi 5 as part of the JARVIS homelab infrastructure.

**Source:** https://github.com/dustinlacewell/Chibot-Ultra-Battle
**Version:** Recreating ChUB 2000 v1.5.2 (Beta)

---

## 1. Project Goals

- Recreate the original game mechanics identically — damage formulas, status effects, AI priority logic, move execution timing, super meter, runes, fatalities, all 5 battle types
- Native compatibility with original `.CH2`, `.AN2`, `.ITM`, `.W2K`, `.INI` file formats — original content packs drop in and work
- Web-based multiplayer replacing AOL chatroom integration — multiple concurrent battle rooms via Socket.IO
- Full editor suite in the browser — character, arena, item, weapon, dataset, CPU personality editors
- Juke Box audio player supporting MIDI, MP3, and SPC (SNES) formats
- Ship with all original content packs (Final Fantasy, Dragon Ball Z, Pokemon, Sailor Moon, Marvel vs Capcom, Star Wars, Zelda, Super Smash Bros, Super Mario RPG, fan characters)
- Host on Raspberry Pi 5 with full JARVIS integration (nginx, Cloudflare subdomain, systemd service)

## 2. Architecture

### 2.1 Stack

- **Runtime:** Node.js (v22, already installed on Pi)
- **Server:** Express + Socket.IO (monolithic, single process)
- **Client:** Vanilla HTML/CSS/JS (no framework)
- **Port:** 9012
- **Deployment:** systemd service, nginx reverse proxy

### 2.2 Why Monolithic Node.js

- Single event loop maps 1:1 to the original VB6's single-process timer architecture
- Shared game logic (damage calc, status effects, move validation) between server and client — written once in JS, used by both
- Simplest deployment: one systemd service, one port, one log
- Lowest memory footprint on Pi
- Matches existing JARVIS service patterns (GameTheory on Flask/5001, status proxies on Python)

### 2.3 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      NGINX (port 80)                        │
│  /chub/ → localhost:9012    chub.cpr0duct.com → :9012       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Node.js Express + Socket.IO (:9012)            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  HTTP Routes │  │  Socket.IO   │  │  Static Files     │  │
│  │  /api/editor │  │  /battle     │  │  /client (HTML,   │  │
│  │  /api/data   │  │  /lobby      │  │   CSS, JS, audio) │  │
│  │  /api/status │  │  /jukebox    │  │                   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────────┘  │
│         │                │                                   │
│  ┌──────▼────────────────▼──────────────────────────────┐   │
│  │              Shared Game Engine (JS modules)          │   │
│  │  combat.js · cpu-ai.js · status.js · damage-calc.js  │   │
│  │  arena.js  · runes.js  · items.js  · weapons.js      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Data Layer                               │   │
│  │  parsers/ (CH2, AN2, ITM, W2K, INI, string-vars)    │   │
│  │  dataset-loader.js · state-manager.js (rooms)        │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                               │                              │
│              ┌────────────────▼─────────────────┐           │
│              │        /data/ (content)           │           │
│              │  characters/ arenas/ items/       │           │
│              │  weapons/ datasets/ audio/        │           │
│              └──────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 VB6-to-Node Module Mapping

| Original VB6 | Web Recreation |
|---|---|
| FBATTLE.FRM timers (tiDoMove, tiCPU, tiMisc) | setInterval loops in BattleRoom class |
| Global arrays: Senshi(), P(), Weapons(), etc. | BattleRoom instance state (per-room isolation) |
| DOMOVE.BAS (move execution) | engine/combat.js (shared server+client) |
| CPU.bas (AI logic) | engine/cpu-ai.js (server-side only) |
| DATASET.BAS (file loading) | parsers/*.js (CH2, AN2, ITM, W2K, INI) |
| DECLARE.BAS (types + globals) | engine/types.js + engine/constants.js |
| ConstDeclares.bas (enums) | engine/constants.js |
| ARENA1.BAS (arena effects) | engine/arena.js |
| ChiInit.Bas (initialization) | server/init.js |
| AOL chatroom (multiplayer) | Socket.IO rooms |
| VB6 Forms (editors) | Browser editor pages + REST API |
| FMIDI.FRM (Juke Box) | Web Audio API + MIDI.js + client player |
| Windows Registry (settings) | JSON config file + browser localStorage |

## 3. Game Engine

### 3.1 Timer System

Three `setInterval` loops per BattleRoom, mapping directly to the VB6 timers:

**moveLoop() (~500ms interval)** — maps to `tiDoMove_Timer`
- Process queued commands from Socket.IO
- Validate move legality (MP, status restrictions, super threshold)
- Call combat.executeMove()
- Resolve pending moves (check execution timers)
- Broadcast results to room

**cpuLoop() (750ms interval)** — maps to `tiCPU_Timer`
- For each CPU player, run `cpuAI.behNormal()` with priority chain:
  1. Block/counter incoming attacks
  2. Use Super abilities at threshold (SP >= 100)
  3. Apply buffs (Regen, Haste, Barriers)
  4. Heal low-HP allies (weighted by Goodwill personality stat)
  5. Attack strongest opponent (weighted by Wrath)
  6. Resource management — HP-to-Super divert (weighted by Greed)

**miscLoop() (1000ms interval)** — maps to `tiMisc_Timer`
- Apply passive HP/MP restoration (arena RestLowHP/RestHighHP)
- Tick status effect durations (XTimer)
- Roll arena events (frequency-based probability)
- Check battle end conditions (last team standing, time limit, etc.)
- Item spawn timer

### 3.2 Damage Calculation

Exact recreation of `ProjectedTotalDamage()` from `DOMOVE.BAS`:

```
1. Base damage = move.strength
2. Randomize ±25%: damage += random(damage/2) - damage/4
3. Apply attacker stat: damage *= (physStr or magStr) / 50
4. Apply defender stat: damage *= (100 - physDef or magDef) / 50
5. Arena element multiplier: damage *= arena.elements[move.element]
6. Arena global multiplier: damage *= arena.allAttacks
7. Weakness: if move.element === target.weakTo → damage *= 1.5
8. Resistance: if move.element === target.resistance → damage *= 0.5
9. Bless/Curse: bless → damage *= 1.5; curse → damage /= 1.5
10. Blind: if attacker blinded → damage *= 0.1
11. Super multiplier: hits = floor(SP / 50) + 2; damage *= hits
12. Cheese limit enforcement: cap max damage
13. Critical hit: 10% chance → damage *= 2
```

### 3.3 Move Execution Pipeline

```
Player types: /braver cloud2

1. PARSE     → { command: "braver", target: "cloud2", isSuper: false }
2. VALIDATE  → Check: alive? muted? frozen? enough MP? move exists?
3. QUEUE     → Set P[i].curMove, P[i].moveTarget, P[i].moveStart = now
4. BROADCAST → Emit "move-begin" string ("%SN focuses energy...")
5. WAIT      → 15s (normal), 10s (haste), 20s (slow), 20s+ (fatality)
6. HIT CHECK → Roll accuracy vs target defense → hit or miss
7. DAMAGE    → projectDamage() with all modifiers
8. APPLY     → Subtract HP, apply status effects (% chance per status)
9. BROADCAST → Emit hit/miss/crit string + damage numbers
10. POST     → Target dead? Life3? Fatality eligible? Battle over?
```

Special cases preserved:
- Cheese limit caps max damage per hit
- Supers always single-target regardless of move's target type
- Blocking during move wind-up cancels the move
- Counter-attack triggers if blocking with SP >= 100
- Fatality available when target <= 1/6 max HP
- Morph element changes character mid-battle

### 3.4 Status Effects (28+)

All status effects from `ConstDeclares.bas`, with identical behavior:

| Status | Effect | Duration | Removal |
|---|---|---|---|
| Mute | Physical moves only | XTimer ticks | Timer expiry |
| Chaos | Random moves on random targets | XTimer ticks | Timer expiry |
| Freeze | Cannot act, stops current move | XTimer ticks | Timer expiry or hit |
| Poison | HP loss every 15 game-seconds | 50% wear-off per tick | Random or cure |
| Blind | Attack value → 0 (minimal damage) | XTimer ticks | Timer expiry |
| Haste | Moves hit in 10s instead of 15s | XTimer ticks | Timer expiry |
| Slow | Moves hit in 20s instead of 15s | XTimer ticks | Timer expiry |
| Stun | Paralyzed, unable to move | Until hit | Taking damage |
| Life3 | Auto-resurrect on death (once) | Until triggered | Consumed on death |
| Regen | Gradual HP recovery | XTimer ticks | Timer expiry |
| Stop | Frozen in time, cannot act | XTimer ticks | Timer expiry |
| Mushroom | Transformed, gains HP, cannot act | XTimer ticks | Timer expiry |
| MIA | Removed from battle temporarily | Fixed duration | Cannot be nullified |
| Quick | Next move hits instantly | One use | On next move |
| Berserk | Random attacks, 1.5x damage | XTimer ticks | Timer expiry |
| Sleep | Cannot act | Until hit | Taking damage |
| Bless | 1.5x damage dealt | XTimer ticks | Timer expiry |
| Curse | 1/1.5x damage dealt | XTimer ticks | Timer expiry |
| P. Barrier | Physical damage reduction | XTimer ticks | Timer expiry |
| M. Barrier | Magic damage reduction | XTimer ticks | Timer expiry |
| Invincible | Immune to damage | XTimer ticks | Timer expiry |
| Charmed | Attacks allies instead of enemies | XTimer ticks | Timer expiry |
| Doom | Death after countdown | Fixed timer | Cannot be nullified |
| + remaining effects from ConstDeclares.bas | | | |

Applied via percentage chance from move/item definitions. Moves can also remove statuses (value of -1 in the status slot).

### 3.5 Battle Types

All 5 from `FBATTLE.FRM`:

- **Teams** — Players assigned to teams (A-Z). Last team standing wins. Default mode.
- **Free-for-All (FFA)** — Everyone vs everyone. Last player alive wins.
- **Respawn FFA** — 30-second respawns. Score by kills. Time limit.
- **Capture the Flag** — Team-based CTF with flag mechanics.
- **Fatality FFA** — Score only via fatality kills.

### 3.6 Super Meter System

- Max SP: 300 points
- Gaining: taking damage (+SP proportional), dealing damage (+SP smaller), `/divert` (convert HP→SP), resting (+SP per tick)
- Super Attack (100+ SP): `/s-movename` or `/3-movename` — hits = `floor(SP/50) + 2`, consumes all SP, always single-target
- Counter Attack (100+ SP): automatic when blocking — reflects damage to attacker
- Rune activation: some runes consume SP

### 3.7 Rune System

11 runes from `ConstDeclares.bas`: Haste, Magic, Armor, Counter, Luck (and variants), Survival, Thorns, Counter Guard. Each provides a passive buff for the duration of the battle.

### 3.8 Elements (30+)

From `ConstDeclares.bas`: Physical, Heal, NoDmg, Poison, Grass, Rock, Psychic, Ghost, Water, Fire, Lightning, Earth, Wind, Ki, HPSteal, MPSteal, Clone, WeaponBreak, Morph, Life, Demi, Reveal, and more. Each has an arena multiplier slot.

## 4. Data Parsers

### 4.1 Architecture

```
parsers/
├── ch2-parser.js      Read/write .CH2 (text) and .CHE (encrypted)
├── an2-parser.js      Read/write .AN2 (text) and .ANA (encrypted)
├── itm-parser.js      Read/write .ITM
├── w2k-parser.js      Read/write .W2K
├── ini-parser.js      Read/write .INI datasets (with glob expansion)
├── string-vars.js     %SN, %T, %S2, %Y variable substitution engine
└── index.js           Unified loader: loadDataset(iniPath) → full game state
```

All parsers are bidirectional (read + write) to support the editor suite. Content created in the web editors saves in the exact original file format.

### 4.2 Character Format (.CH2)

Line-by-line text format from `CH1.BAS LoadChar()`:

- Line 1: fullName (quoted string)
- Line 2: targetId
- Line 3: species
- Line 4: commandKey (no leading slash)
- Line 5: selectString
- Line 6: selectJoinString
- Lines 7-10: physStr, physDef, magStr, magDef (integers, must total <= 220)
- Line 11: weakTo (element name or empty)
- Line 12: restString
- Lines 13-15: blockString, blockFailString, blockSuccessString
- 5 taunts, 5 kill strings, 5 when-killed strings
- Fatality: commandKey, preString, moveString
- Up to 12 moves, each a repeating block: name, commandKey, canBeSupered, beginString, superBeginString, healSelfString, hitString, postMoveB, postMoveA, critString, superHitString, superMissString, missString, status[0-27], element, strength, target

### 4.3 Arena Format (.AN2)

From `ARENA1.BAS LoadArena()`:

- Line 1: name
- Lines 2-11: description (10 lines)
- Lines 12-42: elements[0-30] (31 multipliers; index 0 = allAttacks global)
- Lines 43-48: restLowHP, restHighHP, restLowMP, restHighMP, hpPerSecond, mpPerSecond
- Up to 10 events, each: name, frequency (1-5), hpDamage, hitString, missString, hitsAll flag

### 4.4 Item Format (.ITM)

From `FITEMED.FRM`:

- Lines 1-5: name, spawnString, telefragString, getString, youmaGetString
- Lines 6-7: hp, mp
- Lines 8-35: status[0-27] (percentage chance for each status effect)

### 4.5 Weapon Format (.W2K)

- Lines 1-6: name, shortName, equipString, description, dropString, charges
- Up to 5 moves (same structure as character moves, plus weaponEffect field and instant/requiresAllUses flags)

### 4.6 Dataset Format (.INI)

From `DATASET.BAS`:

- Lines 1-48: quoted strings for game event messages (see C2KData.txt for full mapping)
- After `[more]` marker or line 48: file glob patterns for content loading
- After `[Death]` marker: death announcement strings (random selection)
- After `[Fatality]` marker: fatality announcement strings

String variables: `%SN` (player name), `%T` (target), `%S2` (secondary), `%Y` (other).

DOS wildcard translation: `*.CH?` → `*.{CH2,CHE}`, `*.*` → all supported extensions. Relative paths resolved from INI file location.

### 4.7 Encrypted Formats (.CHE, .ANA)

Binary encrypted variants of .CH2 and .AN2. Decryption routine ported from `CH1.BAS LoadEncryptedChar()`. Ensures compatibility with content packs distributed in encrypted format.

## 5. Multiplayer

### 5.1 Connection Flow

```
CONNECT → LOBBY → ROOM SETUP (Selection) → BATTLE
                         ↕                      ↕
                     SPECTATE ←── (eliminated players)
```

### 5.2 Room Lifecycle

```
WAITING → SELECTION → VOTING → BATTLE → ENDED
                                  ↕         ↓
                               PAUSED    (restart)
```

- **WAITING** — room created, players joining
- **SELECTION** — players pick characters, assign teams, add CPU bots
- **VOTING** — vote on battle type and arena
- **BATTLE** — game loop running, commands accepted
- **PAUSED** — host paused, timers frozen
- **ENDED** — results/stats shown, option to restart

### 5.3 CPU Bot Management

- Room creator can add CPU bots during selection phase
- Pick character, assign team, set CPU personality
- CPU personality: 4 sliders from `FCPUEdit.frm` — Goodwill (heal priority), Greed (item/SP priority), Wrath (attack aggression), Arrogance (super usage)
- Presets: Aggressive, Defensive, Greedy, Balanced, Custom
- "Add Random CPUs" button — auto-picks random characters with random personalities
- "EZ-Teams" button — auto-distributes all players across teams evenly (from `FCharEdi.frm`)
- "Fill CPUs" button — fills remaining slots with random CPU characters
- Solo play: one human + any number of CPU bots, or all-CPU "Full Auto" mode

### 5.4 Authority Model

**Server-authoritative:** damage calculation, hit/miss/crit rolls, status effect application, HP/MP/SP changes, move validation, kill/death determination, battle end conditions, item spawn timing, arena event triggers, CPU AI decisions.

**Client-side (display only):** battle text rendering, HP/MP/SP bar animations, status icon display, move timer countdown (cosmetic), Jukebox audio playback, scroll speed preferences, command history and autocomplete.

### 5.5 Chat Commands

Exact original syntax preserved:

- `/cloud` — select character (selection phase)
- `/braver cloud2` — use move targeting player
- `/1`, `/2`, ... — quick-select move by number
- `/s-braver cloud2` or `/3-braver` — super move
- `/block` — block incoming attack
- `/rest` — rest to recover HP/MP
- `/taunt` — taunt opponent
- `/divert 50` — convert HP to Super Points
- `/moves`, `/status` — view moves/stats
- `/get` — pick up spawned item
- `/flee` — attempt to flee battle
- `/defect player` — switch teams
- `/fatal target` or `/<fatalkey> target` — execute fatality
- `~begin`, `~pause`, `~unpause`, `~end` — host commands (tilde prefix)
- `~kick player`, `~hostboot player` — host moderation

### 5.6 Reconnection

If a player disconnects mid-battle, their character auto-switches to CPU control for 60 seconds. If they reconnect within that window, they resume control. After 60 seconds, CPU plays for them until battle end.

### 5.7 Spectator Mode

Eliminated players and lobby visitors can spectate active battles. Spectators receive all `battle:message` and `battle:state-update` events but cannot send commands.

## 6. Client UI

### 6.1 Technology

Vanilla HTML/CSS/JS. No frontend framework. Socket.IO client for real-time communication. Light/dark theme toggle (default: dark, stored in localStorage).

### 6.2 Pages

```
client/
├── index.html          Landing page → lobby
├── lobby.html          Room browser, create/join
├── battle.html         Main battle interface
├── editors/
│   ├── character.html  Character editor
│   ├── arena.html      Arena editor
│   ├── item.html       Item editor
│   ├── weapon.html     Weapon editor
│   ├── dataset.html    Dataset/INI editor
│   └── cpu.html        CPU personality editor
├── jukebox.html        Music player
├── stats.html          Battle statistics
├── css/
│   ├── chub.css        Core styles + light/dark themes
│   └── battle.css      Battle-specific layout
└── js/
    ├── socket-client.js    Socket.IO connection manager
    ├── battle-view.js      Battle text renderer + stat bars
    ├── command-input.js    Slash command parser + autocomplete
    ├── jukebox-player.js   Audio playback engine
    ├── editor-forms.js     Shared editor form logic
    ├── theme.js            Light/dark mode toggle + persistence
    └── shared/             Shared engine modules (import from server)
```

### 6.3 Battle Interface Layout

Recreation of `FBATTLE.FRM`:

- **Toolbar** (top) — Exit, Begin, Pause, Moves, Chars, Teams, Stats, Jukebox buttons + scroll speed slider + theme toggle
- **Battle text log** (left/main) — scrolling text output with color-coded messages (attacks in red, heals in green, items in yellow, arena events in purple, system messages in blue)
- **Status panel** (right sidebar) — per-player cards showing: name, character, team, HP/MP/SP bars with numbers, active status effect badges, [CPU] indicator. Plus arena info and item-on-field indicator.
- **Command input** (bottom) — slash command input with autocomplete for move names, player names, and commands. Command history with up/down arrows.
- **Status bar** (bottom) — battle type, arena name, elapsed time, player count, spectator count, latency

### 6.4 Responsive Design

- **Desktop (>900px)** — side-by-side: battle log left, status panel right
- **Tablet (600-900px)** — status panel collapses to compact top bar with HP bars only, expandable on tap
- **Mobile (<600px)** — full-width battle log, swipe-up panel for status, bottom-fixed command input

### 6.5 Light/Dark Theme

- **Dark (default)** — dark backgrounds (#0a0a1a, #1a1a2e), light text, colored accents. Faithful to the VB6 aesthetic.
- **Light** — white/light gray backgrounds, dark text, same accent colors adjusted for contrast.
- Toggle button in toolbar area. Preference stored in localStorage.
- CSS custom properties (variables) for all theme-dependent colors. Single class toggle on `<body>`.

## 7. Editor Suite

### 7.1 REST API

```
GET  /api/editor/characters          List all .CH2/.CHE files
GET  /api/editor/characters/:file    Parse and return character data as JSON
POST /api/editor/characters/:file    Save character data (JSON → .CH2)
DEL  /api/editor/characters/:file    Delete character file

GET  /api/editor/arenas              List all .AN2/.ANA files
GET  /api/editor/arenas/:file        Parse and return arena data as JSON
POST /api/editor/arenas/:file        Save arena data (JSON → .AN2)
DEL  /api/editor/arenas/:file        Delete arena file

GET  /api/editor/items               List all .ITM files
GET  /api/editor/items/:file         Parse and return item data as JSON
POST /api/editor/items/:file         Save item data (JSON → .ITM)
DEL  /api/editor/items/:file         Delete item file

GET  /api/editor/weapons             List all .W2K files
GET  /api/editor/weapons/:file       Parse and return weapon data as JSON
POST /api/editor/weapons/:file       Save weapon data (JSON → .W2K)
DEL  /api/editor/weapons/:file       Delete weapon file

GET  /api/editor/datasets            List all .INI files
GET  /api/editor/datasets/:file      Parse and return dataset config as JSON
POST /api/editor/datasets/:file      Save dataset config (JSON → .INI)

POST /api/editor/reload              Hot-reload all content (no restart)
```

### 7.2 Character Editor

Recreation of CharEdit + CH1.BAS:
- Identity fields: full name, target ID, command key, species
- Stat sliders: physStr, physDef, magStr, magDef (enforcing 220 total cap with live counter)
- Weakness/resistance element dropdowns
- Move list (up to 12) with inline summary (name, command, element, strength, target type)
- Move sub-editor: all fields from the .CH2 move block including all 28 status effect percentage sliders
- Fatality section: command key, pre-string, move string
- Collapsible strings panel: select, rest, block, taunts (5), kill strings (5), death strings (5)
- Load .CH2 / Save .CH2 / Clear actions

### 7.3 Arena Editor

Recreation of ARENA1.BAS:
- Name and 10-line description
- 31 element multiplier sliders (index 0 = global "all attacks" multiplier)
- HP/MP restoration ranges (low/high for rest, per-second gradual)
- Up to 10 events, each with: name, frequency slider (1-5), HP damage, hit/miss strings, hitsAll toggle

### 7.4 Item Editor

Recreation of FITEMED.FRM:
- Name, spawn string, telefrag string, get string, youma get string
- HP and MP values (negative values for damage)
- Grid of 28 status effect percentage inputs

### 7.5 Weapon Editor

- Name, short name, equip string, description, drop string, charges (0 = unlimited)
- Up to 5 moves using the same move sub-editor as character editor
- Per-move weapon effect: no effect / expend charge / drop weapon / destroy weapon
- Instant hit and requires-all-uses flags

### 7.6 Dataset Editor

- 48 configurable message strings with live %SN/%T/%S2/%Y preview
- File glob pattern list with add/remove/reorder
- [Death] and [Fatality] message string lists

### 7.7 CPU Personality Editor

Recreation of FCPUEdit.frm:
- Four sliders: Goodwill (0-100), Greed (0-100), Wrath (0-100), Arrogance (0-100)
- Presets: Aggressive (Wrath=90, Arrogance=80), Defensive (Goodwill=90), Greedy (Greed=90), Balanced (all 50), Custom

## 8. Juke Box

Recreation of `FMIDI.FRM`:

- Playlist view with track list from the loaded dataset's audio directory
- Transport controls: play, pause, previous, next
- Volume slider (per-player, local)
- Loop and shuffle toggles
- Now-playing display

### 8.1 Audio Format Support

- **MIDI** — Web MIDI API with MIDI.js fallback (software synthesis)
- **MP3** — HTML5 Audio element
- **SPC** — JavaScript SNES APU emulator (spc_player.js or equivalent)

### 8.2 Sync

Host controls the playlist and track selection. All players in the room receive `jukebox:track-change` and `jukebox:sync` events. Playback starts at the same position. Individual volume control per player.

## 9. Deployment

### 9.1 Raspberry Pi Service

```ini
# /etc/systemd/system/chub.service
[Unit]
Description=ChUB 2000 Web Battle Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/projects/CHUB
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=9012

[Install]
WantedBy=multi-user.target
```

### 9.2 Nginx Configuration

```nginx
location /chub/ {
    proxy_pass http://127.0.0.1:9012/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

WebSocket upgrade headers are required for Socket.IO. Long read timeout for persistent connections.

### 9.3 Cloudflare Tunnel

New subdomain entries in existing tunnel config:

```yaml
- hostname: chub.cpr0duct.com
  service: http://192.168.1.25:9012
- hostname: chub.cpr0duct.work
  service: http://192.168.1.25:9012
```

### 9.4 Access Routes

| Method | URL | Notes |
|---|---|---|
| Local (ethernet) | http://192.168.1.25/chub/ | Direct LAN access |
| Local (wifi) | http://192.168.1.10/chub/ | Direct LAN access |
| Local direct | http://192.168.1.25:9012/ | Bypass nginx |
| Cloudflare | https://chub.cpr0duct.com/ | Always-on public |
| Cloudflare | https://chub.cpr0duct.work/ | Alternate domain |
| ngrok | https://\<ngrok-url\>/chub/ | Corporate firewall bypass |

### 9.5 Status API

```
GET /chub/api/status → {
  "status": "online",
  "uptime": 86400,
  "rooms": { "active": 2, "total_created": 15 },
  "players": { "online": 5, "peak": 12 },
  "content": {
    "characters": 147, "arenas": 23,
    "items": 18, "weapons": 12, "datasets": 8
  }
}
```

### 9.6 Development Workflow

- Edit code on Windows (D:\AI\CHUB)
- Syncthing auto-syncs to Pi (/home/pi/projects/CHUB) every 30 seconds
- Dev mode: nodemon or fs.watch auto-restarts server on changes
- Production: manual restart via `sudo systemctl restart chub`

## 10. Content Organization

```
data/
├── characters/
│   ├── finfant/        Final Fantasy (Cloud, Tifa, Aeris, Barret...)
│   ├── smeb/           Sailor Moon
│   ├── dbz/            Dragon Ball Z
│   ├── pokemon/        Pokemon
│   ├── mvc/            Marvel vs Capcom
│   ├── starwars/       Star Wars
│   ├── ssmk/           Super Smash Bros
│   ├── smrpg/          Super Mario RPG
│   ├── zelda64/        Legend of Zelda
│   ├── fanchars/       Fan-created characters
│   └── xchars/         Extra/misc characters
├── arenas/             All .AN2/.ANA arena files
├── items/              All .ITM item files
├── weapons/            All .W2K weapon files
├── datasets/           All .INI dataset configs
│   ├── arcade.ini
│   ├── MegaMix.ini
│   ├── smeb.ini
│   └── ...
└── audio/
    ├── midi/           MIDI music files
    ├── mp3/            MP3 audio files
    └── spc/            SNES SPC audio files
```

Original content packs from the GitHub repo reorganized into this structure. INI file glob paths updated to use new relative paths. All original files preserved unmodified.

## 11. Project Structure

```
CHUB/
├── server/
│   ├── index.js            Entry point (Express + Socket.IO setup)
│   ├── init.js             Game initialization (ChiInit.Bas port)
│   ├── routes/
│   │   ├── editor.js       Editor REST API routes
│   │   └── status.js       Status API route
│   └── sockets/
│       ├── lobby.js        Lobby event handlers
│       ├── room.js         Room/selection event handlers
│       └── battle.js       Battle event handlers
├── engine/                 Shared game engine (server + client)
│   ├── types.js            Data structures (CharType, MoveType, etc.)
│   ├── constants.js        All constants from ConstDeclares.bas
│   ├── combat.js           Move execution (DOMOVE.BAS port)
│   ├── damage-calc.js      Damage formula
│   ├── cpu-ai.js           CPU AI (CPU.bas port) — server-only
│   ├── status.js           Status effect logic
│   ├── arena.js            Arena effects (ARENA1.BAS port)
│   ├── runes.js            Rune system
│   ├── items.js            Item pickup/effects
│   ├── weapons.js          Weapon system
│   ├── battle-room.js      BattleRoom class (state + timer loops)
│   └── command-parser.js   Slash command parsing
├── parsers/
│   ├── ch2-parser.js       .CH2/.CHE read/write
│   ├── an2-parser.js       .AN2/.ANA read/write
│   ├── itm-parser.js       .ITM read/write
│   ├── w2k-parser.js       .W2K read/write
│   ├── ini-parser.js       .INI dataset read/write + glob expansion
│   ├── string-vars.js      %SN/%T/%S2/%Y substitution
│   └── index.js            Unified dataset loader
├── client/                 Static frontend files
│   ├── index.html
│   ├── lobby.html
│   ├── battle.html
│   ├── jukebox.html
│   ├── stats.html
│   ├── editors/            Editor pages
│   ├── css/                Stylesheets (with light/dark themes)
│   └── js/                 Client-side JavaScript
├── data/                   Game content (see Section 10)
├── config/
│   └── default.json        Server config (port, paths, defaults)
├── package.json
└── docs/
```

## 12. Follow-Up Tasks (Separate Projects)

- **JARVIS Dashboard Card** — add ChUB card to JARVIS dashboard consuming `/chub/api/status`. To be done via JARVIS_Server project AI.
- **DNS Setup** — add `chub.cpr0duct.com` and `chub.cpr0duct.work` CNAME records in Cloudflare DNS + tunnel config entries.
