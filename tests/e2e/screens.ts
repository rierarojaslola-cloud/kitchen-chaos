/**
 * Visual review tool: starts the real server, joins bot players over WebSocket, starts a level
 * and screenshots the big screen. With --compare it also captures `?procedural=1`.
 *
 *   npm run build && npx tsx tests/e2e/screens.ts [--compare] [levelId ...]
 * Output: .e2e-artifacts/screens/<level>[-procedural].png
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { loadConfig } from '../../apps/server/src/config';
import { startServer } from '../../apps/server/src/server';
import { TestClient } from '../integration/wsClient';

const argv = process.argv.slice(2);
const compare = argv.includes('--compare');
const levels = argv.filter((a) => !a.startsWith('--'));
const ids = levels.length ? levels : ['burger-1', 'burger-2', 'pizza-1', 'pizza-2', 'asian-1', 'asian-2'];
const OUT = path.resolve('.e2e-artifacts/screens');
fs.mkdirSync(OUT, { recursive: true });

const mod = (await import('@sparticuz/chromium')) as unknown as { default: { executablePath: () => Promise<string>; args: string[] } };
const srv = await startServer(loadConfig({ port: 0, host: '127.0.0.1', serveStatic: true, staticDir: 'apps/web/dist' }), {
  countdownMs: 200,
  tickMs: 50,
  now: Date.now,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? (await mod.default.executablePath()),
  args: [...mod.default.args.filter((a) => !a.startsWith('--single-process')), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const allStars = Object.fromEntries(ids.concat(['burger-1', 'burger-2', 'pizza-1', 'pizza-2', 'asian-1', 'asian-2']).map((i) => [i, 3]));

for (const levelId of ids) {
  for (const variant of compare ? ['', 'procedural'] : ['']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(150000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript((stars) => {
      localStorage.setItem('kc.progress', JSON.stringify({ best: {}, stars }));
      localStorage.setItem('kc.settings', JSON.stringify({ quality: 'high', reducedMotion: false, showFps: false }));
    }, allStars);
    await page.goto(`http://127.0.0.1:${srv.port}/${variant ? '?procedural=1' : ''}`);
    await page.getByRole('button', { name: 'Crear partida' }).click();
    const code = (await (await page.waitForFunction(() => (window as unknown as { __kc: { room?: { code: string } } }).__kc.room?.code)).jsonValue()) as string;
    const bots: TestClient[] = [];
    for (const [i, c] of ['nuri', 'bru', 'lua', 'rocco'].entries()) {
      const t = await TestClient.connect(srv.port);
      t.send({ t: 'player:join', v: 1, code, name: `Xef ${i + 1}`, character: c });
      await t.waitFor('joined');
      bots.push(t);
    }
    bots[0]!.send({ t: 'level', levelId });
    await new Promise((r) => setTimeout(r, 300));
    bots[0]!.send({ t: 'flow', action: 'start' });
    await page.waitForFunction(() => (window as unknown as { __kc: { view: string } }).__kc.view === 'playing');
    // move chefs apart and let two of them walk while the screenshot is taken
    let seq = 0;
    const dirs: [number, number][] = [[1, 0.3], [-1, 0.2], [0.5, 1], [-0.4, 1]];
    for (const [i, b] of bots.entries()) b.send({ t: 'in', s: ++seq, x: dirs[i]![0], z: dirs[i]![1], u: false });
    await new Promise((r) => setTimeout(r, 700));
    for (const [i, b] of bots.entries()) if (i > 1) b.send({ t: 'in', s: ++seq, x: 0, z: 0, u: false });
    await new Promise((r) => setTimeout(r, 2500));
    const info = await page.evaluate(() => { const k = (window as unknown as { __kc: { assets: () => unknown; stats: () => unknown } }).__kc; return { ...(k.assets?.() as object), ...(k.stats() as object) }; });
    const file = path.join(OUT, `${levelId}${variant ? `-${variant}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log(`${path.relative(process.cwd(), file)}  assets=${JSON.stringify(info)}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
    for (const b of bots) b.close();
    await ctx.close();
  }
}
await browser.close();
await srv.close();
process.exit(0);
