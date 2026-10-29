/** Shared geometry/material helpers with caching (geometries and materials are reused). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  map?: THREE.Texture;
  side?: THREE.Side;
}

export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.6}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? 0}|${o.opacity ?? 1}|${o.map?.uuid ?? ''}|${o.side ?? 0}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.6,
      metalness: o.metal ?? 0,
      ...(o.emissive ? { emissive: new THREE.Color(o.emissive), emissiveIntensity: o.emissiveIntensity ?? 1 } : {}),
      ...(o.transparent || (o.opacity ?? 1) < 1 ? { transparent: true, opacity: o.opacity ?? 1 } : {}),
      ...(o.map ? { map: o.map } : {}),
      ...(o.side !== undefined ? { side: o.side } : {}),
    });
    matCache.set(key, m);
  }
  return m;
}

/** A unique (non-cached) material for objects whose colour animates. */
export function uniqueMat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0,
    ...(o.emissive ? { emissive: new THREE.Color(o.emissive), emissiveIntensity: o.emissiveIntensity ?? 0 } : {}),
  });
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadows = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = shadows;
  me.receiveShadow = shadows;
  return me;
}

export const rbox = (w: number, h: number, d: number, r = 0.04, seg = 3) =>
  geo(`rbox:${w}:${h}:${d}:${r}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
export const sphere = (r: number, ws = 20, hs = 14) => geo(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const cyl = (rt: number, rb: number, h: number, seg = 20) => geo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const torus = (r: number, t: number, arc = Math.PI * 2, rs = 10, ts = 24) => geo(`tor:${r}:${t}:${arc}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
export const capsule = (r: number, l: number) => geo(`cap:${r}:${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
export const cone = (r: number, h: number, seg = 16) => geo(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));

/** Lathe from a 2D profile (x = radius, y = height). */
export function lathe(key: string, pts: [number, number][], seg = 28): THREE.LatheGeometry {
  return geo(`lathe:${key}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
}

/** Sphere with seeded vertex displacement: organic shapes (lettuce, rice, cheese holes...). */
export function lumpy(key: string, r: number, amount: number, detail = 2, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  return geo(`lumpy:${key}`, () => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    let seed = key.length * 97;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const offsets = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let o = offsets.get(k);
      if (o === undefined) {
        o = 1 + (rand() - 0.5) * amount;
        offsets.set(k, o);
      }
      v.multiplyScalar(o);
      v.set(v.x * sx, v.y * sy, v.z * sz);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

export function disposeKitCaches(): void {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
}

/** Disposes geometries/materials/textures under `root` that are NOT shared through the caches. */
export function disposeUncached(root: THREE.Object3D, keepTextures: Set<THREE.Texture> = new Set()): void {
  const geos = new Set(geoCache.values());
  const mats = new Set(matCache.values());
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !geos.has(m.geometry)) m.geometry.dispose();
    const list = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of list) {
      if (mats.has(mt)) continue;
      const map = (mt as THREE.MeshStandardMaterial).map;
      if (map && !keepTextures.has(map) && !map.userData.cached) map.dispose();
      mt.dispose();
    }
  });
}

/**
 * Static batching: merges every non-dynamic mesh under `root` into one mesh per
 * (material, shadow flags), in `root`'s local space. Subtrees whose node has
 * `userData.dynamic = true` are left untouched (they animate by transform or visibility).
 * Materials are kept by reference, so material animation (emissive, colour) still works.
 */
export function mergeStatic(root: THREE.Object3D): number {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  const cached = new Set(geoCache.values());
  const visit = (o: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot && o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && m.visible) {
      const g = m.geometry;
      if (g.attributes.position && g.attributes.normal && g.attributes.uv) {
        let c = g.index ? g.toNonIndexed() : g.clone();
        for (const name of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(name)) c.deleteAttribute(name);
        c.morphAttributes = {};
        c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
        b.geos.push(c);
        victims.push(m);
        c = null as unknown as THREE.BufferGeometry;
      }
    }
    for (const child of [...o.children]) visit(child, false);
  };
  visit(root, true);
  let made = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.userData.merged = true;
    root.add(mesh);
    made++;
  }
  for (const v of victims) {
    v.removeFromParent();
    if (!cached.has(v.geometry)) v.geometry.dispose();
  }
  return made;
}
