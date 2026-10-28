/**
 * One game room: lobby membership, phase state machine, authoritative simulation loop,
 * reconnection and broadcast. Rooms are fully independent from each other.
 */
import { randomBytes } from 'node:crypto';
import {
  canTransition,
  CHARACTER_IDS,
  COUNTDOWN_S,
  HOST_RECONNECT_GRACE_S,
  LOBBY_RECONNECT_GRACE_S,
  MAX_PLAYERS,
  MIN_PLAYERS,
  nextPhase,
  type ClientMessage,
  type FlowAction,
  type LobbyPlayer,
  type RoomPhase,
  type RoomSnapshot,
  type SavedProgress,
  type ServerMessage,
  type Transition,
} from '@kc/shared';
import { GameSimulation, getLevel, LEVELS, nextLevelId, unlockedLevels, type LevelDef } from '@kc/game-logic';
import type { Connection } from './connection';

export interface RoomOptions {
  countdownMs: number;
  tickMs: number;
  /** Test-only: override level duration in seconds. Never set from the network. */
  levelDurationOverride?: number;
  now: () => number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  countdownMs: COUNTDOWN_S * 1000,
  tickMs: 50,
  now: Date.now,
};

interface PlayerSlot {
  id: string;
  token: string;
  slot: number;
  name: string;
  character: string;
  ready: boolean;
  conn: Connection | null;
  /** When the socket dropped (ms), null while connected. */
  leftAt: number | null;
  /** Voluntarily left mid-game: kept in sim as idle chef until results. */
  quit: boolean;
  lastInSeq: number;
  lastActSeq: number;
  lastHint: string;
}

export const newToken = (): string => randomBytes(24).toString('base64url');
const newId = (): string => 'p_' + randomBytes(6).toString('base64url');

export class Room {
  readonly code: string;
  readonly hostToken = newToken();
  host: Connection | null = null;
  hostLeftAt: number | null = null;
  phase: RoomPhase = 'lobby';
  levelId: string = LEVELS[0]!.id;
  best: Record<string, number> = {};
  stars: Record<string, number> = {};
  pauseReason: RoomSnapshot['pauseReason'] = null;
  countdownEndsAt: number | null = null;
  lastActivity: number;

  private players: PlayerSlot[] = [];
  private sim: GameSimulation | null = null;
  private activeIds: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastStep = 0;
  private stationCache = new Map<number, string>();
  private needFull = true;
  private pendingEvents: import('@kc/game-logic').GameEvent[] = [];

  constructor(
    code: string,
    private readonly opts: RoomOptions = DEFAULT_ROOM_OPTIONS,
    progress?: SavedProgress,
  ) {
    this.code = code;
    this.lastActivity = opts.now();
    if (progress) {
      // Local campaign progress supplied by the host browser. Only used to unlock levels and
      // show bests; it cannot affect a running game's score.
      this.best = { ...progress.best };
      this.stars = { ...progress.stars };
    }
  }

  // ───────────── Membership ─────────────
  get connectedPlayers(): PlayerSlot[] {
    return this.players.filter((p) => p.conn && !p.quit);
  }

  get leaderId(): string | null {
    const c = [...this.connectedPlayers].sort((a, b) => a.slot - b.slot)[0];
    return c?.id ?? null;
  }

  hasSockets(): boolean {
    return !!this.host || this.players.some((p) => p.conn);
  }

  attachHost(conn: Connection): void {
    if (this.host && this.host !== conn) {
      this.host.send({ t: 'closed', reason: 'La pantalla s’ha obert en un altre dispositiu.' });
      this.host.role = { kind: 'none' };
      this.host.close(4100, 'replaced');
    }
    this.host = conn;
    this.hostLeftAt = null;
    conn.role = { kind: 'host', code: this.code };
    this.touch();
    if (this.pauseReason === 'disconnect') this.tryAutoResume();
    this.broadcastRoom();
    if (this.sim && this.phase !== 'lobby') {
      conn.send({ t: 'level:init', level: this.sim.initView() });
      this.needFull = true;
      if (this.phase === 'results') conn.send({ t: 'results', results: this.sim.results() });
    }
  }

