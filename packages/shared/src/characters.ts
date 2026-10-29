/**
 * Original chef cast. Visual parameters drive the procedural character builder on the
 * host screen, so each chef has its own silhouette (body shape, hat, hair, accessory),
 * not just a different colour.
 */

export type HatStyle = 'toque' | 'beret' | 'bandana' | 'mushroom' | 'cap' | 'hijab' | 'none';
export type HairStyle = 'short' | 'buns' | 'ponytail' | 'bald' | 'curly' | 'mohawk' | 'afro' | 'braid' | 'long';
export type Accessory = 'none' | 'beard' | 'mustache' | 'glasses' | 'scarf' | 'earring';

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  /** Home town shown in the chef picker (flavour only, never affects gameplay). */
  from: string;
  /** Used for art direction and balance of the cast (docs/ASSETS.md). */
  gender: 'f' | 'm';
  /** Jacket / main colour */
  primary: string;
  /** Apron / secondary colour (also the hijab / bandana colour) */
  secondary: string;
  skin: string;
  /** Hair colour; for a covered head (hijab) this is the headscarf colour. */
  hair: string;
  hat: HatStyle;
  hairStyle: HairStyle;
  accessory: Accessory;
  /** Small eyelash strokes (readability cue at TV distance). */
  lashes: boolean;
  /** Body proportions: width and height multipliers (silhouette variety). */
  bodyW: number;
  bodyH: number;
  headScale: number;
}

/**
 * Cast of 10 (4 men, 6 women) from different origins, with skin tones spanning very light to very
 * dark and distinct silhouettes. Ordered alternating so the picker never groups by gender.
 */
export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'nuri', name: 'Nuri', gender: 'm', from: 'Esmirna', tagline: 'Talla més ràpid que la seva ombra', primary: '#f4f1ea', secondary: '#e2553f', skin: '#c99a72', hair: '#1c1412', hat: 'toque', hairStyle: 'short', accessory: 'earring', lashes: false, bodyW: 1.0, bodyH: 1.0, headScale: 1.0 },
  { id: 'amara', name: 'Amara', gender: 'f', from: 'Lagos', tagline: 'Dirigeix la cuina com una orquestra', primary: '#f08a24', secondary: '#1e5f74', skin: '#5b3622', hair: '#1a1210', hat: 'none', hairStyle: 'afro', accessory: 'earring', lashes: true, bodyW: 1.04, bodyH: 1.02, headScale: 1.0 },
  { id: 'bru', name: 'Bru', gender: 'm', from: 'Barcelona', tagline: 'Barba de llenyataire, cor de pastisser', primary: '#2f5d8a', secondary: '#f2e3c6', skin: '#6b4128', hair: '#16100c', hat: 'beret', hairStyle: 'curly', accessory: 'beard', lashes: false, bodyW: 1.22, bodyH: 0.95, headScale: 1.05 },
  { id: 'mei', name: 'Mei', gender: 'f', from: 'Chengdu', tagline: 'Precisió de cirurgiana amb el wok', primary: '#1f8a8a', secondary: '#f6efe2', skin: '#efc9a4', hair: '#2b1b14', hat: 'cap', hairStyle: 'ponytail', accessory: 'scarf', lashes: true, bodyW: 0.95, bodyH: 1.06, headScale: 0.98 },
  { id: 'kai', name: 'Kai', gender: 'm', from: 'Apia', tagline: 'Mai deixa cremar res', primary: '#3f8f5a', secondary: '#20242b', skin: '#9a6440', hair: '#14110f', hat: 'bandana', hairStyle: 'mohawk', accessory: 'none', lashes: false, bodyW: 0.86, bodyH: 1.12, headScale: 0.95 },
  { id: 'priya', name: 'Priya', gender: 'f', from: 'Bangalore', tagline: 'Mai oblida cap comanda', primary: '#c2185b', secondary: '#f6e7c8', skin: '#a9744e', hair: '#1b1310', hat: 'none', hairStyle: 'braid', accessory: 'none', lashes: true, bodyW: 0.9, bodyH: 1.08, headScale: 0.98 },
  { id: 'rocco', name: 'Rocco', gender: 'm', from: 'Nàpols', tagline: 'El bigoti més famós del barri', primary: '#e9b22f', secondary: '#7a2e1f', skin: '#e8b48c', hair: '#2a2a2a', hat: 'mushroom', hairStyle: 'bald', accessory: 'mustache', lashes: false, bodyW: 1.12, bodyH: 1.04, headScale: 1.0 },
  { id: 'ximena', name: 'Ximena', gender: 'f', from: 'Oaxaca', tagline: 'Té un sisè sentit per al punt de cocció', primary: '#e76f51', secondary: '#264653', skin: '#c48a5e', hair: '#2a1712', hat: 'toque', hairStyle: 'long', accessory: 'none', lashes: true, bodyW: 0.98, bodyH: 0.98, headScale: 1.02 },
  { id: 'lua', name: 'Lua', gender: 'f', from: 'Girona', tagline: 'Petita, ràpida i sempre amb pressa', primary: '#7b4fb3', secondary: '#ffd166', skin: '#f6d2b8', hair: '#e86a92', hat: 'none', hairStyle: 'buns', accessory: 'glasses', lashes: true, bodyW: 0.92, bodyH: 0.84, headScale: 1.12 },
  { id: 'leila', name: 'Leila', gender: 'f', from: 'Marràqueix', tagline: 'Calma absoluta en plena hora punta', primary: '#3d5a80', secondary: '#ee6c4d', skin: '#c8956a', hair: '#2a9d8f', hat: 'hijab', hairStyle: 'short', accessory: 'none', lashes: true, bodyW: 1.0, bodyH: 1.04, headScale: 1.0 },
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
