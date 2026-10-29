/**
 * Core content + snapshot (view) types. Content is data-driven: ingredients, recipes and
 * levels are plain objects interpreted by the simulation.
 */

export type IngredientKind =
  | 'bun'
  | 'patty'
  | 'lettuce'
  | 'tomato'
  | 'cheese'
  | 'onion'
  | 'potato'
  | 'dough'
  | 'mushroom'
  | 'rice'
  | 'fish'
  | 'cucumber'
  | 'shrimp';

export type IngState = 'raw' | 'chopped' | 'cooked' | 'burnt';

/** Cooking station types (a station "cooks" an ingredient placed directly on it). */
export type CookStation = 'grill' | 'fryer' | 'pot' | 'oven' | 'wok';

export type StationType =
  | 'counter'
  | 'crate'
  | 'board'
  | CookStation
  | 'plates'
  | 'serve'
  | 'trash';

export type PlateStyle = 'plate' | 'board' | 'bowl';

export type RestaurantId = 'burger' | 'pizza' | 'asian';

export interface IngredientDef {
  id: IngredientKind;
  name: string;
  /** Short label used on controller / order cards when icons are not available. */
  emoji: string;
  /** If set, ingredient can be chopped from raw on a cutting board in `chopTime` seconds. */
  chopTime?: number;
  /** If set, ingredient can be cooked on that station type. */
  cook?: { on: CookStation; from: IngState; time: number; burnTime: number };
  /** States in which the ingredient may be put on a plate. */
  plateable: IngState[];
  /** Can be added as topping onto raw dough (only when chopped). */
  topping?: boolean;
}

export interface RecipePart {
  ing: IngredientKind;
  st: IngState;
  /** For dough-based recipes: required toppings (multiset, order irrelevant). */
  toppings?: IngredientKind[];
}

export interface RecipeDef {
  id: string;
  name: string;
  parts: RecipePart[];
  /** Base points for a correct delivery. */
  points: number;
  /** Base time an order stays open (seconds) before balance scaling. */
  time: number;
  difficulty: 1 | 2 | 3;
}

// ───────────────────────── Runtime items ─────────────────────────

export interface IngredientItem {
  kind: 'ing';
  id: number;
  ing: IngredientKind;
  st: IngState;
  /** Progress of the current processing step (chop or cook), 0..1 */
  p: number;
  /** Burn progress once cooked, 0..1 (1 = burnt) */
  b: number;
  toppings?: IngredientKind[];
  /** Bitmask of player slots that handled this item (cooperation tracking). */
  touched: number;
}

export interface PlateItem {
  kind: 'plate';
  id: number;
  style: PlateStyle;
  contents: IngredientItem[];
  touched: number;
}

export type Item = IngredientItem | PlateItem;

// ───────────────────────── Levels ─────────────────────────

export type LevelEvent =
  | { at: number; type: 'rush'; duration: number; factor: number; minPlayers?: number }
  | { at: number; type: 'urgent'; recipeId?: string; minPlayers?: number }
  | { at: number; type: 'breakdown'; station: CookStation | 'board'; minPlayers?: number }
  | { at: number; type: 'shortage'; ing: IngredientKind; duration: number; minPlayers?: number };

export interface MenuEntry {
  recipeId: string;
  weight: number;
  /** Only offered when at least this many players are in the game. */
  minPlayers?: number;
}

export interface LevelDef {
  id: string;
  order: number;
  name: string;
  description: string;
  restaurant: RestaurantId;
  /** Seconds. */
  duration: number;
  /** ASCII layout rows. See layout.ts for the legend. */
  layout: string[];
  /** Lowercase crate letters → ingredient. */
  crates: Record<string, IngredientKind>;
  /** Tiles that only become a station with ≥ minPlayers; otherwise a plain counter. */
  conditional?: { x: number; z: number; minPlayers: number }[];
  plateStyle: PlateStyle;
  menu: MenuEntry[];
  orders: {
    /** Seconds between spawns for 3 players (reference). */
    interval: number;
    /** Max simultaneous orders for 2 players (reference). */
    maxActive: number;
    firstDelay: number;
  };
  plates: number;
  /** Star thresholds for 3 players (reference). */
  stars: [number, number, number];
  events: LevelEvent[];
  /** Short tutorial hints shown at level intro. */
  hints: string[];
  /** Mechanic introduced by this level (shown in campaign map). */
  newMechanic: string;
}

