import { chromium } from 'playwright-core';
import { loadConfig } from '/home/claude/kitchen-chaos/apps/server/src/config';
import { startServer } from '/home/claude/kitchen-chaos/apps/server/src/server';
const mod: any = await import('@sparticuz/chromium');
const srv = await startServer(loadConfig({ port: 0, host: '127.0.0.1', serveStatic: true, staticDir: '/home/claude/kitchen-chaos/apps/web/dist' }));
const b = await chromium.launch({ executablePath: await mod.default.executablePath(), args: [...mod.default.args.filter((a:string)=>!a.startsWith('--single-process')), '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
for (const [q, w, h] of [['low',1280,720],['medium',1280,720],['high',1920,1080]] as const) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('console', m => m.type()==='error' && console.log('ERR', m.text()));
  await p.addInitScript((q) => localStorage.setItem('kc.settings', JSON.stringify({ quality: q, reducedMotion: false, showFps: true })), q);
  await p.goto(`http://127.0.0.1:${srv.port}`);
  await new Promise(r => setTimeout(r, 6000));
  const fps = await p.evaluate(() => [(window as any).__kcFps, document.fonts.status, JSON.stringify((window as any).__kc?.stats())]);
  console.log(q, w, h, fps);
  const t0 = Date.now();
  try { await p.screenshot({ path: `/tmp/claude-0/diag-${q}.png`, timeout: 60000 }); console.log('shot ms', Date.now()-t0); } catch(e) { console.log('shot fail', (e as Error).message.slice(0,80)); }
  await ctx.close();
}
await b.close(); await srv.close();
