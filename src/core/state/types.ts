import type { Element, WeaponClass } from '../../config/weapons';
import type { Outcome } from '../../config/enhancement';
import type { EnhanceItem, ItemId } from '../../config/economy';

export interface StockEntry {
  item: ItemId;
  price: number;
  /** Copies left in this visit. */
  left: number;
}

export interface MerchantVisit {
  day: number;
  stock: StockEntry[];
}

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
  /** Index the weapon had in the inventory, so an undo puts it back in place. */
  index: number;
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
  /** Owned consumables by ItemId (hearts are used at once and never stored). */
  items: Record<string, number>;
  /** Enhancement items switched on for the next attempt. */
  armed: Partial<Record<EnhanceItem, boolean>>;
  /** Today's merchant stock, rolled once when a visiting day begins (§15). */
  merchant: MerchantVisit | null;
  tutorials: Record<string, boolean>;
  /** State captured when the night begins; restored on death (DECISIONS.md #4). */
  nightSnapshot: NightSnapshot | null;
  lastEnhance: EnhanceRecord | null;
  story: { flags: Record<string, boolean> };
  stats: RunStats;
}

export type NightSnapshot = Omit<GameState, 'nightSnapshot'>;

/** Per-run totals, shown on the game over screen (§20). */
export interface RunStats {
  enhanceAttempts: number;
  destroyed: number;
  bestLevel: number;
  kills: number;
  /** Seconds survived across all nights of the run. */
  nightSeconds: number;
  nightsWon: number;
  deaths: number;
  bossesKilled: number;
  sold: number;
  goldEarned: number;
}

/** What the game over screen shows (§20). */
export interface GameOverSummary {
  day: number;
  bestLevel: number;
  kills: number;
  bossesKilled: number;
  nightSeconds: number;
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
