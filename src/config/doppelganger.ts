// Doppelgangers: blacksmiths from parallel worlds (reboot spec §3.2–3.6).
// PROVISIONAL: every number here is a tuning placeholder until the enhancement table, enemy difficulty
// and economy are validated (spec PART 10, 15). Change freely; nothing is final.
import type { Element, WeaponClass } from './weapons';

export type Temperament = 'stable' | 'challenger' | 'allIn';

export interface TemperamentDef {
  name: string;
  desc: string;
  /** Stops enhancing on reaching this fraction of the night's "expected level" (Infinity = never stops early). */
  targetFactor: number;
  /** Extra levels added on top of the target, rolled 0..targetJitter. */
  targetJitter: number;
  /** How many fresh +0 weapons it may start after losing one to destruction. */
  retries: number;
  /** Clue modifiers (bluffing): how loud its weapon looks/sounds compared to its true level. */
  glowBias: number;
  /** AI: how eagerly it charges in (0 = careful, 1 = reckless). */
  aggression: number;
}

export const TEMPERAMENTS: Record<Temperament, TemperamentDef> = {
  stable: { name: '안정형', desc: '적당한 단계에서 멈춘다', targetFactor: 0.75, targetJitter: 1, retries: 1, glowBias: 0, aggression: 0.35 },
  challenger: { name: '도전형', desc: '더 높이 가려고 위험을 감수한다', targetFactor: 1.1, targetJitter: 3, retries: 2, glowBias: 0.15, aggression: 0.6 },
  allIn: { name: '올인형', desc: '파괴를 각오하고 극한까지 민다', targetFactor: 1.8, targetJitter: 6, retries: 4, glowBias: -0.25, aggression: 0.85 },
};

export interface NightPlan {
  /** Doppelgangers that come through the rift. */
  count: number;
  /** Enhancement attempts each doppelganger may spend in total (all its weapons). */
  attemptBudget: number;
  /** The level an average doppelganger aims for (temperaments scale it). */
  expectedLevel: number;
  /** Weapons each rival's own anvil has handed it so far (3 a day, capped). */
  weapons: number;
  weights: Record<Temperament, number>;
}

/** Spec: DAY 1 brings three. Count, budget and target grow with the day. */
export function nightPlan(day: number): NightPlan {
  const d = Math.max(1, day);
  return {
    count: Math.min(8, 3 + Math.floor((d - 1) / 5)),
    attemptBudget: Math.round(14 + d * 9),
    expectedLevel: Math.round(4 + d * 0.55),
    weapons: Math.min(12, 3 * d),
    weights: {
      stable: Math.max(1, 6 - d * 0.12),
      challenger: 3 + d * 0.06,
      allIn: 1 + d * 0.08,
    },
  };
}

/** Name pieces: "<title> <role>", e.g. "STORM FORGEMASTER". */
export const ELEMENT_TITLE: Record<Element, string[]> = {
  fire: ['EMBER', 'CINDER', 'BLAZE'],
  earth: ['STONE', 'IRON', 'QUAKE'],
  lightning: ['STORM', 'THUNDER', 'SPARK'],
  water: ['TIDE', 'DEEP', 'RAIN'],
  ice: ['FROST', 'RIME', 'WINTER'],
};
export const ROLES = ['FORGEMASTER', 'SMITH', 'HAMMERER', 'ANVILBORN', 'BLADEWRIGHT'];

/** English weapon words for the reveal banner: "+43 THUNDER SPEAR". */
export const ELEMENT_WORD: Record<Element, string> = { fire: 'FIRE', earth: 'EARTH', lightning: 'THUNDER', water: 'TIDE', ice: 'ICE' };
export const CLASS_WORD: Record<WeaponClass, string> = { sword: 'SWORD', spear: 'SPEAR', axe: 'AXE' };

/**
 * When the hidden level is revealed (spec §3.5): its first heavy attack, or when it drops below this HP
 * fraction, or when it has been fighting for this many seconds.
 */
export const REVEAL = { hpBelow: 0.5, afterSeconds: 25 };

/** Combat scaling for doppelgangers (PROVISIONAL). */
export const DOPPEL_COMBAT = {
  /** HP = base × growth^(day-1) × (1 + level × perLevel). */
  hp: { base: 1400, growth: 1.22, perLevel: 0.05 },
  /** Hit damage to the player = base × growth^level (a heavy attack ×heavyMul). Avoidable by design. */
  damage: { base: 7, growth: 1.1, heavyMul: 2.2 },
  /** Telegraph (wind-up) seconds before a strike lands: always readable (spec §3.4, §4.5). */
  windup: { light: 0.45, heavy: 0.85 },
  xp: 40,
};
