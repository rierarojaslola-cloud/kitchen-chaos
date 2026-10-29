/**
 * Big-screen client. Client-side view state machine:
 *   MENU → CREATING_ROOM → LOBBY (player selection + campaign map) → COUNTDOWN/LOADING_LEVEL
 *   → PLAYING ⇄ PAUSED → LEVEL_RESULTS → (LOBBY | COUNTDOWN) ; RECONNECTING / ERROR overlays.
 * The server is authoritative for every transition that affects the game.
 */
import '../styles/host.css';
import QRCode from 'qrcode';
import {
  ERROR_TEXT_CA,
  GAME_VERSION,
  getCharacter,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PROTOCOL_VERSION,
  SLOT_COLORS,
  SLOT_LABELS,
  type RoomSnapshot,
  type SavedProgress,
  type ServerMessage,
} from '@kc/shared';
import { getLevel, LEVELS, nextLevelId, RESTAURANTS, type LevelInitView, type LevelResults, type PlayerView } from '@kc/game-logic';
import { GameSocket, type SocketStatus } from '../net/socket';
import { KitchenScene, type Quality } from '../render/scene';
import { audio } from '../audio/audio';
import { chefPortrait, UI_ICONS } from '../common/icons';
import { h, store, svg } from '../common/dom';
import { AttractMode } from './attract';
import { assets } from '../render/assets';
import { Hud } from './hud';

type View = 'menu' | 'creating' | 'lobby' | 'countdown' | 'playing' | 'paused' | 'results' | 'error';

interface Settings {
  quality: Quality;
  reducedMotion: boolean;
  showFps: boolean;
}

const sessionStore = store<{ code: string; token: string } | null>('kc.host', null, sessionStorage);
const progressStore = store<SavedProgress>('kc.progress', { best: {}, stars: {} });
const settingsStore = store<Settings>('kc.settings', {
  quality: 'high',
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  showFps: false,
});

const ui = document.getElementById('ui')!;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const settings = settingsStore.get();

const state = {
  view: 'menu' as View,
  room: null as RoomSnapshot | null,
  level: null as LevelInitView | null,
  results: null as LevelResults | null,
  lastPlayers: [] as PlayerView[],
  wantCreate: false,
  status: 'connecting' as SocketStatus,
  error: '',
  info: null as { publicUrl: string | null; lan: string[]; version: string } | null,
  countdownTimer: 0,
  countdownLocalEnd: 0,
};

let scene: KitchenScene;
try {
  scene = new KitchenScene(canvas, { quality: settings.quality, reducedMotion: settings.reducedMotion });
} catch (err) {
  console.error(err);
  document.getElementById('boot')!.innerHTML =
    '<p style="max-width:40ch;text-align:center">Aquest navegador no pot mostrar gràfics 3D (WebGL no disponible). Prova amb Chrome, Edge o Firefox actualitzats.</p>';
  throw err;
}
const attract = new AttractMode(scene);
let hud: Hud | null = null;
let lastState: Extract<ServerMessage, { t: 'state' }> | null = null;

// ───────────────────────── Networking ─────────────────────────
const socket = new GameSocket({
  onStatus: (s) => {
    state.status = s;
    hud?.setNet(s === 'open');
    if (s === 'offline' && state.view !== 'menu') renderConnectionLost();
  },
  onOpen: () => {
    const sess = sessionStore.get();
    if (sess) socket.send({ t: 'host:resume', v: PROTOCOL_VERSION, code: sess.code, token: sess.token });
    else if (state.wantCreate) createRoom();
  },
  onMessage: (m) => onMessage(m),
});

function createRoom(): void {
  state.wantCreate = true;
  setView('creating');
  if (socket.send({ t: 'host:create', v: PROTOCOL_VERSION, progress: progressStore.get() })) state.wantCreate = false;
}

