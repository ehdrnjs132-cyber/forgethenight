// Enhancement conversions and daily counters, driven by the skill tree (core/systems/skillTree.ts).
// Conversions are applied AFTER the base roll; the base table is never changed:
//   1. 신의 망치: a SUCCESS or GREAT_SUCCESS becomes +5 (then no other conversion).
//   2. otherwise, a SUCCESS becomes GREAT_SUCCESS with one roll at
//      기적의 불꽃 % + min(streak × 과열 per, 과열 max)  (capped at 100%), never two separate rolls.
//   3. 굳은 쇠: a DROP becomes KEEP with its own roll (drawn only when that node is owned).
// Pure functions over GameState.
import { MAX_LEVEL } from '../../config/weapons';
import { DIVINE_STEP } from '../../config/forgeSkills';
import type { Outcome } from '../../config/enhancement';
import type { Rng } from '../rng';
import type { DailyCounters, EnhanceCandidate, GameState, Weapon } from '../state/types';
import { levelAfter, rollOutcome } from './enhancement';
import type { EnhanceRow } from '../../config/enhancement';
import { treeEffects } from './skillTree';
import { STAMINA } from '../../config/skillTree';

/** Today's counters (fresh ones when the stored day is not today). */
export function daily(state: GameState): DailyCounters {
  const d = state.daily;
  return d && d.day === state.day ? d : { day: state.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: 0, secondWind: 0 };
}

// ───────────────────────── stamina (user decisions 2026-11-26)
// From the first strike of the day the blacksmith tires: stamina drains a little every second (while the
// forge is open) until the next morning refills it. Faster hammering therefore means more strikes out of
// the same stamina, which is what the speed stars are for. At 0 the hammer stops for the day.
export function staminaMax(state: GameState): number {
  return STAMINA.max + treeEffects(state).staminaMax;
}

/** Stamina lost per second once the day's work has started. */
export function drainRate(state: GameState): number {
  return STAMINA.drainPerSec * (1 - Math.min(STAMINA.maxCut, treeEffects(state).drainCut));
}

export function staminaLeft(state: GameState): number {
  return Math.max(0, staminaMax(state) - (daily(state).staminaUsed ?? 0));
}

/** The first strike of the day has been made: the drain is running. */
export function staminaStarted(state: GameState): boolean {
  return !!daily(state).staminaStarted;
}

/** Seconds of work left today at the current drain. */
export function workSecondsLeft(state: GameState): number {
  return staminaLeft(state) / drainRate(state);
}

/**
 * A strike: starts the day's drain, and 굳은 살 / 아끼기 / 불굴 may win back STAMINA.refundSec seconds of
 * stamina (one roll, drawn only when owned).
 */
export function strike(state: GameState, rng: Rng): { state: GameState; refund: number } {
  const e = treeEffects(state);
  const lucky = e.staminaSave > 0 && rng.next() * 100 < e.staminaSave;
  const refund = lucky ? Math.min(daily(state).staminaUsed ?? 0, drainRate(state) * STAMINA.refundSec) : 0;
  return { state: withDaily(state, { staminaStarted: true, staminaUsed: (daily(state).staminaUsed ?? 0) - refund }), refund };
}

/**
 * Let `seconds` of work pass. Nothing happens before the first strike or once stamina is gone.
 * 두 번째 바람: once a day, running out gives back a share of the maximum.
 */
export function drainStamina(state: GameState, seconds: number): { state: GameState; drained: number; secondWind: number } {
  if (!staminaStarted(state) || staminaLeft(state) <= 0 || seconds <= 0) return { state, drained: 0, secondWind: 0 };
  const max = staminaMax(state);
  const d = daily(state);
  const before = d.staminaUsed ?? 0;
  let used = Math.min(max, before + drainRate(state) * seconds);
  let wind = 0;
  const e = treeEffects(state);
  if (used >= max && e.secondWind > 0 && !d.secondWind) {
    wind = Math.round((max * e.secondWind) / 100);
    used = max - wind;
  }
  return { state: withDaily(state, { staminaUsed: used, ...(wind ? { secondWind: 1 } : {}) }), drained: used - before + wind, secondWind: wind };
}

export function withDaily(state: GameState, patch: Partial<Omit<DailyCounters, 'day'>>): GameState {
  return { ...state, daily: { ...daily(state), ...patch } };
}

export function phoenixLeft(state: GameState): number {
  return Math.max(0, treeEffects(state).phoenix.perDay - daily(state).phoenix);
}

/** Level a weapon destroyed at `level` comes back at, under 불사조. */
export function phoenixLevel(state: GameState, level: number): number {
  const mode = treeEffects(state).phoenix.mode;
  const l = mode === 'full' ? level : mode === 'minus2' ? level - 2 : Math.floor(level / 2);
  return Math.max(0, Math.min(MAX_LEVEL, l));
}

export function fateSplitLeft(state: GameState): number {
  return Math.max(0, treeEffects(state).fateSplit - daily(state).fateSplit);
}

/** Current 과열 단조 bonus (%p) on a weapon. */
export function overheatBonus(state: GameState, weapon: Weapon): number {
  const o = treeEffects(state).overheat;
  return Math.min((weapon.streak ?? 0) * o.per, o.max);
}

/** Chance (%) that a plain SUCCESS on this weapon becomes a GREAT_SUCCESS. */
export function greatConversionChance(state: GameState, weapon: Weapon): number {
  return Math.min(100, treeEffects(state).miracle + overheatBonus(state, weapon));
}

/**
 * Roll one result for `weapon` with the given row and apply the conversions.
 * Always draws three numbers (base, 신의 망치, 기적/과열), plus one for 굳은 쇠 only when a drop is
 * rolled and that node is owned.
 */
export function rollCandidate(state: GameState, weapon: Weapon, row: EnhanceRow, rng: Rng, force?: Outcome): EnhanceCandidate {
  const e = treeEffects(state);
  const baseRoll = rng.next();
  const divineRoll = rng.next() * 100;
  const greatRoll = rng.next() * 100;
  const rolled = force ?? rollOutcome(row, baseRoll);
  let outcome = rolled;
  let miracle = false;
  let divine = false;
  let level = levelAfter(weapon.level, rolled);
  if (!force && (rolled === 'success' || rolled === 'great')) {
    if (divineRoll < e.divine) {
      divine = true;
      outcome = 'great';
      level = Math.min(MAX_LEVEL, weapon.level + DIVINE_STEP);
    } else if (rolled === 'success' && greatRoll < greatConversionChance(state, weapon)) {
      miracle = true;
      outcome = 'great';
      level = levelAfter(weapon.level, 'great');
    }
  }
  if (!force && rolled === 'down' && e.downKeep > 0 && rng.next() * 100 < e.downKeep) {
    outcome = 'keep';
    level = weapon.level;
  }
  return { rolled, outcome, level, miracle, divine };
}

/** Rank of a candidate for 두 번 내려치기: higher level is better, destroyed is worst. */
export function candidateScore(c: EnhanceCandidate): number {
  return c.level === null ? -1 : c.level;
}
