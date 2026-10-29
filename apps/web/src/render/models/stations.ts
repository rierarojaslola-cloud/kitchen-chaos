/**
 * Procedural kitchen station models. Each one is ~1×1 tile, front facing local +z.
 * `userData.anchor` is where the held item sits; `userData.animate(state)` drives
 * per-frame visuals (heat glow, knife, oil shimmer, plate stack count…).
 */
import * as THREE from 'three';
import type { IngredientKind, StationInit, StationView } from '@kc/game-logic';
import { INGREDIENTS } from '@kc/game-logic';
import type { Theme } from '../themes';
import { labelTexture, woodTexture } from '../textures';
import { buildIngredient, buildPlateBase } from './food';
import { cone, cyl, lathe, lumpy, mat, mergeStatic, mesh, rbox, sphere, torus, uniqueMat } from './kit';

export interface StationAnimState {
  view: StationView;
  time: number;
  dt: number;
  /** Item on the station is cooking right now. */
  cooking: boolean;
}

export interface StationObject extends THREE.Group {
  userData: {
    anchor: THREE.Vector3;
    animate?: (s: StationAnimState) => void;
    /** Height for overhead indicators. */
    top: number;
  };
}

const TOP_Y = 0.92;

function station(anchorY = TOP_Y, top = 1.25): StationObject {
  const g = new THREE.Group() as StationObject;
  g.userData = { anchor: new THREE.Vector3(0, anchorY, 0), top };
  return g;
}

/** Standard counter cabinet + themed top slab. */
function cabinet(theme: Theme, bodyColor = theme.counterBody, withTop = true): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(rbox(0.96, 0.8, 0.92, 0.05), mat(bodyColor, { rough: 0.55 }));
  body.position.y = 0.44;
  const kick = mesh(rbox(0.9, 0.08, 0.86, 0.02), mat(theme.counterTrim, { rough: 0.8 }));
  kick.position.y = 0.04;
  g.add(body, kick);
  // door seam + handle on the front
  const seam = mesh(rbox(0.012, 0.6, 0.01, 0.004, 1), mat(theme.counterTrim, { rough: 0.6 }), false);
  seam.position.set(0, 0.46, 0.462);
  const handleL = mesh(rbox(0.16, 0.025, 0.03, 0.01, 2), mat('#cfd6db', { rough: 0.3, metal: 0.8 }), false);
  handleL.position.set(-0.13, 0.66, 0.475);
  const handleR = handleL.clone();
  handleR.position.x = 0.13;
  g.add(seam, handleL, handleR);
  if (withTop) {
    const top = mesh(rbox(1.0, 0.08, 1.0, 0.025), theme.counterTop());
    top.position.y = 0.88;
    g.add(top);
  }
  return g;
}

function counter(theme: Theme): StationObject {
  const s = station();
  s.add(cabinet(theme));
  return s;
}

function board(theme: Theme): StationObject {
  const s = station(0.96);
  s.add(cabinet(theme));
  const wood = mesh(rbox(0.7, 0.05, 0.52, 0.02), mat('#c58a4f', { rough: 0.7, map: woodTexture('#c58a4f', '#8a5b33') }));
  wood.position.y = 0.945;
  s.add(wood);
  const knife = new THREE.Group();
  const blade = mesh(rbox(0.3, 0.012, 0.07, 0.006, 1), mat('#dfe6ea', { rough: 0.15, metal: 0.95 }));
  const handle = mesh(rbox(0.13, 0.03, 0.04, 0.012, 2), mat('#2b2b30', { rough: 0.5 }));
  handle.position.x = -0.21;
  knife.add(blade, handle);
  knife.position.set(0.2, 0.985, 0.17);
  knife.rotation.y = -0.4;
  knife.userData.dynamic = true;
  s.add(knife);
  s.userData.animate = ({ view, time }) => {
    if (view.busy) {
      knife.position.y = 1.02 + Math.abs(Math.sin(time * 18)) * 0.07;
      knife.rotation.z = Math.sin(time * 18) * 0.25;
    } else {
      knife.position.y = 0.985;
      knife.rotation.z = 0;
    }
  };
  return s;
}

function heatMaterial(color: string): THREE.MeshStandardMaterial {
  return uniqueMat('#2a1410', { rough: 0.6, emissive: color, emissiveIntensity: 0 });
}

