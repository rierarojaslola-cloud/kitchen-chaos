/**
 * End-to-end browser test (real Chromium, real server, real WebSockets).
 *
 *  - 1 big-screen page (1920×1080) + up to 5 phone pages (emulated touch devices)
 *  - Phones join by URL with the room code, pick chefs, the leader starts the game
 *  - A "bot" drives two chefs THROUGH THE PHONE UI (dragging the on-screen joystick and
 *    tapping buttons) to cook, plate and serve a burger, reading positions from the
 *    host page's read-only debug surface.
 *  - Checks error paths (wrong code, full room), reconnection, pause, results.
 *  - Captures screenshots to .e2e-artifacts/ and writes report.json.
 *
 * NOTE: headless Chromium renders WebGL with SwiftShader (CPU), so FPS numbers recorded
 * here are NOT representative of real GPUs.
 *
 * Run: npm run build && npm run test:e2e
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { loadConfig } from '../../apps/server/src/config';
import { startServer } from '../../apps/server/src/server';

const OUT = path.resolve('.e2e-artifacts');
fs.mkdirSync(OUT, { recursive: true });
const report: { name: string; ok: boolean; detail?: string }[] = [];
const consoleErrors: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  report.push({ name, ok, ...(detail ? { detail } : {}) });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function chromePath(): Promise<{ exe: string; args: string[] }> {
  if (process.env.CHROME_PATH) return { exe: process.env.CHROME_PATH, args: [] };
  const mod = (await import('@sparticuz/chromium')) as unknown as { default: { executablePath: () => Promise<string>; args: string[] } };
  return { exe: await mod.default.executablePath(), args: mod.default.args };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T>, pred: (v: T) => boolean, timeout = 15000, step = 150): Promise<T> {
  const end = Date.now() + timeout;
  let v = await fn();
  while (!pred(v)) {
    if (Date.now() > end) throw new Error(`waitFor timeout (last value: ${JSON.stringify(v)?.slice(0, 200)})`);
    await sleep(step);
    v = await fn();
  }
  return v;
}

function watchConsole(page: Page, label: string): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${label}] pageerror: ${err.message}`));
}

interface HostDebug {
  view: string;
  room: { code: string; phase: string; players: { id: string; slot: number; connected: boolean; name: string }[]; leaderId: string } | null;
  level: { stations: { id: number; type: string; x: number; z: number; dir: number; crate?: string }[] } | null;
  players: { id: string; x: number; z: number; held: unknown }[];
  score: number;
}
const hostState = (host: Page) => host.evaluate(() => {
  const k = (window as unknown as { __kc: HostDebug }).__kc;
  return { view: k.view, room: k.room, level: k.level, players: k.players, score: k.score } as HostDebug;
});

async function newPhone(browser: Browser, base: string, url: string, label: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  watchConsole(page, label);
  await page.goto(`${base}${url}`);
  return { ctx, page };
}

async function joinPhone(page: Page, name: string, chefIndex: number): Promise<void> {
  await page.locator('input[aria-label="El teu nom"]').fill(name);
  await page.getByRole('button', { name: 'Triar xef' }).click();
  await page.locator('.chef').nth(chefIndex).click();
  await page.getByRole('button', { name: 'Entrar a la sala' }).click();
  await page.locator('.me-card').waitFor({ timeout: 10000 });
}

// ───────────── Bot driving the phone joystick ─────────────
const DIRS: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };

async function stick(page: Page): Promise<{ cx: number; cy: number }> {
  const b = (await page.locator('.stick-zone').boundingBox())!;
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

/** Positions come straight from the in-process authoritative server (test hook); inputs go through the phone UI. */
type PosSource = (() => { id: string; x: number; z: number }[]) & { phase?: () => string };

