import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export interface ServerConfig {
  port: number;
  host: string;
  /** Public base URL used in QR codes (e.g. https://kitchen.example.com). Optional. */
  publicUrl: string | null;
  maxRooms: number;
  /** Directory with the built web client (served in production). */
  staticDir: string;
  serveStatic: boolean;
  /** Allowed WebSocket Origin hosts (comma separated). Empty = same-host or any in dev. */
  allowedOrigins: string[];
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: intEnv('PORT', 3000),
    host: process.env.HOST ?? '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || null,
    maxRooms: intEnv('MAX_ROOMS', 300),
    staticDir: process.env.STATIC_DIR ?? path.resolve(here, '../../web/dist'),
    serveStatic: process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === '1' || process.argv.includes('--serve'),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ...overrides,
  };
}
