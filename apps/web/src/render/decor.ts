/**
 * Restaurant-specific decoration: what makes each kitchen a different place.
 * Decoration stays on walls / above head height so it never hides gameplay.
 */
import * as THREE from 'three';
import type { LevelInitView, RestaurantId } from '@kc/game-logic';
import { RESTAURANTS } from '@kc/game-logic';
import { cyl, geo, lathe, lumpy, mat, mesh, rbox, sphere, torus, uniqueMat } from './models/kit';
import { roundRect } from './textures';

function neonText(text: string, color: string, font: string, w = 1024, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  for (const blur of [40, 20, 8]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintedSign(text: string, bg: string, fg: string, font: string, w = 1024, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  roundRect(ctx, 8, 8, w - 16, h - 16, 40);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  roundRect(ctx, 26, 26, w - 52, h - 52, 28);
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface DecorResult {
  group: THREE.Group;
  animate: (time: number) => void;
}

export function buildDecor(level: LevelInitView, id: RestaurantId): DecorResult {
  const g = new THREE.Group();
  const W = level.width;
  const H = level.height;
  const backZ = 1.0; // face of the back wall
  const anims: ((t: number) => void)[] = [];
  const name = RESTAURANTS[id].name;
  const stationsOf = (t: string) => level.stations.filter((s) => s.type === t);

  if (id === 'burger') {
    const tex = neonText(name, '#ff4fa3', '400 150px "Lilita One", sans-serif');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    // keep clear of the extractor hoods above the cooking line
    const hot = stationsOf('grill').concat(stationsOf('fryer')).map((s) => s.x + 0.5);
    const hotMid = hot.length ? hot.reduce((a, b) => a + b, 0) / hot.length : W / 2;
    sign.position.set(hotMid > W / 2 ? 3.6 : W - 3.6, 2.0, backZ + 0.02);
    g.add(sign);
    anims.push((t) => {
      (sign.material as THREE.MeshBasicMaterial).opacity = 0.88 + Math.sin(t * 3.1) * 0.05 + (Math.sin(t * 37) > 0.97 ? -0.3 : 0);
    });
    // extractor hoods flush against the back wall, above head height (never over the cooktop)
    for (const s of [...stationsOf('grill'), ...stationsOf('fryer')]) {
      if (s.z > 1) continue;
      const hood = mesh(rbox(0.96, 0.3, 0.42, 0.04), mat('#b8c2c8', { rough: 0.3, metal: 0.85 }));
      hood.position.set(s.x + 0.5, 2.35, backZ + 0.21);
      g.add(hood);
    }
    // checker strip along back wall
    const strip = mesh(rbox(W - 2, 0.16, 0.04, 0.01, 1), mat('#c8382b', { rough: 0.5 }), false);
    strip.position.set(W / 2, 1.25, backZ + 0.02);
    g.add(strip);
    // warm LED bar along the top of the back wall
    const led = mesh(rbox(W - 2.4, 0.05, 0.05, 0.01, 1), mat('#ffe0b0', { emissive: '#ffcf8a', emissiveIntensity: 1.6 }), false);
    led.position.set(W / 2, 2.55, backZ + 0.05);
    g.add(led);
  }

  if (id === 'pizza') {
    const tex = paintedSign(name, '#2f5d3a', '#f6e7c8', '400 120px "Lilita One", sans-serif');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.95), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    sign.position.set(W / 2 + 2.2, 2.0, backZ + 0.02);
    g.add(sign);
    // arched windows with warm daylight
    for (const x of [2.2, W - 2.2]) {
      const glow = mesh(new THREE.CircleGeometry(0.55, 24, 0, Math.PI), mat('#ffe6b8', { emissive: '#ffd59a', emissiveIntensity: 1.3 }), false);
      glow.position.set(x, 1.95, backZ + 0.015);
      const rect = mesh(new THREE.PlaneGeometry(1.1, 0.6), glow.material as THREE.Material, false);
      rect.position.set(x, 1.65, backZ + 0.015);
      const frame = mesh(torus(0.55, 0.05, Math.PI, 6, 20), mat('#6b4a32', { rough: 0.7 }), false);
      frame.position.set(x, 1.95, backZ + 0.03);
      g.add(glow, rect, frame);
    }
    // hanging copper pans
    for (let i = 0; i < 4; i++) {
      const pan = mesh(lathe('copperPan', [[0, 0], [0.18, 0.01], [0.2, 0.06], [0.19, 0.065], [0.17, 0.02], [0, 0.015]]), mat('#c46a3a', { rough: 0.25, metal: 0.9 }), false);
      pan.rotation.x = -Math.PI / 2; // copper bottom faces the room
      pan.position.set(W / 2 - 3.3 + i * 0.5, 2.15 - (i % 2) * 0.15, backZ + 0.08);
      g.add(pan);
    }
    // shelf with jars on side wall
    const shelf = mesh(rbox(0.25, 0.05, 2.0, 0.01), mat('#6b4a32', { rough: 0.7 }), false);
    shelf.position.set(1.12, 1.7, H / 2);
    g.add(shelf);
    for (let i = 0; i < 5; i++) {
      const jar = mesh(cyl(0.07, 0.07, 0.2, 12), mat(['#c9301f', '#3f7f2a', '#e8c25a'][i % 3]!, { rough: 0.2, opacity: 0.85 }), false);
      jar.position.set(1.12, 1.83, H / 2 - 0.8 + i * 0.4);
      g.add(jar);
    }
    // olive tree pots in front corners (outside the kitchen floor)
    for (const x of [-0.6, W + 0.6]) {
      const potM = mesh(cyl(0.3, 0.22, 0.45, 16), mat('#b8572f', { rough: 0.8 }));
      potM.position.set(x, 0.225, H - 1.2);
      const crown = mesh(lumpy('olive', 0.5, 0.35, 2), mat('#6f8f4a', { rough: 0.8 }));
      crown.position.set(x, 1.1, H - 1.2);
      g.add(potM, crown);
    }
  }

  if (id === 'asian') {
    // moon window
    const moon = mesh(new THREE.CircleGeometry(0.85, 40), mat('#fff1c9', { emissive: '#ffe4a3', emissiveIntensity: 1.1 }), false);
    moon.position.set(W / 2, 1.95, backZ + 0.015);
    const ring = mesh(torus(0.86, 0.06, Math.PI * 2, 8, 40), mat('#3a2617', { rough: 0.7 }), false);
    ring.position.set(W / 2, 1.95, backZ + 0.03);
    g.add(moon, ring);
    for (let i = 0; i < 3; i++) {
      const branch = mesh(cyl(0.015, 0.02, 0.9, 5), mat('#2a1a10'), false);
      branch.position.set(W / 2 - 0.3 + i * 0.25, 1.75 + i * 0.1, backZ + 0.035);
      branch.rotation.z = 0.9 - i * 0.4;
      g.add(branch);
    }
    const tex = paintedSign(name, '#7a1f1a', '#ffd9a0', '400 120px "Lilita One", sans-serif');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    sign.position.set(W - 3.2, 2.1, backZ + 0.02);
    g.add(sign);
    // paper lanterns
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * ((W - 4) / 3);
      const lm = uniqueMat(i % 2 ? '#ff6b5c' : '#ffb35c', { rough: 0.9, emissive: i % 2 ? '#ff5a3c' : '#ffa53c', emissiveIntensity: 1.1 });
      const lantern = mesh(lumpy('lantern', 0.22, 0.02, 2, 1, 1.25, 1), lm, false);
      lantern.userData.dynamic = true;
      lantern.position.set(x, 2.55, 2.4 + (i % 2) * 0.8);
      const cap = mesh(cyl(0.11, 0.11, 0.06, 10), mat('#1d1a1a'), false);
      cap.position.set(x, 2.84, lantern.position.z);
      g.add(lantern, cap);
      anims.push((t) => {
        lantern.rotation.z = Math.sin(t * 0.9 + i) * 0.05;
        lm.emissiveIntensity = 1.0 + Math.sin(t * 2 + i * 1.7) * 0.12;
      });
    }
    // bamboo on side walls
    for (const x of [0.8, W - 0.8]) {
      for (let i = 0; i < 3; i++) {
        const b = mesh(cyl(0.05, 0.05, 2.4, 8), mat('#7fa34a', { rough: 0.6 }), false);
        b.position.set(x, 1.2, 1.6 + i * 0.22);
        g.add(b);
        for (let k = 0; k < 4; k++) {
          const node = mesh(torus(0.05, 0.012, Math.PI * 2, 4, 10), mat('#5d7f33'), false);
          node.rotation.x = Math.PI / 2;
          node.position.set(x, 0.4 + k * 0.55, 1.6 + i * 0.22);
          g.add(node);
        }
      }
    }
  }

  // shared: wall clock
  const clock = new THREE.Group();
  const face = mesh(cyl(0.28, 0.28, 0.05, 28), mat('#fff8ec', { rough: 0.4 }), false);
  face.rotation.x = Math.PI / 2;
  const rim = mesh(torus(0.28, 0.03, Math.PI * 2, 6, 28), mat('#2a1d17', { rough: 0.4 }), false);
  const hand = mesh(geo('clockHand', () => new THREE.BoxGeometry(0.02, 0.22, 0.01).translate(0, 0.1, 0)), mat('#ff5a3c'), false);
  hand.position.z = 0.035;
  hand.userData.dynamic = true;
  clock.add(face, rim, hand);
  clock.position.set(id === 'pizza' ? W / 2 - 1.6 : id === 'asian' ? 3.0 : W - 2.2, 2.3, backZ + 0.03);
  g.add(clock);
  anims.push((t) => (hand.rotation.z = -t * 0.5));

  return { group: g, animate: (t) => anims.forEach((a) => a(t)) };
}