  join(conn: Connection, name: string, character: string): PlayerSlot | { error: 'ROOM_FULL' | 'ROOM_IN_GAME' } {
    this.dropExpired();
    if (this.phase !== 'lobby' && this.phase !== 'results') return { error: 'ROOM_IN_GAME' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'ROOM_FULL' };
    const used = new Set(this.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const taken = new Set(this.players.map((p) => p.character));
    const chosen = taken.has(character) ? CHARACTER_IDS.find((c) => !taken.has(c)) ?? character : character;
    const p: PlayerSlot = {
      id: newId(),
      token: newToken(),
      slot,
      name,
      character: chosen,
      ready: false,
      conn,
      leftAt: null,
      quit: false,
      lastInSeq: -1,
      lastActSeq: -1,
      lastHint: '',
    };
    this.players.push(p);
    conn.role = { kind: 'player', code: this.code, playerId: p.id };
    this.touch();
    conn.send({ t: 'joined', playerId: p.id, token: p.token, code: this.code, slot: p.slot });
    this.broadcastRoom();
    return p;
  }

  resumePlayer(conn: Connection, token: string): boolean {
    const p = this.players.find((x) => x.token === token && !x.quit);
    if (!p) return false;
    if (p.conn && p.conn !== conn) {
      p.conn.send({ t: 'closed', reason: 'Aquesta sessió s’ha obert en un altre dispositiu.' });
      p.conn.role = { kind: 'none' };
      p.conn.close(4100, 'replaced');
    }
    p.conn = conn;
    p.leftAt = null;
    p.lastHint = '';
    conn.role = { kind: 'player', code: this.code, playerId: p.id };
    this.touch();
    conn.send({ t: 'joined', playerId: p.id, token: p.token, code: this.code, slot: p.slot });
    if (this.sim && this.activeIds.includes(p.id)) this.sim.setConnected(p.id, true);
    if (this.pauseReason === 'disconnect') this.tryAutoResume();
    this.broadcastRoom();
    if (this.phase === 'results' && this.sim) conn.send({ t: 'results', results: this.sim.results() });
    return true;
  }

  /** Socket closed (not a voluntary leave). */
  onDisconnect(conn: Connection): void {
    if (this.host === conn) {
      this.host = null;
      this.hostLeftAt = this.opts.now();
      if (this.phase === 'playing') this.pause('disconnect');
      this.broadcastRoom();
      return;
    }
    const p = this.players.find((x) => x.conn === conn);
    if (!p) return;
    p.conn = null;
    p.leftAt = this.opts.now();
    if (this.sim && this.activeIds.includes(p.id)) this.sim.setConnected(p.id, false);
    if (this.phase === 'playing' && this.activeConnectedCount() < Math.min(MIN_PLAYERS, this.activeIds.length)) {
      this.pause('disconnect');
    }
    this.broadcastRoom();
  }

  private activeConnectedCount(): number {
    return this.activeIds.filter((id) => this.players.find((p) => p.id === id)?.conn).length;
  }

  private removePlayer(p: PlayerSlot): void {
    this.players = this.players.filter((x) => x !== p);
  }

  leave(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    const conn = p.conn;
    if (conn) conn.role = { kind: 'none' };
    if (this.sim && this.activeIds.includes(p.id) && this.phase !== 'lobby' && this.phase !== 'results') {
      p.quit = true;
      p.conn = null;
      this.sim.setConnected(p.id, false);
      if (this.phase === 'playing' && this.activeConnectedCount() < Math.min(MIN_PLAYERS, this.activeIds.length)) this.pause('disconnect');
    } else {
      this.removePlayer(p);
    }
    this.broadcastRoom();
  }

  kick(playerId: string): boolean {
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return false;
    if (p.conn) {
      p.conn.send({ t: 'kicked' });
      p.conn.role = { kind: 'none' };
      p.conn.close(4200, 'kicked');
    }
    this.removePlayer(p);
    this.broadcastRoom();
    return true;
  }

  /** Drops lobby players whose reconnection grace expired. */
  dropExpired(): void {
    const now = this.opts.now();
    if (this.phase === 'lobby' || this.phase === 'results') {
      const before = this.players.length;
      this.players = this.players.filter((p) => p.conn || (p.leftAt !== null && now - p.leftAt < LOBBY_RECONNECT_GRACE_S * 1000) ? !p.quit : false);
      if (this.players.length !== before) this.broadcastRoom();
    }
  }

  /** True when the room should be destroyed. */
  isExpired(idleTimeoutMs: number): boolean {
    const now = this.opts.now();
    if (this.phase === 'closed') return true;
    if (!this.host && this.hostLeftAt !== null && now - this.hostLeftAt > HOST_RECONNECT_GRACE_S * 1000) return true;
    if (!this.hasSockets() && now - this.lastActivity > idleTimeoutMs) return true;
    return false;
  }

  close(reason: string): void {
    this.stopLoop();
    this.phase = 'closed';
    const msg: ServerMessage = { t: 'closed', reason };
    for (const c of this.allConns()) {
      c.send(msg);
      c.role = { kind: 'none' };
      c.close(4300, 'room closed');
    }
    this.host = null;
    for (const p of this.players) p.conn = null;
  }

  // ───────────── Messages ─────────────
  handle(conn: Connection, msg: ClientMessage): void {
    this.touch();
    const role = conn.role;
    const isHost = role.kind === 'host' && this.host === conn;
    const player = role.kind === 'player' ? this.players.find((p) => p.id === role.playerId && p.conn === conn) : undefined;
    const isLeader = !!player && player.id === this.leaderId;

    switch (msg.t) {
      case 'in': {
        if (!player || this.phase !== 'playing' || !this.sim || !this.activeIds.includes(player.id)) return;
        if (msg.s <= player.lastInSeq) return; // stale / duplicated / out of order
        player.lastInSeq = msg.s;
        this.sim.setInput(player.id, msg.x, msg.z, msg.u);
        return;
      }
      case 'act': {
        if (!player || this.phase !== 'playing' || !this.sim || !this.activeIds.includes(player.id)) return;
        if (msg.s <= player.lastActSeq) return; // duplicate press
        player.lastActSeq = msg.s;
        this.sim.queueInteract(player.id);
        return;
      }
      case 'player:character': {
        if (!player || (this.phase !== 'lobby' && this.phase !== 'results')) return conn.error('NOT_ALLOWED');
        if (this.players.some((p) => p !== player && p.character === msg.character)) {
          return conn.error('NOT_ALLOWED', false, 'Aquest xef ja l’ha triat un altre jugador.');
        }
        player.character = msg.character;
        this.broadcastRoom();
        return;
      }
      case 'player:ready': {
        if (!player) return conn.error('NOT_ALLOWED');
        player.ready = msg.ready;
        this.broadcastRoom();
        return;
      }
      case 'player:leave': {
        if (player) this.leave(player.id);
        return;
      }
      case 'host:kick': {
        if (!isHost) return conn.error('NOT_ALLOWED');
        if (!this.kick(msg.playerId)) conn.error('NOT_ALLOWED');
        return;
      }
      case 'level': {
        if (!isHost && !isLeader) return conn.error('NOT_ALLOWED');
        if (this.phase !== 'lobby' && this.phase !== 'results') return conn.error('NOT_ALLOWED');
        if (!getLevel(msg.levelId)) return conn.error('BAD_MESSAGE');
        if (!unlockedLevels(this.stars).includes(msg.levelId)) return conn.error('LEVEL_LOCKED');
        this.levelId = msg.levelId;
        this.broadcastRoom();
        return;
      }
      case 'flow':
        return this.flow(conn, msg.action, isHost, isLeader, !!player);
      default:
        return conn.error('BAD_MESSAGE');
    }
  }

  private flow(conn: Connection, action: FlowAction, isHost: boolean, isLeader: boolean, isPlayer: boolean): void {
    const privileged = isHost || isLeader;
    switch (action) {
      case 'start':
      case 'retry':
        if (!privileged) return conn.error('NOT_ALLOWED');
        return this.startLevel(conn, this.levelId);
      case 'next': {
        if (!privileged || this.phase !== 'results') return conn.error('NOT_ALLOWED');
        const next = nextLevelId(this.levelId);
        if (!next || !unlockedLevels(this.stars).includes(next)) return conn.error('LEVEL_LOCKED');
        this.levelId = next;
        return this.startLevel(conn, next);
      }
      case 'pause':
        if (!privileged && !isPlayer) return conn.error('NOT_ALLOWED');
        if (!canTransition(this.phase, 'pause')) return;
        return this.pause(isHost ? 'host' : 'player');
      case 'resume':
        if (!privileged) return conn.error('NOT_ALLOWED');
        if (this.phase !== 'paused') return;
        if (this.activeConnectedCount() < Math.min(MIN_PLAYERS, this.activeIds.length) || !this.host) {
          return conn.error('NOT_ENOUGH_PLAYERS');
        }
        return this.resume();
      case 'toLobby':
        if (!privileged) return conn.error('NOT_ALLOWED');
        if (!canTransition(this.phase, 'toLobby')) return;
        this.stopLoop();
        this.applyTransition('toLobby');
        this.sim = null;
        this.activeIds = [];
        this.pauseReason = null;
        for (const p of this.players.filter((x) => x.quit)) this.removePlayer(p);
        this.broadcastRoom();
        return;
    }
  }

  private applyTransition(t: Transition): void {
    this.phase = nextPhase(this.phase, t);
  }

  startLevel(conn: Connection | null, levelId: string): void {
    if (!canTransition(this.phase, 'startCountdown')) return conn?.error('NOT_ALLOWED');
    const base = getLevel(levelId);
    if (!base) return conn?.error('BAD_MESSAGE');
    if (!unlockedLevels(this.stars).includes(levelId)) return conn?.error('LEVEL_LOCKED');
    // drop players who quit / expired before starting
    for (const p of this.players.filter((x) => x.quit)) this.removePlayer(p);
    this.dropExpired();
    const participants = [...this.connectedPlayers].sort((a, b) => a.slot - b.slot);
    if (participants.length < MIN_PLAYERS) return conn?.error('NOT_ENOUGH_PLAYERS');
    if (!this.host) return conn?.error('NOT_ALLOWED', false, 'Cal la pantalla principal connectada.');

    const level: LevelDef = this.opts.levelDurationOverride ? { ...base, duration: this.opts.levelDurationOverride } : base;
    const seed = randomBytes(4).readUInt32LE(0);
    this.sim = new GameSimulation(level, participants.map((p) => ({ id: p.id, slot: p.slot })), seed);
    this.activeIds = participants.map((p) => p.id);
    for (const p of participants) {
      p.lastInSeq = -1;
      p.lastActSeq = -1;
      p.lastHint = '';
    }
    this.levelId = levelId;
    this.applyTransition('startCountdown');
    this.countdownEndsAt = this.opts.now() + this.opts.countdownMs;
    this.pauseReason = null;
    this.stationCache.clear();
    this.needFull = true;
    this.pendingEvents = [];
    this.host.send({ t: 'level:init', level: this.sim.initView() });
    this.broadcastRoom();
    this.startLoop();
  }

  private pause(reason: NonNullable<RoomSnapshot['pauseReason']>): void {
    if (!canTransition(this.phase, 'pause')) return;
    this.applyTransition('pause');
    this.pauseReason = reason;
    this.stopLoop();
    if (this.sim) for (const id of this.activeIds) this.sim.setInput(id, 0, 0, false);
    this.broadcastRoom();
  }

  private resume(): void {
    if (!canTransition(this.phase, 'resume')) return;
    this.applyTransition('resume');
    this.pauseReason = null;
    this.broadcastRoom();
    this.startLoop();
  }

  private tryAutoResume(): void {
    if (this.phase === 'paused' && this.pauseReason === 'disconnect' && this.host && this.activeConnectedCount() >= Math.min(MIN_PLAYERS, this.activeIds.length)) {
      this.resume();
    }
  }

  // ───────────── Loop ─────────────
  private startLoop(): void {
    this.stopLoop();
    this.lastStep = this.opts.now();
    this.timer = setInterval(() => this.loop(), this.opts.tickMs);
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private loop(): void {
    const now = this.opts.now();
    if (this.phase === 'countdown') {
      if (this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
        this.applyTransition('beginPlay');
        this.countdownEndsAt = null;
        this.lastStep = now;
        this.broadcastRoom();
      }
      return;
    }
    if (this.phase !== 'playing' || !this.sim) return;
    const dt = this.opts.tickMs / 1000;
    // Fixed-step catch-up (bounded) so simulation speed is independent of timer jitter.
    let steps = Math.floor((now - this.lastStep) / this.opts.tickMs);
    if (steps > 5) {
      steps = 5;
      this.lastStep = now - 5 * this.opts.tickMs;
    }
    for (let i = 0; i < steps; i++) {
      this.pendingEvents.push(...this.sim.step(dt));
      this.lastStep += this.opts.tickMs;
      if (this.sim.isFinished()) break;
    }
    if (steps > 0) this.broadcastState();
    if (this.sim.isFinished()) this.finish();
  }

  private finish(): void {
    if (!this.sim) return;
    this.stopLoop();
    this.applyTransition('finish');
    const r = this.sim.results();
    this.best[r.levelId] = Math.max(this.best[r.levelId] ?? 0, r.score);
    this.stars[r.levelId] = Math.max(this.stars[r.levelId] ?? 0, r.stars);
    const msg: ServerMessage = { t: 'results', results: r };
    for (const c of this.allConns()) c.send(msg);
    this.broadcastRoom();
  }

  private broadcastState(): void {
    if (!this.sim) return;
    const sim = this.sim;
    if (this.host) {
      const full = this.needFull;
      const stations = sim.stationViews().filter((s) => {
        const json = JSON.stringify(s);
        if (!full && this.stationCache.get(s.id) === json) return false;
        this.stationCache.set(s.id, json);
        return true;
      });
      this.host.send({
        t: 'state',
        tick: sim.tick,
        time: Math.round(sim.timeLeft * 100) / 100,
        score: sim.score,
        players: sim.playerViews(),
        stations,
        orders: sim.orderViews(),
        ev: this.pendingEvents,
        full,
      });
      this.needFull = false;
    }
    this.pendingEvents = [];
    for (const p of this.players) {
      if (!p.conn || !this.activeIds.includes(p.id)) continue;
      const hint = sim.hintFor(p.id);
      const json = JSON.stringify(hint);
      if (json !== p.lastHint) {
        p.lastHint = json;
        p.conn.sendRaw(`{"t":"you","hint":${json}}`);
      }
    }
  }

  // ───────────── Broadcast ─────────────
  private allConns(): Connection[] {
    const out: Connection[] = [];
    if (this.host) out.push(this.host);
    for (const p of this.players) if (p.conn) out.push(p.conn);
    return out;
  }

  snapshot(): RoomSnapshot {
    const players: LobbyPlayer[] = this.players
      .filter((p) => !p.quit)
      .map((p) => ({ id: p.id, slot: p.slot, name: p.name, character: p.character, connected: !!p.conn, ready: p.ready }))
      .sort((a, b) => a.slot - b.slot);
    return {
      code: this.code,
      phase: this.phase,
      players,
      hostConnected: !!this.host,
      leaderId: this.leaderId,
      levelId: this.levelId,
      unlocked: unlockedLevels(this.stars),
      best: this.best,
      stars: this.stars,
      pauseReason: this.pauseReason,
      countdownEndsAt: this.countdownEndsAt,
      activePlayerCount: this.activeIds.length,
    };
  }

  broadcastRoom(): void {
    const json = JSON.stringify({ t: 'room', room: this.snapshot() } satisfies ServerMessage);
    for (const c of this.allConns()) c.sendRaw(json);
  }

  private touch(): void {
    this.lastActivity = this.opts.now();
  }

  /** For tests / diagnostics. */
  debugSim(): GameSimulation | null {
    return this.sim;
  }
}
