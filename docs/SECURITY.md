# Security & privacy

Implemented and tested:

- **Server authority**: scores, timers, item states, orders, phases and player identity live only on
  the server. Clients send intent.
- **Validation**: every client message goes through `parseClientMessage` (type, ranges, finite numbers,
  lengths, known enums, room-code alphabet, token format). Invalid → `BAD_MESSAGE`. Unit-tested.
- **Rate limiting**: token bucket per socket (60/s, burst 120). Tested.
- **Identity**: random 192-bit session tokens (`crypto.randomBytes`) for players and host; player ids
  are random. A player can only act as the slot bound to its socket; resuming with a token replaces the
  previous socket (no impersonation, no duplicate seats).
- **Duplicate actions**: `act` and `in` sequence numbers must increase.
- **Room isolation**: each room has its own simulation and timers. Tested.
- **Privacy**: only a nickname (≤14 chars, sanitised) and chosen chef are stored, in memory, for the
  room's lifetime. No accounts, no analytics, no personal data persisted.
- **HTTP**: static file serving prevents path traversal; `nosniff`, `no-referrer`, `DENY` framing.
- **Origins**: optional `ALLOWED_ORIGINS` allow-list for WebSocket upgrades.
- **Transport**: use HTTPS/WSS in deployment (reverse proxy / platform TLS). The client picks `wss:`
  automatically under `https:`.

Known limits:

- Campaign progress sent by the host browser is trusted for unlocking levels only (by design, local
  couch game; no competitive stakes).
- Single process; no persistence: a server restart closes all rooms.
- No CAPTCHA/abuse protection for room creation beyond the global room cap and rate limit.
