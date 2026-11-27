// 상인 모르의 방문 대화 (user 2026-11-27): every merchant day opens with a talk — the long shop
// introduction the first time, a short greeting after that. Pure functions over GameState.
import type { MerchantGreeting } from '../../config/story';
import type { GameState } from '../state/types';
import { merchantHere } from './economy';
import { rentDueDay } from './rent';

/** Rent this close (days) makes Morr warn about it. */
export const RENT_WARN_DAYS = 2;
/** A weapon at least this high makes him admire it. */
export const BIG_LEVEL = 50;

/** Morr is here today and has not talked yet. */
export function merchantTalkDue(state: GameState): boolean {
  return merchantHere(state) && state.merchantTalkDay !== state.day;
}

/**
 * The one greeting for a later visit, most pressing first: a rare stone in stock, the rent close,
 * a weapon broken since his last talk, a +50 weapon on the rack, else the plain one.
 */
export function merchantGreeting(state: GameState): MerchantGreeting {
  if (state.merchant?.stock.some((e) => e.item === 'timeStone' && e.left > 0)) return 'rare';
  if (rentDueDay(state) - state.day <= RENT_WARN_DAYS) return 'rent';
  if (state.merchantTalkDestroyed !== undefined && state.stats.destroyed > state.merchantTalkDestroyed) return 'broke';
  if (state.weapons.some((w) => w.level >= BIG_LEVEL)) return 'big';
  return 'basic';
}

/** He has talked today; remember how many weapons were broken by then (for the next "broke" check). */
export function markMerchantTalk(state: GameState): GameState {
  return { ...state, merchantTalkDay: state.day, merchantTalkDestroyed: state.stats.destroyed };
}
