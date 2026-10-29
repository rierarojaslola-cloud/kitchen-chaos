/**
 * Stylised procedural food models. Each builder returns a group whose origin sits at the
 * bottom-centre of the food, plus an optional `update` that animates state colour (e.g. a
 * patty browning on the grill according to cook/burn progress).
 */
import * as THREE from 'three';
import type { IngredientKind, IngredientView, ItemView, PlateStyle } from '@kc/game-logic';
import { capsule, cone, cyl, geo, lathe, lumpy, mat, mesh, rbox, sphere, torus, uniqueMat } from './kit';

export interface FoodObject extends THREE.Group {
  userData: { update?: (v: IngredientView) => void; height: number };
}

const C = {
  bun: '#e3a24f',
  bunTop: '#c9782f',
  sesame: '#fff3d6',
  rawMeat: '#d9707a',
  cookedMeat: '#6b3a22',
  burnt: '#241a16',
  lettuce: '#6cc24a',
  lettuceDark: '#3f8f2f',
  tomato: '#e8392c',
  tomatoIn: '#ff8a6a',
  stem: '#3f7f2a',
  cheese: '#ffcd3c',
  onion: '#b45a9a',
  onionIn: '#f2d7ea',
  potato: '#c79a5a',
  potatoIn: '#f4df9a',
  fries: '#f2b52c',
  dough: '#f1dcb0',
  crust: '#d99a4e',
  sauce: '#c9301f',
  mushroom: '#d9c4a5',
  mushCap: '#8a6648',
  rice: '#f7f4ec',
  sack: '#c8ae7d',
  fish: '#7d97ad',
  fishBelly: '#d5dde4',
  salmon: '#ff8a5c',
  cucumber: '#3f8f3a',
  cucumberIn: '#c8e89a',
  shrimpRaw: '#c9b3b0',
  shrimpCooked: '#ff7a4d',
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Colour for cook/burn progress: raw → cooked → burnt. */
function cookColor(raw: string, cooked: string, v: IngredientView, out: THREE.Color): THREE.Color {
  if (v.st === 'burnt') return out.set(C.burnt);
  if (v.st === 'cooked') return out.copy(tmpA.set(cooked)).lerp(tmpB.set(C.burnt), Math.min(1, v.b) * 0.75);
  return out.copy(tmpA.set(raw)).lerp(tmpB.set(cooked), Math.min(1, v.p) * 0.85);
}

function group(height: number): FoodObject {
  const g = new THREE.Group() as FoodObject;
  g.userData = { height };
  return g;
}

function bun(): FoodObject {
  const g = group(0.24);
  const bottom = mesh(lathe('bunBottom', [[0, 0], [0.15, 0], [0.17, 0.03], [0.17, 0.07], [0, 0.075]]), mat(C.bun, { rough: 0.7 }));
  const top = mesh(lathe('bunTop', [[0, 0], [0.17, 0], [0.175, 0.04], [0.14, 0.11], [0.07, 0.15], [0, 0.155]]), mat(C.bunTop, { rough: 0.55 }));
  top.position.y = 0.085;
  g.add(bottom, top);
  for (let i = 0; i < 7; i++) {
    const s = mesh(sphere(0.012, 6, 4), mat(C.sesame), false);
    const a = i * 0.9;
    const r = 0.05 + (i % 3) * 0.03;
    s.position.set(Math.cos(a) * r, 0.085 + 0.145 - r * 0.45, Math.sin(a) * r);
    s.scale.set(1.4, 0.6, 0.8);
    g.add(s);
  }
  return g;
}

function patty(v: IngredientView): FoodObject {
  const g = group(0.08);
  const m = uniqueMat(C.rawMeat, { rough: 0.75 });
  const body = mesh(lumpy('patty', 0.16, 0.12, 2, 1, 0.32, 1), m);
  body.position.y = 0.045;
  g.add(body);
  g.userData.update = (nv) => {
    cookColor(C.rawMeat, C.cookedMeat, nv, m.color);
    m.roughness = nv.st === 'cooked' ? 0.45 : 0.75;
  };
  g.userData.update(v);
  return g;
}

function lettuce(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.06);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(lumpy('leafbit', 0.07, 0.5, 1, 1.2, 0.25, 0.9), mat(i % 2 ? C.lettuce : C.lettuceDark, { rough: 0.5 }));
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.08, 0.025 + (i % 3) * 0.012, Math.sin(a) * 0.08);
      leaf.rotation.set(0.3, a, 0.2);
      g.add(leaf);
    }
    return g;
  }
  const g = group(0.26);
  const head = mesh(lumpy('lettuce', 0.14, 0.35, 2, 1, 0.85, 1), mat(C.lettuce, { rough: 0.5 }));
  head.position.y = 0.12;
  const inner = mesh(lumpy('lettuceIn', 0.1, 0.4, 1), mat(C.lettuceDark, { rough: 0.5 }));
  inner.position.y = 0.16;
  g.add(head, inner);
  return g;
}

