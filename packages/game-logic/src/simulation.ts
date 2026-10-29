/**
 * Authoritative kitchen simulation. Pure TypeScript, no I/O, fixed-step: the server calls
 * `step(dt)` at SIM_TICK_HZ independently of any rendering frame rate.
 *
 * Interactions are resolved through `resolveInteract` / `resolveUse`, which return both a
 * human label (sent to the phone as a contextual hint) and an `apply` closure. The same
 * function powers the hint and the action, so the hint can never lie about what happens.
 */
import { balanceFor, type BalancedLevel } from './balance';
import { canChop, INGREDIENTS, ingredientLabel, isPlateable } from './ingredients';
import { parseLayout, type ParsedLayout } from './layout';
import { canAddTopping, isPartialOfAny, matchesRecipe, MAX_PLATE_ITEMS, RECIPES } from './recipes';
import { createRng, weightedPick } from './rng';
import type {
  ControllerHint,
  GameEvent,
  IngredientItem,
  IngredientKind,
  IngredientView,
  Item,
  ItemView,
  LevelDef,
  LevelEvent,
  LevelInitView,
  LevelResults,
  OrderView,
  PlateItem,
  PlayerAction,
  PlayerStats,
  PlayerView,
  RecipeDef,
  StationInit,
  StationType,
  StationView,
} from './types';

// ───────────────────────── Tunables ─────────────────────────
export const SIM = {
  playerSpeed: 4.1,
  playerRadius: 0.32,
  reach: 1.3,
  facingDot: 0.3,
  repairTime: 2.4,
  plateReturnDelay: 5,
  wastePenaltyProcessed: 3,
  wastePenaltyRaw: 1,
  expiredPenaltyRatio: 0.5,
  tipRatio: 0.5,
  coopRatio: 0.15,
  urgentTimeRatio: 0.6,
  urgentPointsMul: 2,
  chopSfxInterval: 0.3,
  burnWarnAt: 0.55,
} as const;

const COOK_TYPES: ReadonlySet<StationType> = new Set(['grill', 'fryer', 'pot', 'oven', 'wok']);

const STATION_LABEL: Record<StationType, string> = {
  counter: 'Taulell',
  crate: 'Caixa',
  board: 'Taula de tallar',
  grill: 'Planxa',
  fryer: 'Fregidora',
  pot: "Olla d'arròs",
  oven: 'Forn de pedra',
  wok: 'Wok',
  plates: 'Plats nets',
  serve: 'Servei',
  trash: 'Escombraries',
};

// ───────────────────────── Runtime state ─────────────────────────
interface SimPlayer {
  id: string;
  slot: number;
  x: number;
  z: number;
  a: number;
  held: Item | null;
  input: { x: number; z: number; use: boolean };
  act: PlayerAction;
  connected: boolean;
  pendingInteract: number;
  stats: PlayerStats;
}

interface SimStation extends StationInit {
  item: Item | null;
  plates: number;
  /** -1 = working; 0..1 = broken with repair progress */
  broken: number;
  empty: boolean;
  busyBy: string | null;
  burnWarned: boolean;
  chopSfx: number;
}

interface SimOrder {
  id: number;
  recipe: RecipeDef;
  t: number;
  T: number;
  urgent: boolean;
}

interface Resolution {
  label: string | null;
  apply?: () => void;
}

export interface SimPlayerInit {
  id: string;
  slot: number;
}

export class GameSimulation {
  readonly level: LevelDef;
  readonly balance: BalancedLevel;
  readonly layout: ParsedLayout;
  private readonly rand: () => number;
  private players = new Map<string, SimPlayer>();
  private stations: SimStation[];
  private stationAt = new Map<string, SimStation>();
  private orders: SimOrder[] = [];
  private nextItemId = 1;
  private nextOrderId = 1;
  private events: GameEvent[] = [];
  private spawnTimer: number;
  private rushUntil = -1;
  private rushFactor = 1;
  private firedEvents = new Set<number>();
  private shortages: { st: SimStation; until: number }[] = [];
  private plateReturns: { at: number; st: SimStation }[] = [];
  private warned30 = false;
  private warned10 = false;