function onMessage(m: ServerMessage): void {
  switch (m.t) {
    case 'host:created':
      sessionStore.set({ code: m.code, token: m.token });
      audio.play('join');
      break;
    case 'host:resumed':
      break;
    case 'room':
      onRoom(m.room);
      break;
    case 'level:init':
      state.level = m.level;
      attract.stop();
      scene.loadLevel(m.level, (state.room?.players ?? []).map((p) => ({ id: p.id, character: p.character })));
      scene.setTopReserve(0.24);
      hud?.el.remove();
      hud = new Hud(m.level, scene);
      ui.prepend(hud.el);
      audio.setMusic(m.level.restaurant);
      audio.setIntensity(0);
      break;
    case 'state':
      lastState = m;
      if (!hud) return;
      scene.pushPlayers(m.players);
      scene.pushStations(m.stations);
      scene.handleEvents(m.ev);
      hud.handleEvents(m.ev);
      hud.update(m.time, m.score, m.orders);
      playEventAudio(m.ev);
      if (crewChanged(m.players)) hud.setCrew(state.room?.players ?? [], m.players);
      audio.setIntensity(m.time <= 30 ? 2 : m.orders.length >= 4 ? 1 : 0);
      break;
    case 'results':
      state.results = m.results;
      scene.setMood(m.results.won ? 'happy' : 'sad');
      audio.play(m.results.won ? 'win' : 'lose');
      audio.setMusic('none');
      break;
    case 'error':
      if (m.code === 'ROOM_NOT_FOUND' || m.code === 'INVALID_SESSION') {
        sessionStore.clear();
        if (state.view !== 'menu') {
          state.error = 'La sala anterior ja no existeix. Crea una partida nova.';
          resetToMenu();
          renderError(state.error);
        }
        return;
      }
      if (m.fatal) {
        state.error = m.message;
        renderError(m.message);
      } else toast(m.message);
      break;
    case 'closed':
      sessionStore.clear();
      resetToMenu();
      renderError(m.reason);
      break;
    default:
      break;
  }
}

function crewChanged(players: PlayerView[]): boolean {
  const sig = (ps: PlayerView[]) => ps.map((p) => `${p.id}:${p.connected}`).join();
  const changed = sig(players) !== sig(state.lastPlayers);
  state.lastPlayers = players;
  return changed;
}

function onRoom(room: RoomSnapshot): void {
  const prev = state.room;
  state.room = room;
  if (room.countdownLeftMs !== null) state.countdownLocalEnd = performance.now() + room.countdownLeftMs;
  // persist local campaign progress
  progressStore.set({ best: room.best, stars: room.stars });
  if (prev) {
    const before = prev.players.filter((p) => p.connected).length;
    const after = room.players.filter((p) => p.connected).length;
    if (after > before) audio.play('join');
    if (after < before) audio.play('leave');
  }
  if (hud && state.level) hud.setCrew(room.players, state.lastPlayers);
  switch (room.phase) {
    case 'lobby':
      if (state.view !== 'lobby') {
        hud?.el.remove();
        hud = null;
        state.level = null;
        state.results = null;
        audio.setMusic('menu');
      }
      setView('lobby');
      break;
    case 'countdown':
      setView('countdown');
      break;
    case 'playing':
      if (state.view === 'countdown') audio.play('go');
      setView('playing');
      break;
    case 'paused':
      setView('paused');
      break;
    case 'results':
      setView('results');
      break;
    case 'closed':
      resetToMenu();
      break;
  }
}

function resetToMenu(): void {
  hud?.el.remove();
  hud = null;
  state.room = null;
  state.level = null;
  setView('menu');
}

// ───────────────────────── Views ─────────────────────────
function setView(v: View): void {
  const changed = v !== state.view;
  state.view = v;
  if (v === 'menu' || v === 'lobby' || v === 'creating') {
    scene.setMood('normal');
    attract.start(v === 'lobby' && state.room ? state.room.levelId : 'burger-1', v === 'menu' ? 0.38 : 0);
  }
  if (changed || v === 'lobby' || v === 'paused' || v === 'results') render();
}

