/**
 * Procedural stylised chef rig. Silhouette comes from CharacterDef (body proportions, hat,
 * hair, accessory), so each chef reads differently at TV distance. The rig is a simple
 * hierarchy of pivots animated in code (walk, carry, chop, repair, idle, celebrate).
 *
 * PROVISIONAL: designed to be swapped for skinned GLB characters (see docs/ASSETS.md);
 * the `ChefRig` interface (root, holdAnchor, animate) is what the scene depends on.
 */
import * as THREE from 'three';
import type { CharacterDef } from '@kc/shared';
import type { PlayerAction } from '@kc/game-logic';
import { capsule, cone, cyl, lathe, lumpy, mat, mergeStatic, mesh, rbox, sphere, torus } from './kit';

export interface ChefAnimInput {
  speed: number;
  act: PlayerAction;
  holding: boolean;
  dt: number;
  time: number;
  mood: 'normal' | 'happy' | 'sad';
}

export interface ChefRig {
  root: THREE.Group;
  holdAnchor: THREE.Object3D;
  headTop: number;
  animate: (i: ChefAnimInput) => void;
  setDimmed: (dim: boolean) => void;
}

export function buildChef(def: CharacterDef): ChefRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const jacket = mat(def.primary, { rough: 0.7 });
  const apronM = mat(def.secondary, { rough: 0.8 });
  const skin = mat(def.skin, { rough: 0.6 });
  const hairM = mat(def.hair, { rough: 0.75 });
  const dark = mat('#1d1a1a', { rough: 0.5 });
  const trousers = mat('#2c3036', { rough: 0.8 });

  const W = def.bodyW;
  const H = def.bodyH;
  const hip = 0.3;
  const torsoH = 0.46 * H;

  // ── legs ──
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.1 * W, hip, 0);
    const leg = mesh(capsule(0.065, 0.16), trousers);
    leg.position.y = -0.13;
    const shoe = mesh(rbox(0.13, 0.08, 0.2, 0.035), dark);
    shoe.position.set(0, -0.26, 0.03);
    pivot.add(leg, shoe);
    pivot.userData.dynamic = true;
    body.add(pivot);
    legs.push(pivot);
  }

  // ── torso ──
  const torso = mesh(
    lathe(`torso:${W}:${H}`, [
      [0, 0],
      [0.2 * W, 0],
      [0.235 * W, 0.08 * H],
      [0.24 * W, 0.24 * H],
      [0.21 * W, 0.4 * H],
      [0.12 * W, torsoH],
      [0, torsoH + 0.01],
    ]),
    jacket,
  );
  torso.position.y = hip - 0.04;
  torso.userData.dynamic = true;
  const apron = mesh(rbox(0.3 * W, 0.34 * H, 0.06, 0.03), apronM);
  apron.position.set(0, hip + 0.13 * H, 0.2 * W);
  apron.rotation.x = -0.06;
  const pocket = mesh(rbox(0.14 * W, 0.07, 0.02, 0.01, 1), mat(shadeHex(def.secondary), { rough: 0.8 }), false);
  pocket.position.set(0, hip + 0.08 * H, 0.235 * W);
  body.add(torso, apron, pocket);
  for (let i = 0; i < 2; i++) {
    const b = mesh(sphere(0.018, 8, 6), mat('#e9e2d4', { rough: 0.3 }), false);
    b.position.set(0.07 * W, hip + (0.3 + i * 0.07) * H, 0.215 * W);
    body.add(b);
  }

  // ── arms ──
  const shoulderY = hip + torsoH * 0.82;
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25 * W, shoulderY, 0);
    const arm = mesh(capsule(0.055, 0.17), jacket);
    arm.position.y = -0.12;
    const hand = mesh(sphere(0.062, 12, 10), skin);
    hand.position.y = -0.26;
    pivot.add(arm, hand);
    pivot.userData.dynamic = true;
    body.add(pivot);
    arms.push(pivot);
  }

  // ── head ──
  const headR = 0.2 * def.headScale;
  const head = new THREE.Group();
  const headY = hip + torsoH + headR * 0.82;
  head.position.y = headY;
  head.userData.dynamic = true;
  body.add(head);
  const skull = mesh(sphere(headR, 24, 18), skin);
  skull.scale.set(1, 0.95, 0.96);
  head.add(skull);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = mesh(sphere(headR * 0.13, 10, 8), dark, false);
    eye.position.set(side * headR * 0.36, headR * 0.08, headR * 0.86);
    eye.scale.set(0.85, 1.15, 0.6);
    const glint = mesh(sphere(headR * 0.04, 6, 4), mat('#ffffff', { rough: 0.2 }), false);
    glint.position.set(headR * 0.03, headR * 0.05, headR * 0.06);
    eye.add(glint);
    eye.userData.dynamic = true;
    head.add(eye);
    eyes.push(eye);
    const brow = mesh(rbox(headR * 0.3, headR * 0.06, headR * 0.06, 0.01, 1), hairM, false);
    brow.position.set(side * headR * 0.36, headR * 0.32, headR * 0.86);
    brow.rotation.z = side * -0.12;
    head.add(brow);
    const blush = mesh(sphere(headR * 0.12, 8, 6), mat('#ff8c8c', { rough: 0.8, opacity: 0.55 }), false);
    blush.position.set(side * headR * 0.55, -headR * 0.18, headR * 0.72);
    blush.scale.set(1, 0.55, 0.3);
    head.add(blush);
  }
  const nose = mesh(sphere(headR * 0.12, 10, 8), mat(shadeHex(def.skin, -0.06), { rough: 0.6 }), false);
  nose.position.set(0, -headR * 0.06, headR * 0.97);
  const mouth = mesh(torus(headR * 0.16, headR * 0.035, Math.PI, 6, 12), mat('#7a2a2a', { rough: 0.5 }), false);
  mouth.position.set(0, -headR * 0.32, headR * 0.86);
  mouth.rotation.z = Math.PI;
  mouth.userData.dynamic = true;
  head.add(nose, mouth);

  // ── hair ──
  switch (def.hat === 'hijab' ? 'bald' : def.hairStyle) {
    case 'short': {
      const cap = mesh(sphere(headR * 1.03, 20, 12, ), hairM);
      cap.scale.set(1, 0.6, 1);
      cap.position.set(0, headR * 0.32, -headR * 0.08);
      head.add(cap);
      break;
    }
    case 'curly': {
      for (let i = 0; i < 11; i++) {
        const c = mesh(sphere(headR * 0.32, 10, 8), hairM);
        const a = (i / 11) * Math.PI * 2;
        c.position.set(Math.cos(a) * headR * 0.82, headR * 0.35 + Math.sin(i * 1.7) * headR * 0.08, Math.sin(a) * headR * 0.8 - headR * 0.1);
        head.add(c);
      }
      break;
    }
    case 'buns': {
      const cap = mesh(sphere(headR * 1.04, 20, 12), hairM);
      cap.scale.set(1, 0.62, 1);
      cap.position.set(0, headR * 0.3, -headR * 0.1);
      head.add(cap);
      for (const side of [-1, 1]) {
        const bun = mesh(sphere(headR * 0.36, 14, 10), hairM);
        bun.position.set(side * headR * 0.78, headR * 0.82, -headR * 0.1);
        head.add(bun);
      }
      break;
    }
    case 'ponytail': {
      const cap = mesh(sphere(headR * 1.04, 20, 12), hairM);
      cap.scale.set(1, 0.62, 1);
      cap.position.set(0, headR * 0.3, -headR * 0.1);
      const tail = mesh(capsule(headR * 0.2, headR * 0.7), hairM);
      tail.position.set(0, -headR * 0.05, -headR * 1.05);
      tail.rotation.x = 0.4;
      head.add(cap, tail);
      break;
    }
    case 'mohawk': {
      for (let i = 0; i < 5; i++) {
        const spike = mesh(cone(headR * 0.14, headR * 0.45, 6), hairM);
        spike.position.set(0, headR * 0.92, headR * 0.5 - i * headR * 0.28);
        spike.rotation.x = -0.35 + i * 0.12;
        head.add(spike);
      }
      break;
    }
    case 'afro': {
      const big = mesh(sphere(headR * 1.32, 18, 12), hairM);
      big.scale.set(1.05, 0.9, 1);
      big.position.set(0, headR * 0.45, -headR * 0.35);
      head.add(big);
      break;
    }
    case 'braid': {
      const cap = mesh(sphere(headR * 1.04, 20, 12), hairM);
      cap.scale.set(1, 0.62, 1);
      cap.position.set(0, headR * 0.3, -headR * 0.1);
      head.add(cap);
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const b = mesh(sphere(headR * (0.19 - t * 0.05), 10, 8), hairM);
        b.position.set(-headR * (0.85 + 0.2 * Math.sin(t * 2.2)), -headR * (0.25 + 1.9 * t), headR * (-0.1 + 1.0 * t));
        head.add(b);
      }
      break;
    }
    case 'long': {
      const cap = mesh(sphere(headR * 1.04, 20, 12), hairM);
      cap.scale.set(1, 0.62, 1);
      cap.position.set(0, headR * 0.3, -headR * 0.1);
      const back = mesh(rbox(headR * 1.8, headR * 1.7, headR * 0.5, headR * 0.2), hairM);
      back.position.set(0, -headR * 0.42, -headR * 0.6);
      head.add(cap, back);
      break;
    }
    case 'bald':
      break;
  }

  // ── hats ──
  const white = mat('#fbfaf6', { rough: 0.7 });
  switch (def.hat) {
    case 'toque': {
      const band = mesh(cyl(headR * 0.82, headR * 0.86, headR * 0.35, 20), white);
      band.position.y = headR * 0.78;
      const puff = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const p = mesh(sphere(headR * 0.42, 12, 10), white);
        const a = (i / 6) * Math.PI * 2;
        p.position.set(Math.cos(a) * headR * 0.42, headR * 1.3, Math.sin(a) * headR * 0.42);
        puff.add(p);
      }
      const crown = mesh(sphere(headR * 0.55, 14, 10), white);
      crown.position.y = headR * 1.45;
      puff.add(crown);
      head.add(band, puff);
      break;
    }
    case 'beret': {
      const b = mesh(sphere(headR * 1.05, 18, 10), mat(def.secondary === '#f2e3c6' ? '#27445f' : def.secondary, { rough: 0.85 }));
      b.scale.set(1.05, 0.32, 1.05);
      b.position.set(headR * 0.1, headR * 0.86, 0);
      b.rotation.z = -0.25;
      const stalk = mesh(cyl(headR * 0.05, headR * 0.05, headR * 0.15, 6), mat('#27445f'));
      stalk.position.set(headR * 0.15, headR * 1.2, 0);
      head.add(b, stalk);
      break;
    }
    case 'bandana': {
      const band = mesh(torus(headR * 0.95, headR * 0.12, Math.PI * 2, 8, 24), mat(def.secondary === '#20242b' ? '#e2553f' : def.secondary, { rough: 0.8 }));
      band.rotation.x = Math.PI / 2 - 0.2;
      band.position.y = headR * 0.42;
      const knot = mesh(sphere(headR * 0.16, 8, 6), band.material as THREE.Material);
      knot.position.set(0, headR * 0.3, -headR * 0.98);
      const tails = mesh(cone(headR * 0.12, headR * 0.4, 4), band.material as THREE.Material);
      tails.position.set(0, headR * 0.1, -headR * 1.08);
      tails.rotation.x = -2.6;
      head.add(band, knot, tails);
      break;
    }
    case 'mushroom': {
      const m = mesh(lathe('mushHat', [[0, 0], [headR * 0.8, 0], [headR * 1.25, headR * 0.25], [headR * 1.15, headR * 0.6], [headR * 0.6, headR * 1.0], [0, headR * 1.08]]), white);
      m.position.y = headR * 0.6;
      head.add(m);
      break;
    }
    case 'cap': {
      const dome = mesh(sphere(headR * 1.04, 18, 10, ), mat(def.primary, { rough: 0.7 }));
      dome.scale.set(1, 0.55, 1);
      dome.position.y = headR * 0.42;
      const brim = mesh(cyl(headR * 0.62, headR * 0.62, headR * 0.06, 16), mat(def.secondary === '#f6efe2' ? '#164f4f' : def.secondary, { rough: 0.7 }));
      brim.scale.set(1, 1, 0.75);
      brim.position.set(0, headR * 0.5, headR * 0.82);
      head.add(dome, brim);
      break;
    }
    case 'hijab': {
      const scarf = mat(def.hair, { rough: 0.85 });
      const hood = mesh(sphere(headR * 1.12, 20, 14), scarf);
      hood.position.set(0, headR * 0.06, -headR * 0.3);
      const collar = mesh(cyl(headR * 0.95, headR * 1.15, headR * 0.6, 20), scarf);
      collar.position.set(0, -headR * 0.95, -headR * 0.1);
      head.add(hood, collar);
      break;
    }
    case 'none':
      break;
  }

  // ── accessories ──
  switch (def.accessory) {
    case 'beard': {
      const beard = mesh(lumpy('beard', headR * 0.75, 0.25, 2, 1.15, 0.85, 0.7), hairM);
      beard.position.set(0, -headR * 0.45, headR * 0.45);
      head.add(beard);
      mouth.visible = false;
      break;
    }
    case 'mustache': {
      for (const side of [-1, 1]) {
        const m = mesh(capsule(headR * 0.08, headR * 0.28), hairM);
        m.rotation.z = side * (Math.PI / 2 - 0.35);
        m.position.set(side * headR * 0.2, -headR * 0.18, headR * 0.95);
        head.add(m);
      }
      break;
    }
    case 'glasses': {
      const frame = mat('#2a1d17', { rough: 0.4 });
      for (const side of [-1, 1]) {
        const ring = mesh(torus(headR * 0.2, headR * 0.035, Math.PI * 2, 6, 18), frame, false);
        ring.position.set(side * headR * 0.36, headR * 0.08, headR * 0.93);
        head.add(ring);
      }
      const bridge = mesh(rbox(headR * 0.25, headR * 0.04, headR * 0.04, 0.005, 1), frame, false);
      bridge.position.set(0, headR * 0.12, headR * 0.98);
      head.add(bridge);
      break;
    }
    case 'scarf': {
      const scarf = mesh(torus(0.15 * W, 0.045, Math.PI * 2, 8, 20), mat('#e2553f', { rough: 0.85 }));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = hip + torsoH - 0.02;
      body.add(scarf);
      break;
    }
    case 'earring': {
      const e = mesh(torus(headR * 0.08, headR * 0.02, Math.PI * 2, 6, 10), mat('#ffd166', { rough: 0.2, metal: 0.9 }), false);
      e.position.set(headR * 0.98, -headR * 0.2, 0);
      e.rotation.y = Math.PI / 2;
      head.add(e);
      break;
    }
    case 'none':
      break;
  }

  const holdAnchor = new THREE.Object3D();
  holdAnchor.position.set(0, hip + torsoH * 0.55, 0.42 * Math.max(1, W * 0.9));
  root.add(holdAnchor);

  // ── static batching (keeps animated pivots separate) ──
  if (!mouth.visible) mouth.userData.dynamic = true;
  for (const pv of [...legs, ...arms]) mergeStatic(pv);
  mergeStatic(head);
  mergeStatic(body);

  // ── animation state ──
  let phase = 0;
  let blink = 2 + Math.random() * 3;
  let jump = 0;
  const allMeshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) allMeshes.push(o as THREE.Mesh);
  });

  const animate = ({ speed, act, holding, dt, time, mood }: ChefAnimInput) => {
    const walking = speed > 0.3;
    phase += dt * (walking ? 4 + speed * 2.4 : 0);
    const s = Math.sin(phase);
    // legs
    legs[0]!.rotation.x = walking ? s * 0.65 : lerp(legs[0]!.rotation.x, 0, 0.2);
    legs[1]!.rotation.x = walking ? -s * 0.65 : lerp(legs[1]!.rotation.x, 0, 0.2);
    // body bob + lean
    const bob = walking ? Math.abs(Math.cos(phase)) * 0.045 : Math.sin(time * 2.2) * 0.008;
    if (mood === 'happy') jump = Math.max(jump, 0);
    body.position.y = bob + (mood === 'happy' ? Math.abs(Math.sin(time * 7)) * 0.12 : 0);
    body.rotation.x = lerp(body.rotation.x, walking ? 0.1 : mood === 'sad' ? 0.18 : 0, 0.15);
    torso.scale.y = 1 + (walking ? 0 : Math.sin(time * 2.2) * 0.012);
    head.rotation.x = lerp(head.rotation.x, mood === 'sad' ? 0.35 : 0, 0.1);
    // arms
    const [l, r] = arms as [THREE.Group, THREE.Group];
    if (act === 'chop') {
      r.rotation.x = -1.1 + Math.sin(time * 18) * 0.55;
      l.rotation.x = lerp(l.rotation.x, -0.9, 0.3);
      r.rotation.z = 0;
    } else if (act === 'repair') {
      r.rotation.x = -1.3 + Math.sin(time * 25) * 0.25;
      l.rotation.x = -1.3 + Math.cos(time * 25) * 0.25;
    } else if (holding) {
      l.rotation.x = lerp(l.rotation.x, -1.25, 0.3);
      r.rotation.x = lerp(r.rotation.x, -1.25, 0.3);
      l.rotation.z = lerp(l.rotation.z, -0.25, 0.3);
      r.rotation.z = lerp(r.rotation.z, 0.25, 0.3);
    } else if (mood === 'happy') {
      l.rotation.x = lerp(l.rotation.x, -2.6, 0.2);
      r.rotation.x = lerp(r.rotation.x, -2.6, 0.2);
      l.rotation.z = lerp(l.rotation.z, -0.4, 0.2);
      r.rotation.z = lerp(r.rotation.z, 0.4, 0.2);
    } else {
      l.rotation.x = walking ? -s * 0.55 : lerp(l.rotation.x, 0, 0.15);
      r.rotation.x = walking ? s * 0.55 : lerp(r.rotation.x, 0, 0.15);
      l.rotation.z = lerp(l.rotation.z, -0.08, 0.2);
      r.rotation.z = lerp(r.rotation.z, 0.08, 0.2);
    }
    // blink
    blink -= dt;
    const closed = blink < 0.12;
    if (blink < 0) blink = 2.5 + Math.random() * 3;
    for (const e of eyes) e.scale.y = closed ? 0.15 : 1.15;
    mouth.scale.y = mood === 'sad' ? -1 : 1;
  };

  const setDimmed = (dim: boolean) => {
    for (const m of allMeshes) {
      m.visible = true;
    }
    root.scale.setScalar(dim ? 0.92 : 1);
    body.rotation.z = dim ? 0.12 : 0;
  };

  return { root, holdAnchor, headTop: headY + headR * 1.9, animate, setDimmed };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shadeHex(hex: string, amt = -0.12): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
