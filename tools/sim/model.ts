// Exact and Monte Carlo models of "keep enhancing one weapon", built on the game's own rules
// (rollOutcome, levelAfter) so the simulator cannot drift from the game.
import type { EnhanceRow } from '../../src/config/enhancement';
import { levelAfter, rollOutcome } from '../../src/core/systems/enhancement';

/**
 * Probability of reaching `target` from `from` before the weapon is destroyed,
 * when the player keeps enhancing (keep results just retry). Solved by iteration.
 */
export function reachProbability(rows: readonly EnhanceRow[], from: number, target: number): number {
  if (from >= target) return 1;
  const p = new Array<number>(51).fill(0);
  for (let l = target; l <= 50; l++) p[l] = 1;
  for (let iter = 0; iter < 20000; iter++) {
    let delta = 0;
    for (let l = target - 1; l >= 0; l--) {
      const r = rows[l];
      const moving = 100 - r.keep;
      if (moving <= 0) continue;
      const up2 = p[Math.min(50, l + 2)];
      const up1 = p[l + 1];
      const dn = p[Math.max(0, l - 1)];
      const next = (r.great * up2 + r.success * up1 + r.down * dn) / moving;
      delta = Math.max(delta, Math.abs(next - p[l]));
      p[l] = next;
    }
    if (delta < 1e-13) break;
  }
  return p[from];
}

export interface PushResult {
  /** Highest level reached before stopping. */
  peak: number;
  /** Total enhancement clicks until the weapon broke or hit +50. */
  clicks: number;
  /** Clicks used to first reach each level (index = level), or -1. */
  firstReach: number[];
  destroyed: boolean;
}

/** Enhance one weapon from +0 until it is destroyed or reaches +50. */
export function pushToEnd(rows: readonly EnhanceRow[], random: () => number): PushResult {
  let level = 0;
  let clicks = 0;
  let peak = 0;
  const firstReach = new Array<number>(51).fill(-1);
  firstReach[0] = 0;
  while (level < 50) {
    clicks++;
    const next = levelAfter(level, rollOutcome(rows[level], random()));
    if (next === null) return { peak, clicks, firstReach, destroyed: true };
    level = next;
    if (level > peak) {
      for (let l = peak + 1; l <= level; l++) if (firstReach[l] < 0) firstReach[l] = clicks;
      peak = level;
    }
  }
  return { peak, clicks, firstReach, destroyed: false };
}