function clearScreens(): void {
  for (const el of [...ui.children]) if (!el.classList.contains('hud')) el.remove();
}

function render(): void {
  clearScreens();
  switch (state.view) {
    case 'menu':
      return renderMenu();
    case 'creating':
      ui.append(h('div', { class: 'scrim' }, h('div', { class: 'panel', role: 'status' }, h('h2', {}, 'Preparant la cuina…'), h('p', {}, 'Creant una sala nova al servidor.'))));
      return;
    case 'lobby':
      return void renderLobby();
    case 'countdown':
      return renderCountdown();
    case 'playing':
      return;
    case 'paused':
      return renderPause();
    case 'results':
      return renderResults();
    case 'error':
      return renderError(state.error);
  }
}

function renderMenu(): void {
  const createBtn = h('button', { class: 'btn', onclick: () => { audio.unlock(); audio.play('ui'); createRoom(); } }, 'Crear partida');
  const joinBtn = h('button', { class: 'btn secondary', onclick: () => { audio.unlock(); showJoinHelp(); } }, 'Unir-se amb el mòbil');
  const optBtn = h('button', { class: 'btn secondary', onclick: () => { audio.unlock(); showOptions(); } }, 'Opcions i accessibilitat');
  ui.append(
    h(
      'section',
      { class: 'title-screen' },
      h(
        'div',
        {},
        h('h1', { class: 'wordmark' }, h('span', { class: 'w1' }, 'Kitchen'), h('span', { class: 'w2' }, 'Chaos')),
        h('div', { class: 'ticket wordmark-ribbon' }, 'Service Rush'),
        h('div', { class: 'title-menu' }, createBtn, joinBtn, optBtn),
      ),
      h('div', {}),
      h(
        'footer',
        { class: 'title-foot' },
        h('span', {}, `v${GAME_VERSION}`),
        h('span', {}, '2 a 4 jugadors · un mòbil per jugador'),
        h('button', { onclick: showCredits }, 'Crèdits'),
      ),
    ),
  );
  createBtn.focus();
  audio.setMusic('menu');
}

async function joinBaseUrl(): Promise<{ base: string; warn: string | null }> {
  if (!state.info) {
    try {
      state.info = await (await fetch('/api/info', { cache: 'no-store' })).json();
    } catch (err) {
      console.warn('[host] /api/info unavailable', err);
    }
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (state.info?.publicUrl) return { base: state.info.publicUrl, warn: null };
  if (local && state.info?.lan.length) return { base: `${location.protocol}//${state.info.lan[0]}:${location.port}`, warn: null };
  if (local)
    return {
      base: location.origin,
      warn: 'Aquesta pantalla s’ha obert amb "localhost". Els mòbils no hi poden accedir: obre el joc amb l’adreça IP de l’ordinador a la xarxa local o configura PUBLIC_URL.',
    };
  return { base: location.origin, warn: null };
}

async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14303f', light: '#ffffff' } });
}

async function showJoinHelp(): Promise<void> {
  const { base, warn } = await joinBaseUrl();
  const url = `${base}/controller.html`;
  const close = h('button', { class: 'btn', onclick: () => scrim.remove() }, 'Entesos');
  const scrim = h(
    'div',
    { class: 'scrim' },
    h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Com unir-se' },
      h('h2', {}, 'Juga amb el teu mòbil'),
      h('p', {}, 'Primer, algú crea la partida en aquesta pantalla. Després, cada jugador escaneja el codi QR que apareixerà o obre aquesta adreça al mòbil i escriu el codi de la sala:'),
      h('div', { class: 'row', style: { justifyContent: 'center', margin: '1rem 0' } }, h('div', { class: 'qr', html: await qrSvg(url) })),
      h('p', { class: 'join-url', style: { textAlign: 'center' } }, url),
      warn ? h('p', { class: 'join-warn' }, warn) : null,
      h('p', {}, 'Consell: posa el mòbil en horitzontal per jugar més còmode.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, close),
    ),
  );
  ui.append(scrim);
  close.focus();
}

