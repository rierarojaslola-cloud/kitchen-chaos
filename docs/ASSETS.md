# Asset inventory

**Status legend:** `pendent` · `en producció` · `implementat` · `verificat` (seen in automated
screenshots / tests) · `substituït`.
**Quality legend:** `B` = modelled in **Blender** by script (assets-src/blender, GLB, licence-clean) ·
`P` = procedural Three.js geometry (licence-clean, PROVISIONAL; also used as automatic fallback) ·
`D` = definitive (hand-finished by an artist).
**Origin/licence for every `P` asset:** original code in this repository (project licence). No
third-party art or audio files are included. Fonts: Lilita One + Rubik (SIL OFL 1.1, via
@fontsource, self-hosted).

### Blender → GLB pipeline (since 2026-10-29)

`npm run assets:build` = export game data → `assets-src/blender/build_all.py` (Blender 5.2 via `bpy`
or `blender -b -P`) → `scripts/optimize-models.mjs` (gltf-transform meshopt + quantization, no
simplification) → `apps/web/public/models/*.glb` + `manifest.json` (committed; deploy needs no Blender).
Client: `render/assets.ts` preloads the manifest; any missing/failed model falls back to the procedural
builder. `?procedural=1` forces the old models (for comparison). Review renders: `docs/assets/*.png`
(`assets-src/blender/preview.py`, Cycles, game camera angle).

| Budget | Target | Actual |
|---|---|---|
| Character | ≤ 15k tris | 10.0k – 12.4k |
| Station | ≤ 8k tris | 1.1k – 2.8k |
| Download, all 16 models | — | 1.25 MB (meshopt) from 2.7 MB raw |

Remaining runtime-procedural (P): food items, plates, decor, textures, VFX, icons.

## Characters (`assets-src/blender/chefs.py` → `chef-<id>.glb`; fallback `render/models/chef.ts`)

| ID | Name | Function | Format | Variants | Materials | Animations | Status | Q | Priority |
|---|---|---|---|---|---|---|---|---|---|
| CHR-NURI | Nuri | playable chef | GLB (8-bone rig, 7 clips) | toque, short hair, earring | jacket, apron, skin, hair | idle breathe, blink, walk, carry, chop, repair, celebrate, sad | verificat | B | P1 |
| CHR-BRU | Bru | playable chef | GLB (8-bone rig, 7 clips) | beret, curly hair, beard, wide body | idem | idem | verificat | B | P1 |
| CHR-KAI | Kai | playable chef | GLB (8-bone rig, 7 clips) | bandana, mohawk, tall/slim | idem | idem | verificat | B | P1 |
| CHR-LUA | Lua | playable chef | GLB (8-bone rig, 7 clips) | twin buns, glasses, short | idem | idem | verificat | B | P1 |
| CHR-ROCCO | Rocco | playable chef | GLB (8-bone rig, 7 clips) | mushroom hat, mustache, bald | idem | idem | verificat | B | P1 |
| CHR-MEI | Mei | playable chef | GLB (8-bone rig, 7 clips) | cap, ponytail, scarf | idem | idem | verificat | B | P1 |
| CHR-PORTRAIT-* | portraits | lobby/phone UI | inline SVG | 1 per chef | flat | — | verificat | P | P2 |
| CHR-RING / BADGE | slot ring + J1–J4 badge | identity at distance (colour + number) | runtime mesh / sprite | 4 slots | emissive | pulse, bob | verificat | P | P1 |

Rig: root, hips, spine, head, arm.L/R, leg.L/R; rigid parts parented to bones (no skin stretching).
Clips: Idle (2 s), Walk (0.67 s, speed-scaled), Carry, Chop, Repair, Celebrate, Sad; the client blends a
body layer and an arm layer (walk while carrying/chopping). Blink and sad mouth driven by named nodes.
Pending: weighted skinning + facial shape keys, foot IK, cosmetic unlockables, entrance animation,
hand-finished sculpt/texture pass (D).

## Ingredients (`models/food.ts`, icons in `common/icons.ts`)

