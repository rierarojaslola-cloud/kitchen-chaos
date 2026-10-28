/**
 * ASCII level layout parsing + playability validation.
 *
 * Legend:
 *   #  wall                     .  floor
 *   1-4 spawn point (floor)      C  counter
 *   B  cutting board             G  grill        F  fryer
 *   P  rice pot                  O  oven         W  wok
 *   D  plate stack               S  serve window T  trash
 *   a-z crate (mapping in LevelDef.crates)
 */
import { INGREDIENTS } from './ingredients';
import { RECIPES } from './recipes';
import type { IngredientKind, LevelDef, StationInit, StationType } from './types';

const CHAR_TO_STATION: Record<string, StationType> = {
  C: 'counter',
  B: 'board',
  G: 'grill',
  F: 'fryer',
  P: 'pot',
  O: 'oven',
  W: 'wok',
  D: 'plates',
  S: 'serve',
  T: 'trash',
};

export interface ParsedLayout {
  width: number;
  height: number;
  /** solid[z][x] */
  solid: boolean[][];
  walls: boolean[][];
  stations: StationInit[];
  /** Spawn tile centres indexed by slot (0..3). */
  spawns: { x: number; z: number }[];
  tiles: string[];
}

const DIRS: [number, number][] = [
  [0, 1], // +z (towards camera) preferred
  [1, 0],
  [-1, 0],
  [0, -1],
];

export function parseLayout(level: LevelDef, playerCount: number): ParsedLayout {
  const rows = level.layout;
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height < 3 || width < 3) throw new Error(`Level ${level.id}: layout too small`);
  for (const r of rows) if (r.length !== width) throw new Error(`Level ${level.id}: ragged layout row "${r}"`);

  const cond = new Map<string, number>();
  for (const c of level.conditional ?? []) cond.set(`${c.x},${c.z}`, c.minPlayers);

  const solid: boolean[][] = [];
  const walls: boolean[][] = [];
  const stations: StationInit[] = [];
  const spawns: { x: number; z: number }[] = [];
  const tiles: string[] = [];
  let nextId = 1;

  for (let z = 0; z < height; z++) {
    const sRow: boolean[] = [];
    const wRow: boolean[] = [];
    let tRow = '';
    for (let x = 0; x < width; x++) {
      let ch = rows[z]![x]!;
      const min = cond.get(`${x},${z}`);
      if (min !== undefined && playerCount < min) ch = 'C';
      if (ch === '#') {
        sRow.push(true);
        wRow.push(true);
        tRow += '#';
      } else if (ch === '.' || (ch >= '1' && ch <= '4')) {
        sRow.push(false);
        wRow.push(false);
        tRow += '.';
        if (ch >= '1' && ch <= '4') spawns[Number(ch) - 1] = { x: x + 0.5, z: z + 0.5 };
      } else {
        sRow.push(true);
        wRow.push(false);
        tRow += 'S';
        let type: StationType | undefined = CHAR_TO_STATION[ch];
        let crate: IngredientKind | undefined;
        if (!type && ch >= 'a' && ch <= 'z') {
          crate = level.crates[ch];
          if (!crate) throw new Error(`Level ${level.id}: unknown crate letter '${ch}'`);
          type = 'crate';
        }
        if (!type) throw new Error(`Level ${level.id}: unknown layout char '${ch}'`);
        stations.push({ id: nextId++, type, x, z, dir: 0, ...(crate ? { crate } : {}) });
      }
    }
    solid.push(sRow);
    walls.push(wRow);
    tiles.push(tRow);
  }

  // Facing direction: first adjacent floor tile (preference order DIRS).
  for (const s of stations) {
    s.dir = 0;
    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dz] = DIRS[i]!;
      const nx = s.x + dx;
      const nz = s.z + dz;
      if (nz >= 0 && nz < height && nx >= 0 && nx < width && !solid[nz]![nx]!) {
        s.dir = [0, 1, 3, 2][i]!; // map to 0=+z,1=+x,3=-x,2=-z
        break;
      }
    }
  }

  return { width, height, solid, walls, stations, spawns, tiles };
}

/** Flood fill over floor tiles from a start tile; returns visited set "x,z". */
export function floodFloor(layout: ParsedLayout, sx: number, sz: number): Set<string> {
  const seen = new Set<string>();
  const stack: [number, number][] = [[sx, sz]];
  while (stack.length) {
    const [x, z] = stack.pop()!;
    const key = `${x},${z}`;
    if (seen.has(key)) continue;
    if (z < 0 || z >= layout.height || x < 0 || x >= layout.width) continue;
    if (layout.solid[z]![x]) continue;
    seen.add(key);
    stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  return seen;
}

/**
 * Validates that a level is completely playable with `playerCount` players:
 * spawns exist, every station is reachable by at least one player, and every recipe on the
 * (player-filtered) menu can be produced with the stations and crates present.
 */
export function validateLevel(level: LevelDef, playerCount: number): string[] {
  const errors: string[] = [];
  let layout: ParsedLayout;
  try {
    layout = parseLayout(level, playerCount);
  } catch (e) {
    return [(e as Error).message];
  }
  const reach = new Set<string>();
  for (let slot = 0; slot < playerCount; slot++) {
    const sp = layout.spawns[slot];
    if (!sp) {
      errors.push(`missing spawn ${slot + 1}`);
      continue;
    }
    for (const k of floodFloor(layout, Math.floor(sp.x), Math.floor(sp.z))) reach.add(k);
  }
  for (const s of layout.stations) {
    const ok = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => reach.has(`${s.x + dx!},${s.z + dz!}`));
    if (!ok) errors.push(`station ${s.type}@${s.x},${s.z} unreachable`);
  }
  const has = (t: StationType) => layout.stations.some((s) => s.type === t);
  const crates = new Set(layout.stations.filter((s) => s.crate).map((s) => s.crate));
  if (!has('serve')) errors.push('no serve window');
  if (!has('plates')) errors.push('no plate stack');
  for (const entry of level.menu) {
    if ((entry.minPlayers ?? 0) > playerCount) continue;
    const r = RECIPES[entry.recipeId];
    if (!r) {
      errors.push(`unknown recipe ${entry.recipeId}`);
      continue;
    }
    for (const part of r.parts) {
      const need: IngredientKind[] = [part.ing, ...(part.toppings ?? [])];
      for (const ing of need) {
        if (!crates.has(ing)) errors.push(`${r.id}: no crate for ${ing}`);
        const def = INGREDIENTS[ing];
        const target = ing === part.ing ? part.st : 'chopped';
        if ((target === 'chopped' || def.cook?.from === 'chopped') && def.chopTime && !has('board'))
          errors.push(`${r.id}: needs a cutting board`);
        if (target === 'cooked' && def.cook && !has(def.cook.on)) errors.push(`${r.id}: needs ${def.cook.on}`);
      }
    }
  }
  return errors;
}
