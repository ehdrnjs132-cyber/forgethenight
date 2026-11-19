// First-day prologue (user decision 2026-11-18): on the very first DAY 1 every enhancement shatters the
// weapon, the smith has to face the night with the old hammer and is beaten for sure; that loss costs no
// life, and DAY 1 starts over with three fresh weapons (only this once). The flag lives in `tutorials`,
// which carries over between runs, so it plays once per save.
import type { GameState } from '../state/types';
import { grantDaily, type GrantResult } from './weapons';

export const PROLOGUE_DONE = 'prologueDone';

/**
 * Switched off 2026-11-19 (user decision): with the night now an optional gamble, day 1 is a normal,
 * guided day (see config/dialogue.ts COACH) instead of forced shattering and a scripted lost night.
 * Kept so old saves and the code paths stay valid; set to true to bring the prologue back.
 */
export const PROLOGUE_ENABLED = false;

/** True from the first morning until the end of the first night (only while the prologue is enabled). */
export function inPrologue(s: GameState): boolean {
  return PROLOGUE_ENABLED && s.day === 1 && !s.tutorials[PROLOGUE_DONE] && s.stats.nightsWon === 0;
}

/** After the scripted defeat: back to DAY 1 morning, no life lost, three new weapons. */
export function endPrologue(prev: GameState): GrantResult {
  const base: GameState = prev.nightSnapshot ? { ...prev.nightSnapshot, nightSnapshot: null } : { ...prev, nightSnapshot: null };
  const state: GameState = {
    ...base,
    phase: 'day',
    lives: prev.lives,
    tutorials: { ...base.tutorials, [PROLOGUE_DONE]: true },
    grantedDays: base.grantedDays.filter((d) => d !== 1),
  };
  return grantDaily(state);
}
