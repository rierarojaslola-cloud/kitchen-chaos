# Kitchen Chaos: Service Rush *(nom provisional)*

Joc web cooperatiu de cuina 3D per a **2 a 4 jugadors**. La partida es veu en una pantalla gran
(ordinador, televisió o projector, en un navegador) i **cada jugador fa servir el seu mòbil com a
comandament**: escaneja el QR, tria un xef i a cuinar.

- 3 restaurants originals (La Brasa Neó, Forn Pedra Viva, Lluna de Bambú), 6 nivells amb mecàniques
  noves progressives, 12 receptes, 13 ingredients amb estats visuals.
- Servidor autoritatiu en temps real (WebSocket), sales amb codi i QR, reconnexió amb testimoni de sessió.
- Adaptació real a 2, 3 i 4 jugadors (ritme, paciència, objectius, receptes i estacions extra).
- Càmera ortogràfica quasi isomètrica, il·luminació amb ombres, partícules, música i efectes sintetitzats.

> Estat real de cada funcionalitat (implementat / provat / provisional / pendent): **[docs/STATUS.md](docs/STATUS.md)**.

---

## Requisits

- **Node.js ≥ 20** (provat amb 22.23) i npm ≥ 10.
- Navegador modern amb **WebGL 2** per a la pantalla gran (Chrome, Edge, Firefox, Safari 16+).
- Mòbils: qualsevol navegador modern (no cal instal·lar res).
- Ordinador i mòbils a la **mateixa xarxa** (o un desplegament públic amb HTTPS).

## Instal·lació

```bash
npm install
```

## Jugar a casa (xarxa local) — la manera més ràpida

```bash
npm run build      # comprova tipus i compila el client web a apps/web/dist
npm start          # servidor de joc + client al port 3000 (funciona a Windows, Mac i Linux)
```

La consola mostra les adreces LAN, per exemple `LAN: http://192.168.1.40:3000`.

1. A l'ordinador connectat a la tele, obre **l'adreça LAN** (no `localhost`) i prem **Crear partida**.
2. Cada jugador escaneja el **QR** o obre `http://192.168.1.40:3000/controller.html` i escriu el codi.
3. Quan hi hagi 2 o més jugadors, comença des de la pantalla gran o des del mòbil del J1.

> ⚠️ `localhost` al mòbil és el propi mòbil, no l'ordinador. Si obres la pantalla gran amb
> `localhost`, el joc intenta posar al QR la IP de l'ordinador (via `/api/info`); si no en troba,
> mostra un avís. Si la xarxa aïlla clients (Wi-Fi de convidats, alguns routers), els mòbils no hi
> podran accedir: fes servir una xarxa domèstica normal o un desplegament públic.

## Desenvolupament

```bash
npm run dev        # servidor (tsx watch, port 3000) + Vite (port 5173, accessible a la LAN)
```

Obre `http://<IP-de-l'ordinador>:5173` a la pantalla gran. Vite fa de proxy de `/ws` i `/api` cap al
servidor.

## Proves

```bash
npm run typecheck  # TypeScript estricte a tot el monorepo
npm test           # Vitest: unitàries (lògica, protocol, validació) + integració (WebSockets reals)
npm run build && npm run test:e2e   # navegador real: 1 pantalla + 4-5 mòbils emulats
```

La prova E2E necessita un Chromium. Fa servir `CHROME_PATH` si existeix; si no, el paquet
`@sparticuz/chromium` (inclòs a devDependencies). Genera captures i `report.json` a
`.e2e-artifacts/`. Detalls i darrers resultats: [docs/TESTING.md](docs/TESTING.md).

## Variables d'entorn (servidor)

| Variable | Per defecte | Descripció |
|---|---|---|
| `PORT` | `3000` | Port HTTP + WebSocket |
| `HOST` | `0.0.0.0` | Interfície d'escolta |
| `PUBLIC_URL` | — | URL pública per als QR (p. ex. `https://cuina.exemple.cat`) |
| `MAX_ROOMS` | `300` | Sales simultànies màximes |
| `STATIC_DIR` | `apps/web/dist` | Client compilat |
| `SERVE_STATIC` | auto | `1` per servir el client fora de `NODE_ENV=production` |
| `ALLOWED_ORIGINS` | — | Llista d'orígens (host:port) permesos per a WebSocket, separats per comes |

No hi ha cap secret ni credencial: no cal `.env`.

