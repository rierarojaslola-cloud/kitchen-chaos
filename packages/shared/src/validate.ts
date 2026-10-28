/**
 * Strict runtime validation of untrusted client messages. Returns null for anything malformed.
 * No dependency on a schema library: the protocol is small and hand validation keeps the
 * bundle lean and the rules explicit.
 */
import { MAX_MESSAGE_BYTES, MAX_NAME_LENGTH } from './constants';
import { CHARACTER_IDS } from './characters';
import { isValidRoomCode, normalizeRoomCode } from './roomCode';
import type { ClientMessage, FlowAction, SavedProgress } from './protocol';

type Obj = Record<string, unknown>;

const FLOW_ACTIONS: readonly FlowAction[] = ['start', 'pause', 'resume', 'toLobby', 'retry', 'next'];
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Removes control chars and trims; collapses whitespace. */
export function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

function parseProgress(v: unknown): SavedProgress | undefined {
  if (!isObj(v) || !isObj(v.best) || !isObj(v.stars)) return undefined;
  const best: Record<string, number> = {};
  const stars: Record<string, number> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v.best)) {
    if (++n > 64) break;
    if (ID_RE.test(k) && isInt(val) && val >= 0 && val < 1e7) best[k] = val;
  }
  n = 0;
  for (const [k, val] of Object.entries(v.stars)) {
    if (++n > 64) break;
    if (ID_RE.test(k) && isInt(val) && val >= 0 && val <= 3) stars[k] = val;
  }
  return { best, stars };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null; // malformed JSON is simply rejected
  }
  if (!isObj(m) || typeof m.t !== 'string') return null;

  switch (m.t) {
    case 'in': {
      if (!isInt(m.s) || m.s < 0 || !isFiniteNum(m.x) || !isFiniteNum(m.z) || typeof m.u !== 'boolean') return null;
      let x = Math.max(-1, Math.min(1, m.x));
      let z = Math.max(-1, Math.min(1, m.z));
      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
      return { t: 'in', s: m.s, x, z, u: m.u };
    }
    case 'act':
      return isInt(m.s) && m.s >= 0 ? { t: 'act', s: m.s } : null;
    case 'ping':
      return isFiniteNum(m.c) ? { t: 'ping', c: m.c } : null;
    case 'host:create': {
      if (!isInt(m.v)) return null;
      const progress = parseProgress(m.progress);
      return progress ? { t: 'host:create', v: m.v, progress } : { t: 'host:create', v: m.v };
    }
    case 'host:resume':
    case 'player:resume': {
      if (!isInt(m.v) || !isStr(m.code, 8) || !isStr(m.token, 64)) return null;
      const code = normalizeRoomCode(m.code);
      if (!isValidRoomCode(code) || !TOKEN_RE.test(m.token)) return null;
      return { t: m.t, v: m.v, code, token: m.token };
    }
    case 'host:kick':
      return isStr(m.playerId, 40) && ID_RE.test(m.playerId) ? { t: 'host:kick', playerId: m.playerId } : null;
    case 'host:close':
      return { t: 'host:close' };
    case 'player:join': {
      if (!isInt(m.v) || !isStr(m.code, 8) || !isStr(m.name, 64) || !isStr(m.character, 20)) return null;
      const code = normalizeRoomCode(m.code);
      const name = sanitizeName(m.name);
      if (!isValidRoomCode(code) || name.length === 0 || !CHARACTER_IDS.includes(m.character)) return null;
      return { t: 'player:join', v: m.v, code, name, character: m.character };
    }
    case 'player:character':
      return isStr(m.character, 20) && CHARACTER_IDS.includes(m.character) ? { t: 'player:character', character: m.character } : null;
    case 'player:ready':
      return typeof m.ready === 'boolean' ? { t: 'player:ready', ready: m.ready } : null;
    case 'player:leave':
      return { t: 'player:leave' };
    case 'level':
      return isStr(m.levelId, 40) && ID_RE.test(m.levelId) ? { t: 'level', levelId: m.levelId } : null;
    case 'flow':
      return typeof m.action === 'string' && (FLOW_ACTIONS as readonly string[]).includes(m.action)
        ? { t: 'flow', action: m.action as FlowAction }
        : null;
    default:
      return null;
  }
}
