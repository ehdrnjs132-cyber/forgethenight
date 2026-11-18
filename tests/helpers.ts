import { createRun } from '../src/core/state/initial';
import type { GameState, Weapon } from '../src/core/state/types';
import { enhance } from '../src/core/systems/enhancement';
import type { Outcome } from '../src/config/enhancement';

/** A run past the first-enhance tutorial with the given weapons. */
export function runWith(weapons: Partial<Weapon>[], seed = 1): GameState {
  const s = createRun(seed);
  s.tutorials.firstEnhance = true;
  s.weapons = weapons.map((w, i) => ({ id: `w${i + 1}`, cls: 'sword', element: 'fire', level: 0, bornDay: 1, ...w }));
  s.weaponSeq = s.weapons.length;
  return s;
}

/** Find an RNG seed whose next enhancement of `weaponId` gives `outcome`. */
export function seedFor(state: GameState, weaponId: string, outcome: Outcome): GameState {
  for (let seed = 1; seed < 200000; seed++) {
    const attempt = enhance({ ...state, rng: seed }, weaponId, { confirmLast: true });
    if (attempt.ok && attempt.result.outcome === outcome) return { ...state, rng: seed };
  }
  throw new Error(`no seed gives ${outcome}`);
}
