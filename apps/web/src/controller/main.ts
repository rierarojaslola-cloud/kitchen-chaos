/**
 * Phone controller. Shows only what the player needs (their chef, held item, contextual
 * actions); the TV shows the kitchen. Input is sent as small validated messages:
 *   'in'  movement vector + ACTION held flag (≈15-20 Hz while moving, immediately on change)
 *   'act' INTERACT presses with a strictly increasing sequence number (server dedupes)
 */
import '../styles/controller.css';
import {
  CHARACTERS,
  ERROR_TEXT_CA,
  getCharacter,
  isValidRoomCode,
  normalizeRoomCode,
  PROTOCOL_VERSION,
  randomChefName,
  SLOT_COLORS,
  SLOT_LABELS,
  type RoomSnapshot,
  type ServerMessage,
} from '@kc/shared';
import { getLevel, LEVELS, nextLevelId, type ControllerHint, type LevelResults } from '@kc/game-logic';
import { GameSocket, type SocketStatus } from '../net/socket';
import { chefPortrait, ingredientIcon, UI_ICONS } from '../common/icons';
import { h, store, svg } from '../common/dom';
import { INGREDIENTS, type IngredientKind } from '@kc/game-logic';

interface Session {
  code: string;
  token: string;
}
interface Prefs {
  name: string;
  character: string;
  haptics: boolean;
}

const sessionStore = store<Session | null>('kc.pad.session', null);
const prefsStore = store<Prefs>('kc.pad.prefs', { name: '', character: 'nuri', haptics: true });
const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

type Step = 'code' | 'chef' | 'joining' | 'lobby' | 'game' | 'results' | 'kicked' | 'closed' | 'fatal';

const st = {
  step: 'code' as Step,
  code: normalizeRoomCode(params.get('room') ?? ''),
  prefs: prefsStore.get(),
  playerId: '',
  slot: 0,
  room: null as RoomSnapshot | null,
  hint: { interact: null, use: null, held: null, near: null, progress: null } as ControllerHint,
  results: null as LevelResults | null,
  error: '',
  status: 'connecting' as SocketStatus,
  joining: false,
};
if (!st.prefs.name) st.prefs.name = randomChefName();

// ───────────────────────── Socket ─────────────────────────
const socket = new GameSocket({
  onStatus: (s) => {
    st.status = s;
    updateConnUi();
  },
  onOpen: () => {
    const sess = sessionStore.get();
    if (sess && (!st.code || sess.code === st.code)) {
      st.code = sess.code;
      socket.send({ t: 'player:resume', v: PROTOCOL_VERSION, code: sess.code, token: sess.token });
    } else if (st.joining) sendJoin();
  },
  onMessage: (m) => onMessage(m),
});

function sendJoin(): void {
  st.joining = true;
  socket.send({ t: 'player:join', v: PROTOCOL_VERSION, code: st.code, name: st.prefs.name, character: st.prefs.character });
}

function onMessage(m: ServerMessage): void {
  switch (m.t) {
    case 'joined':
      st.joining = false;
      st.playerId = m.playerId;
      st.slot = m.slot;
      st.code = m.code;
      sessionStore.set({ code: m.code, token: m.token });
      history.replaceState(null, '', `?room=${m.code}`);
      buzz(20);
      break;
    case 'room':
      onRoom(m.room);
      break;
    case 'you':
      st.hint = m.hint;
      updatePadHint();
      break;
    case 'fb':
      feedback(m.kind, m.text);
      break;
    case 'results':
      st.results = m.results;
      break;
    case 'error':
      st.joining = false;
      if (m.code === 'INVALID_SESSION' || (m.code === 'ROOM_NOT_FOUND' && sessionStore.get())) {
        sessionStore.clear();
        st.error = m.code === 'ROOM_NOT_FOUND' ? ERROR_TEXT_CA.ROOM_NOT_FOUND : 'La sessió anterior ja no és vàlida. Torna a entrar.';
        go('code');
        return;
      }
      if (m.fatal) {
        st.error = m.message;
        go('fatal');
        return;
      }
      if (st.step === 'joining' || st.step === 'chef' || st.step === 'code') {
        st.error = m.message;
        go(m.code === 'ROOM_NOT_FOUND' || m.code === 'ROOM_FULL' || m.code === 'ROOM_IN_GAME' ? 'code' : 'chef');
      } else feedback('invalid', m.message);
      break;
    case 'kicked':
      sessionStore.clear();
      go('kicked');
      break;
    case 'closed':
      sessionStore.clear();
      st.error = m.reason;
      go('closed');
      break;
    default:
      break;
  }
}

