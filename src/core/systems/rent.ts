// The king's rent (user decisions 2026-11-19/20): he comes every 3–5 days and the rent rises every day.
// Rent that cannot be paid ENDS THE RUN (2026-11-20, like Bills Must Be Paid; it used to cost a life),
// unless 왕의 자비 puts it off once. Pure functions over GameState.
import { RENT } from '../../config/economy';
import { Rng } from '../rng';
import type { GameState, RentNotice } from '../state/types';
import { treeEffects } from './skillTree';

/** Base rent the king asks on `day` (before the tree's discount). */
export function rentAmount(day: number): number {
  return Math.round((RENT.base * Math.pow(RENT.growth, Math.max(0, day - 1))) / 10) * 10;
}

/** Rent on `day` for this run, after 왕과의 거래. */
export function rentFor(state: GameState, day: number): number {
  const cut = Math.min(0.8, treeEffects(state).rentCut);
  return Math.round((rentAmount(day) * (1 - cut)) / 10) * 10;
}

/** First visit for a run (or an older save): RENT.firstAfter days from `day`. */
export function rentDueDay(state: GameState): number {
  return state.rentDueDay ?? state.day + RENT.firstAfter;
}

/** 왕의 자비 is owned and not used yet this run. */
export function mercyLeft(state: GameState): boolean {
  return treeEffects(state).mercy && !state.mercyUsed;
}

/**
 * Morning check: on (or after) the due day the king collects, then sets his next visit 3–5 days later.
 * Short of gold: the run ends (lives go to 0, which GameCore.morning turns into the game over), or
 * 왕의 자비 lets it go once and nothing is taken.
 */
export function collectRent(prev: GameState): { state: GameState; notice: RentNotice | null } {
  const due = rentDueDay(prev);
  if (prev.day < due) return { state: prev.rentDueDay === undefined ? { ...prev, rentDueDay: due } : prev, notice: null };
  const amount = rentFor(prev, prev.day);
  const rng = new Rng(prev.rng);
  const next = prev.day + RENT.minGap + rng.int(RENT.maxGap - RENT.minGap + 1);
  if (prev.rentPrepaid) {
    // paid in advance: the king leaves satisfied
    const notice: RentNotice = { day: prev.day, amount, paid: 0, lifeLost: false, prepaid: true };
    return { state: { ...prev, rng: rng.state, rentDueDay: next, lastRent: notice, rentPrepaid: false }, notice };
  }
  if (prev.gold >= amount) {
    const notice: RentNotice = { day: prev.day, amount, paid: amount, lifeLost: false };
    return { state: { ...prev, gold: prev.gold - amount, rng: rng.state, rentDueDay: next, lastRent: notice }, notice };
  }
  if (mercyLeft(prev)) {
    const notice: RentNotice = { day: prev.day, amount, paid: 0, lifeLost: false, mercy: true };
    return { state: { ...prev, rng: rng.state, rentDueDay: next, lastRent: notice, mercyUsed: true }, notice };
  }
  const notice: RentNotice = { day: prev.day, amount, paid: 0, lifeLost: true };
  return { state: { ...prev, lives: 0, rng: rng.state, rentDueDay: next, lastRent: notice }, notice };
}

export type PrepayBlock = 'night' | 'already' | 'gold';

/** What paying the next visit in advance costs today: today's rate, cheaper than on the visit day. */
export function prepayPrice(state: GameState): number {
  return rentFor(state, state.day);
}

/** 월세 미리 내기: pay the next visit now at today's rate; until the visit the hammer is faster and luckier. */
export function prepayRent(prev: GameState): { ok: true; state: GameState; price: number } | { ok: false; reason: PrepayBlock } {
  if (prev.phase !== 'day') return { ok: false, reason: 'night' };
  if (prev.rentPrepaid) return { ok: false, reason: 'already' };
  const price = prepayPrice(prev);
  if (prev.gold < price) return { ok: false, reason: 'gold' };
  return { ok: true, state: { ...prev, gold: prev.gold - price, rentPrepaid: true, rentDueDay: rentDueDay(prev) }, price };
}