async function driveTo(positions: PosSource, phone: Page, pid: string, station: { x: number; z: number; dir: number }, face = true): Promise<void> {
  const [dx, dz] = DIRS[station.dir]!;
  const tx = station.x + dx + 0.5;
  const tz = station.z + dz + 0.5;
  const { cx, cy } = await stick(phone);
  await phone.mouse.move(cx, cy);
  await phone.mouse.down();
  const end = Date.now() + 25000;
  let last = '';
  try {
    for (;;) {
      if (Date.now() > end) throw new Error(`could not reach ${tx},${tz} (all ${JSON.stringify(positions().map((p) => [p.x.toFixed(2), p.z.toFixed(2)]))}; at ${last}; pad ${JSON.stringify(await phone.evaluate(() => (window as unknown as { __pad: unknown }).__pad))})`);
      const me = positions().find((p) => p.id === pid);
      last = me ? `${me.x.toFixed(2)},${me.z.toFixed(2)}` : 'none';
      if (!me) throw new Error('player not in state');
      const vx = tx - me.x;
      const vz = tz - me.z;
      const d = Math.hypot(vx, vz);
      if (d < 0.3) break;
      // proportional speed: slow near the target so control-loop latency cannot overshoot
      const k = Math.max(26, Math.min(62, d * 40));
      await phone.mouse.move(cx + (vx / d) * k, cy + (vz / d) * k);
      await sleep(60);
    }
  } finally {
    await phone.mouse.up();
  }
  if (!face) return;
  // face the station: small nudge towards it
  await phone.mouse.move(cx, cy);
  await phone.mouse.down();
  await phone.mouse.move(cx - dx * 40, cy - dz * 40, { steps: 2 });
  await sleep(160);
  await phone.mouse.up();
  await sleep(150);
}

async function tapInteract(phone: Page): Promise<void> {
  const b = (await phone.locator('.pbtn.interact').boundingBox())!;
  await phone.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await phone.mouse.down();
  await sleep(60);
  await phone.mouse.up();
  await sleep(200);
}

async function interactLabel(phone: Page): Promise<string> {
  return (await phone.locator('.pbtn.interact .lbl').textContent()) ?? '';
}