async function renderLobby(): Promise<void> {
  const room = state.room!;
  const { base, warn } = await joinBaseUrl();
  if (state.view !== 'lobby' || state.room !== room) return; // superseded while awaiting
  const joinUrl = `${base}/controller.html?room=${room.code}`;
  const connected = room.players.filter((p) => p.connected);
  const canStart = connected.length >= MIN_PLAYERS;

  const slots = Array.from({ length: MAX_PLAYERS }, (_, slot) => {
    const p = room.players.find((x) => x.slot === slot);
    const color = SLOT_COLORS[slot]!;
    if (!p)
      return h('div', { class: 'slot empty', style: { '--pc': color } }, h('span', { class: 'badge', style: { opacity: '0.5' } }, SLOT_LABELS[slot]), h('div', { class: 'hint' }, 'Lloc lliure'));
    const c = getCharacter(p.character);
    return h(
      'div',
      { class: 'slot filled', style: { '--pc': color } },
      h('span', { class: 'badge' }, SLOT_LABELS[slot]),
      svg(chefPortrait(c, 110)),
      h('div', { class: 'name' }, p.name),
      h('div', { class: 'meta' }, `Xef ${c.name} · ${c.from}`),
      h('div', { class: `state ${p.connected ? 'ok' : 'off'}` }, !p.connected ? 'Reconnectant…' : p.ready ? 'A punt!' : 'Connectat'),
      h('button', { class: 'kick', title: `Expulsar ${p.name}`, 'aria-label': `Expulsar ${p.name}`, onclick: () => confirmKick(p.id, p.name) }, '×'),
    );
  });

  const levelCards = (Object.keys(RESTAURANTS) as (keyof typeof RESTAURANTS)[]).map((rid) => {
    const r = RESTAURANTS[rid];
    const levels = LEVELS.filter((l) => l.restaurant === rid).sort((a, b) => a.order - b.order);
    return h(
      'section',
      { class: 'resto', style: { '--accent': r.accent } },
      h('h3', {}, r.name),
      h('p', { class: 'tag' }, r.tagline),
      h(
        'div',
        { class: 'levels' },
        levels.map((l) => {
          const locked = !room.unlocked.includes(l.id);
          const stars = room.stars[l.id] ?? 0;
          return h(
            'button',
            {
              class: 'level-card',
              'aria-pressed': room.levelId === l.id ? 'true' : 'false',
              disabled: locked,
              title: locked ? 'Aconsegueix 1 estrella al nivell anterior per desbloquejar-lo' : l.description,
              onclick: () => {
                audio.play('ui');
                socket.send({ t: 'level', levelId: l.id });
              },
            },
            h('span', { class: 'n' }, `${l.order}. ${l.name}`),
            h('span', { class: 'mech' }, locked ? 'Bloquejat' : l.newMechanic),
            h('span', { class: 'stars', 'aria-label': `${stars} estrelles` }, [0, 1, 2].map((i) => svg(UI_ICONS.star(i < stars, 18)))),
          );
        }),
      ),
    );
  });

  const level = getLevel(room.levelId);
  const startBtn = h(
    'button',
    { class: 'btn go', disabled: !canStart, onclick: () => { audio.unlock(); audio.play('ui'); socket.send({ t: 'flow', action: 'start' }); } },
    `Començar: ${level?.name ?? ''}`,
  );
  const qr = h('div', { class: 'qr', 'aria-label': `Codi QR per unir-se a la sala ${room.code}` });
  qr.innerHTML = await qrSvg(joinUrl);

  ui.append(
    h(
      'section',
      { class: 'lobby' },
      h(
        'header',
        { class: 'lobby-head' },
        h('h1', {}, 'Sala de preparació'),
        h('div', { class: 'row' }, h('button', { class: 'btn small secondary', onclick: showOptions }, 'Opcions'), h('button', { class: 'btn small secondary', onclick: confirmClose }, 'Tancar la sala')),
      ),
      h(
        'div',
        { class: 'ticket join-ticket' },
        h('span', { class: 'pin' }),
        h('span', { class: 'lbl' }, 'Codi de la sala'),
        h('div', { class: 'room-code', 'aria-label': `Codi ${room.code.split('').join(' ')}` }, room.code),
        qr,
        h('span', { class: 'join-url' }, joinUrl),
        warn ? h('p', { class: 'join-warn' }, warn) : null,
      ),
      h('div', { class: 'slots' }, slots),
      h('div', { class: 'campaign' }, levelCards),
      h(
        'footer',
        { class: 'lobby-actions' },
        h('span', { class: 'why' }, canStart ? `${connected.length} xefs connectats. El ${SLOT_LABELS[0]} també pot començar des del mòbil.` : `Calen ${MIN_PLAYERS - connected.length} jugador(s) més per començar.`),
        startBtn,
      ),
    ),
  );
}

