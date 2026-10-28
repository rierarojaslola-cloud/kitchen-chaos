import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants';

/** Normalises user input: uppercase, strips spaces, maps look-alikes (0→O is not in alphabet, so reject). */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Generates a code using the provided random source (crypto-backed on the server). */
export function generateRoomCode(randomInt: (maxExclusive: number) => number): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return out;
}
