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

// ───────────────────────── stamina (user decision 2026-11-26): every strike costs some, refilled each morning
export function staminaMax(state: GameState): number {
  return STAMINA.max + treeEffects(state).staminaMax;
}

/** Stamina one strike costs right now. */
export function strikeCost(state: GameState): number {
  return Math.max(STAMINA.minCost, STAMINA.strikeCost - treeEffects(state).strikeCut);
}

export function staminaLeft(state: GameState): number {
  return Math.max(0, staminaMax(state) - (daily(state).staminaUsed ?? 0));
}

/** Strikes left today at the current cost. */
export function strikesLeft(state: GameState): number {
  return Math.floor(staminaLeft(state) / strikeCost(state));
}

/**
 * Pay for one strike. 굳은 살 / 불굴 may make it free (one roll, drawn only when owned); 두 번째 바람
 * gives stamina back once a day when it runs out.
 */
export function spendStrike(state: GameState, rng: Rng): { state: GameState; cost: number; saved: boolean; secondWind: number } {
  const e = treeEffects(state);
  const saved = e.staminaSave > 0 && rng.next() * 100 < e.staminaSave;
  const cost = saved ? 0 : strikeCost(state);
  const d = daily(state);
  let used = (d.staminaUsed ?? 0) + cost;
  let wind = 0;
  if (e.secondWind > 0 && !d.secondWind && staminaMax(state) - used < strikeCost(state)) {
    wind = e.secondWind;
    used = Math.max(0, used - wind);
  }
  return { state: withDaily(state, { staminaUsed: used, ...(wind ? { secondWind: 1 } : {}) }), cost, saved, secondWind: wind };
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
