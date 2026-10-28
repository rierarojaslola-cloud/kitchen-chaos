import { describe, expect, it } from 'vitest';
import {
  canTransition,
  generateRoomCode,
  isValidRoomCode,
  nextPhase,
  normalizeRoomCode,
  parseClientMessage,
  sanitizeName,
} from '@kc/shared';
import { RateLimiter } from '../../apps/server/src/connection';

describe('room codes', () => {
  it('generates valid unambiguous codes', () => {
    let seed = 0;
    for (let i = 0; i < 200; i++) {
      const c = generateRoomCode((n) => (seed++ * 7) % n);
      expect(isValidRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[IO0-9]/);
    }
  });
  it('normalises user input', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(isValidRoomCode('AB0D')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
  });
});

describe('message validation', () => {
  it('clamps movement vectors to the unit circle', () => {
    const m = parseClientMessage(JSON.stringify({ t: 'in', s: 1, x: 5, z: 5, u: true }));
    expect(m?.t).toBe('in');
    if (m?.t === 'in') expect(Math.hypot(m.x, m.z)).toBeCloseTo(1);
  });
  it('rejects malformed or oversized input', () => {
    expect(parseClientMessage('{')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'in', s: 1, x: 'a', z: 0, u: true }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'in', s: 1, x: Infinity, z: 0, u: true }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'act', s: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'hack' }))).toBeNull();
    expect(parseClientMessage('x'.repeat(5000))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'player:join', v: 1, code: 'ABCD', name: 'A', character: 'nope' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'flow', action: 'win' }))).toBeNull();
  });
  it('sanitises names', () => {
    expect(sanitizeName('  <b>Xef\u0007   Gran</b>  ')).toBe('bXef Gran/b');
    expect(sanitizeName('a'.repeat(50)).length).toBe(14);
  });
  it('filters saved progress', () => {
    const m = parseClientMessage(JSON.stringify({ t: 'host:create', v: 1, progress: { best: { 'burger-1': 100, 'x y': 5 }, stars: { 'burger-1': 9 } } }));
    expect(m).toEqual({ t: 'host:create', v: 1, progress: { best: { 'burger-1': 100 }, stars: {} } });
  });
});

describe('phase state machine', () => {
  it('allows only valid transitions', () => {
    expect(canTransition('lobby', 'startCountdown')).toBe(true);
    expect(canTransition('lobby', 'pause')).toBe(false);
    expect(canTransition('playing', 'finish')).toBe(true);
    expect(canTransition('paused', 'finish')).toBe(false);
    expect(nextPhase('results', 'startCountdown')).toBe('countdown');
    expect(() => nextPhase('lobby', 'resume')).toThrow();
  });
});

describe('rate limiter', () => {
  it('allows bursts then throttles, and refills over time', () => {
    let t = 0;
    const rl = new RateLimiter(10, 5, () => t);
    let ok = 0;
    for (let i = 0; i < 20; i++) if (rl.take()) ok++;
    expect(ok).toBe(5);
    t += 1000;
    ok = 0;
    for (let i = 0; i < 20; i++) if (rl.take()) ok++;
    expect(ok).toBe(5);
  });
});
