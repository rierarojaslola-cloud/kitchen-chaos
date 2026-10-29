/**
 * Procedural canvas textures (original, generated at runtime → no licensing issues).
 * Each generator draws base colour detail; a matching roughness map is derived where useful.
 */
import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(key: string, size: number, draw: Draw, srgb = true, repeat = 1): THREE.CanvasTexture {
  const k = `${key}:${repeat}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size, rng(hashStr(key)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  cache.set(k, tex);
  return tex;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise(ctx: CanvasRenderingContext2D, size: number, rand: () => number, alpha: number, count: number, light = true): void {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    const s = 1 + rand() * 2;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

/** Wooden planks running along X. */
export function woodTexture(base: string, dark: string, repeat = 1): THREE.CanvasTexture {
  return make(`wood:${base}:${dark}`, 256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const planks = 4;
    const h = size / planks;
    for (let p = 0; p < planks; p++) {
      const y = p * h;
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.12})`;
      ctx.fillRect(0, y, size, h);
      ctx.strokeStyle = dark;
      ctx.globalAlpha = 0.35;
      for (let g = 0; g < 9; g++) {
        ctx.beginPath();
        const gy = y + rand() * h;
        ctx.moveTo(0, gy);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, gy + Math.sin(x * 0.05 + rand() * 6) * 2.2);
        ctx.lineWidth = 0.6 + rand();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = dark;
      ctx.fillRect(0, y, size, 2);
      const seam = rand() * size;
      ctx.fillRect(seam, y, 2, h);
      // knot
      if (rand() > 0.5) {
        ctx.beginPath();
        ctx.ellipse(rand() * size, y + h / 2, 5 + rand() * 4, 3, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    noise(ctx, size, rand, 0.08, 1500);
  }, true, repeat);
}

/** Square tiles with grout and per-tile tone variation (floors, walls). */
export function tileTexture(a: string, b: string, grout: string, tiles = 4, checker = true, repeat = 1, shape: 'square' | 'hex' | 'subway' = 'square'): THREE.CanvasTexture {
  return make(`tile:${a}:${b}:${grout}:${tiles}:${checker}:${shape}`, 512, (ctx, size, rand) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, size, size);
    if (shape === 'subway') {
      const rows = tiles * 2;
      const th = size / rows;
      const tw = th * 2;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? tw / 2 : 0;
        for (let x = -tw; x < size + tw; x += tw) {
          ctx.fillStyle = shade(rand() > 0.5 ? a : b, (rand() - 0.5) * 0.08);
          roundRect(ctx, x + off + 2, r * th + 2, tw - 4, th - 4, 4);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + off + 5, r * th + 4, tw - 10, 3);
        }
      }
    } else if (shape === 'hex') {
      const r0 = size / tiles / 2;
      const w = Math.sqrt(3) * r0;
      for (let row = -1; row < tiles * 1.4; row++) {
        for (let col = -1; col < tiles * 1.3; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0);
          const cy = row * r0 * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = Math.PI / 6 + (k * Math.PI) / 3;
            const px = cx + Math.cos(ang) * (r0 - 2.5);
            const py = cy + Math.sin(ang) * (r0 - 2.5);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = shade((row + col) % 3 === 0 ? b : a, (rand() - 0.5) * 0.12);
          ctx.fill();
        }
      }
    } else {
      const t = size / tiles;
      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          const base = checker && (x + y) % 2 ? b : a;
          ctx.fillStyle = shade(base, (rand() - 0.5) * 0.09);
          roundRect(ctx, x * t + 3, y * t + 3, t - 6, t - 6, 6);
          ctx.fill();
          const g = ctx.createLinearGradient(x * t, y * t, x * t + t, y * t + t);
          g.addColorStop(0, 'rgba(255,255,255,0.10)');
          g.addColorStop(1, 'rgba(0,0,0,0.10)');
          ctx.fillStyle = g;
          roundRect(ctx, x * t + 3, y * t + 3, t - 6, t - 6, 6);
          ctx.fill();
        }
      }
    }
    noise(ctx, size, rand, 0.06, 2500);
    noise(ctx, size, rand, 0.05, 1200, false);
  }, true, repeat);
}

/** Brushed stainless steel. */
export function steelTexture(repeat = 1): THREE.CanvasTexture {
  return make('steel', 256, (ctx, size, rand) => {
    ctx.fillStyle = '#b9c2c9';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const y = rand() * size;
      ctx.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * 0.25})` : `rgba(40,50,60,${rand() * 0.18})`;
      ctx.lineWidth = rand() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
  }, true, repeat);
}

/** Speckled stone / terrazzo. */
export function stoneTexture(base: string, chips: string[], repeat = 1): THREE.CanvasTexture {
  return make(`stone:${base}:${chips.join()}`, 256, (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = chips[Math.floor(rand() * chips.length)]!;
      ctx.globalAlpha = 0.35 + rand() * 0.5;
      ctx.beginPath();
      const r = 0.8 + rand() * 3.2;
      ctx.ellipse(rand() * size, rand() * size, r, r * (0.5 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    noise(ctx, size, rand, 0.07, 1800);
  }, true, repeat);
}

/** Soft radial blob used for contact shadows and particles. */
export function blobTexture(): THREE.CanvasTexture {
  return make('blob', 128, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, false);
}

/** Text/emoji label rendered to a texture (crate signs, badges). */
export function labelTexture(text: string, bg: string, fg: string, font = '700 76px Rubik, sans-serif', w = 256, h = 128): THREE.CanvasTexture {
  return make(`label:${text}:${bg}:${fg}:${font}:${w}x${h}`, Math.max(w, h), (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const x0 = (size - w) / 2;
    const y0 = (size - h) / 2;
    ctx.fillStyle = bg;
    roundRect(ctx, x0 + 4, y0 + 4, w - 8, h - 8, Math.min(w, h) * 0.28);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + 4);
  }, true);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

export function disposeTextureCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
