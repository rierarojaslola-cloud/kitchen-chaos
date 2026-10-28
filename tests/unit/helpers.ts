import { GameSimulation, getLevel, type LevelDef, type StationType } from '@kc/game-logic';

export function makeSim(levelId = 'burger-1', players = 2, seed = 7): GameSimulation {
  const level = getLevel(levelId) as LevelDef;
  return new GameSimulation(
    level,
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, slot: i })),
    seed,
  );
}

/** Teleports a player in front of a station and faces it (test-only shortcut). */
export function faceStation(sim: GameSimulation, pid: string, pick: StationType | number, nth = 0): number {
  const st =
    typeof pick === 'number'
      ? sim.debugStations().find((s) => s.id === pick)!
      : sim.debugStations().filter((s) => s.type === pick)[nth]!;
  if (!st) throw new Error(`no station ${String(pick)}`);
  const dirs: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };
  const [dx, dz] = dirs[st.dir]!;
  const p = sim.debugPlayer(pid)!;
  p.x = st.x + dx + 0.5;
  p.z = st.z + dz + 0.5;
  p.a = Math.atan2(-dx, -dz);
  return st.id;
}

export function crateFor(sim: GameSimulation, ing: string): number {
  const st = sim.debugStations().find((s) => s.type === 'crate' && s.crate === ing);
  if (!st) throw new Error(`no crate ${ing}`);
  return st.id;
}

export function interact(sim: GameSimulation, pid: string): void {
  sim.queueInteract(pid);
  sim.step(0.05);
}

export function run(sim: GameSimulation, seconds: number, dt = 0.05): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) sim.step(dt);
}