function confirmKick(id: string, name: string): void {
  confirmDialog(`Vols expulsar ${name} de la sala?`, 'Expulsar', () => socket.send({ t: 'host:kick', playerId: id }));
}

function confirmClose(): void {
  confirmDialog('Es tancarà la sala per a tothom. Vols continuar?', 'Tancar la sala', () => {
    socket.send({ t: 'host:close' });
    sessionStore.clear();
  });
}

function confirmDialog(text: string, okLabel: string, ok: () => void): void {
  const yes = h('button', { class: 'btn', onclick: () => { scrim.remove(); ok(); } }, okLabel);
  const no = h('button', { class: 'btn secondary', onclick: () => scrim.remove() }, 'Cancel·lar');
  const scrim = h('div', { class: 'scrim' }, h('div', { class: 'panel', role: 'alertdialog', 'aria-modal': 'true' }, h('h2', {}, 'Confirmació'), h('p', {}, text), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, no, yes)));
  ui.append(scrim);
  no.focus();
}

function renderCountdown(): void {
  const lvl = state.level;
  const num = h('div', { class: 'num', 'aria-live': 'assertive' }, '3');
  ui.append(
    h(
      'div',
      { class: 'count' },
      h('div', { class: 'lvl' }, lvl ? `${RESTAURANTS[lvl.restaurant].name} · ${lvl.name}` : 'Preparant…'),
      num,
      lvl ? h('ul', {}, lvl.hints.map((x) => h('li', {}, x))) : null,
    ),
  );
  clearInterval(state.countdownTimer);
  const tick = () => {
    if (state.view !== 'countdown') return clearInterval(state.countdownTimer);
    const left = Math.max(1, Math.ceil((state.countdownLocalEnd - performance.now()) / 1000));
    if (num.textContent !== String(left)) {
      num.textContent = String(left);
      num.style.animation = 'none';
      void num.offsetWidth;
      num.style.animation = '';
      audio.play('tick');
    }
  };
  state.countdownTimer = window.setInterval(tick, 100);
}