function tomato(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.06);
    for (let i = 0; i < 3; i++) {
      const sl = mesh(cyl(0.085, 0.085, 0.028, 18), mat(C.tomato, { rough: 0.35 }));
      const inside = mesh(cyl(0.065, 0.065, 0.03, 14), mat(C.tomatoIn, { rough: 0.4 }));
      sl.add(inside);
      sl.position.set((i - 1) * 0.05, 0.016 + i * 0.012, (i - 1) * 0.02);
      sl.rotation.z = 0.12 * (i - 1);
      g.add(sl);
    }
    return g;
  }
  const g = group(0.2);
  const body = mesh(sphere(0.1, 20, 14), mat(C.tomato, { rough: 0.3 }));
  body.scale.set(1, 0.85, 1);
  body.position.y = 0.085;
  const stem = mesh(cone(0.05, 0.03, 5), mat(C.stem));
  stem.position.y = 0.175;
  g.add(body, stem);
  return g;
}

function cheese(v: IngredientView): FoodObject {
  const m = mat(C.cheese, { rough: 0.45 });
  if (v.st === 'chopped') {
    const g = group(0.05);
    for (let i = 0; i < 2; i++) {
      const sl = mesh(rbox(0.2, 0.02, 0.2, 0.008, 1), m);
      sl.position.y = 0.012 + i * 0.022;
      sl.rotation.y = i * 0.5;
      g.add(sl);
    }
    return g;
  }
  const g = group(0.14);
  const wedgeGeo = geo('cheeseWedge', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.24, -0.07);
    shape.lineTo(0.24, 0.07);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  });
  const w = mesh(wedgeGeo, m);
  w.rotation.x = -Math.PI / 2;
  w.position.set(-0.12, 0.012, 0);
  g.add(w);
  for (let i = 0; i < 3; i++) {
    const hole = mesh(sphere(0.02, 8, 6), mat('#e0a91f', { rough: 0.6 }), false);
    hole.position.set(-0.02 + i * 0.06, 0.13, (i - 1) * 0.02);
    hole.scale.y = 0.4;
    g.add(hole);
  }
  return g;
}

