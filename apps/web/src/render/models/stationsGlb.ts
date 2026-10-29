/**
 * Stations built from Blender GLBs (assets-src/blender/stations.py). Same contract as the
 * procedural builders (StationObject: anchor, top, animate), so the scene does not care which
 * one it gets. Returns null when the model is not available → procedural fallback.
 */
import * as THREE from 'three';
import type { StationInit } from '@kc/game-logic';
import { assets } from '../assets';
import type { Theme } from '../themes';
import { mat } from './kit';
import { attachCrateContents, attachPlateStack, type StationObject } from './stations';

/** Material names whose properties animate: cloned per instance so stations animate independently. */
const ANIMATED_MATERIALS = new Set(['Heat', 'Oil', 'Water', 'BlueFlame', 'Fire', 'WokFlame', 'Lamp']);
/** Nodes that move: kept out of static batching. */
const DYNAMIC_NODES = ['Knife', 'Basket', 'Water', 'Pan', 'Flames', 'Bell', 'Lid'];

function glbKey(type: StationInit['type']): string {
  return type === 'plates' ? 'station-counter' : `station-${type}`;
}

export function buildStationGlb(def: StationInit, theme: Theme, plateStyle: 'plate' | 'board' | 'bowl'): StationObject | null {
  const gltf = assets.get(glbKey(def.type));
  if (!gltf) return null;
  const root = gltf.scene.clone(true) as unknown as StationObject;
  const themeBody = mat(def.type === 'serve' ? theme.counterTrim : theme.counterBody, { rough: 0.55 });
  const themeTrim = mat(theme.counterTrim, { rough: 0.7 });
  const themeTop = theme.counterTop();
  const animated = new Map<string, THREE.MeshStandardMaterial>();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const swap = (material: THREE.Material): THREE.Material => {
      const name = material.name;
      if (name === 'Theme_Body') return themeBody;
      if (name === 'Theme_Top') return themeTop;
      if (name === 'Theme_Trim') return themeTrim;
      if (ANIMATED_MATERIALS.has(name)) {
        let c = animated.get(name);
        if (!c) {
          c = (material as THREE.MeshStandardMaterial).clone();
          animated.set(name, c);
        }
        return c;
      }
      return material;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
  for (const n of DYNAMIC_NODES) {
    const node = root.getObjectByName(n);
    if (node) node.userData.dynamic = true;
  }

  const anchor = root.getObjectByName('Anchor')?.position.clone() ?? new THREE.Vector3(0, 0.92, 0);
  const top = root.getObjectByName('Top')?.position.y ?? 1.25;
  root.userData = { anchor, top, glb: true };

  const m = (name: string) => animated.get(name);
  const node = (name: string) => root.getObjectByName(name);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  switch (def.type) {
    case 'board': {
      const knife = node('Knife');
      const base = knife?.position.clone();
      root.userData.animate = ({ view, time }) => {
        if (!knife || !base) return;
        if (view.busy) {
          knife.position.y = base.y + 0.04 + Math.abs(Math.sin(time * 18)) * 0.07;
          knife.rotation.z = Math.sin(time * 18) * 0.25;
        } else {
          knife.position.y = base.y;
          knife.rotation.z = 0;
        }
      };
      break;
    }
    case 'grill': {
      const heat = m('Heat');
      root.userData.animate = ({ cooking, time, view }) => {
        if (!heat) return;
        const target = view.broken !== undefined ? 0.2 + Math.random() * 0.6 : cooking ? 1.3 + Math.sin(time * 6) * 0.25 : 0.12;
        heat.emissiveIntensity = lerp(heat.emissiveIntensity, target, 0.15);
      };
      break;
    }
    case 'fryer': {
      const oil = m('Oil');
      const basket = node('Basket');
      const by = basket?.position.y ?? 0;
      root.userData.animate = ({ cooking, time }) => {
        if (oil) oil.emissiveIntensity = cooking ? 0.45 + Math.sin(time * 9) * 0.12 : 0.12;
        if (basket) basket.position.y = cooking ? by - 0.05 + Math.sin(time * 3) * 0.008 : by;
      };
      break;
    }
    case 'pot': {
      const flame = m('BlueFlame');
      const water = node('Water');
      const waterMat = m('Water');
      const wy = water?.position.y ?? 0;
      root.userData.animate = ({ cooking, time }) => {
        if (flame) flame.emissiveIntensity = cooking ? 1.8 + Math.sin(time * 14) * 0.4 : 0;
        if (water) water.position.y = wy + (cooking ? Math.sin(time * 10) * 0.006 : 0);
        waterMat?.color.set(cooking ? '#a9dbe9' : '#8fc4d6');
      };
      break;
    }
    case 'oven': {
      const fire = m('Fire');
      root.userData.animate = ({ cooking, time, view }) => {
        if (!fire) return;
        const flick = Math.sin(time * 11) * 0.15 + Math.sin(time * 23) * 0.1;
        fire.emissiveIntensity = view.broken !== undefined ? 0.05 + Math.random() * 0.1 : (cooking ? 2.4 : 0.9) + flick;
      };
      break;
    }
    case 'wok': {
      const flame = m('WokFlame');
      const flames = node('Flames');
      const pan = node('Pan');
      root.userData.animate = ({ cooking, time }) => {
        if (flame) flame.emissiveIntensity = cooking ? 2.2 + Math.sin(time * 17) * 0.5 : 0;
        if (flames) {
          flames.visible = cooking;
          flames.scale.y = 0.8 + Math.sin(time * 21) * 0.25;
        }
        if (pan) pan.rotation.z = cooking ? Math.sin(time * 5) * 0.05 : 0;
      };
      break;
    }
    case 'serve': {
      const lamp = m('Lamp');
      const bell = node('Bell');
      let ring = 0;
      root.userData.animate = ({ time, dt }) => {
        if (lamp) lamp.emissiveIntensity = 1.5 + Math.sin(time * 2) * 0.15;
        if (!bell) return;
        if (ring > 0) {
          ring -= dt;
          bell.rotation.z = Math.sin(ring * 60) * ring * 0.6;
        } else bell.rotation.z = 0;
      };
      (root.userData as { ring?: () => void }).ring = () => (ring = 0.5);
      break;
    }
    case 'trash': {
      const lid = node('Lid');
      let open = 0;
      root.userData.animate = ({ dt }) => {
        if (open > 0) open -= dt;
        if (lid) lid.rotation.x += ((open > 0 ? -1.1 : 0) - lid.rotation.x) * 0.25;
      };
      (root.userData as { pop?: () => void }).pop = () => (open = 0.6);
      break;
    }
    case 'plates':
      attachPlateStack(root, theme, plateStyle, anchor.y);
      break;
    case 'crate': {
      const fill = node('Fill')?.position.clone() ?? new THREE.Vector3(0, 0.66, 0);
      const sign = node('Sign')?.position.clone() ?? new THREE.Vector3(0, 0.38, 0.47);
      attachCrateContents(root, def.crate ?? 'tomato', fill, sign);
      break;
    }
    default:
      break;
  }
  return root;
}