function renderPause(): void {
  const room = state.room!;
  const reason =
    room.pauseReason === 'disconnect'
      ? !room.hostConnected
        ? 'La pantalla principal s’ha desconnectat.'
        : 'Falta algun jugador. La partida continuarà automàticament quan torni.'
      : room.pauseReason === 'player'
        ? 'Un jugador ha posat pausa.'
        : 'Partida en pausa.';
  const resume = h('button', { class: 'btn go', onclick: () => socket.send({ t: 'flow', action: 'resume' }) }, 'Continuar');
  ui.append(
    h(
      'div',
      { class: 'scrim' },
      h(
        'div',
        { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pausa' },
        h('h2', {}, 'Pausa'),
        h('p', {}, reason),
        h(
          'div',
          { class: 'row' },
          resume,
          h('button', { class: 'btn secondary', onclick: showOptions }, 'Opcions'),
          h('button', { class: 'btn secondary', onclick: () => confirmDialog('Es perdrà el progrés d’aquest nivell.', 'Tornar a la sala', () => socket.send({ t: 'flow', action: 'toLobby' })) }, 'Abandonar el nivell'),
        ),
      ),
    ),
  );
  resume.focus();
}

function renderResults(): void {
  const r = state.results;
  const room = state.room!;
  if (!r) return;
  const next = nextLevelId(r.levelId);
  const nextUnlocked = !!next && room.unlocked.includes(next);
  const lvl = getLevel(r.levelId)!;
  const rows: [string, string | number, boolean?][] = [
    [`Plats servits (${r.delivered})`, `+${r.dishPoints}`],
    ['Propines per rapidesa', `+${r.tips}`],
    ['Bonus de treball en equip', `+${r.coopBonus}`],
    [`Comandes perdudes (${r.expired})`, `−${r.expiredPenalty}`, true],
    [`Menjar llençat (${r.wasted})`, `−${r.wastePenalty}`, true],
  ];
  const mvp = (title: string, key: 'served' | 'chops' | 'pickups' | 'repairs') => {
    const best = [...r.players].sort((a, b) => b[key] - a[key])[0];
    if (!best || best[key] === 0) return null;
    const lp = room.players.find((p) => p.id === best.id);
    return h('div', { class: 'mvp', style: { '--pc': SLOT_COLORS[best.slot] } }, svg(chefPortrait(getCharacter(lp?.character ?? 'nuri'), 54)), h('b', {}, lp?.name ?? SLOT_LABELS[best.slot]), title);
  };
  const primary = nextUnlocked
    ? h('button', { class: 'btn go', onclick: () => socket.send({ t: 'flow', action: 'next' }) }, 'Següent nivell')
    : h('button', { class: 'btn go', onclick: () => socket.send({ t: 'flow', action: 'retry' }) }, 'Tornar-ho a provar');
  ui.append(
    h(
      'div',
      { class: 'scrim results' },
      h(
        'div',
        { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Resultats' },
        h('h2', {}, r.won ? 'Servei completat!' : 'El servei s’ha complicat…'),
        h('p', { style: { margin: '0 auto' } }, `${lvl.name} · ${r.playerCount} jugadors`),
        h('div', { class: 'big-stars', 'aria-label': `${r.stars} de 3 estrelles` }, [0, 1, 2].map((i) => svg(UI_ICONS.star(i < r.stars, 88)))),
        h('p', { class: 'final' }, String(r.score)),
        h('p', { style: { margin: '0 auto', color: 'var(--mist)' } }, `Objectius: ${r.thresholds.join(' · ')}`),
        h('table', { class: 'breakdown' }, h('tbody', {}, rows.map(([k, v, neg]) => h('tr', { class: neg ? 'neg' : '' }, h('td', {}, k), h('td', {}, v))))),
        h('div', { class: 'mvps' }, mvp('més plats servits', 'served'), mvp('més talls', 'chops'), mvp('reparacions', 'repairs')),
        h(
          'div',
          { class: 'row', style: { justifyContent: 'center' } },
          primary,
          nextUnlocked ? h('button', { class: 'btn secondary', onclick: () => socket.send({ t: 'flow', action: 'retry' }) }, 'Repetir') : null,
          h('button', { class: 'btn secondary', onclick: () => socket.send({ t: 'flow', action: 'toLobby' }) }, 'Tornar a la sala'),
        ),
        !r.won ? h('p', { style: { color: 'var(--mist)', marginTop: '1rem' } }, `Cal ${r.thresholds[0]} punts per aconseguir la primera estrella i desbloquejar el següent nivell.`) : null,
      ),
    ),
  );
  primary.focus();
}

function renderError(msg: string): void {
  const ok = h('button', { class: 'btn', onclick: () => { scrim.remove(); if (state.view === 'error') setView('menu'); } }, 'D’acord');
  const scrim = h('div', { class: 'scrim' }, h('div', { class: 'panel', role: 'alertdialog' }, h('h2', {}, 'Avís'), h('p', {}, msg), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, ok)));
  ui.append(scrim);
  ok.focus();
}

function renderConnectionLost(): void {
  if (document.querySelector('.conn-lost')) return;
  const retry = h('button', { class: 'btn', onclick: () => { scrim.remove(); socket.retry(); } }, 'Tornar a connectar');
  const scrim = h(
    'div',
    { class: 'scrim conn-lost' },
    h('div', { class: 'panel', role: 'alertdialog' }, h('h2', {}, 'Sense connexió'), h('p', {}, 'No es pot contactar amb el servidor del joc. Comprova la xarxa i que el servidor estigui en marxa.'), retry),
  );
  ui.append(scrim);
}

function toast(text: string): void {
  hud?.banner(text, 'info') ??
    (() => {
      const t = h('div', { class: 'banner info' }, text);
      ui.append(t);
      setTimeout(() => t.remove(), 4000);
    })();
}

function showOptions(): void {
  const s = settingsStore.get();
  const range = (label: string, value: number, onInput: (v: number) => void) => {
    const out = h('output', {}, `${Math.round(value * 100)}`);
    const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(value), 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => {
      out.textContent = String(Math.round(Number(input.value) * 100));
      onInput(Number(input.value));
    });
    return h('label', { class: 'opt' }, h('span', {}, label), input, out);
  };
  const q = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Qualitat gràfica' },
    (['high', 'medium', 'low'] as Quality[]).map((k) =>
      h('button', {
        'aria-pressed': String(s.quality === k),
        onclick: (e: Event) => {
          s.quality = k;
          settingsStore.set(s);
          scene.applyQuality(k);
          q.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        },
      }, { high: 'Alta', medium: 'Mitjana', low: 'Baixa' }[k]),
    ),
  );
  const rm = h('input', { type: 'checkbox', checked: s.reducedMotion }) as HTMLInputElement;
  rm.addEventListener('change', () => {
    s.reducedMotion = rm.checked;
    settingsStore.set(s);
    scene.setReducedMotion(rm.checked);
    document.body.classList.toggle('reduced', rm.checked);
  });
  const fps = h('input', { type: 'checkbox', checked: s.showFps }) as HTMLInputElement;
  fps.addEventListener('change', () => {
    s.showFps = fps.checked;
    settingsStore.set(s);
    fpsEl.hidden = !fps.checked;
  });
  const mute = h('input', { type: 'checkbox', checked: audio.muted }) as HTMLInputElement;
  mute.addEventListener('change', () => audio.setVolumes(audio.musicVolume, audio.sfxVolume, mute.checked));
  const close = h('button', { class: 'btn', onclick: () => scrim.remove() }, 'Fet');
  const scrim = h(
    'div',
    { class: 'scrim' },
    h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Opcions' },
      h('h2', {}, 'Opcions'),
      range('Música', audio.musicVolume, (v) => audio.setVolumes(v, audio.sfxVolume, audio.muted)),
      range('Efectes de so', audio.sfxVolume, (v) => { audio.setVolumes(audio.musicVolume, v, audio.muted); audio.play('pickup'); }),
      h('label', { class: 'toggle' }, mute, 'Silenciar tot'),
      h('div', { class: 'opt' }, h('span', {}, 'Qualitat gràfica'), q, h('span')),
      h('label', { class: 'toggle' }, rm, 'Reduir moviment i efectes'),
      h('br'),
      h('label', { class: 'toggle' }, fps, 'Mostrar rendiment (FPS)'),
      h('p', { style: { color: 'var(--mist)', fontSize: 'var(--t-xs)' } }, 'Els avisos importants sempre es mostren en pantalla, a més de sonar. Els jugadors es distingeixen per color i per número (J1 a J4).'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, close),
    ),
  );
  ui.append(scrim);
  close.focus();
}