function onion(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.05);
    for (let i = 0; i < 4; i++) {
      const ring = mesh(torus(0.04 + i * 0.012, 0.009, Math.PI * 2, 6, 18), mat(i % 2 ? C.onion : C.onionIn, { rough: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set((i % 2) * 0.05 - 0.025, 0.012 + i * 0.006, (i > 1 ? 1 : -1) * 0.03);
      g.add(ring);
    }
    return g;
  }
  const g = group(0.22);
  const body = mesh(lathe('onion', [[0, 0], [0.06, 0.01], [0.105, 0.07], [0.09, 0.14], [0.03, 0.19], [0.01, 0.22], [0, 0.22]]), mat(C.onion, { rough: 0.35 }));
  g.add(body);
  return g;
}

function potato(v: IngredientView): FoodObject {
  if (v.st === 'raw') {
    const g = group(0.16);
    const b = mesh(lumpy('potato', 0.11, 0.25, 2, 1.25, 0.75, 0.9), mat(C.potato, { rough: 0.85 }));
    b.position.y = 0.08;
    g.add(b);
    return g;
  }
  const g = group(0.1);
  const m = uniqueMat(C.potatoIn, { rough: 0.6 });
  for (let i = 0; i < 9; i++) {
    const stick = mesh(rbox(0.035, 0.035, 0.2, 0.01, 1), m);
    stick.position.set(((i % 3) - 1) * 0.045, 0.02 + Math.floor(i / 3) * 0.035, ((i * 37) % 5) * 0.01 - 0.02);
    stick.rotation.y = ((i * 53) % 7) * 0.12 - 0.35;
    g.add(stick);
  }
  g.userData.update = (nv) => {
    cookColor(C.potatoIn, C.fries, nv, m.color);
  };
  g.userData.update(v);
  return g;
}

function dough(v: IngredientView): FoodObject {
  const g = group(0.07);
  const baseMat = uniqueMat(C.dough, { rough: 0.8 });
  const rimMat = uniqueMat(C.dough, { rough: 0.7 });
  const base = mesh(cyl(0.23, 0.23, 0.03, 32), baseMat);
  base.position.y = 0.015;
  const rim = mesh(torus(0.22, 0.03, Math.PI * 2, 8, 32), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.035;
  g.add(base, rim);
  const tops = v.top ?? [];
  if (tops.includes('tomato')) {
    const sauce = mesh(cyl(0.19, 0.19, 0.01, 28), mat(C.sauce, { rough: 0.3 }), false);
    sauce.position.y = 0.035;
    g.add(sauce);
  }
  if (tops.includes('cheese')) {
    for (let i = 0; i < 9; i++) {
      const blob = mesh(lumpy('cheeseBlob', 0.05, 0.4, 1, 1, 0.25, 1), mat('#ffe48a', { rough: 0.35 }), false);
      const a = i * 2.4;
      const r = 0.04 + (i % 3) * 0.05;
      blob.position.set(Math.cos(a) * r, 0.045, Math.sin(a) * r);
      g.add(blob);
    }
  }
  if (tops.includes('mushroom')) {
    for (let i = 0; i < 6; i++) {
      const sl = mesh(cyl(0.03, 0.03, 0.012, 10), mat(C.mushroom, { rough: 0.6 }), false);
      const a = i * 1.05 + 0.4;
      sl.position.set(Math.cos(a) * 0.12, 0.052, Math.sin(a) * 0.12);
      sl.scale.set(1, 1, 0.7);
      g.add(sl);
    }
  }
  g.userData.update = (nv) => {
    cookColor(C.dough, C.crust, nv, rimMat.color);
    cookColor(C.dough, '#e8b874', nv, baseMat.color);
  };
  g.userData.update(v);
  return g;
}

function mushroom(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.04);
    for (let i = 0; i < 5; i++) {
      const sl = mesh(cyl(0.035, 0.035, 0.014, 12), mat(C.mushroom, { rough: 0.6 }));
      sl.rotation.x = Math.PI / 2;
      sl.position.set((i - 2) * 0.035, 0.035, (i % 2) * 0.03);
      g.add(sl);
    }
    return g;
  }
  const g = group(0.16);
  const stem = mesh(cyl(0.035, 0.045, 0.09, 12), mat(C.mushroom, { rough: 0.7 }));
  stem.position.y = 0.045;
  const cap = mesh(lathe('mushCap', [[0, 0], [0.1, 0], [0.095, 0.03], [0.06, 0.07], [0, 0.08]]), mat(C.mushCap, { rough: 0.6 }));
  cap.position.y = 0.08;
  g.add(stem, cap);
  return g;
}

function rice(v: IngredientView): FoodObject {
  if (v.st === 'raw') {
    const g = group(0.22);
    const sack = mesh(lumpy('sack', 0.12, 0.15, 2, 1, 1.25, 0.9), mat(C.sack, { rough: 0.95 }));
    sack.position.y = 0.13;
    const tie = mesh(torus(0.045, 0.012, Math.PI * 2, 6, 14), mat('#8a5b33'));
    tie.rotation.x = Math.PI / 2;
    tie.position.y = 0.24;
    g.add(sack, tie);
    return g;
  }
  const g = group(0.12);
  const m = uniqueMat(C.rice, { rough: 0.8 });
  const mound = mesh(lumpy('rice', 0.14, 0.18, 3, 1, 0.65, 1), m);
  mound.position.y = 0.05;
  g.add(mound);
  g.userData.update = (nv) => {
    if (nv.st === 'burnt') m.color.set('#4a3b2c');
    else if (nv.st === 'cooked') m.color.copy(tmpA.set(C.rice)).lerp(tmpB.set('#b08a52'), Math.min(1, nv.b) * 0.7);
    else m.color.set(C.rice);
  };
  g.userData.update(v);
  return g;
}

