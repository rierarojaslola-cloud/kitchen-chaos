# Development status

_Last update: 2026-10-29 (Blender models) · version 0.2.0 · protocol 1_

Legend: ✅ **verified** (automated test or browser E2E evidence) · 🟡 **implemented, not fully verified**
· 🧪 **provisional** (works, needs art/playtest pass) · ⬜ **pending**.

## Acceptance criteria (brief §17.5)

| Criterion | State | Evidence |
|---|---|---|
| A real room can be created | ✅ | integration + E2E (`Room created from the big screen`) |
| Phones can connect | ✅ emulated · ⬜ physical | E2E with 4–5 emulated touch devices; **no physical phone tested yet** |
| Start a game with 2 players | ✅ | integration (`requires 2 connected players…`) |
| Play with 4 players | ✅ | E2E 4-player session |
| Actions synchronise | ✅ | E2E joystick → chef moves on host; integration movement/interact |
| Recipes can be completed | ✅ burger via phones · ✅ pizza in sim · 🟡 bowls/fries | E2E served a burger (score 0→63); unit tests: burger, pizza, chopping, fryer rules; all menus validated structurally for 2/3/4 players |
| Score reflects actions | ✅ | unit (tips, coop bonus, penalties, breakdown adds up), E2E |
| Real end-of-level condition | ✅ | integration (30 s level) + E2E results on host and phones |
| Main interactive elements not permanent placeholders | ✅ chefs + stations · 🧪 food | chefs and all stations are Blender-built GLB models with rig/animation; food items still procedural (ASSETS.md) |
| Run instructions work | ✅ | `npm install`, `npm run build`, `npm start`, `/healthz`, `/api/info` verified in this environment |
| Known critical bugs documented | ✅ | none open; see "Known issues" |

## Features

### Multiplayer & rooms
- ✅ Room creation, 4-letter unambiguous code (no I/O/digits), QR to `/controller.html?room=CODE`
- ✅ 2–4 players, 5th rejected, wrong code error, version mismatch error
- ✅ Unique chef per room, chef change in lobby, ready flag
- ✅ Host kick, close room, room expiry sweeper, host resume with token
- ✅ Player reconnection with session token (reload resumes same slot)
- ✅ Network drop on a phone recovers (E2E offline/online)
- ✅ Pause when below min players, auto-resume on return; 3–4 players continue with an idle chef
- ✅ Rate limiting, strict validation, duplicate/stale input protection, room isolation
- 🟡 Heartbeat termination of dead sockets (implemented; not covered by a test)
- ⬜ Horizontal scaling (single process by design for now)

### Gameplay
- ✅ Movement with wall/station collisions and soft player separation; flick-to-turn
- ✅ Contextual interact (pick, place, combine, plate, toppings, serve, trash, return plate)
- ✅ Hold-action: chopping (board lock per chef), repairing
- ✅ Cooking states raw → cooked → burnt with warning; 5 cooking station types
- ✅ Orders with timers, tips, cooperation bonus, expiry penalty, waste penalty, stars
- ✅ Chaos events: rush, urgent order, breakdown + repair, ingredient shortage
- ✅ Player-count balance (non-linear multipliers + minPlayers content); validator proves every level is playable with 2, 3 and 4 players
- ✅ 3 restaurants × 2 levels, progressive unlocking (≥1 star), local progress persistence
- 🧪 Balance numbers (order intervals, star thresholds) are first-pass: **no human playtest yet**
- ⬜ Cosmetic rewards / unlockables, dish-washing, moving hazards, dessert restaurant

### Presentation
- ✅ Near-isometric orthographic camera auto-fitted, HUD reserve; screenshots of all 6 levels
- ✅ Distinct restaurant identities (palette, floor, walls, counter materials, lights, decor)
- ✅ 6 original chefs with different silhouettes, procedural animation (walk, carry, chop, repair, idle, blink, celebrate, sad)
- ✅ Station state indicators (progress bars, burn "!", broken wrench, glow/flames/oil)
- ✅ Particles (steam, smoke, sparks, bits, confetti, stars, flames)
- ✅ Static batching: draw calls 695 → 214 (menu scene, high quality); 251 in a 4-player game
- ✅ Blender pipeline: 10 rigged chefs (4 men, 6 women, diverse origins; 7 clips, 2-layer blending) + 10 stations as GLB, 1.97 MB, auto fallback
- 🧪 Food, plates, decor, textures still procedural; no PBR normal/roughness maps
- 🟡 Audio engine (22 SFX + 4 music styles, intensity levels, volume/mute persisted) — **never listened to by a human**; headless tests have no audio output
- ⬜ Weighted skinning / facial shape keys, hand-finished art pass, hand-made icons/illustrations

### UX & accessibility
- ✅ Catalan UI; clear errors (wrong code, full room, in game, version, closed, kicked)
- ✅ Identity by colour **and** number (J1–J4); timer/score/warnings visual + audio
- ✅ Options: music/SFX volume, mute, graphics quality, reduced motion, FPS overlay
- ✅ Keyboard: Space/Esc pause on host; focus-visible styles
- ✅ Phone: large thumb targets, dynamic joystick with dead zone, hold-progress ring, vibration optional and gated by user activation, wake lock when available
- 🟡 No formal WCAG audit; colour contrast chosen deliberately but not measured

### Performance
- ✅ Simulation fixed 20 Hz, independent of render FPS
- ✅ State deltas (only changed stations), per-phone hints only on change
- ⬜ **FPS on real GPUs not measured.** Headless test runs use SwiftShader (CPU) → 1–2 FPS, not representative.

## Known issues / limitations
- Not yet tested on physical phones or a physical TV browser (only emulation).
- Server runs TypeScript through `tsx` (no separate server build step); fine for a small deployment.
- Campaign progress is per host browser (localStorage), by design.
- Fonts include non-latin subsets in the build output (only latin is downloaded at runtime thanks to `unicode-range`).
