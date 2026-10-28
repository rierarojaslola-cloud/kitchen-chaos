/**
 * Player-count adaptation. Not a linear multiplier: each lever scales differently and the
 * level content itself (menu entries, conditional stations, events) is filtered by
 * `minPlayers`, so 4 players get more complex recipes and extra stations while 2 players
 * get fewer simultaneous orders and longer order timers.
 */
import type { LevelDef, LevelEvent, MenuEntry } from './types';

export const MIN_SIM_PLAYERS = 1;
export const MAX_SIM_PLAYERS = 4;

/** Seconds between order spawns, relative to the 3-player reference. */
const INTERVAL_MUL: Record<number, number> = { 1: 1.45, 2: 1.2, 3: 1.0, 4: 0.82 };
/** Order patience, relative to reference (small teams walk more per dish). */
const ORDER_TIME_MUL: Record<number, number> = { 1: 1.35, 2: 1.15, 3: 1.0, 4: 0.95 };
/** Score expectations, relative to reference. Small teams are not punished for lower throughput. */
const STAR_MUL: Record<number, number> = { 1: 0.5, 2: 0.72, 3: 1.0, 4: 1.22 };

export interface BalancedLevel {
  playerCount: number;
  maxActive: number;
  interval: number;
  orderTimeMul: number;
  stars: [number, number, number];
  plates: number;
  menu: MenuEntry[];
  events: LevelEvent[];
}

export function balanceFor(level: LevelDef, playerCount: number): BalancedLevel {
  const n = Math.max(MIN_SIM_PLAYERS, Math.min(MAX_SIM_PLAYERS, Math.round(playerCount)));
  const starMul = STAR_MUL[n]!;
  const stars = level.stars.map((s) => Math.round((s * starMul) / 5) * 5) as [number, number, number];
  return {
    playerCount: n,
    maxActive: level.orders.maxActive + (n >= 3 ? 1 : 0) + (n >= 4 ? 1 : 0),
    interval: level.orders.interval * INTERVAL_MUL[n]!,
    orderTimeMul: ORDER_TIME_MUL[n]!,
    stars,
    plates: level.plates + Math.max(0, n - 2),
    menu: level.menu.filter((m) => (m.minPlayers ?? 0) <= n),
    events: level.events.filter((e) => (e.minPlayers ?? 0) <= n),
  };
}
