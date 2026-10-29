/**
 * Attract mode for the title/lobby background: a purely decorative, local animation of a
 * kitchen with wandering chefs. It is NOT the multiplayer game and is never shown as such;
 * it stops as soon as a real level is initialised by the server.
 */
import { GameSimulation, getLevel, type LevelDef } from '@kc/game-logic';
import type { KitchenScene } from '../render/scene';

export class AttractMode {
  private sim: GameSimulation | null = null;
  private timer: number | null = null;
  private levelId = '';
  private goals = new Map<string, { x: number; z: number; t: number }>();
  leftReserve = 0.38;

  constructor(private readonly scene: KitchenScene) {}

  start(levelId = 'burger-1', leftReserve = 0.38): void {
    if (this.levelId === levelId && this.timer) {
      if (leftReserve !== this.leftReserve) {
        this.leftReserve = leftReserve;
        this.scene.setTopReserve(0, leftReserve);
      }
      return;
    }
    this.leftReserve = leftReserve;
    this.stop();
    const level = getLevel(levelId) as LevelDef;
    this.levelId = levelId;
    const ids = ['demo-0', 'demo-1', 'demo-2'];
    const chars = levelId.startsWith('pizza') ? ['rocco', 'ximena', 'amara'] : levelId.startsWith('asian') ? ['mei', 'priya', 'kai'] : ['leila', 'bru', 'nuri'];
    this.sim = new GameSimulation({ ...level, duration: 1e9, events: [] }, ids.map((id, i) => ({ id, slot: i })), 3);
    this.scene.loadLevel(this.sim.initView(), ids.map((id, i) => ({ id, character: chars[i]! })), true);
    this.scene.setTopReserve(0, this.leftReserve);
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  private tick(): void {
    const sim = this.sim;
    if (!sim) return;
    for (const pv of sim.playerViews()) {
      let g = this.goals.get(pv.id);
      if (!g || g.t <= 0 || Math.hypot(g.x - pv.x, g.z - pv.z) < 0.4) {
        const floor: { x: number; z: number }[] = [];
        sim.layout.tiles.forEach((row, z) => [...row].forEach((c, x) => c === '.' && floor.push({ x: x + 0.5, z: z + 0.5 })));
        const f = floor[Math.floor(Math.random() * floor.length)]!;
        g = { ...f, t: 2 + Math.random() * 3 };
        this.goals.set(pv.id, g);
        if (Math.random() < 0.5) sim.queueInteract(pv.id);
      }
      g.t -= 0.05;
      const dx = g.x - pv.x;
      const dz = g.z - pv.z;
      const d = Math.hypot(dx, dz) || 1;
      sim.setInput(pv.id, (dx / d) * 0.6, (dz / d) * 0.6, Math.random() < 0.3);
    }
    sim.step(0.05);
    this.scene.pushPlayers(sim.playerViews());
    this.scene.pushStations(sim.stationViews());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sim = null;
    this.levelId = '';
    this.goals.clear();
  }

  get running(): boolean {
    return !!this.timer;
  }
}
