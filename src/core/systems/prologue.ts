// First-day prologue (user decision 2026-11-18): on the very first DAY 1 every enhancement shatters the
// weapon, the smith has to face the night with the old hammer and is beaten for sure; that loss costs no
// life, and DAY 1 starts over with three fresh weapons (only this once). The flag lives in `tutorials`,
// which carries over between runs, so it plays once per save.
import type { GameState } from '../state/types';
import { grantDaily, type GrantResult } from './weapons';

export const PROLOGUE_DONE = 'prologueDone';

/** True from the first morning until the end of the first night. */
export function inPrologue(s: GameState): boolean {
  return s.day === 1 && !s.tutorials[PROLOGUE_DONE] && s.stats.nightsWon === 0;
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
