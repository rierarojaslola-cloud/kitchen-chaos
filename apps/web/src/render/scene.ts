/**
 * KitchenScene: the 3D presentation of the authoritative server state.
 * It never decides gameplay; it interpolates snapshots and turns events into effects.
 */
import * as THREE from 'three';
import { getCharacter, SLOT_COLORS, SLOT_LABELS } from '@kc/shared';
import {
  INGREDIENTS,
  type GameEvent,
  type IngredientView,
  type ItemView,
  type LevelInitView,
  type PlayerView,
  type StationInit,
  type StationView,
} from '@kc/game-logic';
import { THEMES, type Theme } from './themes';
import { buildStation, DIR_ROT, type StationObject } from './models/stations';
import { buildChef, type ChefRig } from './models/chef';
import { buildChefGlb } from './models/chefGlb';
import { buildIngredient, buildPlate, itemSignature, type FoodObject } from './models/food';
import { disposeUncached, mat, mergeStatic, mesh, rbox, torus } from './models/kit';
import { Particles } from './particles';
import { blobTexture, labelTexture } from './textures';
import { buildDecor, type DecorResult } from './decor';

export type Quality = 'high' | 'medium' | 'low';

const QUALITY: Record<Quality, { shadows: boolean; shadowMap: number; maxDpr: number; particles: number; aa: boolean }> = {
  high: { shadows: true, shadowMap: 2048, maxDpr: 2, particles: 1600, aa: true },
  medium: { shadows: true, shadowMap: 1024, maxDpr: 1.25, particles: 900, aa: true },
  low: { shadows: false, shadowMap: 512, maxDpr: 1, particles: 400, aa: false },
};

const CAMERA_PITCH = THREE.MathUtils.degToRad(41);
const CAMERA_YAW = THREE.MathUtils.degToRad(0);
const INTERP_DELAY_MS = 90;
const WALL_H = 2.6;

interface Snapshot {
  at: number;
  players: Map<string, PlayerView>;
}

interface ChefEntry {
  rig: ChefRig;
  ring: THREE.Mesh;
  badge: THREE.Sprite;
  shadow: THREE.Mesh;
  item: FoodObject | null;
  sig: string;
  lastPos: THREE.Vector2;
  speed: number;
  view: PlayerView;
  slot: number;
}

interface StationEntry {
  def: StationInit;
  obj: StationObject;
  view: StationView;
  item: FoodObject | null;
  sig: string;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  barMat: THREE.MeshBasicMaterial;
  warn: THREE.Sprite;
  wrench: THREE.Sprite;
  emitT: number;
}

export interface SceneOptions {
  quality: Quality;
  reducedMotion: boolean;
}

