// The king's rent (user decision 2026-11-19): he comes every 3–5 days, and the rent rises every day.
// What cannot be paid costs a life (all the gold on hand goes first). Pure functions over GameState.
import { RENT } from '../../config/economy';
import { Rng } from '../rng';
import type { GameState, RentNotice } from '../state/types';

/** Rent the king asks on `day`. */
export function rentAmount(day: number): number {
  return Math.round((RENT.base * Math.pow(RENT.growth, Math.max(0, day - 1))) / 10) * 10;
}

/** First visit for a run (or an older save): RENT.firstAfter days from `day`. */
export function rentDueDay(state: GameState): number {
  return state.rentDueDay ?? state.day + RENT.firstAfter;
}

/** Morning check: on (or after) the due day the king collects, then sets his next visit 3–5 days later. */
export function collectRent(prev: GameState): { state: GameState; notice: RentNotice | null } {
  const due = rentDueDay(prev);
  if (prev.day < due) return { state: prev.rentDueDay === undefined ? { ...prev, rentDueDay: due } : prev, notice: null };
  const amount = rentAmount(prev.day);
  const paid = Math.min(prev.gold, amount);
  const lifeLost = paid < amount;
  const rng = new Rng(prev.rng);
  const next = prev.day + RENT.minGap + rng.int(RENT.maxGap - RENT.minGap + 1);
  const notice: RentNotice = { day: prev.day, amount, paid, lifeLost };
  return {
    state: { ...prev, gold: prev.gold - paid, lives: lifeLost ? Math.max(0, prev.lives - 1) : prev.lives, rng: rng.state, rentDueDay: next, lastRent: notice },
    notice,
  };
}
