import { WebSocket } from 'ws';
import { RATE_LIMIT_BURST, RATE_LIMIT_PER_S, type ErrorCode, ERROR_TEXT_CA, type ServerMessage } from '@kc/shared';

/** Token bucket rate limiter (per connection). */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(
    private readonly perSecond = RATE_LIMIT_PER_S,
    private readonly burst = RATE_LIMIT_BURST,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type Role =
  | { kind: 'none' }
  | { kind: 'host'; code: string }
  | { kind: 'player'; code: string; playerId: string };

let nextConnId = 1;

export class Connection {
  readonly id = nextConnId++;
  role: Role = { kind: 'none' };
  alive = true;
  readonly limiter = new RateLimiter();
  violations = 0;
  private lastRateError = 0;

  constructor(readonly ws: WebSocket, readonly remote: string) {}

  send(msg: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendRaw(json: string): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(json);
  }

  error(code: ErrorCode, fatal = false, message?: string): void {
    if (code === 'RATE_LIMITED') {
      const t = Date.now();
      if (t - this.lastRateError < 1000) return;
      this.lastRateError = t;
    }
    this.send({ t: 'error', code, message: message ?? ERROR_TEXT_CA[code], fatal });
    if (fatal) this.close(4000 + Object.keys(ERROR_TEXT_CA).indexOf(code), code);
  }

  close(code = 1000, reason = ''): void {
    try {
      this.ws.close(code, reason);
    } catch (err) {
      console.warn('[conn] close failed', err);
    }
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}
