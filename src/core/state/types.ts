import type { Element, WeaponClass } from '../../config/weapons';
import type { Outcome } from '../../config/enhancement';

export interface Weapon {
  id: string;
  element: Element;
  cls: WeaponClass;
  level: number;
  /** Day the weapon was handed out. */
  bornDay: number;
}

/** The most recent enhancement, kept for the time-reversal stone (DECISIONS.md, H). */
export interface EnhanceRecord {
  day: number;
  weaponBefore: Weapon;
  wasEquipped: boolean;
  outcome: Outcome;
}

/** Everything belonging to the current run. Wiped on game over; Records survive. */
export interface GameState {
  version: number;
  /** Seeded RNG state; advances with every random roll. */
  rng: number;
  day: number;
  phase: 'day' | 'night';
  lives: number;
  gold: number;
  weapons: Weapon[];
  equippedId: string | null;
  /** Monotonic counter for weapon ids. */
  weaponSeq: number;
  /** Days whose three free weapons were already handed out (§4: no repeats on retry). */
  grantedDays: number[];
  player: { level: number; xp: number; skillPoints: number };
  skills: Record<string, number>;
  totems: { owned: string[]; equipped: string[] };
  items: Record<string, number>;
  tutorials: Record<string, boolean>;
  /** State captured when the night begins; restored on death (DECISIONS.md #4). Filled in M3. */
  nightSnapshot: unknown | null;
  lastEnhance: EnhanceRecord | null;
  story: { flags: Record<string, boolean> };
  stats: { enhanceAttempts: number; destroyed: number; bestLevel: number };
}

/** Kept across game overs (§13 보존 대상). */
export interface Records {
  bestDay: number;
  bestLevel: number;
  kills: number;
  deaths: number;
  bossesKilled: string[];
  runs: number;
}
