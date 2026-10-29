/**
 * Original flat SVG icon family (64×64 grid, 3px ink outline, two-tone fills) for
 * ingredients, processing states and UI glyphs. Identical on TV and phones.
 */
import type { IngredientKind, IngState } from '@kc/game-logic';
import type { CharacterDef } from '@kc/shared';

const INK = '#2a1d17';
const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const ING: Record<IngredientKind, string> = {
  bun: `<path d="M8 34a24 18 0 0 1 48 0z" fill="#e3a24f" ${o}/><rect x="8" y="38" width="48" height="10" rx="5" fill="#d38b3c" ${o}/><g fill="#fff3d6"><ellipse cx="24" cy="25" rx="2.5" ry="1.4"/><ellipse cx="34" cy="21" rx="2.5" ry="1.4"/><ellipse cx="42" cy="27" rx="2.5" ry="1.4"/></g>`,
  patty: `<ellipse cx="32" cy="36" rx="24" ry="12" fill="#8a4a2b" ${o}/><path d="M16 34q8 4 16 0t16 0" fill="none" stroke="#5c2d18" stroke-width="3" stroke-linecap="round"/>`,
  lettuce: `<path d="M32 10c10 0 22 8 22 22s-10 22-22 22S10 46 10 32 22 10 32 10z" fill="#6cc24a" ${o}/><path d="M32 18v32M32 30l-9-7M32 38l10-8" stroke="#3f8f2f" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  tomato: `<circle cx="32" cy="36" r="20" fill="#e8392c" ${o}/><path d="M24 16l8 6 8-6-3 8h-10z" fill="#3f7f2a" ${o}/><ellipse cx="24" cy="30" rx="4" ry="2.5" fill="#ff8a6a"/>`,
  cheese: `<path d="M8 44l40-24 8 8v16z" fill="#ffcd3c" ${o}/><path d="M8 44h48" ${o}/><circle cx="30" cy="38" r="3" fill="#e0a91f"/><circle cx="44" cy="34" r="2.5" fill="#e0a91f"/>`,
  onion: `<path d="M32 10c4 6 18 12 18 28a18 16 0 0 1-36 0c0-16 14-22 18-28z" fill="#b45a9a" ${o}/><path d="M32 22v26M24 30q8 14 0 18M40 30q-8 14 0 18" stroke="#f2d7ea" stroke-width="2.5" fill="none"/>`,
  potato: `<path d="M12 32c0-12 12-18 24-16s18 10 16 20-14 14-24 12-16-6-16-16z" fill="#c79a5a" ${o}/><g fill="#8a6a3a"><circle cx="26" cy="28" r="2"/><circle cx="38" cy="36" r="2"/><circle cx="30" cy="40" r="1.6"/></g>`,
  dough: `<ellipse cx="32" cy="38" rx="24" ry="12" fill="#f1dcb0" ${o}/><ellipse cx="32" cy="36" rx="16" ry="7" fill="#f7e8c8"/>`,
  mushroom: `<path d="M10 32a22 16 0 0 1 44 0z" fill="#8a6648" ${o}/><path d="M24 32h16l-2 18h-12z" fill="#d9c4a5" ${o}/><circle cx="26" cy="24" r="2.5" fill="#f1e2cc"/><circle cx="38" cy="22" r="2" fill="#f1e2cc"/>`,
  rice: `<path d="M12 30h40l-4 18a6 6 0 0 1-6 4H22a6 6 0 0 1-6-4z" fill="#3a7f7a" ${o}/><path d="M12 30c2-10 10-14 20-14s18 4 20 14z" fill="#f7f4ec" ${o}/>`,
  fish: `<path d="M8 32c8-12 28-14 40-2l8-8v20l-8-8C36 46 16 44 8 32z" fill="#7d97ad" ${o}/><circle cx="18" cy="30" r="2.5" fill="${INK}"/><path d="M14 36q12 6 30-2" stroke="#d5dde4" stroke-width="3" fill="none"/>`,
  cucumber: `<rect x="8" y="24" width="48" height="16" rx="8" fill="#3f8f3a" ${o}/><path d="M18 30h4M30 34h4M42 29h4" stroke="#8bd06a" stroke-width="3" stroke-linecap="round"/>`,
  shrimp: `<path d="M44 18c-14-4-28 6-28 20 0 8 6 12 12 10l4-6c-4 0-8-2-8-6 0-8 8-12 16-10z" fill="#ff7a4d" ${o}/><path d="M40 20l10-6M42 24l12-2" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><path d="M28 48l-6 6h12z" fill="#ff7a4d" ${o}/>`,
};

const STATE_BADGE: Partial<Record<IngState, string>> = {
  chopped: `<g transform="translate(40 40)"><circle cx="11" cy="11" r="11" fill="#fff4dc" stroke="${INK}" stroke-width="2.5"/><path d="M5 15l10-10 2 2-8 8z" fill="#c9d0d5" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`,
  cooked: `<g transform="translate(40 40)"><circle cx="11" cy="11" r="11" fill="#fff4dc" stroke="${INK}" stroke-width="2.5"/><path d="M11 4c4 5 6 7 6 10a6 6 0 0 1-12 0c0-3 3-4 3-7 1 2 2 3 3 3 0-2-1-4 0-6z" fill="#ff7a3d" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></g>`,
};

export function ingredientIcon(ing: IngredientKind, st?: IngState, size = 40): string {
  const badge = st ? STATE_BADGE[st] ?? '' : '';
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${ING[ing]}${badge}</svg>`;
}

