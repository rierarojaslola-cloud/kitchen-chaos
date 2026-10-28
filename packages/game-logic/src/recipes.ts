import type { IngredientItem, RecipeDef, RecipePart } from './types';

export const RECIPES: Record<string, RecipeDef> = {
  // ── La Brasa Neó (burger) ──
  burger_classic: {
    id: 'burger_classic', name: 'Hamburguesa clàssica', difficulty: 1, points: 40, time: 70,
    parts: [{ ing: 'bun', st: 'raw' }, { ing: 'patty', st: 'cooked' }],
  },
  cheeseburger: {
    id: 'cheeseburger', name: 'Hamburguesa amb formatge', difficulty: 2, points: 55, time: 80,
    parts: [{ ing: 'bun', st: 'raw' }, { ing: 'patty', st: 'cooked' }, { ing: 'cheese', st: 'chopped' }],
  },
  burger_deluxe: {
    id: 'burger_deluxe', name: 'Hamburguesa completa', difficulty: 3, points: 75, time: 95,
    parts: [{ ing: 'bun', st: 'raw' }, { ing: 'patty', st: 'cooked' }, { ing: 'lettuce', st: 'chopped' }, { ing: 'tomato', st: 'chopped' }],
  },
  fries: {
    id: 'fries', name: 'Patates fregides', difficulty: 1, points: 35, time: 60,
    parts: [{ ing: 'potato', st: 'cooked' }],
  },
  salad: {
    id: 'salad', name: 'Amanida fresca', difficulty: 1, points: 35, time: 60,
    parts: [{ ing: 'lettuce', st: 'chopped' }, { ing: 'tomato', st: 'chopped' }],
  },
  // ── Forn Pedra Viva (pizza) ──
  pizza_margherita: {
    id: 'pizza_margherita', name: 'Pizza margarida', difficulty: 2, points: 65, time: 95,
    parts: [{ ing: 'dough', st: 'cooked', toppings: ['tomato', 'cheese'] }],
  },
  pizza_funghi: {
    id: 'pizza_funghi', name: 'Pizza de bolets', difficulty: 3, points: 85, time: 110,
    parts: [{ ing: 'dough', st: 'cooked', toppings: ['tomato', 'cheese', 'mushroom'] }],
  },
  caprese: {
    id: 'caprese', name: 'Amanida caprese', difficulty: 1, points: 35, time: 60,
    parts: [{ ing: 'tomato', st: 'chopped' }, { ing: 'cheese', st: 'chopped' }],
  },
  // ── Lluna de Bambú (asian) ──
  poke_bowl: {
    id: 'poke_bowl', name: 'Bol de peix', difficulty: 2, points: 60, time: 85,
    parts: [{ ing: 'rice', st: 'cooked' }, { ing: 'fish', st: 'chopped' }, { ing: 'cucumber', st: 'chopped' }],
  },
  shrimp_bowl: {
    id: 'shrimp_bowl', name: 'Bol de gambes', difficulty: 2, points: 60, time: 85,
    parts: [{ ing: 'rice', st: 'cooked' }, { ing: 'shrimp', st: 'cooked' }],
  },
  veggie_bowl: {
    id: 'veggie_bowl', name: 'Bol de verdures', difficulty: 2, points: 55, time: 80,
    parts: [{ ing: 'rice', st: 'cooked' }, { ing: 'cucumber', st: 'chopped' }, { ing: 'onion', st: 'chopped' }],
  },
  deluxe_bowl: {
    id: 'deluxe_bowl', name: 'Bol de la lluna', difficulty: 3, points: 90, time: 110,
    parts: [{ ing: 'rice', st: 'cooked' }, { ing: 'shrimp', st: 'cooked' }, { ing: 'fish', st: 'chopped' }, { ing: 'onion', st: 'chopped' }],
  },
};

export const MAX_PLATE_ITEMS = 4;

function partKey(p: { ing: string; st: string; toppings?: readonly string[] }): string {
  const tops = p.toppings && p.toppings.length ? `[${[...p.toppings].sort().join(',')}]` : '';
  return `${p.ing}:${p.st}${tops}`;
}

function toCounts(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function itemKey(i: IngredientItem): string {
  return partKey({ ing: i.ing, st: i.st, toppings: i.toppings });
}

/** True if the plate contents exactly match the recipe (as multisets). */
export function matchesRecipe(contents: IngredientItem[], recipe: RecipeDef): boolean {
  if (contents.length !== recipe.parts.length) return false;
  const a = toCounts(contents.map(itemKey));
  const b = toCounts(recipe.parts.map(partKey));
  if (a.size !== b.size) return false;
  for (const [k, n] of a) if (b.get(k) !== n) return false;
  return true;
}

/**
 * True if `contents` could still become one of the given recipes (sub-multiset check).
 * Used to refuse plating things no recipe on the menu needs.
 */
export function isPartialOfAny(contents: IngredientItem[], recipes: RecipeDef[]): boolean {
  const have = toCounts(contents.map(itemKey));
  return recipes.some((r) => {
    if (contents.length > r.parts.length) return false;
    const need = toCounts(r.parts.map(partKey));
    for (const [k, n] of have) if ((need.get(k) ?? 0) < n) return false;
    return true;
  });
}

/** Toppings a raw dough may still receive given the menu (keeps pizzas buildable). */
export function canAddTopping(current: string[], topping: string, recipes: RecipeDef[]): boolean {
  const next = [...current, topping];
  return recipes.some((r) =>
    r.parts.some((p) => {
      if (p.ing !== 'dough' || !p.toppings) return false;
      const need = toCounts(p.toppings);
      const have = toCounts(next);
      for (const [k, n] of have) if ((need.get(k) ?? 0) < n) return false;
      return true;
    }),
  );
}

export function recipeIngredients(r: RecipeDef): RecipePart[] {
  return r.parts;
}
