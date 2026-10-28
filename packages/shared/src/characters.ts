/**
 * Original chef cast. Visual parameters drive the procedural character builder on the
 * host screen, so each chef has its own silhouette (body shape, hat, hair, accessory),
 * not just a different colour.
 */

export type HatStyle = 'toque' | 'beret' | 'bandana' | 'mushroom' | 'cap' | 'none';
export type HairStyle = 'short' | 'buns' | 'ponytail' | 'bald' | 'curly' | 'mohawk';
export type Accessory = 'none' | 'beard' | 'mustache' | 'glasses' | 'scarf' | 'earring';

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  /** Jacket / main colour */
  primary: string;
  /** Apron / secondary colour */
  secondary: string;
  skin: string;
  hair: string;
  hat: HatStyle;
  hairStyle: HairStyle;
  accessory: Accessory;
  /** Body proportions: width and height multipliers (silhouette variety). */
  bodyW: number;
  bodyH: number;
  headScale: number;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'nuri', name: 'Nuri', tagline: 'Talla més ràpid que la seva ombra', primary: '#f4f1ea', secondary: '#e2553f', skin: '#f1c7a1', hair: '#3b2418', hat: 'toque', hairStyle: 'short', accessory: 'earring', bodyW: 1.0, bodyH: 1.0, headScale: 1.0 },
  { id: 'bru', name: 'Bru', tagline: 'Barba de llenyataire, cor de pastisser', primary: '#2f5d8a', secondary: '#f2e3c6', skin: '#d9a07a', hair: '#7a3b1e', hat: 'beret', hairStyle: 'curly', accessory: 'beard', bodyW: 1.22, bodyH: 0.95, headScale: 1.05 },
  { id: 'kai', name: 'Kai', tagline: 'Mai deixa cremar res', primary: '#3f8f5a', secondary: '#20242b', skin: '#a8714f', hair: '#14110f', hat: 'bandana', hairStyle: 'mohawk', accessory: 'none', bodyW: 0.86, bodyH: 1.12, headScale: 0.95 },
  { id: 'lua', name: 'Lua', tagline: 'Petita, ràpida i sempre amb pressa', primary: '#7b4fb3', secondary: '#ffd166', skin: '#f6d2b8', hair: '#e86a92', hat: 'none', hairStyle: 'buns', accessory: 'glasses', bodyW: 0.92, bodyH: 0.84, headScale: 1.12 },
  { id: 'rocco', name: 'Rocco', tagline: 'El bigoti més famós del barri', primary: '#e9b22f', secondary: '#7a2e1f', skin: '#e8b48c', hair: '#2a2a2a', hat: 'mushroom', hairStyle: 'bald', accessory: 'mustache', bodyW: 1.12, bodyH: 1.04, headScale: 1.0 },
  { id: 'mei', name: 'Mei', tagline: 'Precisió de cirurgiana amb el wok', primary: '#1f8a8a', secondary: '#f6efe2', skin: '#efc9a4', hair: '#2b1b14', hat: 'cap', hairStyle: 'ponytail', accessory: 'scarf', bodyW: 0.95, bodyH: 1.06, headScale: 0.98 },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}

/** Slot colours + labels: identity is never conveyed by colour alone (number badge too). */
export const SLOT_COLORS = ['#ff5a4e', '#3fa7ff', '#5fd068', '#ffc93c'] as const;
export const SLOT_LABELS = ['J1', 'J2', 'J3', 'J4'] as const;

const NAME_A = ['Xef', 'Cuiner', 'Mestre', 'Pinche', 'Rei', 'Reina'];
const NAME_B = ['Salsa', 'Pebre', 'Fogó', 'Crispeta', 'Brou', 'Galeta', 'Ceba', 'Panses'];

export function randomChefName(rand: () => number = Math.random): string {
  const a = NAME_A[Math.floor(rand() * NAME_A.length)]!;
  const b = NAME_B[Math.floor(rand() * NAME_B.length)]!;
  return `${a} ${b}`;
}