function fish(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.05);
    for (let i = 0; i < 4; i++) {
      const sl = mesh(rbox(0.07, 0.03, 0.13, 0.012, 2), mat(C.salmon, { rough: 0.3 }));
      sl.position.set((i - 1.5) * 0.055, 0.02, 0);
      sl.rotation.z = -0.25;
      const stripe = mesh(rbox(0.072, 0.008, 0.02, 0.003, 1), mat('#fff0e0', { rough: 0.3 }), false);
      stripe.position.y = 0.016;
      sl.add(stripe);
      g.add(sl);
    }
    return g;
  }
  const g = group(0.12);
  const body = mesh(lumpy('fish', 0.1, 0.06, 2, 2.1, 0.75, 0.7), mat(C.fish, { rough: 0.3, metal: 0.2 }));
  body.position.y = 0.07;
  const belly = mesh(sphere(0.07, 12, 8), mat(C.fishBelly, { rough: 0.35 }));
  belly.scale.set(2.2, 0.6, 0.85);
  belly.position.set(0, 0.05, 0);
  const tail = mesh(cone(0.07, 0.11, 4), mat(C.fish, { rough: 0.3 }));
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.25, 0.07, 0);
  tail.scale.z = 0.25;
  const eye = mesh(sphere(0.014, 8, 6), mat('#111'), false);
  eye.position.set(0.15, 0.09, 0.05);
  g.add(body, belly, tail, eye);
  return g;
}

function cucumber(v: IngredientView): FoodObject {
  if (v.st === 'chopped') {
    const g = group(0.04);
    for (let i = 0; i < 5; i++) {
      const sl = mesh(cyl(0.045, 0.045, 0.016, 14), mat(C.cucumber, { rough: 0.4 }));
      const inside = mesh(cyl(0.036, 0.036, 0.018, 12), mat(C.cucumberIn, { rough: 0.5 }));
      sl.add(inside);
      sl.position.set(((i % 3) - 1) * 0.06, 0.01 + Math.floor(i / 3) * 0.018, (i % 2) * 0.05 - 0.02);
      g.add(sl);
    }
    return g;
  }
  const g = group(0.1);
  const body = mesh(capsule(0.05, 0.22), mat(C.cucumber, { rough: 0.45 }));
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.05;
  g.add(body);
  return g;
}

function shrimp(v: IngredientView): FoodObject {
  const g = group(0.08);
  const m = uniqueMat(C.shrimpRaw, { rough: 0.35 });
  for (let i = 0; i < 3; i++) {
    const s = mesh(torus(0.055, 0.024, Math.PI * 1.35, 8, 16), m);
    s.rotation.x = Math.PI / 2;
    s.rotation.z = i * 2.1;
    s.position.set(Math.cos(i * 2.1) * 0.06, 0.03 + i * 0.012, Math.sin(i * 2.1) * 0.06);
    g.add(s);
  }
  g.userData.update = (nv) => {
    cookColor(C.shrimpRaw, C.shrimpCooked, nv, m.color);
  };
  g.userData.update(v);
  return g;
}

const BUILDERS: Record<IngredientKind, (v: IngredientView) => FoodObject> = {
  bun: () => bun(),
  patty,
  lettuce,
  tomato,
  cheese,
  onion,
  potato,
  dough,
  mushroom,
  rice,
  fish,
  cucumber,
  shrimp,
};

export function buildIngredient(v: IngredientView): FoodObject {
  return BUILDERS[v.ing](v);
}

/** Thin disc version used to stack burgers (ingredient between buns). */
function burgerLayer(v: IngredientView): FoodObject {
  const g = group(0.03);
  if (v.ing === 'patty') return patty(v);
  if (v.ing === 'cheese') {
    const sl = mesh(rbox(0.3, 0.018, 0.3, 0.006, 1), mat(C.cheese, { rough: 0.4 }));
    sl.rotation.y = Math.PI / 4;
    sl.position.y = 0.01;
    g.add(sl);
    g.userData.height = 0.02;
    return g;
  }
  if (v.ing === 'lettuce') {
    const l = mesh(lumpy('lettuceLayer', 0.19, 0.3, 2, 1, 0.12, 1), mat(C.lettuce, { rough: 0.5 }));
    l.position.y = 0.015;
    g.add(l);
    return g;
  }
  if (v.ing === 'tomato') {
    for (let i = 0; i < 2; i++) {
      const s = mesh(cyl(0.08, 0.08, 0.022, 16), mat(C.tomato, { rough: 0.35 }));
      s.position.set(i ? 0.06 : -0.06, 0.012, 0);
      g.add(s);
    }
    return g;
  }
  return buildIngredient(v);
}

// ───────────────────────── Plates ─────────────────────────