| ID | Ingredient | States modelled | Used in | Status | Q |
|---|---|---|---|---|---|
| ING-BUN | pa | whole, burger stack top/bottom | burger-1/2 | verificat | P |
| ING-PATTY | carn | raw→cooked→burnt (continuous colour) | burger | verificat | P |
| ING-LETTUCE | enciam | whole, chopped, burger layer | burger-2 | implementat | P |
| ING-TOMATO | tomàquet | whole, slices, burger layer, pizza sauce | burger-2, pizza | implementat | P |
| ING-CHEESE | formatge | wedge, slices, burger layer, pizza blobs | burger, pizza | implementat | P |
| ING-ONION | ceba | whole, rings | asian | implementat | P |
| ING-POTATO | patata | whole, sticks raw→fries→burnt | burger-2 | implementat | P |
| ING-DOUGH | massa | raw base + toppings → baked crust → burnt | pizza | implementat | P |
| ING-MUSHROOM | xampinyó | whole, slices, pizza topping | pizza-2 | implementat | P |
| ING-RICE | arròs | sack (raw), cooked mound → burnt | asian | implementat | P |
| ING-FISH | peix | whole fish, sashimi slices | asian | implementat | P |
| ING-CUCUMBER | cogombre | whole, slices | asian | implementat | P |
| ING-SHRIMP | gambes | raw grey → cooked orange → burnt | asian | implementat | P |

Pending from the brief's list: pebrots, pastanagues, blat de moro, carn vegetal, ous, farina, salses en
ampolla, espècies, fruita, xocolata, nata, gelats, decoració de postres (needed when a dessert
restaurant/recipes are added — not used by current recipes, so not modelled to avoid useless variants).

## Utensils / plates

| ID | Asset | Function | Status | Q |
|---|---|---|---|---|
| UTL-PLATE | plat ceràmic amb filet | burger plating | verificat | P |
| UTL-BOARD | taula de pizza amb mànec | pizza plating | implementat | P |
| UTL-BOWL | bol amb banda | asian plating | implementat | P |
| UTL-KNIFE | ganivet (taula de tallar) | animated while chopping | implementat | P |
| UTL-POT / WOK / BASKET / PANS | olla, wok, cistella fregidora, paelles decoratives | station parts | implementat | P |
| UTL-BELL | campana de servei | rings on serve | implementat | P |
Pending: espàtules, pinces, cullerots, batedors, gots, ampolles de salsa, caixes de transport, safates.

## Stations (`assets-src/blender/stations.py` → `station-<type>.glb`; fallback `models/stations.ts`)

Shared base cabinet: framed doors with inset panels, metal bar handles, recessed kick plate, overhanging
bevelled worktop. Restaurant colours applied at runtime by swapping `Theme_Body/Top/Trim` materials.
All 10 station types below are **B / verificat** (Cycles review renders + in-game screenshots of the 6
levels); the plate stack and crate food remain P.

| ID | Station | Interactive parts / state indicators | Animation / VFX | Status | Q |
|---|---|---|---|---|---|
| STN-COUNTER | taulell | holds 1 item | — | verificat | P |
| STN-CRATE | caixa d'ingredient | 5 sample ingredients, emoji sign, "BUIT" sign when shortage | toggle | verificat | P |
| STN-BOARD | taula de tallar | progress bar, knife | knife chop, bits particles | implementat | P |
| STN-GRILL | planxa | glowing ridges, progress + burn bar, "!" | heat glow, steam, smoke | verificat | P |
| STN-FRYER | fregidora | oil shimmer, basket | basket dip, steam | implementat | P |
| STN-POT | olla d'arròs | blue flame ring, water | boil wobble, steam | implementat | P |
| STN-OVEN | forn de pedra | fire mouth intensity | flicker, broken dim | implementat | P |
| STN-WOK | wok | flame cones | pan toss, flame particles | implementat | P |
| STN-PLATES | pila de plats | stack count (≤8 visible) | rebuild on change | verificat | P |
| STN-SERVE | taulell de servei | heat lamps, bell | bell ring, confetti | verificat | P |
| STN-TRASH | paperera | pedal lid | lid pop, puff | implementat | P |
| IND-BAR / WARN / WRENCH | progress bar, "!" burn warning, 🔧 broken | billboards | pulse | implementat | P |
Pending: neveres, congeladors, piques/rentaplats (dish-washing mechanic), batedores, estació d'emplatat dedicada.