export function pizzaIcon(toppings: IngredientKind[], size = 40): string {
  const dots = toppings.includes('mushroom') ? `<circle cx="22" cy="34" r="3.5" fill="#d9c4a5" stroke="${INK}" stroke-width="1.5"/><circle cx="40" cy="38" r="3.5" fill="#d9c4a5" stroke="${INK}" stroke-width="1.5"/>` : '';
  const cheese = toppings.includes('cheese') ? `<circle cx="30" cy="36" r="4" fill="#ffe48a"/><circle cx="38" cy="32" r="3" fill="#ffe48a"/><circle cx="26" cy="40" r="3" fill="#ffe48a"/>` : '';
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="36" rx="26" ry="16" fill="#d99a4e" stroke="${INK}" stroke-width="3"/><ellipse cx="32" cy="36" rx="20" ry="11" fill="#c9301f"/>${cheese}${dots}</svg>`;
}

export const UI_ICONS = {
  star: (filled: boolean, size = 28) =>
    `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l8 17 18 2-13 13 4 19-17-9-17 9 4-19L6 25l18-2z" fill="${filled ? '#ffc23d' : 'none'}" stroke="${filled ? INK : '#fff4dc'}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  hand: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 34V16a4 4 0 0 1 8 0v14-18a4 4 0 0 1 8 0v18-14a4 4 0 0 1 8 0v18-10a4 4 0 0 1 8 0v18c0 10-8 18-18 18h-2c-8 0-12-4-16-10l-8-12a4 4 0 0 1 6-6z" fill="#fff4dc" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  knife: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 48L42 14l8 8-28 28z" fill="#dfe6ea" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M42 14l6-6 8 8-6 6" fill="#2a1d17" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  pause: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="12" width="12" height="40" rx="4" fill="currentColor"/><rect x="36" y="12" width="12" height="40" rx="4" fill="currentColor"/></svg>`,
  wifi: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 26a34 34 0 0 1 48 0M16 34a22 22 0 0 1 32 0M24 42a10 10 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="50" r="4" fill="currentColor"/></svg>`,
  sound: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 26h10l14-12v36L20 38H10z" fill="currentColor"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  plate: `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="36" rx="26" ry="12" fill="#fbfbf7" stroke="${INK}" stroke-width="3"/><ellipse cx="32" cy="35" rx="16" ry="6" fill="none" stroke="#d63b2f" stroke-width="2"/></svg>`,
};

/** Front-facing chef portrait generated from the same CharacterDef as the 3D model. */
export function chefPortrait(c: CharacterDef, size = 96): string {
  const w = 30 * c.bodyW;
  const hairStyles: Record<string, string> = {
    short: `<path d="M30 40a20 18 0 0 1 40 0c-6-6-30-6-40 0z" fill="${c.hair}"/>`,
    curly: Array.from({ length: 9 }, (_, i) => `<circle cx="${32 + i * 4.5}" cy="${34 - Math.sin((i / 8) * Math.PI) * 8}" r="6" fill="${c.hair}"/>`).join(''),
    buns: `<path d="M30 40a20 18 0 0 1 40 0c-6-6-30-6-40 0z" fill="${c.hair}"/><circle cx="30" cy="28" r="8" fill="${c.hair}"/><circle cx="70" cy="28" r="8" fill="${c.hair}"/>`,
    ponytail: `<path d="M30 40a20 18 0 0 1 40 0c-6-6-30-6-40 0z" fill="${c.hair}"/><path d="M68 38q14 6 8 26" stroke="${c.hair}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    mohawk: `<path d="M44 20l6-10 6 10 0 10h-12z" fill="${c.hair}"/>`,
    bald: '',
  };
  const hats: Record<string, string> = {
    toque: `<rect x="36" y="22" width="28" height="10" rx="3" fill="#fbfaf6" stroke="${INK}" stroke-width="2.5"/><path d="M34 22c-8-2-6-14 4-12 2-8 22-8 24 0 10-2 12 10 4 12z" fill="#fbfaf6" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
    beret: `<ellipse cx="52" cy="28" rx="24" ry="8" fill="#27445f" stroke="${INK}" stroke-width="2.5" transform="rotate(-10 52 28)"/>`,
    bandana: `<path d="M30 36q20-10 40 0l-2 6q-18-8-36 0z" fill="#e2553f" stroke="${INK}" stroke-width="2.5"/>`,
    mushroom: `<path d="M24 34c0-18 52-18 52 0z" fill="#fbfaf6" stroke="${INK}" stroke-width="2.5"/>`,
    cap: `<path d="M30 36a20 16 0 0 1 40 0z" fill="${c.primary}" stroke="${INK}" stroke-width="2.5"/><path d="M50 36h24a3 3 0 0 1 0 5H50z" fill="#164f4f" stroke="${INK}" stroke-width="2.5"/>`,
    none: '',
  };
  const acc: Record<string, string> = {
    beard: `<path d="M34 52q16 22 32 0q-4 8-16 8t-16-8z" fill="${c.hair}"/>`,
    mustache: `<path d="M38 56q6-6 12 0q6-6 12 0q-6 4-12 0q-6 4-12 0z" fill="${c.hair}"/>`,
    glasses: `<circle cx="42" cy="47" r="6" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="58" cy="47" r="6" fill="none" stroke="${INK}" stroke-width="2.5"/><path d="M48 46h4" stroke="${INK}" stroke-width="2.5"/>`,
    scarf: `<rect x="34" y="66" width="32" height="7" rx="3" fill="#e2553f" stroke="${INK}" stroke-width="2"/>`,
    earring: `<circle cx="71" cy="54" r="2.5" fill="none" stroke="#ffd166" stroke-width="2"/>`,
    none: '',
  };
  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M${50 - w} 100v-14a${w} 16 0 0 1 ${w * 2} 0v14z" fill="${c.primary}" stroke="${INK}" stroke-width="2.5"/>
    <path d="M${50 - w * 0.55} 100v-16h${w * 1.1}v16z" fill="${c.secondary}" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="50" cy="48" r="${21 * c.headScale}" fill="${c.skin}" stroke="${INK}" stroke-width="2.5"/>
    ${hairStyles[c.hairStyle] ?? ''}
    <circle cx="42" cy="47" r="2.6" fill="${INK}"/><circle cx="58" cy="47" r="2.6" fill="${INK}"/>
    <ellipse cx="38" cy="54" rx="3.5" ry="2" fill="#ff8c8c" opacity=".6"/><ellipse cx="62" cy="54" rx="3.5" ry="2" fill="#ff8c8c" opacity=".6"/>
    <path d="M44 57q6 5 12 0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    ${acc[c.accessory] ?? ''}
    ${hats[c.hat] ?? ''}
  </svg>`;
}
