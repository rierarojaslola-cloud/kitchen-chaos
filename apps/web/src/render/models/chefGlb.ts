/**
 * Chef rig built from a Blender GLB (armature + baked clips). Implements the same ChefRig
 * contract as the procedural chef.
 *
 * Two animation layers:
 *   body  — Idle / Walk / Celebrate / Sad, all tracks except the arms
 *   arms  — either the arm tracks of the body clip, or an overlay (Carry / Chop / Repair)
 * Each layer cross-fades independently, so a chef can walk while carrying or chopping.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef } from '@kc/shared';
import { assets } from '../assets';
import type { ChefAnimInput, ChefRig } from './chef';

const FADE = 0.18;
const ARM_PREFIXES = ['armL.', 'armR.'];

type BodyState = 'Idle' | 'Walk' | 'Celebrate' | 'Sad';
type ArmState = BodyState | 'Carry' | 'Chop' | 'Repair';

function splitClip(clip: THREE.AnimationClip, arms: boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => ARM_PREFIXES.some((p) => t.name.startsWith(p)) === arms);
  return new THREE.AnimationClip(`${clip.name}${arms ? ':arms' : ':body'}`, clip.duration, tracks);
}

export function buildChefGlb(def: CharacterDef): ChefRig | null {
  const gltf = assets.get(`chef-${def.id}`);
  if (!gltf) return null;
  const model = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.add(model);

  const holdAnchor = model.getObjectByName('Hold') ?? new THREE.Object3D();
  if (!holdAnchor.parent) {
    holdAnchor.position.set(0, 0.55, 0.42);
    root.add(holdAnchor);
  }
  model.updateMatrixWorld(true);
  const headTopNode = model.getObjectByName('HeadTop');
  const headTop = headTopNode ? headTopNode.getWorldPosition(new THREE.Vector3()).y : 1.3;
  const eyes = ['Eye_L', 'Eye_R'].map((n) => model.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  const eyeScaleY = eyes.map((e) => e.scale.y);
  const mouth = model.getObjectByName('Mouth');

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  const action = (name: string, arms: boolean): THREE.AnimationAction | null => {
    const clip = clips.get(name);
    if (!clip) return null;
    const a = mixer.clipAction(splitClip(clip, arms));
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    return a;
  };
  const bodyActions: Partial<Record<BodyState, THREE.AnimationAction | null>> = {};
  const armActions: Partial<Record<ArmState, THREE.AnimationAction | null>> = {};
  for (const n of ['Idle', 'Walk', 'Celebrate', 'Sad'] as BodyState[]) {
    bodyActions[n] = action(n, false);
    armActions[n] = action(n, true);
  }
  for (const n of ['Carry', 'Chop', 'Repair'] as ArmState[]) armActions[n] = action(n, true);

  let body: BodyState | null = null;
  let arms: ArmState | null = null;
  const fadeTo = <K extends string>(map: Partial<Record<K, THREE.AnimationAction | null>>, from: K | null, to: K) => {
    const next = map[to];
    if (!next) return;
    const prev = from ? map[from] : null;
    next.reset();
    next.setEffectiveWeight(1);
    if (prev && prev !== next) next.crossFadeFrom(prev, FADE, false);
    else next.fadeIn(FADE);
  };
  // keep walk / arm cycles in phase
  const syncArms = () => {
    const b = body ? bodyActions[body] : null;
    const a = arms ? armActions[arms] : null;
    if (b && a && arms === body) a.time = b.time;
  };

  let blink = 2 + Math.random() * 3;
  let dimmed = false;

  const animate = ({ speed, act, holding, dt, mood }: ChefAnimInput) => {
    const walking = speed > 0.3;
    const nextBody: BodyState = mood === 'happy' ? 'Celebrate' : mood === 'sad' ? 'Sad' : walking ? 'Walk' : 'Idle';
    const nextArms: ArmState = act === 'chop' ? 'Chop' : act === 'repair' ? 'Repair' : holding ? 'Carry' : nextBody;
    if (nextBody !== body) {
      fadeTo(bodyActions, body, nextBody);
      body = nextBody;
    }
    if (nextArms !== arms) {
      fadeTo(armActions, arms, nextArms);
      arms = nextArms;
      syncArms();
    }
    const walkScale = THREE.MathUtils.clamp(speed / 2.6, 0.6, 1.8);
    for (const a of [bodyActions.Walk, armActions.Walk]) if (a) a.timeScale = walkScale;
    mixer.update(dt);

    blink -= dt;
    const closed = blink < 0.12;
    if (blink < 0) blink = 2.5 + Math.random() * 3;
    eyes.forEach((e, i) => (e.scale.y = closed ? eyeScaleY[i]! * 0.15 : eyeScaleY[i]!));
    if (mouth) mouth.scale.y = mood === 'sad' ? -Math.abs(mouth.scale.y) : Math.abs(mouth.scale.y);
  };

  const setDimmed = (dim: boolean) => {
    if (dim === dimmed) return;
    dimmed = dim;
    root.scale.setScalar(dim ? 0.92 : 1);
    root.rotation.z = dim ? 0.12 : 0;
  };

  root.userData.glb = true;
  return { root, holdAnchor, headTop, animate, setDimmed };
}
