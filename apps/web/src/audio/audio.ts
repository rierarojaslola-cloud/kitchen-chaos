/**
 * Procedural audio engine (Web Audio API). Every sound is synthesised at runtime, so the
 * game ships with no third-party audio files. Music is a small step sequencer with a
 * per-restaurant style and an intensity level (raised when time is short or during rush).
 *
 * PROVISIONAL: functional and original, but a composer/sound designer pass is planned
 * (see docs/ASSETS.md). Volumes persist in localStorage.
 */
export type Sfx =
  | 'ui'
  | 'join'
  | 'leave'
  | 'pickup'
  | 'place'
  | 'chop'
  | 'chopDone'
  | 'cookDone'
  | 'sizzle'
  | 'burnWarn'
  | 'burnt'
  | 'served'
  | 'wrong'
  | 'invalid'
  | 'trash'
  | 'orderNew'
  | 'orderExpired'
  | 'alarm'
  | 'repair'
  | 'tick'
  | 'go'
  | 'win'
  | 'lose';

export type MusicStyle = 'menu' | 'burger' | 'pizza' | 'asian' | 'none';

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Style {
  bpm: number;
  root: number;
  scale: number[];
  chords: number[][];
  lead: 'square' | 'triangle' | 'sawtooth' | 'sine';
  swing: number;
}

