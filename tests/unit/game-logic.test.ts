import { describe, expect, it } from 'vitest';
import {
  balanceFor,
  GameSimulation,
  getLevel,
  isPartialOfAny,
  LEVELS,
  matchesRecipe,
  RECIPES,
  unlockedLevels,
  validateLevel,
  type IngredientItem,
  type LevelDef,
} from '@kc/game-logic';
import { crateFor, faceStation, interact, makeSim, run } from './helpers';

const ing = (i: IngredientItem['ing'], st: IngredientItem['st'], toppings?: IngredientItem['ing'][]): IngredientItem => ({
  kind: 'ing', id: 0, ing: i, st, p: 0, b: 0, touched: 1, ...(toppings ? { toppings } : {}),
});

describe('level data', () => {
  it('has 3 restaurants and 6 levels', () => {
    expect(new Set(LEVELS.map((l) => l.restaurant)).size).toBe(3);
    expect(LEVELS.length).toBeGreaterThanOrEqual(6);
  });
  for (const level of LEVELS) {
    for (const n of [2, 3, 4]) {
      it(`${level.id} is fully playable with ${n} players`, () => {
        expect(validateLevel(level, n)).toEqual([]);
      });
    }
  }
  it('unlocks levels progressively', () => {
    expect(unlockedLevels({})).toEqual(['burger-1']);
    expect(unlockedLevels({ 'burger-1': 1 })).toEqual(['burger-1', 'burger-2']);
    expect(unlockedLevels({ 'burger-1': 3, 'burger-2': 0 })).toEqual(['burger-1', 'burger-2']);
  });
});

describe('balance per player count', () => {
  const level = getLevel('burger-2') as LevelDef;
  it('is not a linear multiplier and filters content', () => {
    const b2 = balanceFor(level, 2);
    const b3 = balanceFor(level, 3);
    const b4 = balanceFor(level, 4);
    expect(b2.maxActive).toBeLessThan(b4.maxActive);
    expect(b2.interval).toBeGreaterThan(b3.interval);
    expect(b3.interval).toBeGreaterThan(b4.interval);
    expect(b2.orderTimeMul).toBeGreaterThan(b4.orderTimeMul);
    expect(b2.stars[2]).toBeLessThan(b4.stars[2]);
    expect(b2.menu.map((m) => m.recipeId)).not.toContain('cheeseburger');
    expect(b3.menu.map((m) => m.recipeId)).toContain('cheeseburger');
    expect(b4.events.length).toBeGreaterThan(b2.events.length);
  });
  it('adds conditional stations only for bigger teams', () => {
    const count = (n: number) => new GameSimulation(getLevel('burger-1')!, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slot: i }))).debugStations().filter((s) => s.type === 'grill').length;
    expect(count(2)).toBe(2);
    expect(count(4)).toBe(3);
  });
});

describe('recipes', () => {
  it('matches multisets regardless of order', () => {
    const r = RECIPES.burger_deluxe!;
    expect(matchesRecipe([ing('tomato', 'chopped'), ing('bun', 'raw'), ing('lettuce', 'chopped'), ing('patty', 'cooked')], r)).toBe(true);
    expect(matchesRecipe([ing('bun', 'raw'), ing('patty', 'raw')], RECIPES.burger_classic!)).toBe(false);
  });
  it('validates pizza toppings', () => {
    const r = RECIPES.pizza_margherita!;
    expect(matchesRecipe([ing('dough', 'cooked', ['cheese', 'tomato'])], r)).toBe(true);
    expect(matchesRecipe([ing('dough', 'cooked', ['cheese'])], r)).toBe(false);
  });
  it('detects partial plates', () => {
    const menu = [RECIPES.burger_classic!];
    expect(isPartialOfAny([ing('bun', 'raw')], menu)).toBe(true);
    expect(isPartialOfAny([ing('bun', 'raw'), ing('bun', 'raw')], menu)).toBe(false);
  });
});

