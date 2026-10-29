/**
 * In-game HUD on the big screen: order tickets, timer dial, score, crew strip, banners and
 * floating feedback anchored to 3D positions.
 */
import { getCharacter, SLOT_COLORS, SLOT_LABELS, type LobbyPlayer } from '@kc/shared';
import { RECIPES, type GameEvent, type LevelInitView, type OrderView, type PlayerView } from '@kc/game-logic';
import { chefPortrait, ingredientIcon, pizzaIcon, UI_ICONS } from '../common/icons';
import { fmtTime, h, svg } from '../common/dom';
import type { KitchenScene } from '../render/scene';

export class Hud {
  readonly el: HTMLElement;
  private ordersEl: HTMLElement;
  private timerEl: HTMLElement;
  private timerText: HTMLElement;
  private scoreEl: HTMLElement;
  private goalEl: HTMLElement;
  private crewEl: HTMLElement;
  private netEl: HTMLElement;
  private orderEls = new Map<number, { el: HTMLElement; bar: HTMLElement }>();
  private lastScore = 0;
  private level: LevelInitView;

  constructor(level: LevelInitView, private readonly scene: KitchenScene) {
    this.level = level;
    this.timerText = h('span', {}, fmtTime(level.duration));
    this.timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': 'Temps restant', style: { '--frac': '1' } }, this.timerText);
    this.scoreEl = h('div', { class: 'score', 'aria-live': 'polite' }, '0');
    this.goalEl = h('div', { class: 'goal' });
    this.ordersEl = h('div', { class: 'orders', 'aria-label': 'Comandes' });
    this.crewEl = h('div', { class: 'crew' });
    this.netEl = h('div', { class: 'net-warn', hidden: true }, svg(UI_ICONS.wifi), 'Reconnectant amb el servidor…');
    this.el = h(
      'div',
      { class: 'hud passthrough' },
      h('div', { class: 'rail' }),
      this.ordersEl,
      h('div', { class: 'clock-box' }, this.timerEl, this.scoreEl, this.goalEl),
      this.crewEl,
      this.netEl,
    );
    this.renderGoal(0);
  }

  setCrew(players: LobbyPlayer[], views: PlayerView[]): void {
    this.crewEl.replaceChildren(
      ...views
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((v) => {
          const lp = players.find((p) => p.id === v.id);
          const c = getCharacter(lp?.character ?? 'nuri');
          return h(
            'div',
            { class: `mate${v.connected ? '' : ' off'}`, style: { '--pc': SLOT_COLORS[v.slot] } },
            svg(chefPortrait(c, 40)),
            `${SLOT_LABELS[v.slot]} ${lp?.name ?? ''}`,
            v.connected ? null : ' · desconnectat',
          );
        }),
    );
  }

  setNet(ok: boolean): void {
    this.netEl.hidden = ok;
  }

  update(time: number, score: number, orders: OrderView[]): void {
    const frac = Math.max(0, time / this.level.duration);
    this.timerEl.style.setProperty('--frac', String(frac));
    this.timerText.textContent = fmtTime(time);
    this.timerEl.classList.toggle('low', time <= 30);
    if (score !== this.lastScore) {
      this.scoreEl.textContent = String(score);
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
      this.lastScore = score;
      this.renderGoal(score);
    }
    const live = new Set(orders.map((o) => o.id));
    for (const o of orders) {
      let entry = this.orderEls.get(o.id);
      if (!entry) {
        entry = this.makeTicket(o);
        this.orderEls.set(o.id, entry);
        this.ordersEl.append(entry.el);
      }
      const f = Math.max(0, o.t / o.T);
      entry.bar.style.transform = `scaleX(${f})`;
      entry.el.classList.toggle('low', f < 0.25);
    }
    for (const [id, entry] of this.orderEls) {
      if (!live.has(id) && !entry.el.classList.contains('gone') && !entry.el.classList.contains('expired')) {
        entry.el.classList.add('gone');
        setTimeout(() => entry.el.remove(), 600);
        this.orderEls.delete(id);
      }
    }
  }