// ───────────────────────── Views (wire snapshots) ─────────────────────────

export interface IngredientView {
  k: 'ing';
  id: number;
  ing: IngredientKind;
  st: IngState;
  p: number;
  b: number;
  top?: IngredientKind[];
}
export interface PlateView {
  k: 'plate';
  id: number;
  style: PlateStyle;
  c: IngredientView[];
}
export type ItemView = IngredientView | PlateView;

export type PlayerAction = 'idle' | 'walk' | 'chop' | 'repair';

export interface PlayerView {
  id: string;
  slot: number;
  x: number;
  z: number;
  /** Facing angle in radians (0 = +z). */
  a: number;
  held: ItemView | null;
  act: PlayerAction;
  connected: boolean;
}

export interface StationView {
  id: number;
  item: ItemView | null;
  /** Remaining plates for plate stacks. */
  n?: number;
  /** Station disabled by breakdown: repair progress 0..1 */
  broken?: number;
  /** Crate out of stock (shortage event). */
  empty?: boolean;
  /** Someone is chopping / repairing here. */
  busy?: boolean;
}

export interface OrderView {
  id: number;
  r: string;
  t: number;
  T: number;
  u: boolean;
}

export interface StationInit {
  id: number;
  type: StationType;
  x: number;
  z: number;
  /** Direction the station faces (towards walkable floor): 0=+z,1=+x,2=-z,3=-x */
  dir: number;
  crate?: IngredientKind;
}

export interface LevelInitView {
  levelId: string;
  name: string;
  restaurant: RestaurantId;
  width: number;
  height: number;
  /** Rows: '#' wall, '.' floor, 'S' station tile (details in `stations`). */
  tiles: string[];
  stations: StationInit[];
  duration: number;
  menu: string[];
  stars: [number, number, number];
  playerCount: number;
  plateStyle: PlateStyle;
  hints: string[];
}

export type GameEvent =
  | { e: 'pickup'; p: string; item: string }
  | { e: 'place'; p: string; st: number }
  | { e: 'chopDone'; st: number }
  | { e: 'chop'; st: number }
  | { e: 'cookDone'; st: number; ing: IngredientKind }
  | { e: 'burnWarn'; st: number }
  | { e: 'burnt'; st: number }
  | { e: 'served'; p: string; order: number; points: number; tip: number; coop: number; recipe: string }
  | { e: 'wrongDish'; p: string }
  | { e: 'invalid'; p: string; reason: string }
  | { e: 'trash'; p: string; waste: number }
  | { e: 'orderNew'; order: number; recipe: string; urgent: boolean }
  | { e: 'orderExpired'; order: number; recipe: string; penalty: number }
  | { e: 'chaos'; kind: LevelEvent['type']; text: string; st?: number }
  | { e: 'chaosEnd'; kind: LevelEvent['type'] }
  | { e: 'repaired'; st: number; p: string }
  | { e: 'plateBack'; st: number }
  | { e: 'timeWarn'; left: number };

export interface PlayerStats {
  id: string;
  slot: number;
  served: number;
  chops: number;
  pickups: number;
  repairs: number;
}

export interface LevelResults {
  levelId: string;
  score: number;
  stars: number;
  thresholds: [number, number, number];
  delivered: number;
  expired: number;
  /** Base points of delivered dishes (urgent ×2 included). */
  dishPoints: number;
  tips: number;
  coopBonus: number;
  /** Penalties actually deducted (score is clamped at 0, so these always add up). */
  wastePenalty: number;
  expiredPenalty: number;
  wasted: number;
  playerCount: number;
  players: PlayerStats[];
  won: boolean;
}

/** Context info sent to each phone so it can label its buttons. */
export interface ControllerHint {
  /** What INTERACT would do right now (null = nothing). */
  interact: string | null;
  /** What holding ACTION would do right now (null = nothing). */
  use: string | null;
  /** Human label of the held item. */
  held: string | null;
  /** Label of the station in front. */
  near: string | null;
  /** Progress of the current chop/repair (0..1) or null. */
  progress: number | null;
}
