/**
 * HTTP + WebSocket server factory (used by index.ts and by integration tests).
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GAME_VERSION,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  PROTOCOL_VERSION,
  WS_PATH,
} from '@kc/shared';
import { Connection } from './connection';
import { RoomManager } from './roomManager';
import type { ServerConfig } from './config';
import { DEFAULT_ROOM_OPTIONS, type RoomOptions } from './room';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

export interface RunningServer {
  http: http.Server;
  wss: WebSocketServer;
  rooms: RoomManager;
  port: number;
  close: () => Promise<void>;
}

function securityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

export async function startServer(config: ServerConfig, roomOptions: RoomOptions = DEFAULT_ROOM_OPTIONS): Promise<RunningServer> {
  const rooms = new RoomManager(config.maxRooms, roomOptions);
  rooms.start();

  const server = http.createServer((req, res) => {
    securityHeaders(res);
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ version: GAME_VERSION, protocol: PROTOCOL_VERSION, publicUrl: config.publicUrl, lan: lanAddresses(), port: config.port }));
      return;
    }
    if (!config.serveStatic) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found (static serving disabled; use the Vite dev server)');
      return;
    }
    serveStatic(config.staticDir, url.pathname, res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES * 4 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    if (config.allowedOrigins.length && req.headers.origin) {
      const host = (() => {
        try {
          return new URL(req.headers.origin!).host;
        } catch {
          return '';
        }
      })();
      if (!config.allowedOrigins.includes(host)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const conn = new Connection(ws, req.socket.remoteAddress ?? '?');
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return conn.error('BAD_MESSAGE');
      if (!conn.limiter.take()) {
        conn.violations++;
        conn.error('RATE_LIMITED');
        if (conn.violations > 400) conn.close(4008, 'rate limit');
        return;
      }
      const msg = parseClientMessage(data.toString());
      if (!msg) return conn.error('BAD_MESSAGE');
      route(conn, msg, rooms);
    });
    ws.on('close', () => {
      const role = conn.role;
      if (role.kind === 'none') return;
      rooms.get(role.code)?.onDisconnect(conn);
    });
    ws.on('error', (err) => console.warn('[ws] socket error', conn.id, err.message));
  });

  // Heartbeat: detects phones that vanished without closing the socket (Wi-Fi drop, sleep).
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const anyWs = ws as WebSocket & { isAliveKC?: boolean };
      if (anyWs.isAliveKC === false) {
        ws.terminate();
        return;
      }
      anyWs.isAliveKC = false;
      ws.ping();
    });
  }, 10000);
  wss.on('connection', (ws) => {
    const anyWs = ws as WebSocket & { isAliveKC?: boolean };
    anyWs.isAliveKC = true;
    ws.on('pong', () => (anyWs.isAliveKC = true));
  });

  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;

  return {
    http: server,
    wss,
    rooms,
    port,
    close: async () => {
      clearInterval(heartbeat);
      rooms.stop();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

function route(conn: Connection, msg: NonNullable<ReturnType<typeof parseClientMessage>>, rooms: RoomManager): void {
  switch (msg.t) {
    case 'ping':
      return conn.send({ t: 'pong', c: msg.c, s: Date.now() });
    case 'host:create': {
      if (msg.v !== PROTOCOL_VERSION) return conn.error('VERSION_MISMATCH', true);
      if (conn.role.kind !== 'none') return conn.error('NOT_ALLOWED');
      const room = rooms.create(msg.progress);
      if (!room) return conn.error('SERVER_FULL', true);
      conn.send({ t: 'host:created', code: room.code, token: room.hostToken });
      room.attachHost(conn);
      return;
    }
    case 'host:resume': {
      if (msg.v !== PROTOCOL_VERSION) return conn.error('VERSION_MISMATCH', true);
      const room = rooms.get(msg.code);
      if (!room || room.phase === 'closed') return conn.error('ROOM_NOT_FOUND', true);
      if (room.hostToken !== msg.token) return conn.error('INVALID_SESSION', true);
      conn.send({ t: 'host:resumed', code: room.code });
      room.attachHost(conn);
      return;
    }
    case 'host:close': {
      if (conn.role.kind !== 'host') return conn.error('NOT_ALLOWED');
      rooms.remove(conn.role.code, 'L’amfitrió ha tancat la sala.');
      return;
    }
    case 'player:join': {
      if (msg.v !== PROTOCOL_VERSION) return conn.error('VERSION_MISMATCH', true);
      if (conn.role.kind !== 'none') return conn.error('NOT_ALLOWED', false, 'Aquest dispositiu ja és dins d’una sala.');
      const room = rooms.get(msg.code);
      if (!room || room.phase === 'closed') return conn.error('ROOM_NOT_FOUND');
      const res = room.join(conn, msg.name, msg.character);
      if ('error' in res) return conn.error(res.error);
      return;
    }
    case 'player:resume': {
      if (msg.v !== PROTOCOL_VERSION) return conn.error('VERSION_MISMATCH', true);
      const room = rooms.get(msg.code);
      if (!room || room.phase === 'closed') return conn.error('ROOM_NOT_FOUND');
      if (!room.resumePlayer(conn, msg.token)) return conn.error('INVALID_SESSION');
      return;
    }
    default: {
      const role = conn.role;
      if (role.kind === 'none') return conn.error('NOT_ALLOWED');
      const room = rooms.get(role.code);
      if (!room) return conn.error('ROOM_CLOSED', true);
      room.handle(conn, msg);
    }
  }
}

function serveStatic(root: string, pathname: string, res: http.ServerResponse): void {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/controller' || rel === '/c' || rel === '/join') rel = '/controller.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(path.normalize(root))) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const immutable = rel.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}
