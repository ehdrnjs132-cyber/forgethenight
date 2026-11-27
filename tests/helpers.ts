import { createRun } from '../src/core/state/initial';
import type { GameState, Weapon } from '../src/core/state/types';
import { enhance } from '../src/core/systems/enhancement';
import type { Outcome } from '../src/config/enhancement';
import { NIGHT_UNLOCK_DAY } from '../src/config/economy';
import { TREE_BY_ID } from '../src/config/skillTree';

/** A run past the first-enhance tutorial with the given weapons. */
export function runWith(weapons: Partial<Weapon>[], seed = 1): GameState {
  const s = createRun(seed);
  s.tutorials.firstEnhance = true;
  // Plenty of gold and room, so tests about other rules are not blocked by costs or the 3-slot start.
  s.gold = 1_000_000;
  s.inventoryCap = 20;
  s.weapons = weapons.map((w, i) => ({ id: `w${i + 1}`, cls: 'sword', element: 'fire', level: 0, bornDay: 1, ...w }));
  s.weaponSeq = s.weapons.length;
  return s;
}

/**
 * The night dwarf battle is offered from DAY 20 (2026-11-26): move a run to that day for night tests,
 * with the king's visit far away so rent does not interfere.
 */
export function atNightDay(s: GameState): GameState {
  return { ...s, day: NIGHT_UNLOCK_DAY, rentDueDay: NIGHT_UNLOCK_DAY + 100, grantedDays: [...s.grantedDays, NIGHT_UNLOCK_DAY] };
}

/** A state owning the given skill-tree nodes, one weapon w1 and a spare. */
export function withNodes(nodes: string[], w1: Partial<Weapon> = {}): GameState {
  const s = runWith([{ level: 10, ...w1 }, {}]);
  return { ...s, gold: 1_000_000, treeNodes: nodes };
}

/** Every node from the anvil out to `id`. */
export function pathTo(id: string): string[] {
  const out: string[] = [];
  for (let n = TREE_BY_ID[id]; n && n.id !== 'root'; n = TREE_BY_ID[n.from!]) out.unshift(n.id);
  return out;
}

/** Find an RNG seed whose next enhancement of `weaponId` gives `outcome`. */
export function seedFor(state: GameState, weaponId: string, outcome: Outcome): GameState {
  for (let seed = 1; seed < 200000; seed++) {
    const attempt = enhance({ ...state, rng: seed }, weaponId, { confirmLast: true });
    if (attempt.ok && attempt.result.outcome === outcome) return { ...state, rng: seed };
  }
  throw new Error(`no seed gives ${outcome}`);
}