## Publicar a internet amb Render (recomanat per a jugadors)

El repositori inclou `render.yaml`. A Render: **New → Blueprint**, tria el repositori de GitHub i
confirma. Render executa `npm ci --include=dev && npm run build` i `npm start`, i dona una adreça
`https://….onrender.com` amb HTTPS. No cal configurar `PUBLIC_URL`: el QR fa servir l'adreça amb què
s'obre la pantalla gran. Pla gratuït: el servei s'adorm després de 15 minuts sense trànsit i tarda
~1 minut a despertar; les sales es perden si el servei es reinicia.

També hi ha un `Dockerfile` genèric per a altres plataformes (Fly.io, Koyeb, Railway).

## Desplegament (HTTPS)

El servidor és un únic procés Node que serveix el client i el WebSocket al mateix port.

1. `npm ci && npm run build`
2. `PORT=3000 PUBLIC_URL=https://el-teu-domini npm start` (a Windows: `$env:PORT=3000; npm start`)
3. Posa-hi davant un proxy amb TLS (Caddy, Nginx, Traefik) o una plataforma que en doni
   (Render, Fly.io, Railway…). Requisits: **WebSocket upgrade a `/ws`**, timeouts d'inactivitat
   ≥ 60 s (el servidor fa ping cada 10 s), i **una sola instància** (les sales viuen a memòria; per
   escalar horitzontalment cal enrutament fix per codi de sala).

Exemple de Caddyfile:
```
cuina.exemple.cat {
  reverse_proxy localhost:3000
}
```

Sota `https://`, els clients fan servir `wss://` automàticament. Els QR apunten a `PUBLIC_URL`.

## Com es juga

- **Joystick** (esquerra): caminar. Un toc curt gira el xef sense moure'l.
- **Botó groc** (dreta): agafar / deixar / combinar / servir. L'etiqueta diu exactament què farà.
- **Botó verd** (mantenir premut): tallar a la taula, reparar màquines espatllades.
- Les comandes pengen a dalt de la pantalla. Munta el plat i porta'l al taulell de servei.
- Bonus: propina per rapidesa i **bonus d'equip** si el plat l'han tocat 2 o més xefs.
- Orientació recomanada del mòbil: **horitzontal** (dos polzes). En vertical també funciona.

## Models 3D (Blender)

Els xefs i les estacions es generen amb scripts de Blender i es guarden ja compilats a
`apps/web/public/models`, així que **per jugar o publicar no cal Blender**. Per regenerar-los:

```bash
pip install bpy          # Blender 5.x com a mòdul de Python (o fes servir el binari de Blender)
npm run assets:build     # dades → Blender → GLB → compressió meshopt
```

Amb `?procedural=1` a l'adreça de la pantalla gran es fan servir els models antics (per comparar).

## Estructura

```
apps/server        servidor Node (HTTP + ws), sales, bucle autoritatiu
apps/web           client: index.html (pantalla gran), controller.html (mòbil)
packages/shared    protocol, validació, constants, personatges, màquina d'estats
packages/game-logic simulació pura: ingredients, receptes, nivells, equilibri, puntuació
tests/             unit, integration, e2e
assets-src/blender scripts de modelatge (xefs, estacions), previsualització
docs/              arquitectura, decisions, protocol, seguretat, estat, assets, tasques, proves
```

## Errors habituals

| Símptoma | Causa / solució |
|---|---|
| El mòbil no obre la pàgina | Mateixa xarxa? Has obert la IP i no `localhost`? Tallafoc de l'ordinador (obre el port 3000). |
| "Versió incompatible" | Recarrega el mòbil després d'actualitzar el servidor. |
| "La sala ja és plena" | Màxim 4 jugadors; espereu a la propera sala o que algú surti. |
| Pantalla negra a la tele | El navegador no té WebGL; prova un altre navegador o activa l'acceleració per maquinari. |
| No sona res | Els navegadors exigeixen un toc/clic abans de reproduir àudio: prem qualsevol botó. |
| Es pausa sola | Algun jugador ha perdut la connexió; continua sola quan torna. |

## Llicències

Codi i assets generats per codi: propis del projecte. Tipografies Lilita One i Rubik: SIL OFL 1.1.
Dependències: three, ws, qrcode, vite (MIT). Inventari complet: [docs/ASSETS.md](docs/ASSETS.md).