describe('simulation: full burger service', () => {
  it('cooks, plates and serves a classic burger', () => {
    const sim = makeSim('burger-1', 2);
    run(sim, 2.5); // first order arrives
    expect(sim.orderViews().length).toBeGreaterThan(0);
    // force a known order
    sim.debugOrders().length = 0;
    (sim as unknown as { spawnOrder: (r: unknown, u: boolean) => void }).spawnOrder(RECIPES.burger_classic, false);

    // patty → grill
    faceStation(sim, 'p0', crateFor(sim, 'patty'));
    interact(sim, 'p0');
    expect(sim.debugPlayer('p0')!.held).toMatchObject({ ing: 'patty', st: 'raw' });
    const grill = faceStation(sim, 'p0', 'grill');
    expect(sim.hintFor('p0').interact).toMatch(/Cuinar/);
    interact(sim, 'p0');
    expect(sim.debugPlayer('p0')!.held).toBeNull();
    run(sim, 7.2);
    const g = sim.debugStations().find((s) => s.id === grill)!;
    expect(g.item).toMatchObject({ st: 'cooked' });

    // second player: plate + bun
    faceStation(sim, 'p1', 'plates');
    interact(sim, 'p1');
    expect(sim.debugPlayer('p1')!.held?.kind).toBe('plate');
    faceStation(sim, 'p1', crateFor(sim, 'bun'));
    interact(sim, 'p1');
    // scoop the cooked patty from the grill onto the plate
    faceStation(sim, 'p1', grill);
    interact(sim, 'p1');
    const plate = sim.debugPlayer('p1')!.held!;
    expect(plate.kind === 'plate' && plate.contents.length).toBe(2);

    const before = sim.score;
    faceStation(sim, 'p1', 'serve');
    sim.queueInteract('p1');
    const ev = sim.step(0.05);
    const served = ev.find((e) => e.e === 'served');
    expect(served).toBeTruthy();
    // two players handled the dish → cooperation bonus
    expect(served && served.e === 'served' && served.coop).toBeGreaterThan(0);
    expect(sim.score).toBeGreaterThan(before + 40);
    expect(sim.debugOrders().length).toBe(0);
    expect(sim.debugPlayer('p1')!.held).toBeNull();
  });

  it('rejects dishes that match no order without penalty', () => {
    const sim = makeSim('burger-1', 2);
    sim.debugOrders().length = 0;
    faceStation(sim, 'p0', 'plates');
    interact(sim, 'p0');
    faceStation(sim, 'p0', crateFor(sim, 'bun'));
    interact(sim, 'p0');
    faceStation(sim, 'p0', 'serve');
    sim.queueInteract('p0');
    const ev = sim.step(0.05);
    expect(ev.some((e) => e.e === 'wrongDish')).toBe(true);
    expect(sim.debugPlayer('p0')!.held?.kind).toBe('plate');
    expect(sim.score).toBe(0);
  });
});

describe('simulation: processing', () => {
  it('chops only with empty hands and locks the board to one chef', () => {
    const sim = makeSim('burger-2', 3);
    faceStation(sim, 'p0', crateFor(sim, 'lettuce'));
    interact(sim, 'p0');
    const board = faceStation(sim, 'p0', 'board');
    interact(sim, 'p0'); // place
    // p1 also faces the same board from the same tile
    faceStation(sim, 'p1', board);
    sim.setInput('p0', 0, 0, true);
    sim.setInput('p1', 0, 0, true);
    sim.step(0.05);
    expect(sim.debugStations().find((s) => s.id === board)!.busyBy).toBe('p0');
    run(sim, 2.3);
    const st = sim.debugStations().find((s) => s.id === board)!;
    expect(st.item).toMatchObject({ ing: 'lettuce', st: 'chopped' });
    expect(sim.results().players.find((p) => p.id === 'p0')!.chops).toBe(1);
  });

  it('burns food left too long and warns first', () => {
    const sim = makeSim('burger-1', 2);
    faceStation(sim, 'p0', crateFor(sim, 'patty'));
    interact(sim, 'p0');
    faceStation(sim, 'p0', 'grill');
    interact(sim, 'p0');
    const events: string[] = [];
    for (let i = 0; i < 20 * 18; i++) for (const e of sim.step(0.05)) events.push(e.e);
    expect(events).toContain('cookDone');
    expect(events).toContain('burnWarn');
    expect(events).toContain('burnt');
    expect(events.indexOf('burnWarn')).toBeLessThan(events.indexOf('burnt'));
  });

  it('builds and bakes a pizza with toppings', () => {
    const sim = makeSim('pizza-1', 2);
    // dough on a counter
    faceStation(sim, 'p0', crateFor(sim, 'dough'));
    interact(sim, 'p0');
    const counter = sim.debugStations().find((s) => s.type === 'counter' && s.x === 5 && s.z === 4)!;
    faceStation(sim, 'p0', counter.id);
    interact(sim, 'p0');
    for (const top of ['tomato', 'cheese'] as const) {
      faceStation(sim, 'p1', crateFor(sim, top));
      interact(sim, 'p1');
      faceStation(sim, 'p1', 'board');
      interact(sim, 'p1');
      sim.setInput('p1', 0, 0, true);
      run(sim, 2.2);
      sim.setInput('p1', 0, 0, false);
      interact(sim, 'p1'); // pick chopped
      faceStation(sim, 'p1', counter.id);
      interact(sim, 'p1'); // add topping
    }
    expect(counter.item).toMatchObject({ ing: 'dough', toppings: ['tomato', 'cheese'] });
    faceStation(sim, 'p0', counter.id);
    interact(sim, 'p0');
    faceStation(sim, 'p0', 'oven');
    interact(sim, 'p0');
    run(sim, 9.2);
    const oven = sim.debugStations().find((s) => s.type === 'oven' && s.item)!;
    expect(oven.item).toMatchObject({ st: 'cooked', toppings: ['tomato', 'cheese'] });
  });

  it('refuses raw potatoes in the fryer with a clear reason', () => {
    const sim = makeSim('burger-2', 2);
    faceStation(sim, 'p0', crateFor(sim, 'potato'));
    interact(sim, 'p0');
    faceStation(sim, 'p0', 'fryer');
    sim.queueInteract('p0');
    const ev = sim.step(0.05);
    expect(ev.find((e) => e.e === 'invalid')).toMatchObject({ reason: 'Primer cal tallar-ho' });
  });
});