function showCredits(): void {
  const close = h('button', { class: 'btn', onclick: () => scrim.remove() }, 'Tancar');
  const scrim = h(
    'div',
    { class: 'scrim' },
    h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crèdits' },
      h('h2', {}, 'Crèdits'),
      h('p', {}, 'Kitchen Chaos: Service Rush (nom provisional). Joc, models 3D (modelats amb scripts de Blender), textures, icones, música i efectes de so originals.'),
      h('p', {}, 'Tipografies: Lilita One (Juan Montoreano) i Rubik (Hubert & Fischer), llicència SIL Open Font License 1.1.'),
      h('p', {}, 'Tecnologia: Three.js (MIT), ws (MIT), qrcode (MIT), Vite (MIT).'),
      h('p', {}, `Versió ${GAME_VERSION} · protocol ${PROTOCOL_VERSION}`),
      h('p', {}, `Autora: Lola Riera Rojas`),
      close,
    ),
  );
  ui.append(scrim);
  close.focus();
}

// ───────────────────────── Audio cues for events ─────────────────────────
function playEventAudio(events: import('@kc/game-logic').GameEvent[]): void {
  for (const ev of events) {
    switch (ev.e) {
      case 'pickup': audio.play('pickup'); break;
      case 'place': audio.play('place'); break;
      case 'chop': audio.play('chop'); break;
      case 'chopDone': audio.play('chopDone'); break;
      case 'cookDone': audio.play('cookDone'); audio.play('sizzle'); break;
      case 'burnWarn': audio.play('burnWarn'); break;
      case 'burnt': audio.play('burnt'); break;
      case 'served': audio.play('served'); break;
      case 'wrongDish': audio.play('wrong'); break;
      case 'invalid': audio.play('invalid'); break;
      case 'trash': audio.play('trash'); break;
      case 'orderNew': audio.play('orderNew'); break;
      case 'orderExpired': audio.play('orderExpired'); break;
      case 'chaos': audio.play('alarm'); break;
      case 'repaired': audio.play('repair'); break;
      case 'timeWarn': audio.play('alarm'); break;
      default: break;
    }
  }
}

