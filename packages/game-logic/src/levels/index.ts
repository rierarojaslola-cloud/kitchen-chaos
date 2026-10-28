/**
 * Level data. Layout legend in ../layout.ts. Star thresholds and timings are the
 * 3-player reference and are scaled by balance.ts. Values are first-pass and marked
 * PROVISIONAL in docs/STATUS.md until real playtests with phones confirm them.
 */
import type { LevelDef, RestaurantId } from '../types';

export interface RestaurantDef {
  id: RestaurantId;
  name: string;
  tagline: string;
  /** UI accent colour. */
  accent: string;
}

export const RESTAURANTS: Record<RestaurantId, RestaurantDef> = {
  burger: { id: 'burger', name: 'La Brasa Neó', tagline: 'Hamburgueseria urbana de planxa i neó', accent: '#ff7a3d' },
  pizza: { id: 'pizza', name: 'Forn Pedra Viva', tagline: 'Pizzeria artesana de forn de pedra', accent: '#e8c25a' },
  asian: { id: 'asian', name: 'Lluna de Bambú', tagline: 'Bols asiàtics contemporanis', accent: '#4fd1c5' },
};

export const LEVELS: LevelDef[] = [
  {
    id: 'burger-1',
    order: 1,
    name: 'Obertura',
    description: 'Primer servei a La Brasa Neó. Aprèn a tallar, cuinar i servir.',
    restaurant: 'burger',
    duration: 150,
    layout: [
      '##############',
      '#bphCCGGGCDCS#',
      '#............#',
      '#.1........2.#',
      '#B...CCCC...C#',
      '#B...CCCC...T#',
      '#.3........4.#',
      '#............#',
      '##############',
    ],
    crates: { b: 'bun', p: 'patty', h: 'cheese' },
    conditional: [
      { x: 8, z: 1, minPlayers: 4 },
      { x: 1, z: 5, minPlayers: 3 },
    ],
    plateStyle: 'plate',
    menu: [
      { recipeId: 'burger_classic', weight: 3 },
      { recipeId: 'cheeseburger', weight: 2 },
    ],
    orders: { interval: 17, maxActive: 3, firstDelay: 2 },
    plates: 3,
    stars: [120, 260, 400],
    events: [{ at: 95, type: 'urgent', recipeId: 'burger_classic' }],
    hints: [
      'Agafa pa i carn de les caixes.',
      'Posa la carn a la planxa i espera que es cuini.',
      'Agafa un plat, munta la hamburguesa i porta-la al taulell de servei.',
    ],
    newMechanic: 'Tallar, cuinar a la planxa i servir',
  },
  {
    id: 'burger-2',
    order: 2,
    name: 'Hora punta',
    description: 'Arriba la gent de la feina: fregidora, comandes completes i una planxa capriciosa.',
    restaurant: 'burger',
    duration: 200,
    layout: [
      '################',
      '#SCbplthuCGGFFC#',
      '#..............#',
      '#.1..........2.#',
      '#D...CC..CC...B#',
      '#C...CC..CC...B#',
      '#T.3.......4...#',
      '#..............#',
      '#CCBCCCCCCCCCCC#',
      '################',
    ],
    crates: { b: 'bun', p: 'patty', l: 'lettuce', t: 'tomato', h: 'cheese', u: 'potato' },
    conditional: [{ x: 14, z: 5, minPlayers: 3 }],
    plateStyle: 'plate',
    menu: [
      { recipeId: 'burger_classic', weight: 2 },
      { recipeId: 'burger_deluxe', weight: 2 },
      { recipeId: 'fries', weight: 2 },
      { recipeId: 'cheeseburger', weight: 2, minPlayers: 3 },
    ],
    orders: { interval: 16, maxActive: 3, firstDelay: 2 },
    plates: 3,
    stars: [200, 400, 600],
    events: [
      { at: 60, type: 'rush', duration: 25, factor: 0.55 },
      { at: 105, type: 'breakdown', station: 'grill' },
      { at: 150, type: 'urgent', recipeId: 'burger_deluxe' },
      { at: 170, type: 'urgent', minPlayers: 4 },
    ],
    hints: [
      'Les patates s’han de tallar abans de fregir-les.',
      'Si una màquina s’espatlla, mantén ACCIÓ al davant per reparar-la.',
    ],
    newMechanic: 'Fregidora, hora punta i avaries',
  },
  {
    id: 'pizza-1',
    order: 3,
    name: 'Massa mare',
    description: 'Pizzes al forn de pedra: munta-les sobre el taulell abans d’enfornar.',
    restaurant: 'pizza',
    duration: 170,
    layout: [
      '##############',
      '#COOOCCdthCCS#',
      '#............#',
      '#B.1.....2..D#',
      '#B...CCCC....#',
      '#C...CCCC...T#',
      '#..3......4..#',
      '##############',
    ],
    crates: { d: 'dough', t: 'tomato', h: 'cheese' },
    conditional: [{ x: 4, z: 1, minPlayers: 4 }],
    plateStyle: 'board',
    menu: [
      { recipeId: 'pizza_margherita', weight: 3 },
      { recipeId: 'caprese', weight: 2 },
    ],
    orders: { interval: 19, maxActive: 2, firstDelay: 2 },
    plates: 3,
    stars: [140, 300, 460],
    events: [{ at: 110, type: 'urgent', recipeId: 'caprese' }],
    hints: [
      'Deixa la massa en un taulell i afegeix-hi tomàquet i formatge tallats.',
      'Porta la pizza crua al forn. Vigila que no es cremi!',
    ],
    newMechanic: 'Muntatge de pizzes i forn de pedra',
  },
  {
    id: 'pizza-2',
    order: 4,
    name: 'Forn en flames',
    description: 'Cuina partida en dues: passa els ingredients per sobre del taulell central.',
    restaurant: 'pizza',
    duration: 210,
    layout: [
      '###############',
      '#dthmCB#COOODS#',
      '#......C......#',
      '#.1....C..2...#',
      '#B.....C.....T#',
      '#C.3...C...4.C#',
      '#......C......#',
      '#CCBCCC#CCCCCC#',
      '###############',
    ],
    crates: { d: 'dough', t: 'tomato', h: 'cheese', m: 'mushroom' },
    conditional: [{ x: 11, z: 1, minPlayers: 4 }],
    plateStyle: 'board',
    menu: [
      { recipeId: 'pizza_margherita', weight: 3 },
      { recipeId: 'caprese', weight: 1 },
      { recipeId: 'pizza_funghi', weight: 2, minPlayers: 3 },
    ],
    orders: { interval: 20, maxActive: 2, firstDelay: 3 },
    plates: 3,
    stars: [180, 360, 540],
    events: [
      { at: 70, type: 'breakdown', station: 'oven' },
      { at: 115, type: 'rush', duration: 25, factor: 0.6 },
      { at: 160, type: 'urgent', recipeId: 'pizza_margherita' },
      { at: 140, type: 'shortage', ing: 'cheese', duration: 15, minPlayers: 3 },
    ],
    hints: ['La cuina està dividida: feu servir el taulell central per passar-vos el menjar.'],
    newMechanic: 'Cuina dividida i coordinació',
  },
  {
    id: 'asian-1',
    order: 5,
    name: 'Marea alta',
    description: 'Bols d’arròs al Lluna de Bambú: olla, wok i molt de tall.',
    restaurant: 'asian',
    duration: 180,
    layout: [
      '###############',
      '#rfcsoCCWWCCDS#',
      '#.............#',
      '#.1...PPP..2..#',
      '#B....CCC....T#',
      '#B.3.......4..#',
      '#.............#',
      '#CCCCCBCCCCCCC#',
      '###############',
    ],
    crates: { r: 'rice', f: 'fish', c: 'cucumber', s: 'shrimp', o: 'onion' },
    conditional: [
      { x: 9, z: 1, minPlayers: 3 },
      { x: 8, z: 3, minPlayers: 4 },
    ],
    plateStyle: 'bowl',
    menu: [
      { recipeId: 'poke_bowl', weight: 2 },
      { recipeId: 'shrimp_bowl', weight: 2 },
      { recipeId: 'veggie_bowl', weight: 1, minPlayers: 3 },
    ],
    orders: { interval: 18, maxActive: 3, firstDelay: 2 },
    plates: 3,
    stars: [170, 340, 520],
    events: [
      { at: 80, type: 'shortage', ing: 'fish', duration: 15 },
      { at: 120, type: 'urgent', recipeId: 'shrimp_bowl' },
    ],
    hints: ['L’arròs es cou a l’olla; les gambes, al wok.', 'Si s’acaba un ingredient, espera que arribi la reposició.'],
    newMechanic: 'Olla, wok i escassetat d’ingredients',
  },
  {
    id: 'asian-2',
    order: 6,
    name: 'Nit de lluna',
    description: 'Dues cuines unides per un passadís estret. El servei més exigent de la ciutat.',
    restaurant: 'asian',
    duration: 220,
    layout: [
      '#################',
      '#rfcCPPC#CWWCsoS#',
      '#.......C.......#',
      '#.1.....C....2..#',
      '#B.............T#',
      '#B.3....C....4.D#',
      '#.......C.......#',
      '#CCCBCCC#CCCPCCC#',
      '#################',
    ],
    crates: { r: 'rice', f: 'fish', c: 'cucumber', s: 'shrimp', o: 'onion' },
    conditional: [{ x: 12, z: 7, minPlayers: 3 }],
    plateStyle: 'bowl',
    menu: [
      { recipeId: 'poke_bowl', weight: 2 },
      { recipeId: 'shrimp_bowl', weight: 2 },
      { recipeId: 'veggie_bowl', weight: 1 },
      { recipeId: 'deluxe_bowl', weight: 2, minPlayers: 3 },
    ],
    orders: { interval: 17, maxActive: 3, firstDelay: 2 },
    plates: 3,
    stars: [220, 440, 660],
    events: [
      { at: 50, type: 'rush', duration: 25, factor: 0.55 },
      { at: 95, type: 'breakdown', station: 'wok' },
      { at: 130, type: 'shortage', ing: 'shrimp', duration: 15 },
      { at: 160, type: 'urgent' },
      { at: 185, type: 'urgent', minPlayers: 3 },
    ],
    hints: ['El passadís central és estret: organitzeu qui va a cada costat.'],
    newMechanic: 'Dues cuines i passadís estret',
  },
];

export function getLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevelId(id: string): string | undefined {
  const l = getLevel(id);
  if (!l) return undefined;
  return LEVELS.find((x) => x.order === l.order + 1)?.id;
}

/** Levels unlocked given earned stars: first level always; next needs ≥1 star in previous. */
export function unlockedLevels(stars: Record<string, number>): string[] {
  const sorted = [...LEVELS].sort((a, b) => a.order - b.order);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i]!;
    if (i === 0 || (stars[sorted[i - 1]!.id] ?? 0) >= 1) out.push(l.id);
    else break;
  }
  return out;
}