  elapsed = 0;
  tick = 0;
  score = 0;
  delivered = 0;
  expired = 0;
  tips = 0;
  dishPoints = 0;
  coopBonus = 0;
  wastePenalty = 0;
  expiredPenalty = 0;
  wasted = 0;

  constructor(level: LevelDef, players: SimPlayerInit[], seed = 1) {
    this.level = level;
    this.balance = balanceFor(level, players.length);
    this.layout = parseLayout(level, players.length);
    this.rand = createRng(seed);
    this.stations = this.layout.stations.map((s) => ({
      ...s,
      item: null,
      plates: s.type === 'plates' ? this.balance.plates : 0,
      broken: -1,
      empty: false,
      busyBy: null,
      burnWarned: false,
      chopSfx: 0,
    }));
    for (const s of this.stations) this.stationAt.set(`${s.x},${s.z}`, s);
    // Spawn by order of entry (not lobby slot) so split kitchens always get a chef on each
    // side; `slot` keeps the player's identity colour.
    for (const [index, p] of players.entries()) {
      const sp = this.layout.spawns[index] ?? this.layout.spawns[0] ?? { x: 1.5, z: 1.5 };
      this.players.set(p.id, {
        id: p.id,
        slot: p.slot,
        x: sp.x,
        z: sp.z,
        a: Math.PI, // facing -z (towards the back wall stations)
        held: null,
        input: { x: 0, z: 0, use: false },
        act: 'idle',
        connected: true,
        pendingInteract: 0,
        stats: { id: p.id, slot: p.slot, served: 0, chops: 0, pickups: 0, repairs: 0 },
      });
    }
    this.spawnTimer = level.orders.firstDelay;
  }

  get timeLeft(): number {
    return Math.max(0, this.level.duration - this.elapsed);
  }

  isFinished(): boolean {
    return this.elapsed >= this.level.duration;
  }

  // ───────────── Input ─────────────
  setInput(id: string, x: number, z: number, use: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.input.x = x;
    p.input.z = z;
    p.input.use = use;
    // A short flick turns the chef even if it is released before the next tick moves them.
    if (p.connected && Math.hypot(x, z) > 0.2) p.a = Math.atan2(x, z);
  }