function onRoom(room: RoomSnapshot): void {
  st.room = room;
  const me = room.players.find((p) => p.id === st.playerId);
  if (me) st.slot = me.slot;
  switch (room.phase) {
    case 'lobby':
      go('lobby');
      break;
    case 'countdown':
    case 'playing':
    case 'paused':
      go('game');
      updateOverlay();
      break;
    case 'results':
      go('results');
      break;
    default:
      break;
  }
  if (st.step === 'lobby' || st.step === 'results') render();
}

function isLeader(): boolean {
  return !!st.room && st.room.leaderId === st.playerId;
}

// ───────────────────────── Rendering ─────────────────────────
function go(step: Step): void {
  if (st.step === step && step !== 'lobby' && step !== 'results' && step !== 'code') return;
  const leavingGame = st.step === 'game' && step !== 'game';
  st.step = step;
  if (leavingGame) stopInput();
  render();
}

function render(): void {
  switch (st.step) {
    case 'code':
      return renderCode();
    case 'chef':
      return renderChef(false);
    case 'joining':
      return app.replaceChildren(overlayScreen('Entrant a la cuina…', 'Connectant amb la sala ' + st.code, true));
    case 'lobby':
      return renderLobby();
    case 'game':
      return renderPad();
    case 'results':
      return renderResults();
    case 'kicked':
      return app.replaceChildren(endScreen('T’han expulsat de la sala', 'Pots tornar a entrar amb un codi nou.'));
    case 'closed':
      return app.replaceChildren(endScreen('La sala s’ha tancat', st.error || 'Demana a l’amfitrió que creï una partida nova.'));
    case 'fatal':
      return app.replaceChildren(endScreen('No es pot continuar', st.error));
  }
}

function overlayScreen(title: string, text: string, spinner = false): HTMLElement {
  return h('div', { class: 'overlay', role: 'status' }, spinner ? h('div', { class: 'spinner' }) : null, h('h2', {}, title), h('p', {}, text));
}

function endScreen(title: string, text: string): HTMLElement {
  return h(
    'div',
    { class: 'overlay' },
    h('h2', {}, title),
    h('p', {}, text),
    h('button', { class: 'btn', onclick: () => { st.error = ''; st.code = ''; history.replaceState(null, '', location.pathname); go('code'); } }, 'Entrar en una altra sala'),
  );
}

function header(): HTMLElement {
  return h('div', { class: 'mini-mark' }, 'Kitchen ', h('span', {}, 'Chaos'));
}

function renderCode(): void {
  const code = h('input', {
    class: 'code-input',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    maxlength: '4',
    value: st.code,
    'aria-label': 'Codi de la sala',
    placeholder: 'ABCD',
  }) as HTMLInputElement;
  const name = h('input', { value: st.prefs.name, maxlength: '14', 'aria-label': 'El teu nom', autocomplete: 'nickname' }) as HTMLInputElement;
  const dice = h('button', { class: 'dice', type: 'button', 'aria-label': 'Nom aleatori', onclick: () => (name.value = randomChefName()) }, '🎲');
  const err = st.error ? h('div', { class: 'err', role: 'alert' }, st.error) : null;
  const next = h('button', { class: 'btn big', type: 'submit' }, 'Triar xef');
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const c = normalizeRoomCode(code.value);
        if (!isValidRoomCode(c)) {
          st.error = 'El codi té 4 lletres (sense O ni I). Mira’l a la pantalla gran.';
          return render();
        }
        const n = name.value.trim();
        if (!n) {
          st.error = 'Escriu un nom (o fes servir el dau).';
          return render();
        }
        st.code = c;
        st.prefs.name = n.slice(0, 14);
        prefsStore.set(st.prefs);
        st.error = '';
        go('chef');
      },
    },
    h('label', { class: 'field' }, 'Codi de la sala', code),
    h('label', { class: 'field' }, 'El teu nom', h('div', { class: 'name-row' }, name, dice)),
    err,
    next,
  );
  app.replaceChildren(
    h('div', { class: 'screen' }, header(), h('h2', {}, 'Entra a la cuina'), h('p', {}, 'Escriu el codi que surt a la pantalla gran o escaneja el QR.'), form, h('p', { class: 'tip' }, 'Consell: posa el mòbil en horitzontal per jugar.')),
  );
  (st.code ? name : code).focus();
}

