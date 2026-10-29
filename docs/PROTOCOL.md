# Network protocol (v1)

Transport: JSON text frames over WebSocket at `/ws` (same origin as the web client).
Source of truth: `packages/shared/src/protocol.ts`; validation: `packages/shared/src/validate.ts`.
`PROTOCOL_VERSION = 1` — mismatches are rejected with a fatal `VERSION_MISMATCH`.

## Client → server

| `t` | Sender | Fields | Notes |
|---|---|---|---|
| `host:create` | screen | `v`, `progress?` | creates a room; reply `host:created {code, token}` |
| `host:resume` | screen | `v, code, token` | reattach after reload/drop |
| `host:kick` | screen | `playerId` | lobby/results only |
| `host:close` | screen | — | closes the room for everybody |
| `player:join` | phone | `v, code, name, character` | reply `joined {playerId, token, slot}` |
| `player:resume` | phone | `v, code, token` | same slot, same chef |
| `player:character` | phone | `character` | unique per room |
| `player:ready` | phone | `ready` | informative |
| `player:leave` | phone | — | voluntary exit |
| `in` | phone | `s, x, z, u` | movement vector (clamped to unit circle) + ACTION held; stale `s` ignored |
| `act` | phone | `s` | INTERACT press; strictly increasing `s` (duplicates ignored) |
| `level` | screen / leader | `levelId` | must be unlocked |
| `flow` | screen / leader (pause: any player) | `action: start\|pause\|resume\|toLobby\|retry\|next` | server applies the phase state machine |
| `ping` | any | `c` | reply `pong {c, s}` |

## Server → client

| `t` | To | Purpose |
|---|---|---|
| `room` | all | lobby snapshot: phase, players, leader, level, unlocks, pause reason, countdown remaining |
| `level:init` | screen | static level description (layout, stations, menu, stars) |
| `state` | screen | 20 Hz: players, **changed** stations (`full:true` on first), orders, events |
| `you` | phone | contextual hint (only when it changes) |
| `fb` | phone | personal feedback (invalid action reason, served +points, wrong dish) |
| `results` | all | level results |
| `error` | one | `code`, Catalan `message`, `fatal` |
| `kicked`, `closed` | phone / all | terminal notices |

## Room phases

`lobby → countdown → playing ⇄ paused → results → (countdown | lobby)`, any → `closed`.
Transition table in `packages/shared/src/phases.ts` (unit-tested).

## Limits

| Limit | Value |
|---|---|
| message size | 1 KB (validator), 4 KB (socket max payload) |
| rate | 60 msg/s, burst 120 (token bucket); persistent abuse closes the socket |
| rooms | `MAX_ROOMS` (default 300) |
| players | 2–4 per room |
| lobby reconnect grace | 45 s · host grace 120 s · idle room 600 s |
| heartbeat | WebSocket ping every 10 s; dead sockets terminated |