export class KitchenScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private particles: Particles;
  private level: LevelInitView | null = null;
  private theme: Theme = THEMES.burger;
  private levelGroup = new THREE.Group();
  private chefs = new Map<string, ChefEntry>();
  private stations = new Map<number, StationEntry>();
  private snaps: Snapshot[] = [];
  private decor: DecorResult | null = null;
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private accents: THREE.PointLight[] = [];
  private clock = new THREE.Clock();
  private time = 0;
  private raf = 0;
  private shake = 0;
  private center = new THREE.Vector3();
  private viewSize = { w: 10, h: 8 };
  private topReserve = 0.2;
  private leftReserve = 0;
  private mood: 'normal' | 'happy' | 'sad' = 'normal';
  private opts: SceneOptions;
  private characterOf = new Map<string, string>();
  /** Attract-mode chefs carry no player identity (no ring / badge). */
  private demo = false;
  private readonly v3 = new THREE.Vector3();
  /** Called after each frame (HUD uses it to position floating labels). */
  onFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.opts = opts;
    const q = QUALITY[opts.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 80);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.key = new THREE.DirectionalLight('#ffffff', 2);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.key, this.key.target, this.levelGroup);
    this.particles = new Particles(q.particles);
    this.scene.add(this.particles.object);
    this.applyQuality(opts.quality);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.loop();
  }

  // ───────────── Settings ─────────────
  applyQuality(q: Quality): void {
    const cfg = QUALITY[q];
    this.opts.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxDpr));
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.key.castShadow = cfg.shadows;
    this.key.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
    this.key.shadow.map?.dispose();
    (this.key.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
    this.particles.emissionScale = (q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1) * (this.opts.reducedMotion ? 0.5 : 1);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => (mt.needsUpdate = true));
    });
    this.onResize();
  }

  setReducedMotion(v: boolean): void {
    this.opts.reducedMotion = v;
    this.applyQuality(this.opts.quality);
  }

  setTopReserve(fraction: number, left = 0): void {
    this.topReserve = fraction;
    this.leftReserve = left;
    this.fitCamera();
  }

  setMood(m: 'normal' | 'happy' | 'sad'): void {
    this.mood = m;
  }

  // ───────────── Level construction ─────────────
  loadLevel(level: LevelInitView, players: { id: string; character: string }[], demo = false): void {
    this.clearLevel();
    this.demo = demo;
    this.level = level;
    this.theme = THEMES[level.restaurant];
    for (const p of players) this.characterOf.set(p.id, p.character);
    const t = this.theme;
    this.scene.background = new THREE.Color(t.background);
    this.scene.fog = new THREE.Fog(t.fog, 30, 70);
    this.renderer.toneMappingExposure = t.exposure;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.key.color.set(t.keyColor);
    this.key.intensity = t.keyIntensity;

    const W = level.width;
    const H = level.height;
    this.center.set(W / 2, 0, H / 2);

    // floor
    const floorTex = t.floor().clone();
    floorTex.repeat.set(W / 2, H / 2);
    floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, H + 40), new THREE.MeshBasicMaterial({ color: t.background }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(W / 2, -0.02, H / 2);
    this.levelGroup.add(floor, outside);

    // walls
    const wallTex = t.wall().clone();
    wallTex.repeat.set(1, WALL_H / 1);
    wallTex.needsUpdate = true;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: t.wallTint, roughness: 0.6 });
    const capMat = mat(t.counterTrim, { rough: 0.6 });
    const tallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    const lowGeo = new THREE.BoxGeometry(1, 0.32, 1);
    const midGeo = new THREE.BoxGeometry(1, 1.05, 1);
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (level.tiles[z]![x] !== '#') continue;
        const front = z === H - 1;
        const outer = z === 0 || x === 0 || x === W - 1 || front;
        let m: THREE.Mesh;
        if (front) {
          m = new THREE.Mesh(lowGeo, capMat);
          m.position.set(x + 0.5, 0.16, z + 0.5);
        } else if (outer) {
          m = new THREE.Mesh(tallGeo, wallMat);
          m.position.set(x + 0.5, WALL_H / 2, z + 0.5);
        } else {
          m = new THREE.Mesh(midGeo, capMat);
          m.position.set(x + 0.5, 0.525, z + 0.5);
        }
        m.castShadow = !front;
        m.receiveShadow = true;
        this.levelGroup.add(m);
      }
    }
    // skirting along the back wall
    const skirt = mesh(rbox(W - 2, 0.14, 0.06, 0.02, 1), capMat);
    skirt.position.set(W / 2, 0.07, 1.03);
    this.levelGroup.add(skirt);

    // stations
    for (const def of level.stations) this.addStation(def);

    // decor + lights
    this.decor = buildDecor(level, level.restaurant);
    this.levelGroup.add(this.decor.group);
    t.accentLights.forEach((a, i) => {
      const l = new THREE.PointLight(a.color, a.intensity, 7, 1.6);
      l.position.set(i === 0 ? 1.8 : W - 1.8, 2.3, 1.6);
      this.accents.push(l);
      this.levelGroup.add(l);
    });
    const passLight = new THREE.PointLight('#ffb070', 3.5, 4, 1.8);
    const serve = level.stations.find((s) => s.type === 'serve');
    if (serve) {
      passLight.position.set(serve.x + 0.5, 1.6, serve.z + 0.8);
      this.levelGroup.add(passLight);
      this.accents.push(passLight);
    }

    // key light/shadow camera fitted to the kitchen
    // batch every static mesh of the level into one draw call per material
    mergeStatic(this.levelGroup);

    this.key.position.set(W / 2 - 4, 14, H / 2 + 7);
    this.key.target.position.set(W / 2, 0, H / 2);
    const sc = this.key.shadow.camera;
    const ext = Math.max(W, H) * 0.75;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = 40;
    sc.updateProjectionMatrix();

    this.fitCamera();
  }

  private addStation(def: StationInit): void {
    const obj = buildStation(def, this.theme, this.level!.plateStyle);
    obj.position.set(def.x + 0.5, 0, def.z + 0.5);
    obj.rotation.y = DIR_ROT[def.dir] ?? 0;
    this.levelGroup.add(obj);

    const bar = new THREE.Group();
    const bgMat = new THREE.MeshBasicMaterial({ color: '#14303f', transparent: true, opacity: 0.85, depthTest: false });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.13), bgMat);
    const barMat = new THREE.MeshBasicMaterial({ color: '#3fbf7f', depthTest: false });
    const fillGeo = new THREE.PlaneGeometry(0.64, 0.07);
    fillGeo.translate(0.32, 0, 0);
    const fill = new THREE.Mesh(fillGeo, barMat);
    fill.position.set(-0.32, 0, 0.001);
    bar.add(bg, fill);
    bar.renderOrder = 20;
    bg.renderOrder = 20;
    fill.renderOrder = 21;
    bar.position.set(def.x + 0.5, obj.userData.top + 0.2, def.z + 0.5);
    bar.visible = false;
    bar.userData.dynamic = true;
    this.levelGroup.add(bar);

    const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('!', '#ff5a3c', '#ffffff', '400 100px "Lilita One", sans-serif', 128, 128), depthTest: false }));
    warn.scale.set(0.42, 0.42, 1);
    warn.position.set(def.x + 0.5, obj.userData.top + 0.55, def.z + 0.5);
    warn.visible = false;
    warn.renderOrder = 22;
    const wrench = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('🔧', '#ffc23d', '#2a1d17', '700 80px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif', 128, 128), depthTest: false }));
    wrench.scale.set(0.46, 0.46, 1);
    wrench.position.copy(warn.position);
    wrench.visible = false;
    wrench.renderOrder = 22;
    this.levelGroup.add(warn, wrench);

    this.stations.set(def.id, {
      def,
      obj,
      view: { id: def.id, item: null },
      item: null,
      sig: '',
      bar,
      barFill: fill,
      barMat,
      warn,
      wrench,
      emitT: 0,
    });
  }

  clearLevel(): void {
    for (const c of this.chefs.values()) disposeUncached(c.rig.root);
    this.chefs.clear();
    this.stations.clear();
    this.snaps = [];
    this.accents = [];
    this.decor = null;
    disposeUncached(this.levelGroup);
    this.levelGroup.clear();
    this.level = null;
    this.mood = 'normal';
  }

  get hasLevel(): boolean {
    return !!this.level;
  }

  // ───────────── State intake ─────────────
  pushPlayers(players: PlayerView[]): void {
    const map = new Map(players.map((p) => [p.id, p]));
    this.snaps.push({ at: performance.now(), players: map });
    if (this.snaps.length > 6) this.snaps.shift();
    for (const p of players) {
      let c = this.chefs.get(p.id);
      if (!c) c = this.addChef(p);
      c.view = p;
    }
  }

  private addChef(p: PlayerView): ChefEntry {
    const charId = this.characterOf.get(p.id) ?? 'nuri';
    const rig = buildChefGlb(getCharacter(charId)) ?? buildChef(getCharacter(charId));
    const color = SLOT_COLORS[p.slot] ?? '#ffffff';
    const ring = mesh(torus(0.36, 0.035, Math.PI * 2, 6, 32), mat(color, { emissive: color, emissiveIntensity: 0.9, rough: 0.4 }), false);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(SLOT_LABELS[p.slot] ?? '?', color, '#14303f', '400 84px "Lilita One", sans-serif', 160, 112), depthTest: false }));
    badge.scale.set(0.5, 0.5, 1);
    badge.renderOrder = 23;
    ring.visible = !this.demo;
    badge.visible = !this.demo;
    this.levelGroup.add(rig.root, ring, shadow, badge);
    const entry: ChefEntry = { rig, ring, badge, shadow, item: null, sig: '', lastPos: new THREE.Vector2(p.x, p.z), speed: 0, view: p, slot: p.slot };
    this.chefs.set(p.id, entry);
    return entry;
  }

  pushStations(views: StationView[]): void {
    for (const v of views) {
      const s = this.stations.get(v.id);
      if (s) s.view = v;
    }
  }

  // ───────────── Events → effects ─────────────
  handleEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.e) {
        case 'chop': {
          const s = this.stations.get(ev.st);
          const it = s?.view.item;
          const color = it && it.k === 'ing' ? chopColor(it) : '#6cc24a';
          if (s) this.particles.emit('bits', this.stationTop(s), 4, color);
          break;
        }
        case 'chopDone':
        case 'cookDone': {
          const s = this.stations.get(ev.st);
          if (s) {
            this.particles.emit('puff', this.stationTop(s), 8);
            this.particles.emit('star', this.stationTop(s), 6);
          }
          break;
        }
        case 'burnt': {
          const s = this.stations.get(ev.st);
          if (s) this.particles.emit('smoke', this.stationTop(s), 22);
          break;
        }
        case 'served': {
          const serve = [...this.stations.values()].find((s) => s.def.type === 'serve');
          if (serve) {
            this.particles.emit('confetti', this.stationTop(serve), 40);
            this.particles.emit('star', this.stationTop(serve), 12);
            (serve.obj.userData as { ring?: () => void }).ring?.();
          }
          break;
        }
        case 'trash': {
          const s = [...this.stations.values()].find((x) => x.def.type === 'trash' && this.nearChef(ev.p, x));
          const target = s ?? [...this.stations.values()].find((x) => x.def.type === 'trash');
          if (target) {
            this.particles.emit('puff', this.stationTop(target), 10);
            (target.obj.userData as { pop?: () => void }).pop?.();
          }
          break;
        }
        case 'place':
        case 'repaired': {
          const s = this.stations.get(ev.st);
          if (s) this.particles.emit('puff', this.stationTop(s), ev.e === 'repaired' ? 14 : 4);
          break;
        }
        case 'chaos':
          if (ev.kind === 'breakdown' && ev.st !== undefined) {
            const s = this.stations.get(ev.st);
            if (s) this.particles.emit('spark', this.stationTop(s), 30);
            if (!this.opts.reducedMotion) this.shake = 0.35;
          }
          break;
        case 'wrongDish':
        case 'orderExpired':
          if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, 0.15);
          break;
        default:
          break;
      }
    }
  }

  private nearChef(pid: string, s: StationEntry): boolean {
    const c = this.chefs.get(pid);
    if (!c) return false;
    return Math.hypot(c.rig.root.position.x - (s.def.x + 0.5), c.rig.root.position.z - (s.def.z + 0.5)) < 1.6;
  }

  private stationTop(s: StationEntry): THREE.Vector3 {
    return new THREE.Vector3(s.def.x + 0.5, s.obj.userData.anchor.y + 0.15, s.def.z + 0.5);
  }

  /** World → CSS pixel position (for HUD labels). */
  project(x: number, y: number, z: number): { x: number; y: number } {
    this.v3.set(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((this.v3.x + 1) / 2) * rect.width, y: rect.top + ((1 - this.v3.y) / 2) * rect.height };
  }

  stationScreenPos(id: number): { x: number; y: number } | null {
    const s = this.stations.get(id);
    if (!s) return null;
    return this.project(s.def.x + 0.5, s.obj.userData.top + 0.4, s.def.z + 0.5);
  }

  serveScreenPos(): { x: number; y: number } | null {
    const s = [...this.stations.values()].find((x) => x.def.type === 'serve');
    return s ? this.stationScreenPos(s.def.id) : null;
  }

  chefScreenPos(id: string): { x: number; y: number } | null {
    const c = this.chefs.get(id);
    if (!c) return null;
    const p = c.rig.root.position;
    return this.project(p.x, c.rig.headTop + 0.6, p.z);
  }

  // ───────────── Frame ─────────────
  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  };

  private interpolated(id: string): PlayerView | undefined {
    const renderAt = performance.now() - INTERP_DELAY_MS;
    const s = this.snaps;
    if (!s.length) return undefined;
    let a = s[0]!;
    let b = s[s.length - 1]!;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i]!.at <= renderAt && s[i + 1]!.at >= renderAt) {
        a = s[i]!;
        b = s[i + 1]!;
        break;
      }
    }
    const pa = a.players.get(id);
    const pb = b.players.get(id);
    if (!pa || !pb) return pb ?? pa;
    const span = b.at - a.at;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderAt - a.at) / span)) : 1;
    return { ...pb, x: pa.x + (pb.x - pa.x) * t, z: pa.z + (pb.z - pa.z) * t, a: lerpAngle(pa.a, pb.a, t) };
  }

  private update(dt: number): void {
    const t = this.time;
    this.particles.update(dt);
    this.decor?.animate(t);
    const camQ = this.camera.quaternion;

    // chefs
    for (const [id, c] of this.chefs) {
      const v = this.interpolated(id) ?? c.view;
      const root = c.rig.root;
      root.position.set(v.x, 0, v.z);
      root.rotation.y = lerpAngle(root.rotation.y, v.a, 0.35);
      const moved = Math.hypot(v.x - c.lastPos.x, v.z - c.lastPos.y) / Math.max(dt, 1e-3);
      c.speed += (moved - c.speed) * 0.25;
      c.lastPos.set(v.x, v.z);
      c.rig.animate({ speed: c.speed, act: c.view.act, holding: !!c.view.held, dt, time: t + c.slot, mood: this.mood });
      c.rig.setDimmed(!c.view.connected);
      c.ring.position.set(v.x, 0.02, v.z);
      c.ring.scale.setScalar(1 + Math.sin(t * 3 + c.slot) * 0.04);
      c.shadow.position.set(v.x, 0.012, v.z);
      c.badge.position.set(v.x, c.rig.headTop + 0.35 + Math.sin(t * 2 + c.slot) * 0.03, v.z);
      (c.badge.material as THREE.SpriteMaterial).opacity = c.view.connected ? 1 : 0.45;
      // held item
      const sig = itemSignature(c.view.held);
      if (sig !== c.sig) {
        if (c.item) {
          c.rig.holdAnchor.remove(c.item);
          disposeUncached(c.item);
        }
        c.item = c.view.held ? this.buildItem(c.view.held) : null;
        if (c.item) c.rig.holdAnchor.add(c.item);
        c.sig = sig;
      }
      if (c.item && c.view.held?.k === 'ing') c.item.userData.update?.(c.view.held);
    }

    // stations
    for (const s of this.stations.values()) {
      const v = s.view;
      const cooking = isCooking(s.def, v);
      s.obj.userData.animate?.({ view: v, time: t, dt, cooking });
      const sig = itemSignature(v.item);
      if (sig !== s.sig) {
        if (s.item) {
          s.obj.remove(s.item);
          disposeUncached(s.item);
        }
        s.item = v.item ? this.buildItem(v.item) : null;
        if (s.item) {
          s.item.position.copy(s.obj.userData.anchor);
          s.obj.add(s.item);
        }
        s.sig = sig;
      }
      if (s.item && v.item?.k === 'ing') s.item.userData.update?.(v.item);

      // indicators
      let progress: number | null = null;
      let color = '#3fbf7f';
      let warn = false;
      const it = v.item;
      if (v.broken !== undefined) {
        progress = v.broken;
        color = '#3fa7ff';
      } else if (it && it.k === 'ing') {
        const cook = INGREDIENTS[it.ing].cook;
        if (s.def.type === 'board' && it.st === 'raw' && it.p > 0) progress = it.p;
        else if (cook && cook.on === s.def.type && it.st === cook.from && it.p > 0) {
          progress = it.p;
          color = '#ffc23d';
        } else if (cook && cook.on === s.def.type && it.st === 'cooked' && it.b > 0.35) {
          progress = it.b;
          color = '#ff5a3c';
          warn = true;
        }
      }
      s.bar.visible = progress !== null;
      if (progress !== null) {
        s.bar.quaternion.copy(camQ);
        s.barFill.scale.x = Math.max(0.02, Math.min(1, progress));
        s.barMat.color.set(color);
        if (warn) s.barMat.color.lerp(new THREE.Color('#ffffff'), (Math.sin(t * 14) + 1) * 0.25);
      }
      s.warn.visible = warn || (it?.k === 'ing' && it.st === 'burnt');
      if (s.warn.visible) s.warn.scale.setScalar(0.42 + Math.sin(t * 10) * 0.05);
      s.wrench.visible = v.broken !== undefined;
      if (s.wrench.visible) s.wrench.position.y = s.obj.userData.top + 0.55 + Math.sin(t * 5) * 0.05;

      // continuous emitters (throttled)
      s.emitT -= dt;
      if (s.emitT <= 0) {
        s.emitT = 0.18;
        const top = this.stationTop(s);
        if (v.broken !== undefined) this.particles.emit('spark', top, 3);
        if (cooking && (s.def.type === 'pot' || s.def.type === 'grill' || s.def.type === 'fryer')) this.particles.emit('steam', top, 1);
        if (cooking && s.def.type === 'wok') this.particles.emit('flame', top, 2);
        if (it?.k === 'ing' && (it.st === 'burnt' || (it.st === 'cooked' && it.b > 0.6)) && s.def.type !== 'counter') this.particles.emit('smoke', top, 1);
      }
    }

    // camera shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.08;
      this.camera.position.x = this.camBase.x + (Math.random() - 0.5) * k;
      this.camera.position.y = this.camBase.y + (Math.random() - 0.5) * k;
    } else this.camera.position.copy(this.camBase);
  }

  private buildItem(v: ItemView): FoodObject {
    const o = v.k === 'plate' ? buildPlate(v, this.theme.plateColor, this.theme.plateRim) : buildIngredient(v);
    mergeStatic(o);
    return o;
  }

  // ───────────── Camera ─────────────
  private camBase = new THREE.Vector3();

  private fitCamera(): void {
    const level = this.level;
    const W = level?.width ?? 14;
    const H = level?.height ?? 9;
    const dist = 30;
    const dir = new THREE.Vector3(Math.sin(CAMERA_YAW) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(CAMERA_YAW) * Math.cos(CAMERA_PITCH));
    const target = new THREE.Vector3(W / 2, 0.6, H / 2);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    // project the kitchen bounds into view space and fit
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const x of [0.4, W - 0.4])
      for (const y of [0, WALL_H * 0.85])
        for (const z of [0.6, H - 0.4]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    const padX = 0.6;
    const padBottom = 0.5;
    const contentW = (maxX - minX + padX * 2) / (1 - this.leftReserve);
    const contentH = (maxY - minY + padBottom) / (1 - this.topReserve);
    let viewH = contentH;
    let viewW = viewH * aspect;
    if (viewW < contentW) {
      viewW = contentW;
      viewH = viewW / aspect;
    }
    // shift so the kitchen sits in the area not covered by the left reserve (title menu)
    const cx = (minX + maxX) / 2 - (viewW * this.leftReserve) / 2;
    // anchor bottom of content to the bottom of the view; reserved band stays at the top
    const bottom = minY - padBottom;
    this.camera.left = cx - viewW / 2;
    this.camera.right = cx + viewW / 2;
    this.camera.bottom = bottom - (viewH - contentH) / 2;
    this.camera.top = this.camera.bottom + viewH;
    this.camera.updateProjectionMatrix();
    this.camBase.copy(this.camera.position);
    this.viewSize = { w: viewW, h: viewH };
    this.particles.setPixelScale((rect.height * this.renderer.getPixelRatio()) / viewH);
  }

  private onResize = (): void => {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.fitCamera();
  };

  /** Lightweight stats for the debug overlay / performance checks. */
  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.clearLevel();
    this.particles.dispose();
    this.renderer.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function isCooking(def: StationInit, v: StationView): boolean {
  if (v.broken !== undefined) return false;
  const it = v.item;
  if (!it || it.k !== 'ing') return false;
  const cook = INGREDIENTS[it.ing].cook;
  return !!cook && cook.on === def.type && (it.st === cook.from || it.st === 'cooked');
}

function chopColor(i: IngredientView): string {
  const map: Partial<Record<IngredientView['ing'], string>> = {
    tomato: '#e8392c',
    lettuce: '#6cc24a',
    cheese: '#ffcd3c',
    onion: '#e7b3d6',
    potato: '#f4df9a',
    mushroom: '#d9c4a5',
    fish: '#ff8a5c',
    cucumber: '#8bd06a',
  };
  return map[i.ing] ?? '#ffffff';
}