// ───────────── Main ─────────────
async function main(): Promise<void> {
  const dist = path.resolve('apps/web/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run `npm run build` first');
  const srv = await startServer(loadConfig({ port: 0, host: '127.0.0.1', serveStatic: true, staticDir: dist, maxRooms: 20 }), {
    countdownMs: 2000,
    tickMs: 50,
    levelDurationOverride: Number(process.env.E2E_LEVEL_S ?? 200),
    now: Date.now,
  });
  const base = `http://127.0.0.1:${srv.port}`;
  const { exe, args } = await chromePath();
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: [...args.filter((a) => !a.startsWith('--single-process')), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });

  try {
    // ── Host ──
    const hostCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const host = await hostCtx.newPage();
    host.setDefaultTimeout(120000);
    await host.addInitScript(() => localStorage.setItem('kc.settings', JSON.stringify({ quality: 'low', reducedMotion: false, showFps: true })));
    watchConsole(host, 'host');
    await host.goto(base);
    await host.getByRole('button', { name: 'Crear partida' }).waitFor();
    await sleep(1500);
    await host.screenshot({ path: path.join(OUT, '01-host-title.png') });
    check('Title screen renders with create button', true);

    await host.getByRole('button', { name: 'Crear partida' }).click();
    const lobby = await waitFor(() => hostState(host), (s) => s.view === 'lobby' && !!s.room);
    const code = lobby.room!.code;
    check('Room created from the big screen', /^[A-HJ-NP-Z]{4}$/.test(code), `code ${code}`);
    await host.locator('.qr svg').first().waitFor();
    const qrUrl = (await host.locator('.join-url').first().textContent()) ?? '';
    check('QR + join URL point to the controller route with the room code', qrUrl.endsWith(`/controller.html?room=${code}`), qrUrl);

    // ── Error paths ──
    const bad = await newPhone(browser, base, '/controller.html?room=ZZZZ', 'phone-bad');
    await bad.page.locator('input[aria-label="El teu nom"]').fill('Prova');
    await bad.page.getByRole('button', { name: 'Triar xef' }).click();
    await bad.page.getByRole('button', { name: 'Entrar a la sala' }).click();
    const errText = await bad.page.locator('.err').textContent({ timeout: 8000 });
    check('Wrong room code shows a clear error on the phone', !!errText?.includes('No existeix'), errText ?? '');
    await bad.ctx.close();

    // ── 4 phones join ──
    const phones: { ctx: BrowserContext; page: Page }[] = [];
    const names = ['Anna', 'Pau', 'Laia', 'Marc'];
    for (let i = 0; i < 4; i++) {
      const p = await newPhone(browser, base, `/controller.html?room=${code}`, `phone-${i + 1}`);
      if (i === 0) {
        await p.page.screenshot({ path: path.join(OUT, '02-phone-join.png') });
        await p.page.locator('input[aria-label="El teu nom"]').fill(names[i]!);
        await p.page.getByRole('button', { name: 'Triar xef' }).click();
        await p.page.locator('.chef').first().waitFor();
        await p.page.screenshot({ path: path.join(OUT, '03-phone-chef-select.png') });
        await p.page.locator('.chef').nth(0).click();
        await p.page.getByRole('button', { name: 'Entrar a la sala' }).click();
        await p.page.locator('.me-card').waitFor();
      } else await joinPhone(p.page, names[i]!, i);
      phones.push(p);
    }
    const full = await waitFor(() => hostState(host), (s) => (s.room?.players.length ?? 0) === 4);
    check('Four phones joined as independent players', full.room!.players.map((p) => p.slot).join() === '0,1,2,3');
    await phones[0]!.page.screenshot({ path: path.join(OUT, '04-phone-lobby-leader.png') });
    await sleep(600);
    await host.screenshot({ path: path.join(OUT, '05-host-lobby-4-players.png') });

    const fifth = await newPhone(browser, base, `/controller.html?room=${code}`, 'phone-5');
    await fifth.page.locator('input[aria-label="El teu nom"]').fill('Cinquè');
    await fifth.page.getByRole('button', { name: 'Triar xef' }).click();
    await fifth.page.getByRole('button', { name: 'Entrar a la sala' }).click();
    const fullErr = await fifth.page.locator('.err').textContent({ timeout: 8000 });
    check('Fifth player is rejected (room full)', !!fullErr?.includes('plena'), fullErr ?? '');
    await fifth.ctx.close();

    // ── Start from the leader phone ──
    await phones[0]!.page.getByRole('button', { name: /Començar/ }).click();
    await waitFor(() => hostState(host), (s) => s.view === 'countdown');
    await sleep(700);
    await host.screenshot({ path: path.join(OUT, '06-host-countdown.png') });
    const playing = await waitFor(() => hostState(host), (s) => s.view === 'playing' && s.players.length === 4, 10000);
    check('Leader phone started a 4-player game; host shows the kitchen', playing.players.length === 4);
    await phones[0]!.page.locator('.gamepad').waitFor();
    await sleep(1200);
    await host.screenshot({ path: path.join(OUT, '07-host-ingame-burger.png') });
    await phones[0]!.page.screenshot({ path: path.join(OUT, '08-phone-gamepad.png') });

    // ── Movement sync through the joystick ──
    const roomNow = (await hostState(host)).room!;
    const pid = (slot: number) => roomNow.players.find((p) => p.slot === slot)!.id;
    const before = (await hostState(host)).players.find((p) => p.id === pid(2))!;
    const { cx, cy } = await stick(phones[2]!.page);
    await phones[2]!.page.mouse.move(cx, cy);
    await phones[2]!.page.mouse.down();
    await phones[2]!.page.mouse.move(cx + 60, cy, { steps: 3 });
    await sleep(700);
    await phones[2]!.page.mouse.up();
    await sleep(300);
    const after = (await hostState(host)).players.find((p) => p.id === pid(2))!;
    check('Joystick on phone moves the chef on the big screen', after.x > before.x + 0.8, `x ${before.x.toFixed(2)} → ${after.x.toFixed(2)}`);

    // ── Cook + serve a burger through the phone UI ──
    const level = (await hostState(host)).level!;
    const positions: PosSource = Object.assign(() => srv.rooms.get(code)!.debugSim()!.playerViews(), {
      phase: () => {
        const r = srv.rooms.get(code)!;
        const sim = r.debugSim()!;
        const sp = (r as unknown as { players: { id: string; lastInSeq: number; conn: unknown }[] }).players.map((p) => ({ id: p.id, seq: p.lastInSeq, conn: !!p.conn, input: sim.debugPlayer(p.id)?.input, connected: sim.debugPlayer(p.id)?.connected }));
        return JSON.stringify({ phase: r.phase, tick: sim.tick, elapsed: sim.elapsed.toFixed(1), timer: !!(r as unknown as { timer: unknown }).timer, me: sim.debugPlayer(sp[0]!.id) && { x: sim.debugPlayer(sp[0]!.id)!.x, z: sim.debugPlayer(sp[0]!.id)!.z, a: sim.debugPlayer(sp[0]!.id)!.a }, sp });
      },
    });
    const st = (type: string, crate?: string) => level.stations.find((s) => s.type === type && (!crate || s.crate === crate))!;
    const p1 = phones[0]!.page;
    const p2 = phones[1]!.page;
    // J2 prepares a plate with a bun first (so the patty does not burn while J2 walks)
    await driveTo(positions, p2, pid(1), st('plates'));
    await tapInteract(p2);
    await driveTo(positions, p2, pid(1), st('crate', 'bun'));
    await tapInteract(p2);
    const withBun = await p2.locator('.held').textContent();
    check('Plate + bun assembled from the phone', !!withBun?.includes('pa'), withBun ?? '');
    // J2 waits next to the cooking line (in front of the second grill)
    const grills = level.stations.filter((x) => x.type === 'grill').sort((a, b) => a.x - b.x);
    await driveTo(positions, p2, pid(1), grills[1]!, false);

    await driveTo(positions, p1, pid(0), st('crate', 'patty'));
    const lbl = await interactLabel(p1);
    check('Phone shows contextual action near a station', lbl === 'Agafar hamburguesa', lbl);
    await tapInteract(p1);
    const held = await p1.locator('.held').textContent();
    check('Interact on phone picks up the ingredient', !!held?.includes('Hamburguesa'), held ?? '');
    await driveTo(positions, p1, pid(0), grills[0]!);
    await tapInteract(p1);
    const afterPlace = await p1.locator('.held').textContent();
    check('Patty placed on the grill from the phone', afterPlace === 'Mans buides', afterPlace ?? '');
    const sim = () => srv.rooms.get(code)!.debugSim()!;
    const grillWithPatty = sim().debugStations().find((x) => x.type === 'grill' && x.item)!;
    // J2 (waiting at the next grill) turns diagonally towards the patty without walking
    void grillWithPatty;
    {
      const { cx: sx, cy: sy } = await stick(p2);
      await p2.mouse.move(sx, sy);
      await p2.mouse.down();
      await p2.mouse.move(sx - 28, sy - 28, { steps: 2 });
      await sleep(90);
      await p2.mouse.up();
    }
    // wait for the patty to be cooked (label changes to "Posar ... al plat")
    await waitFor(() => interactLabel(p2), (l) => l.startsWith('Posar'), 15000).catch(async (e) => {
      throw new Error(`${(e as Error).message}; grill=${JSON.stringify(grillWithPatty.item)}; held=${await p2.locator('.held').textContent()}; near=${await p2.locator('.near').textContent()}`);
    });
    await tapInteract(p2);
    const plated = await p2.locator('.held').textContent();
    check('Cooked patty plated with a bun (two chefs cooperating)', !!plated?.includes('pa') && !!plated?.includes('hamburguesa'), plated ?? '');
    await host.screenshot({ path: path.join(OUT, '09-host-cooking.png') });

    await driveTo(positions, p2, pid(1), st('serve'));
    const scoreBefore = (await hostState(host)).score;
    // serve as soon as a classic burger order is on the rail
    const served = await waitFor(
      async () => {
        await tapInteract(p2);
        return (await hostState(host)).score;
      },
      (s) => s > scoreBefore,
      45000,
      1500,
    );
    check('Dish served via phone; score increased on the big screen', served > scoreBefore, `score ${scoreBefore} → ${served}`);
    await sleep(300);
    await host.screenshot({ path: path.join(OUT, '10-host-served.png') });

    // ── Reconnection: reload phone 3 → session token resumes the same slot ──
    await phones[2]!.page.reload();
    await phones[2]!.page.locator('.gamepad').waitFor({ timeout: 10000 });
    const rs = await waitFor(() => hostState(host), (s) => !!s.room && s.room.players.every((p) => p.connected));
    check('Phone reload resumes the same player slot (session token)', rs.room!.players.length === 4);

    // ── Network drop on one phone (4 players: game continues) ──
    await phones[3]!.ctx.setOffline(true);
    await waitFor(() => hostState(host), (s) => !!s.room?.players.some((p) => !p.connected), 30000, 300).catch(() => null);
    await phones[3]!.ctx.setOffline(false);
    const back = await waitFor(() => hostState(host), (s) => !!s.room && s.room.players.every((p) => p.connected), 30000, 300);
    check('Phone recovers after a network drop', !!back.room);

    // ── Pause from a phone, resume from leader ──
    await phones[1]!.page.getByRole('button', { name: 'Pausa' }).click();
    await waitFor(() => hostState(host), (s) => s.view === 'paused');
    await sleep(400);
    await host.screenshot({ path: path.join(OUT, '11-host-paused.png') });
    await phones[0]!.page.getByRole('button', { name: 'Continuar' }).click();
    await waitFor(() => hostState(host), (s) => s.view === 'playing');
    check('Pause from a phone and resume from the leader phone', true);

    // ── Performance sample (SwiftShader: not representative) ──
    await host.evaluate(() => localStorage.setItem('x', '1'));
    await sleep(2500);
    const perf = await host.evaluate(() => ({ fps: (window as unknown as { __kcFps?: number }).__kcFps ?? null, stats: (window as unknown as { __kc: { stats: () => unknown } }).__kc.stats() }));
    check('Render stats collected (software GPU)', true, JSON.stringify(perf));

    // ── End of level ──
    await waitFor(() => hostState(host), (s) => s.view === 'results', 300000, 1000);
    await sleep(2000);
    await host.screenshot({ path: path.join(OUT, '12-host-results.png') });
    await phones[0]!.page.locator('.res-stars').waitFor();
    await phones[0]!.page.screenshot({ path: path.join(OUT, '13-phone-results-leader.png') });
    check('Level ends with results on the big screen and the phones', true);

    await phones[0]!.page.getByRole('button', { name: 'Tornar a la sala' }).click();
    await waitFor(() => hostState(host), (s) => s.view === 'lobby');
    check('Leader returns everyone to the lobby', true);
    for (const p of phones) await p.ctx.close();
    await hostCtx.close();

    // ── Visual pass of the other restaurants (progress unlocked locally) ──
    for (const levelId of ['pizza-1', 'pizza-2', 'asian-1', 'asian-2', 'burger-2']) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const h = await ctx.newPage();
      h.setDefaultTimeout(150000);
      watchConsole(h, `host-${levelId}`);
      await h.addInitScript(() => {
        const stars = Object.fromEntries(['burger-1', 'burger-2', 'pizza-1', 'pizza-2', 'asian-1', 'asian-2'].map((id) => [id, 3]));
        localStorage.setItem('kc.progress', JSON.stringify({ best: {}, stars }));
      });
      await h.goto(base);
      await h.getByRole('button', { name: 'Crear partida' }).click();
      const s = await waitFor(() => hostState(h), (x) => x.view === 'lobby' && !!x.room);
      const ps = [await newPhone(browser, base, `/controller.html?room=${s.room!.code}`, 'v1'), await newPhone(browser, base, `/controller.html?room=${s.room!.code}`, 'v2'), await newPhone(browser, base, `/controller.html?room=${s.room!.code}`, 'v3')];
      for (const [i, p] of ps.entries()) await joinPhone(p.page, `Xef ${i + 1}`, i + 3);
      await ps[0]!.page.locator('.lv-list button', { hasText: levelId === 'pizza-1' ? 'Massa mare' : levelId === 'pizza-2' ? 'Forn en flames' : levelId === 'asian-1' ? 'Marea alta' : levelId === 'asian-2' ? 'Nit de lluna' : 'Hora punta' }).click();
      await sleep(400);
      await ps[0]!.page.getByRole('button', { name: /Començar/ }).click();
      await waitFor(() => hostState(h), (x) => x.view === 'playing', 15000);
      // move chefs a bit so they are not all at spawn
      for (const p of ps) {
        const { cx: x0, cy: y0 } = await stick(p.page);
        await p.page.mouse.move(x0, y0);
        await p.page.mouse.down();
        await p.page.mouse.move(x0 + 30, y0 - 50, { steps: 2 });
      }
      await sleep(600);
      for (const p of ps) await p.page.mouse.up();
      await sleep(3500);
      await h.screenshot({ path: path.join(OUT, `20-host-${levelId}.png`) });
      check(`Level ${levelId} loads and renders with 3 players`, true);
      for (const p of ps) await p.ctx.close();
      await ctx.close();
    }
  } catch (err) {
    check('E2E run completed without exceptions', false, (err as Error).stack?.split('\n').slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    await srv.close();
  }

  const relevantErrors = consoleErrors.filter((e) => !/WebGL|GPU stall|swiftshader|Automatic fallback/i.test(e));
  check('No console errors in host or phone pages', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' || '));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ date: new Date().toISOString(), report, consoleErrors }, null, 2));
  const failed = report.filter((r) => !r.ok);
  console.log(`\n${report.length - failed.length}/${report.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

void main();
