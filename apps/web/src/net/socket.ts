/**
 * Typed WebSocket client with automatic reconnection (exponential backoff), latency
 * measurement and a status callback for UI indicators.
 */
import { WS_PATH, type ClientMessage, type ServerMessage } from '@kc/shared';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface GameSocketOptions {
  onMessage: (m: ServerMessage) => void;
  onStatus: (s: SocketStatus) => void;
  /** Called after every (re)connection; return messages to send first (e.g. resume). */
  onOpen: () => void;
}

export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${WS_PATH}`;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private pingTimer: number | null = null;
  private retryTimer: number | null = null;
  rtt = 0;
  status: SocketStatus = 'connecting';

  constructor(private readonly opts: GameSocketOptions, private readonly url = wsUrl()) {
    // Connect on the next microtask so callers finish initialising before callbacks fire.
    queueMicrotask(() => this.connect());
    window.addEventListener('online', () => this.kick());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.kick();
    });
  }

  private setStatus(s: SocketStatus): void {
    this.status = s;
    this.opts.onStatus(s);
  }

  private kick(): void {
    if (this.stopped) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.attempts = 0;
      this.connect();
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      console.warn('[socket] cannot create', err);
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('open');
      this.opts.onOpen();
      this.startPing();
    };
    ws.onmessage = (ev) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(ev.data)) as ServerMessage;
      } catch (err) {
        console.warn('[socket] bad message from server', err);
        return;
      }
      if (m.t === 'pong') {
        this.rtt = performance.now() - m.c;
        return;
      }
      this.opts.onMessage(m);
    };
    ws.onclose = (ev) => {
      this.stopPing();
      if (this.stopped) return;
      // 4xxx codes for fatal errors / kicks / room closed: do not auto-reconnect
      if (ev.code >= 4000 && ev.code !== 4008) {
        this.setStatus('offline');
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows and handles retry */
    };
  }

  private scheduleRetry(): void {
    this.attempts++;
    this.setStatus(this.attempts > 8 ? 'offline' : 'reconnecting');
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.attempts, 5)) * (0.75 + Math.random() * 0.5);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  send(m: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m));
      return true;
    }
    return false;
  }

  /** Manual retry after 'offline'. */
  retry(): void {
    this.attempts = 0;
    this.stopped = false;
    this.connect();
  }

  close(): void {
    this.stopped = true;
    this.stopPing();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}
