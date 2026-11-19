// TutorialManager state helpers (§8). Content lives in config/tutorials.ts.
import type { GameState } from '../state/types';

export type TutorialId =
  | 'firstEnhance'
  | 'firstSale'
  | 'firstMerchant'
  | 'firstSkillPoint'
  | 'prologueDone'
  // day-1 guide lines (config/dialogue.ts COACH), each shown once
  | 'coachArrive'
  | 'coachEnhance'
  | 'coachSell'
  | 'coachSkill'
  | 'coachDay';

export function isTutorialDone(state: GameState, id: TutorialId): boolean {
  return state.tutorials[id] === true;
}

export function completeTutorial(prev: GameState, id: TutorialId): GameState {
  if (isTutorialDone(prev, id)) return prev;
  return { ...prev, tutorials: { ...prev.tutorials, [id]: true } };
}
