// Compresses raw Blender exports (assets-src/blender/out) into apps/web/public/models with
// meshopt + quantization (no simplification, hierarchy and node names preserved).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('assets-src/blender/out');
const dst = path.resolve('apps/web/public/models');
const cli = path.resolve('node_modules/.bin/gltf-transform' + (process.platform === 'win32' ? '.cmd' : ''));
fs.mkdirSync(dst, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
let total = 0;
for (const [key, entry] of Object.entries(manifest)) {
  const input = path.join(src, entry.file);
  const output = path.join(dst, entry.file);
  execFileSync(cli, ['meshopt', input, output, '--level', 'medium'], { stdio: 'ignore', shell: process.platform === 'win32' });
  entry.bytes = fs.statSync(output).size;
  total += entry.bytes;
  console.log(`${key.padEnd(18)} ${String(entry.tris).padStart(6)} tris  ${(entry.bytes / 1024).toFixed(0).padStart(4)} KB`);
}
fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`total ${(total / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), dst)}`);