  private renderGoal(score: number): void {
    const next = this.level.stars.find((s) => s > score);
    const got = this.level.stars.filter((s) => score >= s).length;
    this.goalEl.replaceChildren(
      ...[0, 1, 2].map((i) => svg(UI_ICONS.star(i < got, 22))),
      h('span', {}, next ? ` següent: ${next}` : ' màxim!'),
    );
  }

  private makeTicket(o: OrderView): { el: HTMLElement; bar: HTMLElement } {
    const r = RECIPES[o.r]!;
    const bar = h('i');
    const pizza = r.parts.find((p) => p.ing === 'dough');
    const dish = pizza ? h('div', { class: 'dish' }, svg(pizzaIcon(pizza.toppings ?? [], 52))) : null;
    const parts = pizza
      ? (pizza.toppings ?? []).map((t) => svg(ingredientIcon(t, 'chopped', 34)))
      : r.parts.map((p) => svg(ingredientIcon(p.ing, p.st === 'raw' ? undefined : p.st, 34)));
    const el = h(
      'article',
      { class: `ticket order${o.u ? ' urgent' : ''}`, 'aria-label': `Comanda: ${r.name}` },
      o.u ? h('span', { class: 'urgent-tag' }, 'Urgent · punts ×2') : null,
      h('div', { class: 'rname' }, r.name),
      dish,
      h('div', { class: 'parts' }, parts),
      h('div', { class: 'tbar' }, bar),
    );
    return { el, bar };
  }

  markExpired(orderId: number): void {
    const entry = this.orderEls.get(orderId);
    if (!entry) return;
    entry.el.classList.add('expired');
    setTimeout(() => entry.el.remove(), 700);
    this.orderEls.delete(orderId);
  }

  banner(text: string, kind: 'alert' | 'info' = 'alert'): void {
    const b = h('div', { class: `banner${kind === 'info' ? ' info' : ''}`, role: 'alert' }, text);
    this.el.append(b);
    setTimeout(() => b.remove(), 4000);
  }

  float(x: number, y: number, text: string, cls = ''): void {
    const f = h('div', { class: `float ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
    this.el.append(f);
    setTimeout(() => f.remove(), 1500);
  }

  handleEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.e) {
        case 'served': {
          const pos = this.scene.serveScreenPos();
          if (pos) {
            this.float(pos.x, pos.y, `+${ev.points + ev.tip + ev.coop}`);
            const extras = [ev.tip ? `propina +${ev.tip}` : '', ev.coop ? `equip +${ev.coop}` : ''].filter(Boolean).join('  ');
            if (extras) setTimeout(() => this.float(pos.x, pos.y + 40, extras, 'tip'), 200);
          }
          break;
        }
        case 'orderExpired':
          this.markExpired(ev.order);
          this.banner(`S'ha perdut una comanda: −${ev.penalty}`, 'info');
          break;
        case 'wrongDish': {
          const pos = this.scene.chefScreenPos(ev.p);
          if (pos) this.float(pos.x, pos.y, 'Ningú ha demanat això', 'bad');
          break;
        }
        case 'invalid': {
          const pos = this.scene.chefScreenPos(ev.p);
          if (pos) this.float(pos.x, pos.y, ev.reason, 'tip');
          break;
        }
        case 'trash':
          if (ev.waste > 0) {
            const pos = this.scene.chefScreenPos(ev.p);
            if (pos) this.float(pos.x, pos.y, `−${ev.waste}`, 'bad');
          }
          break;
        case 'chaos':
          this.banner(ev.text);
          break;
        case 'chaosEnd':
          if (ev.kind === 'rush') this.banner("S'ha calmat l'hora punta", 'info');
          if (ev.kind === 'shortage') this.banner('Ha arribat la reposició', 'info');
          break;
        case 'repaired': {
          const pos = this.scene.stationScreenPos(ev.st);
          if (pos) this.float(pos.x, pos.y, 'Reparat!');
          break;
        }
        case 'timeWarn':
          this.banner(`Queden ${ev.left} segons!`, 'info');
          break;
        default:
          break;
      }
    }
  }
}
