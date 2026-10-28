import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isValidRoomCode, PROTOCOL_VERSION } from '@kc/shared';
import { loadConfig } from '../../apps/server/src/config';
import { startServer, type RunningServer } from '../../apps/server/src/server';
import { sleep, TestClient } from './wsClient';

let srv: RunningServer;
const clients: TestClient[] = [];
const V = PROTOCOL_VERSION;

beforeAll(async () => {
  srv = await startServer(loadConfig({ port: 0, host: '127.0.0.1', serveStatic: false, maxRooms: 50 }), {
    countdownMs: 150,
    tickMs: 50,
    levelDurationOverride: 30,
    now: Date.now,
  });
});
afterAll(async () => {
  await srv.close();
});
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

async function client(): Promise<TestClient> {
  const c = await TestClient.connect(srv.port);
  clients.push(c);
  return c;
}

async function hostRoom(): Promise<{ host: TestClient; code: string; token: string }> {
  const host = await client();
  host.send({ t: 'host:create', v: V });
  const m = await host.waitFor('host:created');
  return { host, code: m.code, token: m.token };
}

async function joinPlayers(code: string, n: number, chars = ['nuri', 'bru', 'kai', 'lua']) {
  const out: { c: TestClient; id: string; token: string }[] = [];
  for (let i = 0; i < n; i++) {
    const c = await client();
    c.send({ t: 'player:join', v: V, code, name: `Xef ${i + 1}`, character: chars[i]! });
    const j = await c.waitFor('joined');
    out.push({ c, id: j.playerId, token: j.token });
  }
  return out;
}

async function startGame(host: TestClient, code: string, n: number) {
  const players = await joinPlayers(code, n);
  host.send({ t: 'flow', action: 'start' });
  await host.waitFor('level:init');
  await host.waitFor('room', (m) => m.room.phase === 'playing');
  return players;
}

describe('rooms and lobby', () => {
  it('creates a room with a readable code and exposes /api/info', async () => {
    const { code, host } = await hostRoom();
    expect(isValidRoomCode(code)).toBe(true);
    expect(code).not.toMatch(/[IO01]/);
    const room = await host.waitFor('room');
    expect(room.room.phase).toBe('lobby');
    const info = await (await fetch(`http://127.0.0.1:${srv.port}/api/info`)).json();
    expect(info.protocol).toBe(PROTOCOL_VERSION);
  });

  it('rejects unknown codes and incompatible versions', async () => {
    const c = await client();
    c.send({ t: 'player:join', v: V, code: 'ZZZZ', name: 'A', character: 'nuri' });
    expect((await c.waitFor('error')).code).toBe('ROOM_NOT_FOUND');
    const d = await client();
    d.send({ t: 'host:create', v: 999 });
    const e = await d.waitFor('error');
    expect(e.code).toBe('VERSION_MISMATCH');
    expect(e.fatal).toBe(true);
  });

  it('accepts 4 players, rejects the 5th, keeps chef choices unique', async () => {
    const { host, code } = await hostRoom();
    const ps = await joinPlayers(code, 4, ['nuri', 'nuri', 'kai', 'lua']);
    const room = await host.waitFor('room', (m) => m.room.players.length === 4);
    expect(new Set(room.room.players.map((p) => p.character)).size).toBe(4);
    expect(room.room.players.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
    const fifth = await client();
    fifth.send({ t: 'player:join', v: V, code, name: 'Cinquè', character: 'mei' });
    expect((await fifth.waitFor('error')).code).toBe('ROOM_FULL');
    // a phone already in a room cannot take a second slot
    ps[0]!.c.send({ t: 'player:join', v: V, code, name: 'Dup', character: 'mei' });
    expect((await ps[0]!.c.waitFor('error')).code).toBe('NOT_ALLOWED');
  });

  it('requires 2 connected players and leader/host privileges to start', async () => {
    const { host, code } = await hostRoom();
    const [p1] = await joinPlayers(code, 1);
    host.send({ t: 'flow', action: 'start' });
    expect((await host.waitFor('error')).code).toBe('NOT_ENOUGH_PLAYERS');
    const [p2] = await joinPlayers(code, 1, ['bru']);
    p2!.c.send({ t: 'flow', action: 'start' }); // not leader (slot 1)
    expect((await p2!.c.waitFor('error')).code).toBe('NOT_ALLOWED');
    p1!.c.send({ t: 'flow', action: 'start' }); // leader (slot 0)
    await host.waitFor('room', (m) => m.room.phase === 'countdown');
    await host.waitFor('room', (m) => m.room.phase === 'playing');
  });

  it('lets the host kick players in the lobby', async () => {
    const { host, code } = await hostRoom();
    const [p1] = await joinPlayers(code, 1);
    host.send({ t: 'host:kick', playerId: p1!.id });
    await p1!.c.waitFor('kicked');
    await host.waitFor('room', (m) => m.room.players.length === 0);
  });

  it('rejects malformed messages and rate-limits floods', async () => {
    const c = await client();
    c.sendRaw('not json');
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'in', s: 'x', x: 1, z: 0, u: false } as Record<string, unknown>);
    for (let i = 0; i < 300; i++) c.send({ t: 'ping', c: i });
    await c.waitFor('error', (m) => m.code === 'RATE_LIMITED');
  });

  it('host can resume its room with its token', async () => {
    const { host, code, token } = await hostRoom();
    host.close();
    await sleep(100);
    const h2 = await client();
    h2.send({ t: 'host:resume', v: V, code, token });
    await h2.waitFor('host:resumed');
    expect((await h2.waitFor('room')).room.hostConnected).toBe(true);
    const bad = await client();
    bad.send({ t: 'host:resume', v: V, code, token: 'x'.repeat(32) });
    expect((await bad.waitFor('error')).code).toBe('INVALID_SESSION');
  });
});