function grill(theme: Theme): StationObject {
  const s = station(0.97);
  s.add(cabinet(theme, '#3a3f45', false));
  const top = mesh(rbox(1.0, 0.08, 1.0, 0.025), mat('#9aa3aa', { rough: 0.35, metal: 0.8 }));
  top.position.y = 0.88;
  const plate = mesh(rbox(0.8, 0.04, 0.72, 0.015), mat('#1d1f22', { rough: 0.45, metal: 0.6 }));
  plate.position.y = 0.935;
  s.add(top, plate);
  const glow = heatMaterial('#ff5a1f');
  for (let i = 0; i < 6; i++) {
    const ridge = mesh(rbox(0.74, 0.015, 0.035, 0.006, 1), glow, false);
    ridge.position.set(0, 0.958, -0.28 + i * 0.112);
    s.add(ridge);
  }
  for (let i = 0; i < 2; i++) {
    const knob = mesh(cyl(0.045, 0.05, 0.05, 14), mat('#1b1b1e', { rough: 0.4 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-0.2 + i * 0.4, 0.72, 0.47);
    s.add(knob);
  }
  s.userData.animate = ({ cooking, time, view }) => {
    const target = view.broken !== undefined ? 0.2 + Math.random() * 0.6 : cooking ? 1.3 + Math.sin(time * 6) * 0.25 : 0.12;
    glow.emissiveIntensity += (target - glow.emissiveIntensity) * 0.15;
  };
  return s;
}

function fryer(theme: Theme): StationObject {
  const s = station(0.86);
  s.add(cabinet(theme, '#8e979e', false));
  const top = mesh(rbox(1.0, 0.08, 1.0, 0.025), mat('#c3cbd1', { rough: 0.3, metal: 0.85 }));
  top.position.y = 0.88;
  const well = mesh(rbox(0.7, 0.06, 0.62, 0.02), mat('#22252a', { rough: 0.5, metal: 0.5 }));
  well.position.y = 0.905;
  const oil = mesh(rbox(0.64, 0.02, 0.56, 0.01, 1), uniqueMat('#d99a1e', { rough: 0.15, emissive: '#ff9b1f', emissiveIntensity: 0.15 }), false);
  oil.position.y = 0.93;
  const oilMat = oil.material as THREE.MeshStandardMaterial;
  s.add(top, well, oil);
  const basket = new THREE.Group();
  const frame = mesh(rbox(0.46, 0.14, 0.4, 0.02, 1), mat('#d5dbe0', { rough: 0.3, metal: 0.9, opacity: 0.55 }), false);
  frame.position.y = 0.96;
  const handle = mesh(rbox(0.04, 0.03, 0.4, 0.01, 1), mat('#1b1b1e'));
  handle.position.set(0, 1.03, 0.36);
  handle.rotation.x = -0.45;
  basket.add(frame, handle);
  basket.userData.dynamic = true;
  s.add(basket);
  s.userData.animate = ({ cooking, time }) => {
    oilMat.emissiveIntensity = cooking ? 0.45 + Math.sin(time * 9) * 0.12 : 0.12;
    basket.position.y = cooking ? -0.05 + Math.sin(time * 3) * 0.008 : 0;
  };
  return s;
}

function pot(theme: Theme): StationObject {
  const s = station(1.0, 1.45);
  s.add(cabinet(theme));
  const burner = mesh(torus(0.22, 0.03, Math.PI * 2, 8, 24), mat('#202226', { rough: 0.5, metal: 0.6 }));
  burner.rotation.x = Math.PI / 2;
  burner.position.y = 0.94;
  const flame = mesh(torus(0.17, 0.02, Math.PI * 2, 6, 24), uniqueMat('#1a2c55', { emissive: '#3c8dff', emissiveIntensity: 0 }), false);
  flame.rotation.x = Math.PI / 2;
  flame.position.y = 0.955;
  const flameMat = flame.material as THREE.MeshStandardMaterial;
  const body = mesh(lathe('pot', [[0, 0], [0.26, 0], [0.28, 0.02], [0.28, 0.3], [0.3, 0.32], [0.27, 0.33], [0.26, 0.05], [0, 0.04]]), mat('#aeb8bf', { rough: 0.25, metal: 0.9 }));
  body.position.y = 0.96;
  const water = mesh(cyl(0.255, 0.255, 0.02, 24), uniqueMat('#8fc4d6', { rough: 0.1, opacity: 1 }), false);
  water.position.y = 1.2;
  const waterMat = water.material as THREE.MeshStandardMaterial;
  water.userData.dynamic = true;
  for (const side of [-1, 1]) {
    const h = mesh(torus(0.05, 0.016, Math.PI, 6, 10), mat('#2b2b30', { rough: 0.5 }));
    h.position.set(side * 0.3, 1.2, 0);
    h.rotation.set(0, side > 0 ? 0 : Math.PI, Math.PI / 2);
    s.add(h);
  }
  s.add(burner, flame, body, water);
  s.userData.anchor.set(0, 1.15, 0);
  s.userData.animate = ({ cooking, time }) => {
    flameMat.emissiveIntensity = cooking ? 1.8 + Math.sin(time * 14) * 0.4 : 0;
    water.position.y = 1.2 + (cooking ? Math.sin(time * 10) * 0.006 : 0);
    waterMat.color.set(cooking ? '#a9dbe9' : '#8fc4d6');
  };
  return s;
}

function oven(theme: Theme): StationObject {
  const s = station(0.98, 1.75);
  // brick/stone base
  const base = mesh(rbox(0.98, 0.86, 0.96, 0.05), mat('#8c4b2f', { rough: 0.8 }));
  base.position.y = 0.43;
  const ledge = mesh(rbox(1.0, 0.07, 1.0, 0.025), theme.counterTop());
  ledge.position.y = 0.895;
  const dome = mesh(lumpy('ovenDome', 0.48, 0.04, 3, 1, 0.82, 0.98), mat('#d9c6a8', { rough: 0.9 }));
  dome.position.set(0, 0.93, -0.06);
  // keep only upper half visually by sinking it into the ledge
  const chimney = mesh(cyl(0.08, 0.1, 0.32, 14), mat('#7a3f27', { rough: 0.8 }));
  chimney.position.set(0, 1.45, -0.18);
  const mouthOuter = mesh(torus(0.22, 0.05, Math.PI, 8, 20), mat('#8c4b2f', { rough: 0.8 }));
  mouthOuter.position.set(0, 0.93, 0.38);
  const fireMat = uniqueMat('#2b0d05', { emissive: '#ff7a1a', emissiveIntensity: 0.6, rough: 1 });
  const mouth = mesh(new THREE.CircleGeometry(0.21, 20, 0, Math.PI), fireMat, false);
  mouth.position.set(0, 0.935, 0.395);
  s.add(base, ledge, dome, chimney, mouthOuter, mouth);
  const logs = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const log = mesh(cyl(0.03, 0.03, 0.22, 8), mat('#5a3420', { rough: 0.9 }));
    log.rotation.set(0, i * 0.8, Math.PI / 2);
    log.position.set(-0.32 + i * 0.05, 0.12 + i * 0.05, 0.48);
    logs.add(log);
  }
  s.add(logs);
  s.userData.anchor.set(0, 0.95, 0.24);
  s.userData.animate = ({ cooking, time, view }) => {
    const flick = Math.sin(time * 11) * 0.15 + Math.sin(time * 23) * 0.1;
    fireMat.emissiveIntensity = view.broken !== undefined ? 0.05 + Math.random() * 0.1 : (cooking ? 2.4 : 0.9) + flick;
  };
  return s;
}

function wok(theme: Theme): StationObject {
  const s = station(1.02, 1.45);
  s.add(cabinet(theme, '#2b2f35', false));
  const top = mesh(rbox(1.0, 0.08, 1.0, 0.025), mat('#4a5058', { rough: 0.4, metal: 0.7 }));
  top.position.y = 0.88;
  const ring = mesh(torus(0.24, 0.035, Math.PI * 2, 8, 24), mat('#1b1c1f', { rough: 0.5, metal: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.94;
  const flameMat = uniqueMat('#10203f', { emissive: '#2f7dff', emissiveIntensity: 0 });
  const flames = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const f = mesh(cone(0.035, 0.12, 6), flameMat, false);
    const a = (i / 8) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.16, 0.98, Math.sin(a) * 0.16);
    flames.add(f);
  }
  const pan = mesh(lathe('wok', [[0, 0], [0.12, 0.005], [0.26, 0.07], [0.33, 0.14], [0.32, 0.145], [0.25, 0.08], [0.12, 0.018], [0, 0.015]]), mat('#26282c', { rough: 0.35, metal: 0.8 }));
  pan.position.y = 0.98;
  const handle = mesh(rbox(0.36, 0.04, 0.05, 0.015, 2), mat('#5a3a24', { rough: 0.6 }));
  handle.position.set(0.48, 1.11, 0.06);
  handle.rotation.z = 0.25;
  const panGroup = new THREE.Group();
  panGroup.add(pan, handle);
  panGroup.userData.dynamic = true;
  flames.userData.dynamic = true;
  s.add(top, ring, flames, panGroup);
  s.userData.animate = ({ cooking, time }) => {
    flameMat.emissiveIntensity = cooking ? 2.2 + Math.sin(time * 17) * 0.5 : 0;
    flames.visible = cooking;
    flames.scale.y = 0.8 + Math.sin(time * 21) * 0.25;
    panGroup.rotation.z = cooking ? Math.sin(time * 5) * 0.05 : 0;
  };
  return s;
}

function plates(theme: Theme, style: 'plate' | 'board' | 'bowl'): StationObject {
  const s = station(0.92);
  s.add(cabinet(theme));
  const stack = new THREE.Group();
  stack.position.y = 0.92;
  stack.userData.dynamic = true;
  s.add(stack);
  let shown = -1;
  s.userData.animate = ({ view }) => {
    const n = Math.min(8, view.n ?? 0);
    if (n === shown) return;
    shown = n;
    stack.clear();
    for (let i = 0; i < n; i++) {
      const { obj } = buildPlateBase(style, theme.plateColor, theme.plateRim);
      obj.position.y = i * (style === 'bowl' ? 0.07 : 0.035);
      obj.rotation.y = i * 0.37;
      stack.add(obj);
    }
    mergeStatic(stack);
  };
  return s;
}

function serve(theme: Theme): StationObject {
  const s = station(0.92, 1.9);
  s.add(cabinet(theme, theme.counterTrim));
  const stripe = mesh(rbox(0.97, 0.08, 0.02, 0.01, 1), mat('#ffc23d', { rough: 0.4 }), false);
  stripe.position.set(0, 0.62, 0.465);
  // heat-lamp gantry
  const postMat = mat('#c9d0d5', { rough: 0.3, metal: 0.85 });
  for (const x of [-0.44, 0.44]) {
    const post = mesh(cyl(0.025, 0.025, 0.72, 10), postMat);
    post.position.set(x, 1.28, -0.38);
    s.add(post);
  }
  const bar = mesh(rbox(0.98, 0.07, 0.2, 0.02), postMat);
  bar.position.set(0, 1.64, -0.3);
  const lampMat = uniqueMat('#5a1c0a', { emissive: '#ff6a2a', emissiveIntensity: 1.6 });
  const lamp = mesh(rbox(0.86, 0.025, 0.12, 0.01, 1), lampMat, false);
  lamp.position.set(0, 1.6, -0.3);
  const bell = new THREE.Group();
  const dome = mesh(lathe('bell', [[0, 0], [0.08, 0], [0.075, 0.03], [0.05, 0.06], [0.015, 0.075], [0, 0.08]]), mat('#e2b34a', { rough: 0.2, metal: 0.95 }));
  const knob = mesh(sphere(0.015, 8, 6), mat('#e2b34a', { rough: 0.2, metal: 0.9 }));
  knob.position.y = 0.088;
  bell.add(dome, knob);
  bell.position.set(0.36, 0.92, 0.32);
  bell.userData.dynamic = true;
  s.add(stripe, bar, lamp, bell);
  let ring = 0;
  s.userData.animate = ({ time, dt }) => {
    lampMat.emissiveIntensity = 1.5 + Math.sin(time * 2) * 0.15;
    if (ring > 0) {
      ring -= dt;
      bell.rotation.z = Math.sin(ring * 60) * ring * 0.6;
    } else bell.rotation.z = 0;
  };
  (s.userData as { ring?: () => void }).ring = () => (ring = 0.5);
  return s;
}

function trash(): StationObject {
  const s = station(0.85, 1.25);
  const bin = mesh(lathe('bin', [[0, 0], [0.3, 0], [0.34, 0.75], [0.35, 0.78], [0, 0.78]]), mat('#9aa6ad', { rough: 0.35, metal: 0.75 }));
  const band = mesh(torus(0.335, 0.02, Math.PI * 2, 6, 28), mat('#5f6b72', { rough: 0.4, metal: 0.7 }), false);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.4;
  const lid = new THREE.Group();
  const lidMesh = mesh(lathe('binLid', [[0, 0], [0.37, 0], [0.36, 0.04], [0.2, 0.09], [0, 0.1]]), mat('#b8c2c8', { rough: 0.3, metal: 0.8 }));
  lid.add(lidMesh);
  lid.position.set(0, 0.79, -0.33);
  lid.userData.dynamic = true;
  lidMesh.position.z = 0.33;
  const pedal = mesh(rbox(0.16, 0.03, 0.12, 0.01, 1), mat('#2b2b30'));
  pedal.position.set(0, 0.06, 0.35);
  s.add(bin, band, lid, pedal);
  let open = 0;
  s.userData.animate = ({ dt }) => {
    if (open > 0) open -= dt;
    lid.rotation.x += ((open > 0 ? -1.1 : 0) - lid.rotation.x) * 0.25;
  };
  (s.userData as { pop?: () => void }).pop = () => (open = 0.6);
  return s;
}

function crate(theme: Theme, ing: IngredientKind): StationObject {
  const s = station(0.95, 1.35);
  const woodMat = mat('#b9824d', { rough: 0.8, map: woodTexture('#b9824d', '#7a5030') });
  const darkMat = mat('#7a5030', { rough: 0.85 });
  const base = mesh(rbox(0.96, 0.6, 0.92, 0.04), mat(theme.counterBody, { rough: 0.6 }));
  base.position.y = 0.3;
  s.add(base);
  // slatted open crate on top
  const box = new THREE.Group();
  box.position.y = 0.6;
  const bottom = mesh(rbox(0.9, 0.05, 0.86, 0.015), darkMat);
  bottom.position.y = 0.025;
  box.add(bottom);
  for (let i = 0; i < 3; i++) {
    for (const [x, z, rot] of [[0, 0.42, 0], [0, -0.42, 0], [0.44, 0, Math.PI / 2], [-0.44, 0, Math.PI / 2]] as const) {
      const slat = mesh(rbox(0.9, 0.07, 0.04, 0.015, 1), woodMat);
      slat.position.set(x, 0.08 + i * 0.1, z);
      slat.rotation.y = rot;
      box.add(slat);
    }
  }
  s.add(box);
  const fill = new THREE.Group();
  fill.position.y = 0.66;
  const spots: [number, number, number][] = [[-0.2, 0, -0.15], [0.18, 0, -0.18], [0, 0.04, 0.12], [-0.22, 0.02, 0.18], [0.22, 0.03, 0.15]];
  for (const [i, [x, y, z]] of spots.entries()) {
    const o = buildIngredient({ k: 'ing', id: 0, ing, st: 'raw', p: 0, b: 0 });
    o.position.set(x, y, z);
    o.rotation.y = i * 1.3;
    o.scale.setScalar(ing === 'dough' ? 0.7 : 1.05);
    fill.add(o);
  }
  fill.userData.dynamic = true;
  mergeStatic(fill);
  s.add(fill);
  // sign
  const sign = mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: labelTexture(INGREDIENTS[ing].emoji, '#fff4dc', '#2a1d17', '700 92px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'), transparent: true }), false);
  sign.position.set(0, 0.38, 0.465);
  const empty = mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: labelTexture('BUIT', '#ff5a3c', '#ffffff', '400 70px "Lilita One", sans-serif'), transparent: true }), false);
  empty.position.set(0, 0.38, 0.47);
  empty.visible = false;
  empty.userData.dynamic = true;
  s.add(sign, empty);
  s.userData.animate = ({ view }) => {
    fill.visible = !view.empty;
    empty.visible = !!view.empty;
  };
  return s;
}

export function buildStation(def: StationInit, theme: Theme, plateStyle: 'plate' | 'board' | 'bowl'): StationObject {
  switch (def.type) {
    case 'counter':
      return counter(theme);
    case 'board':
      return board(theme);
    case 'grill':
      return grill(theme);
    case 'fryer':
      return fryer(theme);
    case 'pot':
      return pot(theme);
    case 'oven':
      return oven(theme);
    case 'wok':
      return wok(theme);
    case 'plates':
      return plates(theme, plateStyle);
    case 'serve':
      return serve(theme);
    case 'trash':
      return trash();
    case 'crate':
      return crate(theme, def.crate ?? 'tomato');
  }
}

export const DIR_ROT: Record<number, number> = { 0: 0, 1: Math.PI / 2, 2: Math.PI, 3: -Math.PI / 2 };
