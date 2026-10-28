/**
 * Explicit room-phase state machine. The server is the only authority that applies
 * transitions; clients request them through `flow` messages.
 *
 * Who may request: host screen or the "leader" phone (lowest connected slot), except
 * where noted. `system` transitions are triggered by timers / disconnect handling.
 */
import type { RoomPhase } from './protocol';

export type Transition =
  | 'startCountdown' // lobby|results → countdown (host/leader, ≥2 connected)
  | 'beginPlay' // countdown → playing (system timer)
  | 'pause' // playing → paused (host/leader/system)
  | 'resume' // paused → playing (host/leader, ≥2 connected)
  | 'finish' // playing → results (system: level timer)
  | 'toLobby' // countdown|playing|paused|results → lobby (host/leader)
  | 'close'; // any → closed

const TABLE: Record<Transition, { from: readonly RoomPhase[]; to: RoomPhase }> = {
  startCountdown: { from: ['lobby', 'results'], to: 'countdown' },
  beginPlay: { from: ['countdown'], to: 'playing' },
  pause: { from: ['playing'], to: 'paused' },
  resume: { from: ['paused'], to: 'playing' },
  finish: { from: ['playing'], to: 'results' },
  toLobby: { from: ['countdown', 'playing', 'paused', 'results'], to: 'lobby' },
  close: { from: ['lobby', 'countdown', 'playing', 'paused', 'results'], to: 'closed' },
};

export function canTransition(from: RoomPhase, t: Transition): boolean {
  return TABLE[t].from.includes(from);
}

export function nextPhase(from: RoomPhase, t: Transition): RoomPhase {
  if (!canTransition(from, t)) throw new Error(`Invalid transition ${t} from ${from}`);
  return TABLE[t].to;
}
