/**
 * Pooled GPU point-sprite particles: one draw call for every effect in the kitchen.
 * Capacity scales with the quality setting; reduced-motion mode cuts emission.
 */
import * as THREE from 'three';
import { blobTexture } from './textures';

export type ParticleKind = 'steam' | 'smoke' | 'spark' | 'bits' | 'confetti' | 'star' | 'puff' | 'flame';

interface Preset {
  life: [number, number];
  speed: [number, number];
  up: number;
  spread: number;
  gravity: number;
  drag: number;
  size: [number, number];
  grow: number;
  colors: string[];
  alpha: number;
  additive?: boolean;
}

const PRESETS: Record<ParticleKind, Preset> = {
  steam: { life: [1.2, 2.0], speed: [0.05, 0.2], up: 0.55, spread: 0.18, gravity: -0.1, drag: 0.6, size: [0.18, 0.28], grow: 0.5, colors: ['#ffffff', '#e8f1f6'], alpha: 0.35 },
  smoke: { life: [1.4, 2.4], speed: [0.05, 0.25], up: 0.5, spread: 0.22, gravity: -0.15, drag: 0.5, size: [0.22, 0.36], grow: 0.6, colors: ['#3b3632', '#5a524c', '#2a2624'], alpha: 0.55 },
  spark: { life: [0.3, 0.7], speed: [1.2, 2.6], up: 1.5, spread: 1.0, gravity: 6, drag: 0.2, size: [0.05, 0.09], grow: -0.05, colors: ['#ffd166', '#ff8a3d', '#fff2c4'], alpha: 1, additive: true },
  bits: { life: [0.35, 0.6], speed: [0.8, 1.6], up: 1.4, spread: 0.9, gravity: 7, drag: 0.1, size: [0.05, 0.08], grow: 0, colors: ['#6cc24a'], alpha: 1 },
  confetti: { life: [1.2, 2.0], speed: [1.5, 3.2], up: 3.2, spread: 1.2, gravity: 4.5, drag: 1.2, size: [0.07, 0.11], grow: 0, colors: ['#ff5a3c', '#ffc23d', '#3fbf7f', '#3fa7ff', '#c77dff'], alpha: 1 },
  star: { life: [0.5, 0.9], speed: [1.0, 2.2], up: 1.0, spread: 1.0, gravity: 0.5, drag: 1.5, size: [0.12, 0.2], grow: -0.1, colors: ['#ffd84a', '#fff3b0'], alpha: 1, additive: true },
  puff: { life: [0.35, 0.6], speed: [0.6, 1.2], up: 0.4, spread: 1, gravity: 0, drag: 3, size: [0.12, 0.2], grow: 0.4, colors: ['#ffffff'], alpha: 0.6 },
  flame: { life: [0.25, 0.5], speed: [0.1, 0.3], up: 1.2, spread: 0.15, gravity: -1, drag: 0.5, size: [0.1, 0.16], grow: -0.15, colors: ['#ff9b3d', '#ffd166', '#ff5a1f'], alpha: 0.9, additive: true },
};

export class Particles {
  readonly object: THREE.Group;
  private normal: Layer;
  private additive: Layer;
  emissionScale = 1;

  constructor(capacity: number) {
    this.object = new THREE.Group();
    this.normal = new Layer(capacity, THREE.NormalBlending);
    this.additive = new Layer(Math.ceil(capacity / 2), THREE.AdditiveBlending);
    this.object.add(this.normal.points, this.additive.points);
  }

  emit(kind: ParticleKind, at: THREE.Vector3, count: number, color?: string): void {
    const p = PRESETS[kind];
    const n = Math.max(1, Math.round(count * this.emissionScale));
    const layer = p.additive ? this.additive : this.normal;
    for (let i = 0; i < n; i++) layer.spawn(p, at, color);
  }

  update(dt: number): void {
    this.normal.update(dt);
    this.additive.update(dt);
  }

  setPixelScale(pxPerUnit: number): void {
    this.normal.material.uniforms.uScale!.value = pxPerUnit;
    this.additive.material.uniforms.uScale!.value = pxPerUnit;
  }

  dispose(): void {
    this.normal.dispose();
    this.additive.dispose();
  }
}

class Layer {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private geom: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private grow: Float32Array;
  private baseAlpha: Float32Array;
  private next = 0;
  private readonly tmp = new THREE.Color();

  constructor(private readonly cap: number, blending: THREE.Blending) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.baseAlpha = new Float32Array(cap);
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geom.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: blobTexture() }, uScale: { value: 60 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float uScale;
        void main(){ vAlpha=alpha; vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=size*uScale; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
        void main(){ vec4 t=texture2D(uMap,gl_PointCoord); float a=t.a*vAlpha; if(a<0.01) discard;
          gl_FragColor=vec4(vColor,a); }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(p: Preset, at: THREE.Vector3, color?: string): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const r = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
    const ang = Math.random() * Math.PI * 2;
    const sp = r(p.speed);
    this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.15;
    this.pos[i * 3 + 1] = at.y;
    this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.15;
    this.vel[i * 3] = Math.cos(ang) * sp * p.spread;
    this.vel[i * 3 + 1] = p.up * (0.6 + Math.random() * 0.6);
    this.vel[i * 3 + 2] = Math.sin(ang) * sp * p.spread;
    this.tmp.set(color ?? p.colors[Math.floor(Math.random() * p.colors.length)]!);
    this.col[i * 3] = this.tmp.r;
    this.col[i * 3 + 1] = this.tmp.g;
    this.col[i * 3 + 2] = this.tmp.b;
    this.size[i] = r(p.size);
    this.maxLife[i] = this.life[i] = r(p.life);
    this.grav[i] = p.gravity;
    this.drag[i] = p.drag;
    this.grow[i] = p.grow;
    this.baseAlpha[i] = p.alpha;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i]! -= dt;
      const d = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i * 3]! *= d;
      this.vel[i * 3 + 2]! *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * d - this.grav[i]! * dt;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      if (this.pos[i * 3 + 1]! < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]!) * 0.3;
      }
      this.size[i] = Math.max(0.01, this.size[i]! + this.grow[i]! * dt);
      const t = this.life[i]! / this.maxLife[i]!;
      this.alpha[i] = this.baseAlpha[i]! * Math.min(1, t * 2.5) * (t > 0.85 ? (1 - t) / 0.15 : 1);
    }
    for (const name of ['position', 'color', 'size', 'alpha']) this.geom.getAttribute(name).needsUpdate = true;
  }

  dispose(): void {
    this.geom.dispose();
    this.material.dispose();
  }
}