function renderChef(changing: boolean): void {
  const taken = new Set((st.room?.players ?? []).filter((p) => p.id !== st.playerId).map((p) => p.character));
  let selected = taken.has(st.prefs.character) ? CHARACTERS.find((c) => !taken.has(c.id))?.id ?? st.prefs.character : st.prefs.character;
  const grid = h(
    'div',
    { class: 'chefs', role: 'radiogroup', 'aria-label': 'Tria el teu xef' },
    CHARACTERS.map((c) =>
      h(
        'button',
        {
          class: 'chef',
          type: 'button',
          role: 'radio',
          'aria-pressed': String(c.id === selected),
          'aria-checked': String(c.id === selected),
          disabled: taken.has(c.id),
          onclick: (e: Event) => {
            selected = c.id;
            grid.querySelectorAll('.chef').forEach((b) => {
              b.setAttribute('aria-pressed', String(b === e.currentTarget));
              b.setAttribute('aria-checked', String(b === e.currentTarget));
            });
            buzz(8);
          },
        },
        svg(chefPortrait(c, 90)),
        h('b', {}, c.name),
        h('small', { class: 'from' }, c.from),
        h('small', {}, c.tagline),
      ),
    ),
  );
  const confirm = h(
    'button',
    {
      class: 'btn go big',
      onclick: () => {
        st.prefs.character = selected;
        prefsStore.set(st.prefs);
        if (changing) {
          socket.send({ t: 'player:character', character: selected });
          go('lobby');
          render();
        } else {
          go('joining');
          sendJoin();
        }
      },
    },
    changing ? 'Fet' : 'Entrar a la sala',
  );
  const err = st.error ? h('div', { class: 'err', role: 'alert' }, st.error) : null;
  st.error = '';
  app.replaceChildren(
    h(
      'div',
      { class: 'screen' },
      header(),
      h('h2', {}, changing ? 'Canvia de xef' : `Hola, ${st.prefs.name}! Tria el teu xef`),
      changing ? null : h('p', {}, `Sala ${st.code}`),
      grid,
      err,
      confirm,
      changing ? null : h('button', { class: 'linkish', onclick: () => go('code') }, 'Tornar enrere'),
    ),
  );
}

function renderLobby(): void {
  const room = st.room;
  if (!room) return;
  const me = room.players.find((p) => p.id === st.playerId);
  if (!me) return;
  const c = getCharacter(me.character);
  const color = SLOT_COLORS[me.slot]!;
  const leader = isLeader();
  const ready = h(
    'button',
    { class: `btn big ${me.ready ? 'secondary' : 'go'}`, onclick: () => { socket.send({ t: 'player:ready', ready: !me.ready }); buzz(10); } },
    me.ready ? 'Ja no estic a punt' : 'Estic a punt!',
  );
  const connected = room.players.filter((p) => p.connected).length;
  const lvl = getLevel(room.levelId);
  const leaderTools = leader
    ? h(
        'div',
        { class: 'stack' },
        h('h2', {}, 'Ets el cap de cuina'),
        h('p', {}, 'Tria el nivell i comença quan tothom estigui a punt.'),
        h(
          'div',
          { class: 'lv-list' },
          LEVELS.map((l) => {
            const locked = !room.unlocked.includes(l.id);
            const stars = room.stars[l.id] ?? 0;
            return h(
              'button',
              { 'aria-pressed': String(room.levelId === l.id), disabled: locked, onclick: () => socket.send({ t: 'level', levelId: l.id }) },
              h('span', {}, `${l.order}. ${l.name}`),
              h('span', { class: 'stars' }, locked ? 'Bloquejat' : [0, 1, 2].map((i) => svg(UI_ICONS.star(i < stars, 18)))),
            );
          }),
        ),
        h(
          'button',
          { class: 'btn go big', disabled: connected < 2, onclick: () => { socket.send({ t: 'flow', action: 'start' }); buzz(20); } },
          connected < 2 ? 'Calen 2 jugadors' : `Començar: ${lvl?.name ?? ''}`,
        ),
      )
    : h('p', {}, `Esperant que el ${SLOT_LABELS[0]} o la pantalla gran comencin la partida. Nivell: ${lvl?.name ?? ''}.`);
  const hap = h('input', { type: 'checkbox', checked: st.prefs.haptics }) as HTMLInputElement;
  hap.addEventListener('change', () => {
    st.prefs.haptics = hap.checked;
    prefsStore.set(st.prefs);
    buzz(15);
  });
  app.replaceChildren(
    h(
      'div',
      { class: 'screen' },
      header(),
      h(
        'div',
        { class: 'ticket me-card', style: { '--pc': color } },
        svg(chefPortrait(c, 90)),
        h('div', {}, h('span', { class: 'slot-badge' }, SLOT_LABELS[me.slot]), h('div', { class: 'who' }, me.name), h('div', { style: { color: '#6b5a4c' } }, `Xef ${c.name} (${c.from}) · sala ${room.code}`)),
      ),
      ready,
      h('button', { class: 'btn secondary', onclick: () => renderChef(true) }, 'Canviar de xef'),
      leaderTools,
      'vibrate' in navigator ? h('label', { class: 'tip' }, hap, 'Vibració en prémer botons') : null,
      h('button', { class: 'linkish', onclick: leaveRoom }, 'Sortir de la sala'),
    ),
  );
}

