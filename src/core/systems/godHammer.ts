// 신의 망치 as a chosen one-shot (QA proposal, user request 2026-11-27). Pure functions over GameState.
//
//   · unlocked by the second paid rent; every paid rent after that adds one charge, up to the cap
//   · each rent visit counts once (keyed by its day), so reloading the morning cannot charge twice
//   · the player arms it for the next strike; the strike rolls as usual and a success or great success
//     lands at +DIVINE_STEP (within MAX_LEVEL). The charge is spent whatever the result.
import { GOD_HAMMER } from '../../config/forgeSkills';
import type { GameState, GodHammerState } from '../state/types';
import { treeEffects } from './skillTree';

const EMPTY: GodHammerState = { rentsPaid: 0, charges: 0, armed: false, counted: [] };

export function godHammer(state: GameState): GodHammerState {
  return state.godHammer ?? EMPTY;
}

export function godHammerCap(state: GameState): number {
  return GOD_HAMMER.cap + treeEffects(state).godHammerCap;
}

export function godHammerUnlocked(state: GameState): boolean {
  return godHammer(state).rentsPaid >= GOD_HAMMER.unlockRents;
}

/** A rent visit on `rentDay` was paid: count it once; from the unlock on it also adds a charge. */
export function countRentPaid(state: GameState, rentDay: number): GameState {
  const g = godHammer(state);
  if (g.counted.includes(rentDay)) return state;
  const rentsPaid = g.rentsPaid + 1;
  const charges = rentsPaid >= GOD_HAMMER.unlockRents ? Math.min(godHammerCap(state), g.charges + 1) : g.charges;
  return { ...state, godHammer: { ...g, rentsPaid, charges, counted: [...g.counted, rentDay].slice(-20) } };
}

export type GodHammerBlock = 'locked' | 'empty' | 'night' | 'split';

/** Arm or disarm it for the next strike. Arming turns 운명 분열 off: one roll means one roll. */
export function toggleGodHammer(state: GameState): { ok: true; state: GameState } | { ok: false; reason: GodHammerBlock } {
  const g = godHammer(state);
  if (g.armed) return { ok: true, state: { ...state, godHammer: { ...g, armed: false } } };
  if (state.phase !== 'day') return { ok: false, reason: 'night' };
  if (!godHammerUnlocked(state)) return { ok: false, reason: 'locked' };
  if (g.charges <= 0) return { ok: false, reason: 'empty' };
  if (state.pendingSplit) return { ok: false, reason: 'split' };
  return { ok: true, state: { ...state, splitArmed: false, godHammer: { ...g, armed: true } } };
}

/** Spend the armed charge on the strike being prepared (no-op when not armed or empty). */
export function spendGodHammer(state: GameState): { state: GameState; used: boolean } {
  const g = godHammer(state);
  if (!g.armed || g.charges <= 0) return { state: g.armed ? { ...state, godHammer: { ...g, armed: false } } : state, used: false };
  return { state: { ...state, godHammer: { ...g, armed: false, charges: g.charges - 1 } }, used: true };
}