  queueInteract(id: string): void {
    const p = this.players.get(id);
    if (p && p.connected) p.pendingInteract++;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      p.input = { x: 0, z: 0, use: false };
      p.pendingInteract = 0;
    }
  }

  // ───────────── Stepping ─────────────
  step(dt: number): GameEvent[] {
    this.tick++;
    this.elapsed += dt;

    for (const p of this.players.values()) this.movePlayer(p, dt);
    this.separatePlayers();

    for (const p of this.players.values()) {
      while (p.pendingInteract > 0) {
        p.pendingInteract--;
        this.resolveInteract(p).apply?.();
      }
    }

    for (const s of this.stations) s.busyBy = null;
    for (const p of this.players.values()) {
      p.act = Math.hypot(p.input.x, p.input.z) > 0.15 ? 'walk' : 'idle';
      if (p.input.use && p.connected) this.resolveUse(p, dt).apply?.();
    }

    this.updateCooking(dt);
    this.updateOrders(dt);
    this.updateChaos();
    this.updatePlateReturns();

    const left = this.timeLeft;
    if (!this.warned30 && left <= 30) {
      this.warned30 = true;
      this.events.push({ e: 'timeWarn', left: 30 });
    }
    if (!this.warned10 && left <= 10) {
      this.warned10 = true;
      this.events.push({ e: 'timeWarn', left: 10 });
    }

    const out = this.events;
    this.events = [];
    return out;
  }

  // ───────────── Movement & collisions ─────────────
  private isSolid(tx: number, tz: number): boolean {
    if (tz < 0 || tz >= this.layout.height || tx < 0 || tx >= this.layout.width) return true;
    return this.layout.solid[tz]![tx]!;
  }

  private resolveWalls(p: SimPlayer): void {
    const r = SIM.playerRadius;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const minX = Math.floor(p.x - r);
      const maxX = Math.floor(p.x + r);
      const minZ = Math.floor(p.z - r);
      const maxZ = Math.floor(p.z + r);
      for (let tz = minZ; tz <= maxZ; tz++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (!this.isSolid(tx, tz)) continue;
          const cx = Math.max(tx, Math.min(p.x, tx + 1));
          const cz = Math.max(tz, Math.min(p.z, tz + 1));
          let dx = p.x - cx;
          let dz = p.z - cz;
          const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d < 1e-6) {
            // centre inside the tile: push towards the nearest edge
            const ex = Math.min(p.x - tx, tx + 1 - p.x);
            const ez = Math.min(p.z - tz, tz + 1 - p.z);
            if (ex < ez) {
              dx = p.x - tx < tx + 1 - p.x ? -1 : 1;
              dz = 0;
            } else {
              dz = p.z - tz < tz + 1 - p.z ? -1 : 1;
              dx = 0;
            }
            p.x += dx * (r + 0.001);
            p.z += dz * (r + 0.001);
          } else {
            p.x += (dx / d) * (r - d);
            p.z += (dz / d) * (r - d);
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  private movePlayer(p: SimPlayer, dt: number): void {
    const mag = Math.hypot(p.input.x, p.input.z);
    if (!p.connected || mag < 0.12) return;
    const scale = Math.min(1, mag);
    const dirX = p.input.x / mag;
    const dirZ = p.input.z / mag;
    p.a = Math.atan2(dirX, dirZ);
    // sub-step to avoid tunnelling at low tick rates
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      p.x += (dirX * scale * SIM.playerSpeed * dt) / steps;
      p.z += (dirZ * scale * SIM.playerSpeed * dt) / steps;
      this.resolveWalls(p);
    }
  }

  /** Soft separation: players push each other but can always squeeze past (no permanent blocks). */
  private separatePlayers(): void {
    const list = [...this.players.values()];
    const minD = SIM.playerRadius * 1.7;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= minD || d < 1e-6) continue;
        const push = (minD - d) * 0.25;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
        this.resolveWalls(a);
        this.resolveWalls(b);
      }
    }
  }

  /** Station the player is facing within reach (best alignment), or null. */
  targetStation(p: SimPlayer): SimStation | null {
    const fx = Math.sin(p.a);
    const fz = Math.cos(p.a);
    const ptx = Math.floor(p.x);
    const ptz = Math.floor(p.z);
    let best: SimStation | null = null;
    let bestScore = -Infinity;
    for (let tz = ptz - 1; tz <= ptz + 1; tz++) {
      for (let tx = ptx - 1; tx <= ptx + 1; tx++) {
        const s = this.stationAt.get(`${tx},${tz}`);
        if (!s) continue;
        // closest point of the station tile to the player
        const cx = Math.max(tx, Math.min(p.x, tx + 1));
        const cz = Math.max(tz, Math.min(p.z, tz + 1));
        const dist = Math.hypot(cx - p.x, cz - p.z);
        if (dist > SIM.reach - 0.5) continue;
        const vx = tx + 0.5 - p.x;
        const vz = tz + 0.5 - p.z;
        const vl = Math.hypot(vx, vz) || 1;
        const dot = (vx * fx + vz * fz) / vl;
        if (dot < SIM.facingDot) continue;
        const score = dot - dist * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
    }
    return best;
  }

  // ───────────── Items ─────────────
  private newIngredient(ing: IngredientKind, slot: number): IngredientItem {
    return { kind: 'ing', id: this.nextItemId++, ing, st: 'raw', p: 0, b: 0, touched: 1 << slot };
  }

  private newPlate(slot: number): PlateItem {
    return { kind: 'plate', id: this.nextItemId++, style: this.level.plateStyle, contents: [], touched: 1 << slot };
  }

  private menuRecipes(): RecipeDef[] {
    return this.balance.menu.map((m) => RECIPES[m.recipeId]!).filter(Boolean);
  }

  private canPlate(plate: PlateItem, ing: IngredientItem): boolean {
    if (!isPlateable(ing.ing, ing.st)) return false;
    if (plate.contents.length >= MAX_PLATE_ITEMS) return false;
    return isPartialOfAny([...plate.contents, ing], this.menuRecipes());
  }

  private itemLabel(item: Item): string {
    if (item.kind === 'plate') {
      if (item.contents.length === 0) return item.style === 'bowl' ? 'Bol buit' : 'Plat buit';
      return `${item.style === 'bowl' ? 'Bol' : 'Plat'} (${item.contents.map((c) => INGREDIENTS[c.ing].name.toLowerCase()).join(', ')})`;
    }
    let label = ingredientLabel(item.ing, item.st);
    if (item.toppings?.length) label += ` + ${item.toppings.map((t) => INGREDIENTS[t].name.toLowerCase()).join(', ')}`;
    return label;
  }

  private stationLabel(s: SimStation): string {
    if (s.type === 'crate' && s.crate) return `Caixa: ${INGREDIENTS[s.crate].name}`;
    return STATION_LABEL[s.type];
  }

  private touch(item: Item, slot: number): void {
    item.touched |= 1 << slot;
  }

  private wasteItem(item: Item): number {
    let pen = 0;
    const list = item.kind === 'plate' ? item.contents : [item];
    for (const i of list) {
      this.wasted++;
      pen += i.st === 'raw' && !(i.toppings?.length) ? SIM.wastePenaltyRaw : SIM.wastePenaltyProcessed;
    }
    return pen;
  }

  // ───────────── Interact (discrete) ─────────────
  private resolveInteract(p: SimPlayer): Resolution {
    if (!p.connected) return { label: null };
    const s = this.targetStation(p);
    if (!s) return { label: null };
    const held = p.held;
    const invalid = (reason: string): Resolution => ({
      label: null,
      apply: () => this.events.push({ e: 'invalid', p: p.id, reason }),
    });

    switch (s.type) {
      case 'crate': {
        const ing = s.crate!;
        if (s.empty) return invalid(`S'ha acabat: ${INGREDIENTS[ing].name.toLowerCase()}`);
        if (!held) {
          return {
            label: `Agafar ${INGREDIENTS[ing].name.toLowerCase()}`,
            apply: () => {
              p.held = this.newIngredient(ing, p.slot);
              p.stats.pickups++;
              this.events.push({ e: 'pickup', p: p.id, item: ing });
            },
          };
        }
        if (held.kind === 'plate') {
          const probe = this.newIngredientProbe(ing);
          if (this.canPlate(held, probe)) {
            return {
              label: `Afegir ${INGREDIENTS[ing].name.toLowerCase()} al plat`,
              apply: () => {
                const it = this.newIngredient(ing, p.slot);
                held.contents.push(it);
                this.touch(held, p.slot);
                this.events.push({ e: 'pickup', p: p.id, item: ing });
              },
            };
          }
        }
        return invalid('Primer deixa el que portes');
      }

      case 'plates': {
        if (!held) {
          if (s.plates <= 0) return invalid('No queden plats nets');
          return {
            label: 'Agafar plat',
            apply: () => {
              s.plates--;
              p.held = this.newPlate(p.slot);
              p.stats.pickups++;
              this.events.push({ e: 'pickup', p: p.id, item: 'plate' });
            },
          };
        }
        if (held.kind === 'plate' && held.contents.length === 0) {
          return {
            label: 'Tornar el plat',
            apply: () => {
              s.plates++;
              p.held = null;
              this.events.push({ e: 'place', p: p.id, st: s.id });
            },
          };
        }
        if (held.kind === 'ing' && s.plates > 0) {
          const plate = this.newPlate(p.slot);
          if (this.canPlate(plate, held)) {
            return {
              label: 'Posar-ho en un plat',
              apply: () => {
                s.plates--;
                plate.contents.push(held);
                plate.touched |= held.touched;
                p.held = plate;
                this.events.push({ e: 'pickup', p: p.id, item: 'plate' });
              },
            };
          }
        }
        return invalid('No es pot deixar aquí');
      }

      case 'serve': {
        if (!held || held.kind !== 'plate') return invalid('Porta un plat acabat');
        if (held.contents.length === 0) return invalid('El plat és buit');
        return { label: 'Servir', apply: () => this.deliver(p, held) };
      }

      case 'trash': {
        if (!held) return { label: null };
        if (held.kind === 'plate' && held.contents.length === 0) return invalid('El plat ja és buit');
        return {
          label: held.kind === 'plate' ? 'Buidar el plat' : 'Llençar',
          apply: () => {
            const pen = this.applyPenalty(this.wasteItem(held));
            this.wastePenalty += pen;
            if (held.kind === 'plate') held.contents = [];
            else p.held = null;
            this.events.push({ e: 'trash', p: p.id, waste: pen });
          },
        };
      }

      default:
        return this.resolveHolder(p, s, invalid);
    }
  }

  /** Throwaway ingredient used only to test plating rules (does not consume an id). */
  private newIngredientProbe(ing: IngredientKind): IngredientItem {
    return { kind: 'ing', id: -1, ing, st: 'raw', p: 0, b: 0, touched: 0 };
  }

  /** Counters, boards and cooking stations: hold a single item. */
  private resolveHolder(p: SimPlayer, s: SimStation, invalid: (r: string) => Resolution): Resolution {
    const held = p.held;
    const item = s.item;

    if (!held && item) {
      return {
        label: `Agafar ${this.itemLabel(item).toLowerCase()}`,
        apply: () => {
          s.item = null;
          s.burnWarned = false;
          p.held = item;
          this.touch(item, p.slot);
          p.stats.pickups++;
          this.events.push({ e: 'pickup', p: p.id, item: item.kind === 'plate' ? 'plate' : item.ing });
        },
      };
    }
    if (!held) return { label: null };

    if (!item) {
      const ok = this.accepts(s, held);
      if (ok !== true) return invalid(ok);
      return {
        label: COOK_TYPES.has(s.type) ? `Cuinar a ${STATION_LABEL[s.type].toLowerCase()}` : `Deixar a ${STATION_LABEL[s.type].toLowerCase()}`,
        apply: () => {
          s.item = held;
          s.burnWarned = false;
          p.held = null;
          this.events.push({ e: 'place', p: p.id, st: s.id });
        },
      };
    }

    // Both hands and station hold something: try to combine.
    if (held.kind === 'plate' && item.kind === 'ing' && this.canPlate(held, item)) {
      return {
        label: `Posar ${this.itemLabel(item).toLowerCase()} al plat`,
        apply: () => {
          held.contents.push(item);
          held.touched |= item.touched | (1 << p.slot);
          s.item = null;
          s.burnWarned = false;
          this.events.push({ e: 'place', p: p.id, st: s.id });
        },
      };
    }
    if (held.kind === 'ing' && item.kind === 'plate' && this.canPlate(item, held)) {
      return {
        label: `Afegir ${this.itemLabel(held).toLowerCase()} al plat`,
        apply: () => {
          item.contents.push(held);
          item.touched |= held.touched | (1 << p.slot);
          p.held = null;
          this.events.push({ e: 'place', p: p.id, st: s.id });
        },
      };
    }
    // Pizza toppings: chopped topping onto raw dough lying on the station.
    if (held.kind === 'ing' && item.kind === 'ing' && item.ing === 'dough' && item.st === 'raw' && INGREDIENTS[held.ing].topping && held.st === 'chopped') {
      const current = item.toppings ?? [];
      if (canAddTopping(current, held.ing, this.menuRecipes())) {
        return {
          label: `Afegir ${INGREDIENTS[held.ing].name.toLowerCase()} a la pizza`,
          apply: () => {
            item.toppings = [...current, held.ing];
            item.touched |= held.touched | (1 << p.slot);
            p.held = null;
            this.events.push({ e: 'place', p: p.id, st: s.id });
          },
        };
      }
      return invalid('Aquesta pizza no porta això');
    }
    if (held.kind === 'plate' && item.kind === 'ing') return invalid('Encara no es pot emplatar');
    return invalid('Ja hi ha alguna cosa aquí');
  }

  private accepts(s: SimStation, item: Item): true | string {
    if (s.type === 'counter') return true;
    if (s.type === 'board') return item.kind === 'ing' ? true : 'Aquí només s’hi talla';
    if (COOK_TYPES.has(s.type)) {
      if (item.kind !== 'ing') return 'Aquí no hi va un plat';
      const cook = INGREDIENTS[item.ing].cook;
      if (!cook || cook.on !== s.type) return `Això no es cuina a ${STATION_LABEL[s.type].toLowerCase()}`;
      if (item.st !== cook.from && item.st !== 'cooked' && item.st !== 'burnt') {
        return cook.from === 'chopped' ? 'Primer cal tallar-ho' : 'Això no es pot cuinar així';
      }
      return true;
    }
    return 'No es pot deixar aquí';
  }

  private deliver(p: SimPlayer, plate: PlateItem): void {
    const matching = this.orders.filter((o) => matchesRecipe(plate.contents, o.recipe)).sort((a, b) => a.t - b.t);
    const order = matching[0];
    if (!order) {
      this.events.push({ e: 'wrongDish', p: p.id });
      return;
    }
    const base = order.recipe.points * (order.urgent ? SIM.urgentPointsMul : 1);
    const tip = Math.round(base * SIM.tipRatio * Math.max(0, order.t / order.T));
    let touched = plate.touched;
    for (const c of plate.contents) touched |= c.touched;
    const handlers = countBits(touched);
    const coop = handlers >= 2 ? Math.round(base * SIM.coopRatio) : 0;
    this.score += base + tip + coop;
    this.dishPoints += base;
    this.tips += tip;
    this.coopBonus += coop;
    this.delivered++;
    p.stats.served++;
    this.orders = this.orders.filter((o) => o !== order);
    p.held = null;
    const stack = this.stations.find((s) => s.type === 'plates');
    if (stack) this.plateReturns.push({ at: this.elapsed + SIM.plateReturnDelay, st: stack });
    this.events.push({ e: 'served', p: p.id, order: order.id, points: base, tip, coop, recipe: order.recipe.id });
    if (this.orders.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 1.5);
  }

  /** Score never goes below zero; returns the amount actually deducted (so breakdowns add up). */
  private applyPenalty(amount: number): number {
    const d = Math.min(this.score, amount);
    this.score -= d;
    return d;
  }

  // ───────────── Use (held ACTION) ─────────────
  private resolveUse(p: SimPlayer, dt: number): Resolution {
    const s = this.targetStation(p);
    if (!s) return { label: null };
    if (s.busyBy && s.busyBy !== p.id) return { label: null };
    if (s.broken >= 0) {
      return {
        label: `Reparar ${STATION_LABEL[s.type].toLowerCase()}`,
        apply: () => {
          s.busyBy = p.id;
          p.act = 'repair';
          s.broken += dt / SIM.repairTime;
          if (s.broken >= 1) {
            s.broken = -1;
            p.stats.repairs++;
            this.events.push({ e: 'repaired', st: s.id, p: p.id });
          }
        },
      };
    }
    if (s.type === 'board' && s.item?.kind === 'ing' && canChop(s.item.ing, s.item.st)) {
      if (p.held) return { label: null };
      const item = s.item;
      return {
        label: 'Tallar',
        apply: () => {
          s.busyBy = p.id;
          p.act = 'chop';
          this.touch(item, p.slot);
          item.p += dt / INGREDIENTS[item.ing].chopTime!;
          s.chopSfx -= dt;
          if (s.chopSfx <= 0) {
            s.chopSfx = SIM.chopSfxInterval;
            this.events.push({ e: 'chop', st: s.id });
          }
          if (item.p >= 1) {
            item.st = 'chopped';
            item.p = 0;
            p.stats.chops++;
            this.events.push({ e: 'chopDone', st: s.id });
          }
        },
      };
    }
    return { label: null };
  }

  // ───────────── Systems ─────────────
  private updateCooking(dt: number): void {
    for (const s of this.stations) {
      if (!COOK_TYPES.has(s.type) || s.broken >= 0) continue;
      const it = s.item;
      if (!it || it.kind !== 'ing') continue;
      const cook = INGREDIENTS[it.ing].cook;
      if (!cook || cook.on !== s.type) continue;
      if (it.st === cook.from) {
        it.p += dt / cook.time;
        if (it.p >= 1) {
          it.st = 'cooked';
          it.p = 0;
          it.b = 0;
          this.events.push({ e: 'cookDone', st: s.id, ing: it.ing });
        }
      } else if (it.st === 'cooked') {
        it.b += dt / cook.burnTime;
        if (!s.burnWarned && it.b >= SIM.burnWarnAt) {
          s.burnWarned = true;
          this.events.push({ e: 'burnWarn', st: s.id });
        }
        if (it.b >= 1) {
          it.st = 'burnt';
          it.b = 1;
          this.events.push({ e: 'burnt', st: s.id });
        }
      }
    }
  }

  private spawnOrder(recipe: RecipeDef, urgent: boolean): void {
    const T = recipe.time * this.balance.orderTimeMul * (urgent ? SIM.urgentTimeRatio : 1);
    const o: SimOrder = { id: this.nextOrderId++, recipe, t: T, T, urgent };
    this.orders.push(o);
    this.events.push({ e: 'orderNew', order: o.id, recipe: recipe.id, urgent });
  }

  private updateOrders(dt: number): void {
    for (const o of this.orders) o.t -= dt;
    const expired = this.orders.filter((o) => o.t <= 0);
    for (const o of expired) {
      const pen = this.applyPenalty(Math.round(o.recipe.points * SIM.expiredPenaltyRatio));
      this.expiredPenalty += pen;
      this.expired++;
      this.events.push({ e: 'orderExpired', order: o.id, recipe: o.recipe.id, penalty: pen });
    }
    if (expired.length) this.orders = this.orders.filter((o) => o.t > 0);

    // No new regular orders in the last seconds: nobody could finish them.
    if (this.timeLeft < 12) return;
    const factor = this.elapsed < this.rushUntil ? this.rushFactor : 1;
    this.spawnTimer -= dt / factor;
    if (this.orders.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 2);
    if (this.spawnTimer <= 0) {
      if (this.orders.length < this.balance.maxActive) {
        const entry = weightedPick(this.balance.menu, this.rand);
        const r = entry ? RECIPES[entry.recipeId] : undefined;
        if (r) this.spawnOrder(r, false);
      }
      this.spawnTimer = this.balance.interval * (0.85 + this.rand() * 0.3);
    }
  }

  private updateChaos(): void {
    this.balance.events.forEach((ev, idx) => {
      if (this.firedEvents.has(idx) || this.elapsed < ev.at) return;
      this.firedEvents.add(idx);
      this.applyChaos(ev);
    });
    if (this.rushUntil > 0 && this.elapsed >= this.rushUntil) {
      this.rushUntil = -1;
      this.rushFactor = 1;
      this.events.push({ e: 'chaosEnd', kind: 'rush' });
    }
    for (const sh of this.shortages) {
      if (this.elapsed >= sh.until && sh.st.empty) {
        sh.st.empty = false;
        this.events.push({ e: 'chaosEnd', kind: 'shortage' });
      }
    }
    this.shortages = this.shortages.filter((s) => s.st.empty);
  }

  private applyChaos(ev: LevelEvent): void {
    switch (ev.type) {
      case 'rush':
        this.rushUntil = this.elapsed + ev.duration;
        this.rushFactor = ev.factor;
        this.spawnTimer = Math.min(this.spawnTimer, 1);
        this.events.push({ e: 'chaos', kind: 'rush', text: 'HORA PUNTA! Les comandes arriben més de pressa' });
        break;
      case 'urgent': {
        const pool = ev.recipeId ? [RECIPES[ev.recipeId]!] : this.menuRecipes();
        const r = pool[Math.floor(this.rand() * pool.length)];
        if (r) {
          this.spawnOrder(r, true);
          this.events.push({ e: 'chaos', kind: 'urgent', text: `COMANDA URGENT: ${r.name}. Punts dobles!` });
        }
        break;
      }
      case 'breakdown': {
        const candidates = this.stations.filter((s) => s.type === ev.station && s.broken < 0);
        const s = candidates[Math.floor(this.rand() * candidates.length)];
        if (s) {
          s.broken = 0;
          this.events.push({ e: 'chaos', kind: 'breakdown', st: s.id, text: `AVARIA: ${STATION_LABEL[s.type]}. Mantén ACCIÓ al davant per reparar-la` });
        }
        break;
      }
      case 'shortage': {
        const s = this.stations.find((x) => x.type === 'crate' && x.crate === ev.ing && !x.empty);
        if (s) {
          s.empty = true;
          this.shortages.push({ st: s, until: this.elapsed + ev.duration });
          this.events.push({ e: 'chaos', kind: 'shortage', st: s.id, text: `S'HA ACABAT ${INGREDIENTS[ev.ing].name.toUpperCase()}! Arriba reposició en ${ev.duration} s` });
        }
        break;
      }
    }
  }

  private updatePlateReturns(): void {
    const due = this.plateReturns.filter((r) => this.elapsed >= r.at);
    for (const r of due) {
      r.st.plates++;
      this.events.push({ e: 'plateBack', st: r.st.id });
    }
    if (due.length) this.plateReturns = this.plateReturns.filter((r) => this.elapsed < r.at);
  }

  // ───────────── Views ─────────────
  initView(): LevelInitView {
    return {
      levelId: this.level.id,
      name: this.level.name,
      restaurant: this.level.restaurant,
      width: this.layout.width,
      height: this.layout.height,
      tiles: this.layout.tiles,
      stations: this.layout.stations.map((s) => ({ ...s })),
      duration: this.level.duration,
      menu: this.balance.menu.map((m) => m.recipeId),
      stars: this.balance.stars,
      playerCount: this.balance.playerCount,
      plateStyle: this.level.plateStyle,
      hints: this.level.hints,
    };
  }

  playerViews(): PlayerView[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      slot: p.slot,
      x: round3(p.x),
      z: round3(p.z),
      a: round3(p.a),
      held: p.held ? itemView(p.held) : null,
      act: p.act,
      connected: p.connected,
    }));
  }

  stationViews(): StationView[] {
    return this.stations.map((s) => {
      const v: StationView = { id: s.id, item: s.item ? itemView(s.item) : null };
      if (s.type === 'plates') v.n = s.plates;
      if (s.broken >= 0) v.broken = round3(s.broken);
      if (s.empty) v.empty = true;
      if (s.busyBy) v.busy = true;
      return v;
    });
  }

  orderViews(): OrderView[] {
    return this.orders.map((o) => ({ id: o.id, r: o.recipe.id, t: round3(o.t), T: round3(o.T), u: o.urgent }));
  }

  hintFor(id: string): ControllerHint {
    const p = this.players.get(id);
    if (!p) return { interact: null, use: null, held: null, near: null, progress: null };
    const s = this.targetStation(p);
    const inter = this.resolveInteract(p);
    // resolveUse with dt=0 has no side effects except via apply, which we do not call.
    const use = this.resolveUse(p, 0);
    let progress: number | null = null;
    if (s?.broken !== undefined && s.broken >= 0) progress = s.broken;
    else if (s?.type === 'board' && s.item?.kind === 'ing' && s.item.st === 'raw' && s.item.p > 0) progress = s.item.p;
    return {
      interact: inter.label,
      use: use.label,
      held: p.held ? this.itemLabel(p.held) : null,
      near: s ? this.stationLabel(s) : null,
      progress: progress === null ? null : round3(progress),
    };
  }

  results(): LevelResults {
    const stars = this.balance.stars.filter((t) => this.score >= t).length;
    return {
      levelId: this.level.id,
      score: this.score,
      stars,
      thresholds: this.balance.stars,
      delivered: this.delivered,
      expired: this.expired,
      dishPoints: this.dishPoints,
      tips: this.tips,
      coopBonus: this.coopBonus,
      wastePenalty: this.wastePenalty,
      expiredPenalty: this.expiredPenalty,
      wasted: this.wasted,
      playerCount: this.balance.playerCount,
      players: [...this.players.values()].map((p) => ({ ...p.stats })),
      won: stars >= 1,
    };
  }

  // ───────────── Test / tooling helpers ─────────────
  /** Direct access for tests and bots (never exposed over the network). */
  debugPlayer(id: string): SimPlayer | undefined {
    return this.players.get(id);
  }
  debugStations(): SimStation[] {
    return this.stations;
  }
  debugOrders(): SimOrder[] {
    return this.orders;
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function countBits(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

function ingView(i: IngredientItem): IngredientView {
  const v: IngredientView = { k: 'ing', id: i.id, ing: i.ing, st: i.st, p: round3(i.p), b: round3(i.b) };
  if (i.toppings?.length) v.top = [...i.toppings];
  return v;
}

export function itemView(item: Item): ItemView {
  if (item.kind === 'plate') return { k: 'plate', id: item.id, style: item.style, c: item.contents.map(ingView) };
  return ingView(item);
}
