// Placeholder sound (decision #6): synthesised with Web Audio until Higgsfield / team sounds replace it.
// Every public method maps to one sound name in §22 so files can be swapped in one place later.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; when?: number; slideTo?: number; attack?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, o: { gain?: number; when?: number; freq?: number; q?: number; type?: BiquadFilterType; sweepTo?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Hammer raise. */
  raise() {
    this.noise(0.18, { gain: 0.05, freq: 600, sweepTo: 1800, q: 0.8 });
  }

  /** Metal impact. `weight` 0..5 grows with the weapon's milestone tier (§7.4, §22). */
  strike(weight: number) {
    const base = 520 - weight * 55;
    this.noise(0.08, { gain: 0.35, freq: 4200, type: 'highpass', q: 0.7 });
    this.tone(base, 0.55 + weight * 0.12, { type: 'triangle', gain: 0.22 });
    this.tone(base * 2.76, 0.4 + weight * 0.08, { gain: 0.1 });
    this.tone(base * 5.4, 0.25, { gain: 0.05 });
    this.tone(70 + weight * 4, 0.25 + weight * 0.05, { gain: 0.3 + weight * 0.04, slideTo: 40 });
    if (weight >= 2) this.tone(base * 1.5, 1.1, { type: 'sine', gain: 0.05 + weight * 0.01, when: 0.02 }); // magic resonance
  }

  great() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.7, { type: 'triangle', gain: 0.12, when: 0.05 + i * 0.07 }));
    this.noise(0.6, { gain: 0.08, freq: 6000, type: 'highpass', when: 0.05 });
  }

  success() {
    this.tone(880, 0.6, { type: 'sine', gain: 0.1, when: 0.02 });
    this.tone(1320, 0.45, { type: 'sine', gain: 0.06, when: 0.05 });
  }

  keep() {
    this.tone(140, 0.22, { type: 'sine', gain: 0.18, slideTo: 90 });
  }

  down() {
    this.tone(420, 0.45, { type: 'sawtooth', gain: 0.07, slideTo: 120 });
    this.noise(0.35, { gain: 0.12, freq: 900, sweepTo: 200, q: 3 });
  }

  shatter() {
    this.noise(0.5, { gain: 0.4, freq: 3000, type: 'highpass' });
    for (let i = 0; i < 7; i++) this.tone(1800 + Math.random() * 2600, 0.12 + Math.random() * 0.2, { gain: 0.05, when: Math.random() * 0.25 });
    this.tone(90, 0.5, { gain: 0.3, slideTo: 35 });
  }

  /** "순간적인 정적" after destruction: duck everything for a moment. */
  silence(ms: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + 0.35;
    this.master.gain.setValueAtTime(0.55, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 0.05);
    this.master.gain.setValueAtTime(0.0001, t + ms / 1000);
    this.master.gain.linearRampToValueAtTime(0.55, t + ms / 1000 + 0.25);
  }

  awaken(tier: number) {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f * (1 + tier * 0.05), 1.2, { type: 'sine', gain: 0.08, when: 0.25 + i * 0.12 }));
  }

  click() {
    this.tone(1400, 0.05, { type: 'square', gain: 0.03 });
  }
}
