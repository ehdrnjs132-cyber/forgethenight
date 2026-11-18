// Seeded random numbers (mulberry32). The generator state is a single 32-bit integer,
// stored in GameState so a reloaded save continues the exact same sequence.

export function rngStep(state: number): [value: number, next: number] {
  const next = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(next ^ (next >>> 15), 1 | next);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

export class Rng {
  constructor(public state: number) {}

  /** Uniform in [0, 1). */
  next(): number {
    const [v, s] = rngStep(this.state);
    this.state = s;
    return v;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) | 0;
}
