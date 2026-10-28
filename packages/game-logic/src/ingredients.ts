import type { IngredientDef, IngredientKind, IngState } from './types';

/** Processing times are in seconds. Central balance data for ingredients. */
export const INGREDIENTS: Record<IngredientKind, IngredientDef> = {
  bun: { id: 'bun', name: 'Pa de hamburguesa', emoji: '🍞', plateable: ['raw'] },
  patty: { id: 'patty', name: 'Hamburguesa', emoji: '🥩', cook: { on: 'grill', from: 'raw', time: 7, burnTime: 9 }, plateable: ['cooked'] },
  lettuce: { id: 'lettuce', name: 'Enciam', emoji: '🥬', chopTime: 2.2, plateable: ['chopped'] },
  tomato: { id: 'tomato', name: 'Tomàquet', emoji: '🍅', chopTime: 2.0, plateable: ['chopped'], topping: true },
  cheese: { id: 'cheese', name: 'Formatge', emoji: '🧀', chopTime: 1.6, plateable: ['chopped'], topping: true },
  onion: { id: 'onion', name: 'Ceba', emoji: '🧅', chopTime: 2.4, plateable: ['chopped'] },
  potato: { id: 'potato', name: 'Patata', emoji: '🥔', chopTime: 2.0, cook: { on: 'fryer', from: 'chopped', time: 6, burnTime: 8 }, plateable: ['cooked'] },
  dough: { id: 'dough', name: 'Massa de pizza', emoji: '🫓', cook: { on: 'oven', from: 'raw', time: 9, burnTime: 10 }, plateable: ['cooked'] },
  mushroom: { id: 'mushroom', name: 'Xampinyó', emoji: '🍄', chopTime: 1.8, plateable: ['chopped'], topping: true },
  rice: { id: 'rice', name: 'Arròs', emoji: '🍚', cook: { on: 'pot', from: 'raw', time: 8, burnTime: 11 }, plateable: ['cooked'] },
  fish: { id: 'fish', name: 'Peix', emoji: '🐟', chopTime: 2.6, plateable: ['chopped'] },
  cucumber: { id: 'cucumber', name: 'Cogombre', emoji: '🥒', chopTime: 1.8, plateable: ['chopped'] },
  shrimp: { id: 'shrimp', name: 'Gambes', emoji: '🦐', cook: { on: 'wok', from: 'raw', time: 5, burnTime: 7 }, plateable: ['cooked'] },
};

export const STATE_LABEL_CA: Record<IngState, string> = {
  raw: 'cru',
  chopped: 'tallat',
  cooked: 'cuit',
  burnt: 'cremat',
};

export function canChop(ing: IngredientKind, st: IngState): boolean {
  return st === 'raw' && INGREDIENTS[ing].chopTime !== undefined;
}

export function isPlateable(ing: IngredientKind, st: IngState): boolean {
  return INGREDIENTS[ing].plateable.includes(st);
}

export function ingredientLabel(ing: IngredientKind, st: IngState): string {
  const def = INGREDIENTS[ing];
  if (ing === 'dough' && st === 'cooked') return 'Pizza cuita';
  if (ing === 'dough' && st === 'raw') return 'Pizza crua';
  if (ing === 'potato' && st === 'cooked') return 'Patates fregides';
  if (ing === 'bun') return def.name;
  return `${def.name} ${STATE_LABEL_CA[st]}`;
}