## Environments (`render/themes.ts`, `render/decor.ts`, `render/textures.ts`)

| ID | Restaurant | Palette / materials | Lighting | Decor | Status | Q |
|---|---|---|---|---|---|---|
| ENV-BURGER | La Brasa Neó | warm-grey checker floor, subway tiles, steel tops, red cabinets | cool key, pink+cyan neons, LED bar | neon sign, hoods, red strip, clock | verificat | P |
| ENV-PIZZA | Forn Pedra Viva | terracotta hex floor, stone walls, stone tops, wood cabinets | warm amber key | arched daylight windows, copper pans, jar shelf, olive pots, painted sign | verificat (screenshot) | P |
| ENV-ASIAN | Lluna de Bambú | dark wood floor, teal tiles, wood tops, teal cabinets | dusk teal key, lantern glow | moon window + branches, paper lanterns, bamboo, red sign | verificat (screenshot) | P |
Textures: TEX-TILE (square/hex/subway), TEX-WOOD, TEX-STEEL, TEX-STONE, TEX-BLOB, TEX-LABEL — canvas
generated 256–512 px, cached, sRGB. No normal/roughness maps yet (pending PBR pass).

## VFX (`render/particles.ts`)

steam, smoke, spark, chop bits, confetti, star, puff, flame — pooled point sprites, 2 draw calls,
budget 400/900/1600 by quality; halved in reduced-motion. Status: implementat. Q: P.
Pending: liquid splashes, dough stretch, conveyor, door/drawer animations.

## UI / brand (`styles/*.css`, `common/icons.ts`)

| ID | Asset | Status | Q |
|---|---|---|---|
| BRD-WORDMARK | "Kitchen Chaos" two-tone wordmark + "Service Rush" ticket ribbon (CSS, swappable text) | verificat | P |
| BRD-ICON | app icon SVG (`public/icon.svg`) | implementat | P |
| BRD-PALETTE | tile blue / ticket paper / tomato / mustard / basil (tokens.css) | implementat | D candidate |
| UI-TICKET | torn-paper order ticket with timer bar, urgent variant | verificat | P |
| UI-TIMER | conic kitchen-timer dial | verificat | P |
| ICO-ING-* | 13 ingredient icons + chopped/cooked badges | implementat | P |
| ICO-UI-* | star, hand, knife, pause, wifi, sound, plate | implementat | P |
| SCR-* | title, lobby + QR, countdown, HUD, pause, results, options, credits, errors, reconnect; phone join/chef/lobby/pad/pause/results | verificat (screenshots) | P |

## Audio (`audio/audio.ts`) — procedural Web Audio

| ID | Asset | Status | Q |
|---|---|---|---|
| MUS-MENU / BURGER / PIZZA / ASIAN | step-sequencer loops with per-restaurant scale/tempo/swing; intensity 0–2 | implementat (not listened to by a human yet) | P |
| SFX-* | ui, join/leave, pickup, place, chop, chopDone, cookDone, sizzle, burnWarn, burnt, served, wrong, invalid, trash, orderNew, orderExpired, alarm, repair, tick, go, win, lose — with pitch variation and burst de-dup | implementat (not listened to by a human yet) | P |

## Production priorities (next art pass)

1. CHR-* skinned GLB characters (Blender), keep `ChefRig` interface.
2. STN-GRILL/OVEN/WOK/POT hero props as GLB with ORM maps.
3. Food hero items (burger stack, pizza, bowls) as GLB.
4. PBR normal/roughness maps for floor/wall/counter textures.
5. Human sound-design/music pass.

## Change log
- 2026-10-29: Blender pipeline; 6 chefs + 10 stations moved from P to B (GLB). Fixed in review: apron
  intersecting belly, scalp poking through hair, hair through cap, oven fire hidden, emissive materials
  exported black.