function leaveRoom(): void {
  socket.send({ t: 'player:leave' });
  sessionStore.clear();
  st.room = null;
  st.playerId = '';
  go('code');
}

function renderResults(): void {
  const r = st.results;
  const room = st.room;
  if (!room) return;
  const leader = isLeader();
  const next = r ? nextLevelId(r.levelId) : undefined;
  const nextOk = !!next && room.unlocked.includes(next);
  app.replaceChildren(
    h(
      'div',
      { class: 'overlay' },
      h('h2', {}, r?.won ? 'Servei completat!' : 'Fi del servei'),
      r ? h('div', { class: 'res-stars' }, [0, 1, 2].map((i) => svg(UI_ICONS.star(i < r.stars, 56)))) : null,
      r ? h('p', {}, `${r.score} punts · ${r.delivered} plats servits`) : null,
      leader
        ? h(
            'div',
            { class: 'stack', style: { width: 'min(22rem, 86vw)' } },
            nextOk ? h('button', { class: 'btn go big', onclick: () => socket.send({ t: 'flow', action: 'next' }) }, 'Següent nivell') : null,
            h('button', { class: `btn big ${nextOk ? 'secondary' : 'go'}`, onclick: () => socket.send({ t: 'flow', action: 'retry' }) }, 'Repetir nivell'),
            h('button', { class: 'btn secondary', onclick: () => socket.send({ t: 'flow', action: 'toLobby' }) }, 'Tornar a la sala'),
          )
        : h('p', {}, 'Mira la pantalla gran. El cap de cuina decideix què fem ara.'),
    ),
  );
}

// ───────────────────────── Game pad ─────────────────────────
let padEls: {
  root: HTMLElement;
  held: HTMLElement;
  near: HTMLElement;
  interact: HTMLButtonElement;
  interactLbl: HTMLElement;
  use: HTMLButtonElement;
  useLbl: HTMLElement;
  ring: HTMLElement;
  dot: HTMLElement;
  overlay: HTMLElement;
} | null = null;

const input = { x: 0, z: 0, use: false, seq: 0, actSeq: Date.now() % 1_000_000, lastSent: 0, lastX: 0, lastZ: 0, lastUse: false };
let sendTimer: number | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

function renderPad(): void {
  const room = st.room;
  const me = room?.players.find((p) => p.id === st.playerId);
  const color = SLOT_COLORS[me?.slot ?? st.slot]!;
  const held = h('div', { class: 'held', 'aria-live': 'polite' });
  const near = h('div', { class: 'near' });
  const dot = h('span', { class: 'dot', title: 'Connexió' });
  const pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pausa', onclick: () => socket.send({ t: 'flow', action: 'pause' }) }, svg(UI_ICONS.pause));
  const top = h('div', { class: 'pad-top' }, h('span', { class: 'slot-badge' }, SLOT_LABELS[me?.slot ?? st.slot]), held, near, dot, pauseBtn);

  const base = h('div', { class: 'stick-base idle' }, h('div', { class: 'stick-knob' }));
  const zone = h('div', { class: 'stick-zone', 'aria-label': 'Joystick: llisca per moure el xef' }, base, h('div', { class: 'hint-txt' }, 'Llisca per caminar'));
  const interactLbl = h('span', { class: 'lbl' }, 'Agafar / Deixar');
  const interact = h('button', { class: 'pbtn interact', 'aria-label': 'Interactuar' }, svg(UI_ICONS.hand), interactLbl) as HTMLButtonElement;
  const useLbl = h('span', { class: 'lbl' }, 'Tallar');
  const ring = h('span', { class: 'ring', hidden: true });
  const use = h('button', { class: 'pbtn use dim', 'aria-label': 'Acció (mantén premut)' }, ring, svg(UI_ICONS.knife), useLbl) as HTMLButtonElement;
  const buttons = h('div', { class: 'buttons' }, use, interact);
  const overlay = h('div', { class: 'overlay', hidden: true });
  const root = h('div', { class: 'gamepad', style: { '--pc': color } }, top, zone, buttons, overlay);
  app.replaceChildren(root);
  padEls = { root, held, near, interact, interactLbl, use, useLbl, ring, dot, overlay };

  setupStick(zone, base);
  setupButton(interact, () => {
    input.actSeq++;
    socket.send({ t: 'act', s: input.actSeq });
    buzz(12);
  });
  setupHold(use, (down) => {
    input.use = down;
    pushInput(true);
    if (down) buzz(8);
  });
  startInput();
  updatePadHint();
  updateOverlay();
  updateConnUi();
  void requestWakeLock();
}

