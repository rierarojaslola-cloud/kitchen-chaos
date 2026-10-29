/**
 * Central constants shared by server and clients.
 * Gameplay balance values live in @kc/game-logic (balance.ts / level data).
 */

export const GAME_TITLE = 'KITCHEN CHAOS';
export const GAME_SUBTITLE = 'SERVICE RUSH';
export const GAME_VERSION = '0.2.0';

/** Bump whenever the wire protocol changes in an incompatible way. */
export const PROTOCOL_VERSION = 1;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Unambiguous alphabet: no I, O (confused with 1, 0). Letters only, so no digits at all. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export const MAX_NAME_LENGTH = 14;
export const MAX_MESSAGE_BYTES = 1024;

/** Server simulation rate (Hz) and broadcast rate (Hz). */
export const SIM_TICK_HZ = 20;
export const BROADCAST_HZ = 20;

/** Seconds a disconnected player keeps their slot while in the lobby. */
export const LOBBY_RECONNECT_GRACE_S = 45;
/** Seconds a disconnected host keeps the room alive. */
export const HOST_RECONNECT_GRACE_S = 120;
/** Rooms with no connected sockets are closed after this many seconds. */
export const ROOM_IDLE_TIMEOUT_S = 600;

export const COUNTDOWN_S = 3;

/** Per-connection rate limit (token bucket). */
export const RATE_LIMIT_PER_S = 60;
export const RATE_LIMIT_BURST = 120;

export const WS_PATH = '/ws';
