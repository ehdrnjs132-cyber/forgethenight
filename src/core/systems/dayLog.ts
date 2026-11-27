// Today's forge record (user request 2026-11-27: the night screen shows how many great / success / keep /
// down / destroy results the day had, the best level reached and the gold made). Kept in the daily
// counters, so it starts over every morning. Pure functions over GameState.
import type { Outcome } from '../../config/enhancement';
import type { DayLog, GameState, Weapon } from '../state/types';
import { daily, withDaily } from './forgeSkills';

const EMPTY: DayLog = { attempts: 0, great: 0, success: 0, keep: 0, down: 0, destroy: 0, earned: 0, spent: 0, sold: 0, best: null };

export function dayLog(state: GameState): DayLog {
  return daily(state).log ?? EMPTY;
}

const put = (state: GameState, log: DayLog) => withDaily(state, { log });

/** A strike was paid for (counted once per attempt, 운명 분열 included). */
export function logStrike(state: GameState, cost: number): GameState {
  const l = dayLog(state);
  return put(state, { ...l, attempts: l.attempts + 1, spent: l.spent + cost });
}

/** The strike's result, and the weapon if it reached today's best. */
export function logOutcome(state: GameState, outcome: Outcome, after: Weapon | null): GameState {
  const l = dayLog(state);
  const best = after && (!l.best || after.level > l.best.level) ? { level: after.level, element: after.element, cls: after.cls, ...(after.golden ? { golden: true } : {}) } : l.best;
  return put(state, { ...l, [outcome]: l[outcome] + 1, best });
}

export function logSale(state: GameState, price: number): GameState {
  const l = dayLog(state);
  return put(state, { ...l, earned: l.earned + price, sold: l.sold + 1 });
}
