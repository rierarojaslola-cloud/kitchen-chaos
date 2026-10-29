/**
 * GLB asset library (models built by assets-src/blender, compressed with meshopt).
 *
 * Loading is best-effort: anything that fails to load (or `?procedural=1` in the URL) falls
 * back to the procedural builders, so the game always renders.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

interface ManifestEntry {
  file: string;
  tris: number;
  bytes?: number;
}

const BASE = `${import.meta.env.BASE_URL}models/`;

class AssetLibrary {
  private gltfs = new Map<string, GLTF>();
  private loading: Promise<void> | null = null;
  readonly disabled: boolean;
  /** Keys that failed to load (reported in the debug surface). */
  readonly failed: string[] = [];

  constructor() {
    let disabled = false;
    try {
      disabled = new URLSearchParams(location.search).has('procedural');
    } catch {
      disabled = false;
    }
    this.disabled = disabled;
  }

  /** Loads every model in the manifest. Resolves even on errors (fallbacks are used). */
  load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (this.disabled) return;
      let manifest: Record<string, ManifestEntry>;
      try {
        const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        manifest = (await res.json()) as Record<string, ManifestEntry>;
      } catch (err) {
        console.warn('[assets] no model manifest, using procedural models', err);
        return;
      }
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const entries = Object.entries(manifest);
      let done = 0;
      await Promise.all(
        entries.map(async ([key, e]) => {
          try {
            const gltf = await loader.loadAsync(`${BASE}${e.file}`);
            gltf.scene.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
              }
            });
            this.gltfs.set(key, gltf);
          } catch (err) {
            this.failed.push(key);
            console.warn(`[assets] failed to load ${key}`, err);
          } finally {
            onProgress?.(++done, entries.length);
          }
        }),
      );
    })();
    return this.loading;
  }

  has(key: string): boolean {
    return this.gltfs.has(key);
  }

  get(key: string): GLTF | undefined {
    return this.gltfs.get(key);
  }

  get count(): number {
    return this.gltfs.size;
  }
}

export const assets = new AssetLibrary();
