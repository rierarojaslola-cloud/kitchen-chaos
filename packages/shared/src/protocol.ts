/**
 * Wire protocol (JSON over WebSocket). Every client→server message is validated by
 * `parseClientMessage` before it reaches room logic. Server→client messages are typed here
 * so host screen and controller share one definition.
 *
 * Game snapshot view types come from @kc/game-logic (type-only import: no runtime cycle).
 */
import type {
  GameEvent,
  LevelInitView,
  OrderView,
  PlayerView,
  StationView,
  LevelResults,
  ControllerHint,
} from '@kc/game-logic';

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'results' | 'closed';

export type FlowAction = 'start' | 'pause' | 'resume' | 'toLobby' | 'retry' | 'next';

// ───────────────────────── Client → Server ─────────────────────────

export type ClientMessage =
  | { t: 'host:create'; v: number; progress?: SavedProgress }
  | { t: 'host:resume'; v: number; code: string; token: string }
  | { t: 'host:kick'; playerId: string }
  | { t: 'host:close' }
  | { t: 'player:join'; v: number; code: string; name: string; character: string }
  | { t: 'player:resume'; v: number; code: string; token: string }
  | { t: 'player:character'; character: string }
  | { t: 'player:ready'; ready: boolean }
  | { t: 'player:leave' }
  /** Continuous input: movement vector (clamped to unit circle) + whether ACTION is held. */
  | { t: 'in'; s: number; x: number; z: number; u: boolean }
  /** Discrete INTERACT press. `s` must increase strictly (duplicate protection). */
  | { t: 'act'; s: number }
  | { t: 'level'; levelId: string }
  | { t: 'flow'; action: FlowAction }
  | { t: 'ping'; c: number };

export interface SavedProgress {
  /** levelId → best score */
  best: Record<string, number>;
  /** levelId → best stars (0..3) */
  stars: Record<string, number>;
}

// ───────────────────────── Server → Client ─────────────────────────

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'VERSION_MISMATCH'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_IN_GAME'
  | 'NOT_ALLOWED'
  | 'INVALID_SESSION'
  | 'RATE_LIMITED'
  | 'KICKED'
  | 'ROOM_CLOSED'
  | 'LEVEL_LOCKED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'SERVER_FULL';

export interface LobbyPlayer {
  id: string;
  slot: number;
  name: string;
  character: string;
  connected: boolean;
  ready: boolean;
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  hostConnected: boolean;
  leaderId: string | null;
  levelId: string;
  unlocked: string[];
  best: Record<string, number>;
  stars: Record<string, number>;
  /** Why the game is paused, if it is. */
  pauseReason: 'host' | 'player' | 'disconnect' | null;
  countdownEndsAt: number | null;
  /** Remaining countdown at send time (ms); clients use this, never their own clock vs server. */
  countdownLeftMs: number | null;
  /** Number of players the current/last level was started with. */
  activePlayerCount: number;
}

export type ServerMessage =
  | { t: 'error'; code: ErrorCode; message: string; fatal: boolean }
  | { t: 'host:created'; code: string; token: string }
  | { t: 'host:resumed'; code: string }
  | { t: 'joined'; playerId: string; token: string; code: string; slot: number }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'level:init'; level: LevelInitView }
  | {
      t: 'state';
      tick: number;
      time: number;
      score: number;
      players: PlayerView[];
      /** Only stations that changed since the last message (full set on first / after init). */
      stations: StationView[];
      orders: OrderView[];
      ev: GameEvent[];
      full: boolean;
    }
  | { t: 'you'; hint: ControllerHint }
  /** Personal feedback for one phone (errors / confirmations of that player's actions). */
  | { t: 'fb'; kind: 'invalid' | 'served' | 'wrong' | 'pickup'; text: string }
  | { t: 'results'; results: LevelResults }
  | { t: 'kicked' }
  | { t: 'closed'; reason: string }
  | { t: 'pong'; c: number; s: number };

export const ERROR_TEXT_CA: Record<ErrorCode, string> = {
  BAD_MESSAGE: 'Missatge no vàlid.',
  VERSION_MISMATCH: 'Versió incompatible. Recarrega la pàgina.',
  ROOM_NOT_FOUND: "No existeix cap sala amb aquest codi.",
  ROOM_FULL: 'La sala ja és plena (màxim 4 jugadors).',
  ROOM_IN_GAME: 'La partida ja ha començat. Espera que acabi el nivell.',
  NOT_ALLOWED: 'Aquesta acció no està permesa ara.',
  INVALID_SESSION: 'La sessió ha caducat. Torna a entrar a la sala.',
  RATE_LIMITED: 'Massa missatges. Espera un moment.',
  KICKED: "L'amfitrió t'ha expulsat de la sala.",
  ROOM_CLOSED: 'La sala s’ha tancat.',
  LEVEL_LOCKED: 'Aquest nivell encara està bloquejat.',
  NOT_ENOUGH_PLAYERS: 'Calen com a mínim 2 jugadors connectats.',
  SERVER_FULL: 'El servidor és ple. Torna-ho a provar més tard.',
};