describe('gameplay over the network', () => {
  it('syncs movement from phone input to the host state', async () => {
    const { host, code } = await hostRoom();
    const [p1] = await startGame(host, code, 2);
    const first = await host.next('state');
    const x0 = first.players.find((p) => p.id === p1!.id)!.x;
    p1!.c.send({ t: 'in', s: 1, x: 1, z: 0, u: false });
    await sleep(400);
    const later = await host.next('state');
    expect(later.players.find((p) => p.id === p1!.id)!.x).toBeGreaterThan(x0 + 0.5);
    expect(first.full).toBe(true);
    expect(later.full).toBe(false);
  });

  it('applies INTERACT once per sequence number and updates the phone hint', async () => {
    const { host, code } = await hostRoom();
    const [p1] = await startGame(host, code, 2);
    // Place the chef in front of the patty crate (server-side test hook; the action itself goes over the wire)
    const sim = srv.rooms.get(code)!.debugSim()!;
    const crate = sim.debugStations().find((s) => s.crate === 'patty')!;
    const pl = sim.debugPlayer(p1!.id)!;
    pl.x = crate.x + 0.5;
    pl.z = crate.z + 1.5;
    pl.a = Math.PI;
    await p1!.c.next('you', (m) => m.hint.interact === 'Agafar hamburguesa');
    p1!.c.send({ t: 'act', s: 5 });
    p1!.c.send({ t: 'act', s: 5 }); // duplicate, ignored
    p1!.c.send({ t: 'act', s: 3 }); // stale, ignored
    const st = await host.waitFor('state', (m) => m.ev.some((e) => e.e === 'pickup'));
    expect(st.ev.filter((e) => e.e === 'pickup').length).toBe(1);
    const hint = await p1!.c.waitFor('you', (m) => m.hint.held !== null);
    expect(hint.hint.held).toBe('Hamburguesa cru');
  });

  it('pauses when a player drops below the minimum and auto-resumes on reconnect', async () => {
    const { host, code } = await hostRoom();
    const [, p2] = await startGame(host, code, 2);
    p2!.c.close();
    const paused = await host.waitFor('room', (m) => m.room.phase === 'paused');
    expect(paused.room.pauseReason).toBe('disconnect');
    const again = await client();
    again.send({ t: 'player:resume', v: V, code, token: p2!.token });
    await again.waitFor('joined');
    await host.next('room', (m) => m.room.phase === 'playing');
    // late joiners cannot enter a running game
    const late = await client();
    late.send({ t: 'player:join', v: V, code, name: 'Tard', character: 'mei' });
    expect((await late.waitFor('error')).code).toBe('ROOM_IN_GAME');
  });

  it('keeps playing with 2 of 3 connected (disconnected chef stays idle)', async () => {
    const { host, code } = await hostRoom();
    const [, , p3] = await startGame(host, code, 3);
    p3!.c.close();
    await host.waitFor('room', (m) => m.room.players.some((p) => !p.connected));
    await sleep(200);
    expect(host.lastRoom()!.phase).toBe('playing');
    const st = await host.next('state');
    expect(st.players.find((p) => p.id === p3!.id)!.connected).toBe(false);
  });

  it('isolates rooms from each other', async () => {
    const a = await hostRoom();
    const b = await hostRoom();
    const [pa] = await startGame(a.host, a.code, 2);
    await joinPlayers(b.code, 2, ['mei', 'rocco']);
    pa!.c.send({ t: 'in', s: 1, x: 0, z: 1, u: false });
    await sleep(200);
    expect(b.host.messages.some((m) => m.t === 'state')).toBe(false);
    expect(srv.rooms.get(b.code)!.phase).toBe('lobby');
  });

  it('runs a level to the end, sends results to everyone and allows retry', async () => {
    const { host, code } = await hostRoom();
    const [p1, p2] = await startGame(host, code, 2);
    // speed up: 30 s level (test override)
    const results = await host.waitFor('results', () => true, 40000);
    expect(results.results.levelId).toBe('burger-1');
    expect(results.results.playerCount).toBe(2);
    await p1!.c.waitFor('results');
    await p2!.c.waitFor('results');
    const room = await host.waitFor('room', (m) => m.room.phase === 'results');
    expect(room.room.best['burger-1']).toBe(results.results.score);
    host.send({ t: 'flow', action: 'retry' });
    await host.next('room', (m) => m.room.phase === 'countdown');
    host.send({ t: 'flow', action: 'toLobby' });
    await host.next('room', (m) => m.room.phase === 'lobby');
  }, 45000);
});