describe('simulation: scoring and orders', () => {
  it('penalises expired orders and wasted food, never below zero', () => {
    const sim = makeSim('burger-1', 2);
    sim.score = 100;
    faceStation(sim, 'p0', crateFor(sim, 'patty'));
    interact(sim, 'p0');
    faceStation(sim, 'p0', 'trash');
    interact(sim, 'p0');
    expect(sim.wastePenalty).toBe(1);
    run(sim, 130);
    const r = sim.results();
    expect(r.expired).toBeGreaterThan(0);
    expect(r.expiredPenalty).toBeGreaterThan(0);
    expect(sim.score).toBeGreaterThanOrEqual(0);
  });

  it('respects max simultaneous orders per player count', () => {
    for (const n of [2, 4]) {
      const sim = makeSim('burger-1', n);
      let peak = 0;
      for (let i = 0; i < 20 * 60; i++) {
        sim.step(0.05);
        peak = Math.max(peak, sim.debugOrders().filter((o) => !o.urgent).length);
      }
      expect(peak).toBeLessThanOrEqual(sim.balance.maxActive);
    }
  });

  it('ends the level with results and stars', () => {
    const sim = makeSim('burger-1', 2);
    run(sim, 151);
    expect(sim.isFinished()).toBe(true);
    const r = sim.results();
    expect(r.stars).toBe(0);
    expect(r.won).toBe(false);
    sim.score = r.thresholds[1];
    expect(sim.results().stars).toBe(2);
  });

  it('is deterministic for the same seed', () => {
    const a = makeSim('burger-2', 3, 42);
    const b = makeSim('burger-2', 3, 42);
    run(a, 90);
    run(b, 90);
    expect(a.orderViews()).toEqual(b.orderViews());
  });
});

describe('simulation: chaos events', () => {
  it('breaks a grill and lets players repair it', () => {
    const sim = makeSim('burger-2', 2);
    const evs: string[] = [];
    while (sim.elapsed < 106) for (const e of sim.step(0.05)) evs.push(e.e === 'chaos' ? `chaos:${e.kind}` : e.e);
    expect(evs).toContain('chaos:rush');
    expect(evs).toContain('chaos:breakdown');
    const broken = sim.debugStations().find((s) => s.broken >= 0)!;
    expect(broken.type).toBe('grill');
    faceStation(sim, 'p0', broken.id);
    expect(sim.hintFor('p0').use).toMatch(/Reparar/);
    sim.setInput('p0', 0, 0, true);
    run(sim, 2.6);
    expect(broken.broken).toBe(-1);
  });

  it('shortage empties a crate temporarily', () => {
    const sim = makeSim('asian-1', 2);
    run(sim, 81);
    const crate = sim.debugStations().find((s) => s.crate === 'fish')!;
    expect(crate.empty).toBe(true);
    faceStation(sim, 'p0', crate.id);
    sim.queueInteract('p0');
    expect(sim.step(0.05).some((e) => e.e === 'invalid')).toBe(true);
    run(sim, 16);
    expect(crate.empty).toBe(false);
  });
});

describe('simulation: movement', () => {
  it('moves with input and never enters walls or stations', () => {
    const sim = makeSim('burger-1', 2);
    sim.setInput('p0', 0, -1, false); // towards back wall stations
    run(sim, 3);
    const p = sim.debugPlayer('p0')!;
    expect(p.z).toBeGreaterThan(2 + 0.3 - 1e-6); // row 1 are stations, row 2 floor
    sim.setInput('p0', -1, 0, false);
    run(sim, 3);
    expect(p.x).toBeGreaterThan(1 + 0.3 - 1e-6);
  });

  it('soft-separates players so nobody gets stuck', () => {
    const sim = makeSim('burger-1', 2);
    const a = sim.debugPlayer('p0')!;
    const b = sim.debugPlayer('p1')!;
    b.x = a.x + 0.05;
    b.z = a.z;
    run(sim, 1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.4);
  });

  it('ignores input from disconnected players', () => {
    const sim = makeSim('burger-1', 2);
    const p = sim.debugPlayer('p0')!;
    const x0 = p.x;
    sim.setConnected('p0', false);
    sim.setInput('p0', 1, 0, false);
    run(sim, 1);
    expect(p.x).toBe(x0);
  });
});