const STYLES: Record<Exclude<MusicStyle, 'none'>, Style> = {
  menu: { bpm: 104, root: 57, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], lead: 'triangle', swing: 0.1 },
  burger: { bpm: 122, root: 52, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], lead: 'square', swing: 0.05 },
  pizza: { bpm: 112, root: 55, scale: [0, 2, 4, 5, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'triangle', swing: 0.18 },
  asian: { bpm: 98, root: 54, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'sine', swing: 0.08 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private style: MusicStyle = 'none';
  private intensity = 0;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private lastPlayed = new Map<Sfx, number>();
  musicVolume = 0.5;
  sfxVolume = 0.8;
  muted = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('kc.audio') ?? '{}') as { music?: number; sfx?: number; muted?: boolean };
      if (typeof saved.music === 'number') this.musicVolume = saved.music;
      if (typeof saved.sfx === 'number') this.sfxVolume = saved.sfx;
      if (typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      /* storage unavailable (private mode): keep defaults */
    }
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.applyVolumes();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.style !== 'none' && !this.timer) {
      const s = this.style;
      this.style = 'none';
      this.setMusic(s);
    }
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.muted = muted;
    try {
      localStorage.setItem('kc.audio', JSON.stringify({ music, sfx, muted }));
    } catch {
      /* ignore storage failures */
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.32, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.7, t, 0.05);
  }

  // ───────────── SFX ─────────────
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number, bus?: GainNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterType: BiquadFilterType, freq: number, at = 0, q = 1, bus?: GainNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(s: Sfx): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // de-duplicate bursts of the same sound within 40 ms
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(s) ?? -1) < 0.04) return;
    this.lastPlayed.set(s, now);
    const v = 0.92 + Math.random() * 0.16; // subtle pitch variation
    switch (s) {
      case 'ui':
        this.tone(880 * v, 0.07, 'triangle', 0.25);
        break;
      case 'join':
        this.tone(523 * v, 0.1, 'triangle', 0.3);
        this.tone(784 * v, 0.14, 'triangle', 0.3, 0.08);
        break;
      case 'leave':
        this.tone(523 * v, 0.12, 'triangle', 0.25, 0, 330);
        break;
      case 'pickup':
        this.tone(420 * v, 0.08, 'sine', 0.35, 0, 760 * v);
        break;
      case 'place':
        this.noise(0.07, 0.4, 'lowpass', 700);
        this.tone(160 * v, 0.07, 'sine', 0.35);
        break;
      case 'chop':
        this.noise(0.05, 0.55, 'bandpass', 2600 * v, 0, 2);
        this.tone(240 * v, 0.04, 'square', 0.12);
        break;
      case 'chopDone':
      case 'cookDone':
        this.tone(988 * v, 0.1, 'triangle', 0.28);
        this.tone(1319 * v, 0.18, 'triangle', 0.28, 0.07);
        break;
      case 'sizzle':
        this.noise(0.6, 0.18, 'highpass', 5000);
        break;
      case 'burnWarn':
        for (let i = 0; i < 3; i++) this.tone(1200, 0.06, 'square', 0.18, i * 0.12);
        break;
      case 'burnt':
        this.noise(0.8, 0.35, 'lowpass', 600);
        this.tone(220, 0.5, 'sawtooth', 0.12, 0, 110);
        break;
      case 'served':
        this.tone(1568, 0.6, 'sine', 0.35);
        this.tone(2093, 0.5, 'sine', 0.2, 0.01);
        this.tone(784, 0.12, 'triangle', 0.3, 0.12);
        this.tone(1047, 0.2, 'triangle', 0.3, 0.2);
        break;
      case 'wrong':
      case 'invalid':
        this.tone(196, 0.16, 'square', s === 'wrong' ? 0.2 : 0.12, 0, 150);
        break;
      case 'trash':
        this.noise(0.3, 0.35, 'lowpass', 1200);
        this.tone(120, 0.15, 'sine', 0.3, 0.05);
        break;
      case 'orderNew':
        this.tone(1047 * v, 0.08, 'triangle', 0.22);
        this.tone(1319 * v, 0.12, 'triangle', 0.22, 0.09);
        break;
      case 'orderExpired':
        this.tone(392, 0.2, 'sawtooth', 0.15, 0, 260);
        this.tone(262, 0.3, 'sawtooth', 0.15, 0.18, 180);
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, 0.14, 'square', 0.16, i * 0.16);
        break;
      case 'repair':
        this.tone(660, 0.08, 'triangle', 0.25);
        this.tone(990, 0.12, 'triangle', 0.25, 0.08);
        this.tone(1320, 0.18, 'triangle', 0.25, 0.16);
        break;
      case 'tick':
        this.tone(1500, 0.03, 'square', 0.12);
        break;
      case 'go':
        this.tone(784, 0.12, 'square', 0.25);
        this.tone(1568, 0.3, 'square', 0.25, 0.12);
        break;
      case 'win':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, 'triangle', 0.28, i * 0.11));
        break;
      case 'lose':
        [7, 4, 0, -5].forEach((n, i) => this.tone(NOTE(64 + n), 0.35, 'triangle', 0.25, i * 0.18));
        break;
    }
  }

  // ───────────── Music ─────────────
  setMusic(style: MusicStyle): void {
    if (style === this.style) return;
    this.style = style;
    this.step = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (style === 'none' || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  /** 0 = calm, 1 = busy, 2 = final countdown. */
  setIntensity(level: number): void {
    this.intensity = level;
  }

  private schedule(): void {
    if (!this.ctx || this.style === 'none') return;
    const st = STYLES[this.style];
    const bpm = st.bpm * (this.intensity >= 2 ? 1.12 : 1);
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const i = this.step % 64;
      const bar = Math.floor(i / 16);
      const pos = i % 16;
      const chord = st.chords[bar % st.chords.length]!;
      const swing = pos % 2 ? stepDur * st.swing : 0;
      const t = this.nextTime + swing - this.ctx.currentTime;
      // bass on 1 and 3 (+ eighths when busy)
      if (pos % 8 === 0 || (this.intensity >= 1 && pos % 4 === 2)) this.musicTone(NOTE(st.root - 12 + chord[0]!), stepDur * 1.8, 'triangle', 0.5, t);
      // chord stabs
      if (pos === 4 || pos === 12) for (const n of chord) this.musicTone(NOTE(st.root + n), stepDur * 1.2, 'sine', 0.12, t);
      // lead: deterministic pseudo-melody from scale
      if (pos % 4 === 0 || (this.intensity >= 1 && pos % 2 === 0 && (i * 7) % 5 === 0)) {
        const deg = st.scale[(i * 3 + bar * 2) % st.scale.length]!;
        this.musicTone(NOTE(st.root + 12 + deg), stepDur * 1.5, st.lead, st.lead === 'square' ? 0.05 : 0.11, t);
      }
      // percussion
      if (pos % 4 === 0) this.musicKick(t);
      if (pos % 8 === 4) this.musicSnare(t);
      if (this.intensity >= 1 || pos % 2 === 0) this.musicHat(t, pos % 2 ? 0.05 : 0.08);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private musicTone(f: number, dur: number, type: OscillatorType, vol: number, at: number): void {
    this.tone(f, dur, type, vol, Math.max(0, at), undefined, this.musicBus);
  }
  private musicKick(at: number): void {
    this.tone(120, 0.18, 'sine', 0.6, Math.max(0, at), 45, this.musicBus);
  }
  private musicSnare(at: number): void {
    this.noise(0.12, 0.25, 'bandpass', 1800, Math.max(0, at), 0.8, this.musicBus);
  }
  private musicHat(at: number, vol: number): void {
    this.noise(0.03, vol, 'highpass', 8000, Math.max(0, at), 1, this.musicBus);
  }
}

export const audio = new AudioEngine();