function setupStick(zone: HTMLElement, base: HTMLElement): void {
  const knob = base.firstElementChild as HTMLElement;
  let active: number | null = null;
  let cx = 0;
  let cy = 0;
  const radius = () => base.getBoundingClientRect().width / 2 || 70;
  const rest = () => {
    const r = zone.getBoundingClientRect();
    base.style.left = `${r.width / 2}px`;
    base.style.top = `${r.height / 2}px`;
    knob.style.transform = '';
    base.classList.add('idle');
  };
  rest();
  zone.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    cx = e.clientX - r.left;
    cy = e.clientY - r.top;
    base.style.left = `${cx}px`;
    base.style.top = `${cy}px`;
    base.classList.remove('idle');
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - cx;
    let dy = e.clientY - r.top - cy;
    const rad = radius();
    const len = Math.hypot(dx, dy);
    if (len > rad) {
      dx = (dx / len) * rad;
      dy = (dy / len) * rad;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // dead zone 12% + response curve for fine control
    const mag = Math.min(1, len / rad);
    const eff = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    const nx = len > 0 ? dx / Math.min(len, rad) : 0;
    const ny = len > 0 ? dy / Math.min(len, rad) : 0;
    input.x = nx * eff;
    input.z = ny * eff; // screen down = +z (towards camera)
    pushInput(false);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    input.x = 0;
    input.z = 0;
    rest();
    pushInput(true);
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  window.addEventListener('resize', rest);
}

function setupButton(btn: HTMLElement, onPress: () => void): void {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    onPress();
  });
  const up = () => btn.classList.remove('down');
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function setupHold(btn: HTMLElement, onChange: (down: boolean) => void): void {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    onChange(true);
  });
  const up = () => {
    if (!btn.classList.contains('down')) return;
    btn.classList.remove('down');
    onChange(false);
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

let trailing: number | null = null;

/** Sends movement when it changed meaningfully (throttled to ~22 Hz with a trailing send), or as a keep-alive. */
function pushInput(force: boolean): void {
  const now = performance.now();
  const changed = Math.abs(input.x - input.lastX) > 0.06 || Math.abs(input.z - input.lastZ) > 0.06 || input.use !== input.lastUse;
  if (!force && !changed) return;
  if (!force && now - input.lastSent < 45) {
    // make sure the latest stick position is sent once the throttle window closes
    if (trailing === null) {
      trailing = window.setTimeout(() => {
        trailing = null;
        pushInput(true);
      }, 45 - (now - input.lastSent));
    }
    return;
  }
  if (trailing !== null) {
    clearTimeout(trailing);
    trailing = null;
  }
  input.seq++;
  if (socket.send({ t: 'in', s: input.seq, x: round2(input.x), z: round2(input.z), u: input.use })) {
    input.lastSent = now;
    input.lastX = input.x;
    input.lastZ = input.z;
    input.lastUse = input.use;
  }
}

function startInput(): void {
  stopInput();
  sendTimer = window.setInterval(() => {
    const moving = input.x !== 0 || input.z !== 0 || input.use;
    if (moving && performance.now() - input.lastSent > 150) pushInput(true);
  }, 60);
}

function stopInput(): void {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = null;
  input.x = input.z = 0;
  input.use = false;
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

function updatePadHint(): void {
  if (!padEls) return;
  const hnt = st.hint;
  padEls.interactLbl.textContent = hnt.interact ?? (hnt.held ? 'Deixar' : 'Agafar');
  padEls.interact.classList.toggle('dim', !hnt.interact);
  padEls.useLbl.textContent = hnt.use ?? 'Acció';
  padEls.use.classList.toggle('dim', !hnt.use);
  padEls.ring.hidden = hnt.progress === null;
  if (hnt.progress !== null) padEls.ring.style.setProperty('--p', String(hnt.progress));
  padEls.near.textContent = hnt.near ?? '';
  const ing = heldIngredient(hnt.held);
  padEls.held.replaceChildren(
    ...(hnt.held ? [ing ? svg(ingredientIcon(ing, undefined, 30)) : svg(UI_ICONS.plate), document.createTextNode(hnt.held)] : [document.createTextNode('Mans buides')]),
  );
}

function heldIngredient(label: string | null): IngredientKind | null {
  if (!label || label.startsWith('Plat') || label.startsWith('Bol')) return null;
  const l = label.toLowerCase();
  if (l.startsWith('pizza')) return 'dough';
  if (l.startsWith('patates')) return 'potato';
  for (const def of Object.values(INGREDIENTS)) if (l.startsWith(def.name.toLowerCase())) return def.id;
  return null;
}

function updateOverlay(): void {
  if (!padEls || !st.room) return;
  const o = padEls.overlay;
  const phase = st.room.phase;
  if (phase === 'countdown') {
    o.hidden = false;
    o.replaceChildren(h('h2', {}, 'Prepara’t!'), h('p', {}, 'Mira la pantalla gran. Fes servir el joystick per caminar i el botó groc per agafar i deixar.'));
  } else if (phase === 'paused') {
    o.hidden = false;
    const reason = st.room.pauseReason === 'disconnect' ? 'Esperant que torni un jugador o la pantalla…' : 'Partida en pausa';
    o.replaceChildren(h('h2', {}, 'Pausa'), h('p', {}, reason));
    if (isLeader() && st.room.pauseReason !== 'disconnect') {
      o.append(h('button', { class: 'btn go big', onclick: () => socket.send({ t: 'flow', action: 'resume' }) }, 'Continuar'));
    }
  } else {
    o.hidden = true;
  }
}

function updateConnUi(): void {
  if (padEls) {
    padEls.dot.classList.toggle('bad', st.status !== 'open');
    padEls.dot.title = st.status === 'open' ? 'Connectat' : 'Reconnectant…';
  }
  let ov = document.getElementById('conn-ov');
  if (st.status === 'open' || st.step === 'code' || st.step === 'chef') {
    ov?.remove();
    return;
  }
  if (!ov) {
    ov = overlayScreen(st.status === 'offline' ? 'Sense connexió' : 'Reconnectant…', 'No et moguis: recuperarem la teva plaça automàticament.', st.status !== 'offline');
    ov.id = 'conn-ov';
    if (st.status === 'offline') ov.append(h('button', { class: 'btn', onclick: () => socket.retry() }, 'Tornar-ho a provar'));
    app.append(ov);
  }
}

function feedback(kind: 'invalid' | 'served' | 'wrong' | 'pickup', text: string): void {
  if (kind === 'pickup') return buzz(10);
  const root = padEls?.root ?? app;
  const el = h('div', { class: `fb ${kind === 'served' ? 'good' : 'bad'}`, role: 'status' }, kind === 'served' ? `Servit! ${text}` : text);
  root.querySelectorAll('.fb').forEach((x) => x.remove());
  root.append(el);
  setTimeout(() => el.remove(), 2200);
  buzz(kind === 'served' ? [20, 40, 20] : 40);
}

function buzz(pattern: number | number[]): void {
  if (!st.prefs.haptics || !('vibrate' in navigator)) return;
  // browsers only allow vibration after the user has interacted with the page
  const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* vibration is optional and never the only feedback */
  }
}

async function requestWakeLock(): Promise<void> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (wl) wakeLock = await wl.request('screen');
  } catch {
    /* not supported or denied: game still works */
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ───────────────────────── Boot ─────────────────────────
const sess = sessionStore.get();
if (sess && (!st.code || sess.code === st.code)) go('joining');
else render();
void LEVELS;

// read-only debug surface for automated browser tests
(window as unknown as { __pad: unknown }).__pad = {
  get input() {
    return { ...input };
  },
  get step() {
    return st.step;
  },
  get status() {
    return st.status;
  },
};
