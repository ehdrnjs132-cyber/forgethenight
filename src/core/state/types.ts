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
  /** 과열 단조: successes in a row on this weapon (absent = 0). */
  streak?: number;
  /** 황금 무기 (skill tree): sells for GOLDEN_SELL_MUL × the price. */
  golden?: boolean;
}

/** One possible enhancement result, already including the skill conversions (운명 분열 shows two). */
export interface EnhanceCandidate {
  /** Outcome rolled from the table. */
  rolled: Outcome;
  /** Outcome after 기적의 불꽃 / 과열 단조 / 신의 망치. */
  outcome: Outcome;
  /** Level after it; null = destroyed (before 불사조의 모루, which is decided when it is applied). */
  level: number | null;
  miracle: boolean;
  divine: boolean;
}

/** 운명 분열 waiting for the player's pick; survives a reload. */
export interface PendingSplit {
  weaponId: string;
  before: Weapon;
  candidates: [EnhanceCandidate, EnhanceCandidate];
}

/** Per-day counters, reset when the day changes. */
export interface DailyCounters {
  day: number;
  phoenix: number;
  fateSplit: number;
  freeWeapons: number;
  /** Stamina spent on hammer strikes today (absent in older saves = 0). */
  staminaUsed?: number;
  /** 두 번째 바람 already used today. */
  secondWind?: number;
  /** The first strike of the day was made, so stamina is draining (2026-11-26). */
  staminaStarted?: boolean;
  /** Today's forge record for the end-of-day summary (2026-11-27). Absent = nothing done yet. */
  log?: DayLog;
}

/** What happened at the anvil today (the evening's summary). */
export interface DayLog {
  attempts: number;
  great: number;
  success: number;
  keep: number;
  down: number;
  destroy: number;
  /** Gold from weapons sold today. */
  earned: number;
  /** Gold spent on strikes today. */
  spent: number;
  sold: number;
  /** The highest weapon reached by a strike today (its look, for the showcase). */
  best: { level: number; element: Element; cls: WeaponClass; golden?: boolean } | null;
}

/** 신의 망치 (chosen one-shot): rents paid, charges held, whether the next strike uses one. */
export interface GodHammerState {
  /** Rent visits paid this run (prepaid ones included; mercy and unpaid ones not). */
  rentsPaid: number;
  charges: number;
  /** The next strike uses a charge. */
  armed: boolean;
  /** Days of the rent visits already counted, so a visit can never charge twice. */
  counted: number[];
}

/** The king's last rent visit, for the morning notice. */
export interface RentNotice {
  day: number;
  amount: number;
  paid: number;
  /** Not paid: the run ends (user decision 2026-11-20; it used to cost one life). */
  lifeLost: boolean;
  /** 왕의 자비 put the unpaid rent off to the next visit. */
  mercy?: boolean;
  /** The visit was already paid in advance. `paid` is then what was actually paid back then. */
  prepaid?: boolean;
  /** Day the advance payment was made (absent in older saves). */
  prepaidDay?: number;
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
  /** Inventory slots owned (3 at the start, more from the merchant). */
  inventoryCap: number;
  equippedId: string | null;
  /** Monotonic counter for weapon ids. */
  weaponSeq: number;
  /** Days whose three free weapons were already handed out (§4: no repeats on retry). */
  grantedDays: number[];
  /** Weapons bought at the forge this run; each purchase doubles the next price (absent in older saves = 0). */
  weaponsBought?: number;
  /** Legacy five-skill levels (2026-11-19); refunded and cleared on load. */
  forgeSkills?: Partial<Record<string, number>>;
  /** Skill tree nodes bought (config/skillTree.ts; absent = none). */
  treeNodes?: string[];
  /** 몰아치기: the next enhancement costs nothing. */
  freeEnhance?: boolean;
  /** 왕의 자비 already used this run. */
  mercyUsed?: boolean;
  daily?: DailyCounters;
  /** 운명 분열 switched on for the next enhancement. */
  splitArmed?: boolean;
  pendingSplit?: PendingSplit | null;
  /** Day the king next comes for rent (absent = 3 days after the day it is first needed). */
  rentDueDay?: number;
  lastRent?: RentNotice | null;
  /** The next visit was paid in advance (prepaying was removed 2026-11-26; older saves may still have it). */
  rentPrepaid?: boolean;
  /** Day the 운명의 카드 was last played (one game a day). */
  cardDay?: number;
  /** Day the 운명의 무기 카드 (DAY 30+, weapons at stake) was last played. */
  weaponCardDay?: number;
  /**
   * The weapon 불사조의 모루 protects (QA 2026-11-27: the player picks it). Only its destruction is
   * revived; null / absent = no weapon chosen, so nothing is revived.
   */
  phoenixTarget?: string | null;
  /** 신의 망치 as a chosen one-shot (2026-11-27). Absent in older saves = nothing paid yet. */
  godHammer?: GodHammerState;
  /** Seconds spent playing this run (the game counts it while a run screen is open; 2026-11-27). */
  playSeconds?: number;
  /** Day the merchant Morr last talked (his visit's dialogue plays once a visit). */
  merchantTalkDay?: number;
  /** Weapons destroyed in the run when he last talked (a later visit notices new breakage). */
  merchantTalkDestroyed?: number;
  /** What the advance payment actually cost and on which day (QA 2026-11-20: the notice showed the visit-day rate). */
  rentPrepaidAmount?: number;
  rentPrepaidDay?: number;
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
  goldSpentEnhancing: number;
}

/** What the game over screen shows (§20). */
export interface GameOverSummary {
  day: number;
  bestLevel: number;
  kills: number;
  bossesKilled: number;
  nightSeconds: number;
  /** Time actually spent playing the run, in seconds (2026-11-27; absent from older summaries). */
  playSeconds?: number;
  /** Gold the run made from selling weapons. */
  goldEarned?: number;
}

/** Kept across game overs (§13 보존 대상). */
export interface Records {
  bestDay: number;
  bestLevel: number;
  kills: number;
  deaths: number;
  bossesKilled: string[];
  runs: number;
  /** Cutscenes already watched (the intro plays automatically only the first time). */
  seen: string[];
}
