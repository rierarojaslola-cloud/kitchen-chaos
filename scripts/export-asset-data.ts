/** Writes game data that the Blender scripts need (single source of truth: TypeScript). */
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS } from '../packages/shared/src/characters';

const out = path.resolve('assets-src/blender/data');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'characters.json'), JSON.stringify(CHARACTERS, null, 2));
console.log(`wrote ${CHARACTERS.length} characters → ${path.relative(process.cwd(), out)}/characters.json`);