// ───────────────────────── Keyboard + misc ─────────────────────────
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'Escape' || e.key === ' ') {
    if (state.view === 'playing') {
      e.preventDefault();
      socket.send({ t: 'flow', action: 'pause' });
    } else if (state.view === 'paused' && e.key === ' ') {
      e.preventDefault();
      socket.send({ t: 'flow', action: 'resume' });
    }
  }
});
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

const fpsEl = h('div', { class: 'fps passthrough', hidden: !settings.showFps });
document.body.append(fpsEl);
let frames = 0;
let fpsAt = performance.now();
scene.onFrame = () => {
  frames++;
  const now = performance.now();
  if (now - fpsAt >= 1000) {
    const st = scene.stats();
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} FPS · ${st.calls} draw calls · ${Math.round(st.triangles / 1000)}k tris`;
    (window as unknown as { __kcFps: number }).__kcFps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
  }
};
if (settings.reducedMotion) document.body.classList.add('reduced');

// boot
const bootText = document.querySelector('#boot p');
Promise.all([
  document.fonts.ready.catch(() => undefined),
  assets.load((done, total) => {
    if (bootText) bootText.textContent = `Preparant la cuina… ${Math.round((done / total) * 100)}%`;
  }),
]).finally(() => {
  setView(sessionStore.get() ? 'creating' : 'menu');
  if (!sessionStore.get()) render();
  setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 200);
});

// expose a tiny debug surface for automated browser tests (read-only)
(window as unknown as { __kc: unknown }).__kc = {
  get view() {
    return state.view;
  },
  get room() {
    return state.room;
  },
  stats: () => scene.stats(),
  assets: () => ({ loaded: assets.count, failed: assets.failed, disabled: assets.disabled }),
  get level() {
    return state.level;
  },
  get players() {
    return lastState?.players ?? [];
  },
  get score() {
    return lastState?.score ?? 0;
  },
};
void ERROR_TEXT_CA;
