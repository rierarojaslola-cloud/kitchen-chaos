# Testing

## Suites

| Suite | Command | What it covers |
|---|---|---|
| Typecheck | `npm run typecheck` | strict TS across all packages, apps and tests |
| Unit | `npm test` (tests/unit) | room codes, message validation, sanitising, phase machine, rate limiter; level playability for 2/3/4 players; balance; recipe matching; full burger service in the sim; chopping lock; burning + warning; pizza assembly + oven; fryer rules; penalties and exact score breakdown; order caps; end of level & stars; determinism; breakdown/repair; shortage; movement, collisions, soft separation, flick-to-turn, disconnected input |
| Integration | `npm test` (tests/integration) | real server + real WebSocket clients: create/join/full/wrong code/version, unique chefs, duplicate seat, leader/host privileges, kick, malformed messages, rate limit, host resume, movement sync, act dedupe + hints, pause on disconnect + auto-resume, late join rejected, 2-of-3 continues, room isolation, full level → results → retry → lobby |
| E2E browser | `npm run build && npm run test:e2e` | real Chromium: big screen (1600×900) + 5 emulated phones (844×390 touch). Bot drives chefs **through the phone joystick and buttons** |

## Latest results (2026-10-29, this environment)

- Typecheck: ✅ 0 errors
- Vitest: ✅ **62/62** (49 unit + 13 integration)
- E2E: ✅ **26/26 checks** — `.e2e-artifacts/report.json`

E2E checks: title renders · room created (code format) · QR/URL route · wrong code error · 4 phones
join with slots 0–3 · 5th rejected (room full) · leader phone starts 4-player game · joystick moves
chef on host · plate + bun via phone · contextual label "Agafar hamburguesa" · pick up via phone ·
patty placed on grill · cooked patty plated by a second chef · dish served, score 0 → 48 on host ·
phone reload resumes same slot · phone network drop recovers · pause from phone + resume from leader ·
render stats · level ends with results on host and phones · leader returns to lobby · pizza-1,
pizza-2, asian-1, asian-2, burger-2 load and render with 3 players · no console errors.

### Bugs found by these tests and fixed
- Pizza-2 layout had two unreachable counters (level validator).
- Controller crashed on load: socket callback fired before module init (TDZ) → connect deferred.
- `[hidden]` overridden by `display:grid`: countdown overlay kept covering the joystick.
- CSS custom properties set via `Object.assign(style)` were ignored (player colours, accents).
- Last joystick position could be delayed until keep-alive → trailing throttled send.
- Short flicks lost within one server tick → facing applied on any directional input.
- Score breakdown didn't add up when penalties hit the 0 floor → penalties record amount deducted.
- `navigator.vibrate` called before user activation → gated.
- Visual: camera too top-down, decor occluding stations, high-contrast floor (screenshots review).

## Blender models (2026-10-29)
- Vitest ✅ 62/62 · E2E ✅ 26/26 with all 16 GLB models loaded (host at quality "low" in E2E to keep the
  CPU-rendered browser responsive; timeouts for phone pages raised to 120 s).
- `npx tsx tests/e2e/screens.ts --compare [levels]` captures every level with GLB and with `?procedural=1`.
  burger-2: GLB 250k tris / 358 draw calls vs procedural 281k / 281 (high quality).
- Model review renders: `docs/assets/chefs-cast.png`, `stations-a.png`, `stations-b.png`.

## Simulated vs physical

Everything above is **simulated/emulated**. Not yet done: physical phones (iOS/Android), a real TV
browser, real-GPU FPS measurement, audio listening test, human playtests for balance. See TASKS.md P0.

## Performance notes

Headless Chromium uses SwiftShader (CPU WebGL): 1–3 FPS at 1600×900 — meaningless for real
hardware. Measured structural metrics: menu scene 206–214 draw calls (695 before static batching),
4-player burger game 251 draw calls / 191k triangles at "medium".
