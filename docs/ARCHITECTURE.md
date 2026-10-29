# Architecture

## Overview

```
 ┌────────────── Big screen (TV / PC browser) ──────────────┐        ┌──── Phone (browser) ────┐
 │ apps/web/index.html → src/host/main.ts                    │        │ controller.html          │
 │  • view state machine (menu, lobby, countdown, playing,   │        │  → src/controller/main.ts│
 │    paused, results, error/reconnect overlays)             │        │  • join / chef / lobby   │
 │  • render/scene.ts  Three.js, ortho near-isometric camera │        │  • joystick + 2 buttons  │
 │  • hud.ts           order tickets, timer, score, banners  │        │  • contextual hints      │
 │  • audio/audio.ts   procedural Web Audio                  │        │  • haptics (optional)    │
 └───────────────▲───────────────────────────────────────────┘        └─────────▲───────────────┘
                 │ JSON over WebSocket (/ws)                                       │
                 │  state 20 Hz (delta stations), events                           │ 'in' ~20 Hz, 'act'
                 ▼                                                                 ▼
 ┌──────────────────────────── apps/server (Node, ws) ───────────────────────────────────────┐
 │ server.ts      HTTP (static build, /api/info, /healthz) + WebSocket upgrade, heartbeat    │
 │ connection.ts  per-socket role + token-bucket rate limiter                                │
 │ roomManager.ts room codes, limits, expiry sweeper                                         │
 │ room.ts        lobby membership, phase state machine, reconnection, fixed-step loop,      │
 │                broadcast (host: full/delta state; phones: hints + personal feedback)      │
 └───────────────────────────────▲───────────────────────────────────────────────────────────┘
                                 │ pure function calls
 ┌───────────────────────────────┴─────────────────────┐   ┌──────────────────────────────────┐
 │ packages/game-logic  (no I/O, deterministic)        │   │ packages/shared                  │
 │ simulation.ts  movement, collisions, interactions,  │   │ protocol.ts  message types       │
 │                cooking, orders, scoring, chaos      │   │ validate.ts  untrusted input      │
 │ balance.ts     2/3/4-player adaptation              │   │ phases.ts    room state machine   │
 │ layout.ts      ASCII levels + playability validator │   │ characters.ts chef cast           │
 │ levels/, recipes.ts, ingredients.ts (data)          │   │ roomCode.ts, constants.ts         │
 └─────────────────────────────────────────────────────┘   └──────────────────────────────────┘
```

## Responsibilities (as required)

| Concern | Owner |
|---|---|
| Rooms, identity, start/end, valid actions, items & transformations, official timers, orders, score, win/lose | **Server** (`room.ts` + `GameSimulation`) |
| 3D rendering, camera, animation, interpolation, big-screen UI, VFX/SFX | **Host client** |
| Touch controls, button feedback, chef selection, contextual actions, connection status, errors | **Phone client** |

The simulation runs at a fixed 20 Hz (`SIM_TICK_HZ`) with bounded catch-up and never depends on
render frame rate. Clients never send scores, timers or item states: only intent (movement vector,
action-held flag, interact presses with sequence numbers) and lobby/flow requests.

## Data flow per tick

1. Phone sends `in {s, x, z, u}` when the stick changes (throttled ~22 Hz + trailing send) and
   `act {s}` on each INTERACT press.
2. Server validates (`parseClientMessage`), drops stale/duplicate sequence numbers, applies to sim.
3. `room.loop` steps the sim, then:
   - host ← `state` (players every tick, **only changed stations**, orders, events; `full` after init/resume)
   - each phone ← `you` hint only when it changed; `fb` personal feedback for its own events.
4. Host interpolates players 90 ms behind real time between snapshots.

## Interaction model

`resolveInteract` / `resolveUse` in the simulation return `{label, apply}`. The label is the phone's
contextual button text; `apply` performs the action. One function = the hint can never lie.

Targeting: the station in the 3×3 neighbourhood whose tile is within reach and best aligned with the
chef's facing. Concurrency: interactions are processed sequentially per tick; boards/repairs lock to
one chef per tick (`busyBy`).

## Player-count adaptation (balance.ts)

Non-linear: separate multipliers for spawn interval, order patience and star thresholds; extra
simultaneous orders at 3 and 4 players; plus content filtering by `minPlayers` (menu entries,
conditional stations in the layout, extra chaos events). Spawn points are assigned by entry order so
split kitchens always have a chef on each side.

## Rendering pipeline

- `textures.ts` procedural canvas textures (tiles, wood, steel, stone), cached.
- `models/*` procedural stylised models with shared geometry/material caches.
- `mergeStatic()` batches every static mesh per material (−69 % draw calls measured: 695 → 214);
  animated parts are flagged `userData.dynamic` and kept separate.
- Lighting: hemisphere + shadowed key light fitted to the kitchen + per-theme accent point lights;
  ACES tone mapping. Quality presets high/medium/low (shadow map size, DPR cap, particle budget).
- `particles.ts` pooled GPU point sprites (2 draw calls for all effects).

## Security

See `docs/SECURITY.md`.
