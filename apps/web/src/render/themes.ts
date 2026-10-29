/**
 * Restaurant visual identities: palette, materials and lighting per restaurant.
 * Three deliberately different places, not one scene with swapped textures:
 *  - burger: night street diner, warm planxa light, steel + red, neon accents
 *  - pizza: sunlit stone and terracotta, wood, warm amber ovens
 *  - asian: dusk teal, dark wood and bamboo, paper-lantern glow
 */
import * as THREE from 'three';
import type { RestaurantId } from '@kc/game-logic';
import { steelTexture, stoneTexture, tileTexture, woodTexture } from './textures';

export interface Theme {
  id: RestaurantId;
  background: string;
  fog: string;
  floor: () => THREE.Texture;
  wall: () => THREE.Texture;
  wallTint: string;
  counterTop: () => THREE.MeshStandardMaterial;
  counterBody: string;
  counterTrim: string;
  outside: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  accentLights: { color: string; intensity: number }[];
  plateColor: string;
  plateRim: string;
  exposure: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cachedMat(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

export const THEMES: Record<RestaurantId, Theme> = {
  burger: {
    id: 'burger',
    background: '#10202c',
    fog: '#10202c',
    floor: () => tileTexture('#d9d2c4', '#8f8a84', '#5d5a57', 4, true, 1),
    wall: () => tileTexture('#e7efe9', '#d7e3dc', '#9fb0aa', 4, false, 1, 'subway'),
    wallTint: '#ffffff',
    counterTop: () =>
      cachedMat('burger-top', () => new THREE.MeshStandardMaterial({ map: steelTexture(), metalness: 0.75, roughness: 0.32, color: '#e6ecef' })),
    counterBody: '#c8382b',
    counterTrim: '#2a2d33',
    outside: '#0c1820',
    hemiSky: '#cfe4ff',
    hemiGround: '#3a2a22',
    hemiIntensity: 0.9,
    keyColor: '#fff1dc',
    keyIntensity: 2.3,
    accentLights: [
      { color: '#ff4fa3', intensity: 3.5 },
      { color: '#38d6ff', intensity: 4 },
    ],
    plateColor: '#fbfbf7',
    plateRim: '#d63b2f',
    exposure: 1.05,
  },
  pizza: {
    id: 'pizza',
    background: '#2a1d16',
    fog: '#2a1d16',
    floor: () => tileTexture('#c9683f', '#b8572f', '#e8d6bd', 5, false, 1, 'hex'),
    wall: () => stoneTexture('#e8dcc6', ['#c9b8a0', '#a8927a', '#f7efe2'], 1),
    wallTint: '#fff6ea',
    counterTop: () =>
      cachedMat('pizza-top', () => new THREE.MeshStandardMaterial({ map: stoneTexture('#efe9e0', ['#9a9188', '#c7beb4', '#6f6862']), roughness: 0.45, metalness: 0 })),
    counterBody: '#6b4a32',
    counterTrim: '#3f2a1d',
    outside: '#1e140f',
    hemiSky: '#ffe8c9',
    hemiGround: '#5a3420',
    hemiIntensity: 1.0,
    keyColor: '#ffdcae',
    keyIntensity: 2.5,
    accentLights: [
      { color: '#ff9a3c', intensity: 6 },
      { color: '#ffd27a', intensity: 4 },
    ],
    plateColor: '#c99a62',
    plateRim: '#8a5b33',
    exposure: 1.0,
  },
  asian: {
    id: 'asian',
    background: '#0f2427',
    fog: '#0f2427',
    floor: () => woodTexture('#5b3d2a', '#2c1c12', 2),
    wall: () => tileTexture('#2f5752', '#28504b', '#173331', 3, false, 1, 'square'),
    wallTint: '#dff3ee',
    counterTop: () =>
      cachedMat('asian-top', () => new THREE.MeshStandardMaterial({ map: woodTexture('#c79a62', '#7a5532'), roughness: 0.55, metalness: 0 })),
    counterBody: '#1f3b3a',
    counterTrim: '#0f1f1f',
    outside: '#0a1a1c',
    hemiSky: '#bfefff',
    hemiGround: '#2b2219',
    hemiIntensity: 0.85,
    keyColor: '#e4f6ff',
    keyIntensity: 2.0,
    accentLights: [
      { color: '#ffb35c', intensity: 7 },
      { color: '#ff6b5c', intensity: 5 },
    ],
    plateColor: '#f1ece2',
    plateRim: '#2f6f6a',
    exposure: 1.08,
  },
};
