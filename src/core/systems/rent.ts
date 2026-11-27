// The king's rent (user decisions 2026-11-19/20): he comes every 5 days (7 from 2026-11-26, 5 since 2026-11-27) and the rent rises every day.
// Rent that cannot be paid ENDS THE RUN (2026-11-20, like Bills Must Be Paid; it used to cost a life),
// unless 왕의 자비 puts it off once. Pure functions over GameState.
import { RENT } from '../../config/economy';
import { Rng } from '../rng';
import type { GameState, RentNotice } from '../state/types';
import { treeEffects } from './skillTree';
import { countRentPaid } from './godHammer';
import { offerPerks } from './rentPerks';

/**
 * A visit was paid: 신의 망치 counts it, then the 왕의 하사품 — the kickback, the stones, and the three
 * cards to pick from (2026-11-27). `paid` is what actually left the purse for this visit.
 */
function rentPaid(state: GameState, day: number, paid: number): GameState {
  let s = countRentPaid(state, day);
  const e = treeEffects(s);
  const back = Math.round(paid * e.rentKickback);
  if (back > 0) s = { ...s, gold: s.gold + back };
  if (e.rentProtect > 0 || e.rentLuck > 0)
    s = { ...s, items: { ...s.items, protect: (s.items.protect ?? 0) + e.rentProtect, luck: (s.items.luck ?? 0) + e.rentLuck } };
  return offerPerks(s, paid);
}

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
 * Morning check: on (or after) the due day the king collects, then sets his next visit RENT.minGap..maxGap (5) days later.
 * Short of gold: the run ends (lives go to 0, which GameCore.morning turns into the game over), or
 * 왕의 자비 lets it go once and nothing is taken.
 */
export function collectRent(prev: GameState): { state: GameState; notice: RentNotice | null } {
  const due = rentDueDay(prev);
  if (prev.day < due) return { state: prev.rentDueDay === undefined ? { ...prev, rentDueDay: due } : prev, notice: null };
  const amount = rentFor(prev, prev.day);
  const rng = new Rng(prev.rng);
  // 왕의 총애: every next visit a day later
  const next = prev.day + RENT.minGap + rng.int(RENT.maxGap - RENT.minGap + 1) + treeEffects(prev).rentDelay;
  if (prev.rentPrepaid) {
    // paid in advance: the king leaves satisfied. The notice tells what was actually paid back then
    // (older saves did not keep it: 0 = unknown, and the notice then names no amount).
    const notice: RentNotice = {
      day: prev.day,
      amount,
      paid: prev.rentPrepaidAmount ?? 0,
      lifeLost: false,
      prepaid: true,
      ...(prev.rentPrepaidDay !== undefined ? { prepaidDay: prev.rentPrepaidDay } : {}),
    };
    const { rentPrepaidAmount: _a, rentPrepaidDay: _d, ...rest } = prev;
    // a paid visit counts toward 신의 망치 (once per visit day, in the same state as the payment)
    return { state: rentPaid({ ...rest, rng: rng.state, rentDueDay: next, lastRent: notice, rentPrepaid: false }, prev.day, notice.paid), notice };
  }
  if (prev.gold >= amount) {
    const notice: RentNotice = { day: prev.day, amount, paid: amount, lifeLost: false };
    return { state: rentPaid({ ...prev, gold: prev.gold - amount, rng: rng.state, rentDueDay: next, lastRent: notice }, prev.day, amount), notice };
  }
  if (mercyLeft(prev)) {
    const notice: RentNotice = { day: prev.day, amount, paid: 0, lifeLost: false, mercy: true };
    return { state: { ...prev, rng: rng.state, rentDueDay: next, lastRent: notice, mercyUsed: true }, notice };
  }
  const notice: RentNotice = { day: prev.day, amount, paid: 0, lifeLost: true };
  return { state: { ...prev, lives: 0, rng: rng.state, rentDueDay: next, lastRent: notice }, notice };
}

/** First line of the morning rent notice: always the amount that actually left the purse. */
export function rentPaidLine(n: RentNotice): string {
  if (!n.prepaid) return `DAY ${n.day} 월세 ${n.amount.toLocaleString()}G를 냈습니다.`;
  if (n.paid <= 0) return `DAY ${n.day} 월세는 미리 내 두었습니다.`; // older save: amount not kept
  const when = n.prepaidDay !== undefined ? `DAY ${n.prepaidDay}에 ` : '';
  return `DAY ${n.day} 월세는 ${when}${n.paid.toLocaleString()}G로 미리 내 두었습니다.`;
}

// 월세 미리 내기 was removed on 2026-11-26 (user request). collectRent above still honours a visit that
// an older save already paid in advance, so nobody pays twice.