export function buildPlateBase(style: PlateStyle, color: string, rim: string): { obj: THREE.Object3D; top: number } {
  const g = new THREE.Group();
  if (style === 'bowl') {
    const b = mesh(lathe(`bowl`, [[0, 0], [0.12, 0], [0.13, 0.02], [0.2, 0.09], [0.24, 0.16], [0.225, 0.165], [0.19, 0.1], [0.12, 0.045], [0, 0.04]]), mat(color, { rough: 0.25 }));
    const band = mesh(torus(0.237, 0.012, Math.PI * 2, 6, 32), mat(rim, { rough: 0.3 }), false);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.16;
    g.add(b, band);
    return { obj: g, top: 0.045 };
  }
  if (style === 'board') {
    const b = mesh(cyl(0.27, 0.27, 0.035, 32), mat(color, { rough: 0.7 }));
    b.position.y = 0.0175;
    const handle = mesh(rbox(0.12, 0.03, 0.07, 0.015, 2), mat(color, { rough: 0.7 }));
    handle.position.set(0.31, 0.017, 0);
    g.add(b, handle);
    return { obj: g, top: 0.035 };
  }
  const p = mesh(lathe('plate', [[0, 0], [0.18, 0], [0.2, 0.012], [0.27, 0.04], [0.275, 0.05], [0.25, 0.045], [0.19, 0.022], [0, 0.02]]), mat(color, { rough: 0.2 }));
  const band = mesh(torus(0.262, 0.008, Math.PI * 2, 6, 36), mat(rim, { rough: 0.3 }), false);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.046;
  g.add(p, band);
  return { obj: g, top: 0.022 };
}

/**
 * Builds a plate with its contents arranged by dish logic: burgers stack between buns,
 * bowls put rice at the base, other items are fanned out.
 */
export function buildPlate(view: Extract<ItemView, { k: 'plate' }>, color: string, rim: string): FoodObject {
  const g = group(0.1);
  const { obj, top } = buildPlateBase(view.style, color, rim);
  g.add(obj);
  const contents = view.c;
  const updaters: ((v: IngredientView) => void)[] = [];
  const hasBun = contents.some((c) => c.ing === 'bun');
  if (hasBun) {
    const order: IngredientKind[] = ['patty', 'cheese', 'tomato', 'lettuce'];
    const bottom = mesh(lathe('bunBottom', [[0, 0], [0.15, 0], [0.17, 0.03], [0.17, 0.07], [0, 0.075]]), mat(C.bun, { rough: 0.7 }));
    bottom.position.y = top;
    g.add(bottom);
    let y = top + 0.072;
    const layers = contents.filter((c) => c.ing !== 'bun').sort((a, b) => order.indexOf(a.ing) - order.indexOf(b.ing));
    for (const l of layers) {
      const o = burgerLayer(l);
      o.position.y = y;
      g.add(o);
      y += o.userData.height * 0.85;
    }
    const lid = mesh(lathe('bunTop', [[0, 0], [0.17, 0], [0.175, 0.04], [0.14, 0.11], [0.07, 0.15], [0, 0.155]]), mat(C.bunTop, { rough: 0.55 }));
    lid.position.y = y + 0.005;
    g.add(lid);
    g.userData.height = y + 0.16;
    return g;
  }
  const base = contents.find((c) => c.ing === 'rice') ?? contents.find((c) => c.ing === 'dough');
  let y = top;
  if (base) {
    const o = buildIngredient(base);
    o.position.y = y;
    g.add(o);
    if (o.userData.update) updaters.push(o.userData.update);
    y += base.ing === 'rice' ? 0.08 : 0.04;
  }
  const rest = contents.filter((c) => c !== base);
  rest.forEach((c, i) => {
    const o = buildIngredient(c);
    const n = rest.length;
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
    const r = n === 1 ? 0 : base ? 0.07 : 0.1;
    o.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    o.scale.setScalar(base ? 0.8 : 0.9);
    g.add(o);
  });
  g.userData.height = y + 0.08;
  return g;
}

/** Signature used to decide when an item mesh must be rebuilt (state changes only). */
export function itemSignature(v: ItemView | null): string {
  if (!v) return '';
  if (v.k === 'plate') return `P${v.style}[${v.c.map((c) => `${c.ing}:${c.st}:${(c.top ?? []).join('+')}`).join(',')}]`;
  return `${v.ing}:${v.st}:${(v.top ?? []).join('+')}`;
}
