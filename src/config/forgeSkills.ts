// Legacy: the five-skill chain of 2026-11-19 (기적의 불꽃 … 신의 망치, five levels each), replaced on
// 2026-11-20 by the four-direction tree (config/skillTree.ts). Kept only so an older save can be
// refunded the gold it spent (save.ts migrate).

/** Levels gained by 신의 망치. */
export const DIVINE_STEP = 5;

/**
 * 신의 망치 as a chosen one-shot (QA proposal, user request 2026-11-27). Unlocked when the king's rent is
 * paid for the `unlockRents`-th time; every paid rent after that (counted once per visit) adds a charge,
 * up to `cap` (+ the 신의 손길 star). Armed before a strike: the strike rolls as usual, and a success or
 * great success lands at +DIVINE_STEP (within MAX_LEVEL). The charge is spent whatever the result.
 */
export const GOD_HAMMER = { unlockRents: 2, cap: 1 };

/** Gold the old chain charged for levels 1..5 of each skill. */
export const LEGACY_SKILL_COSTS: Record<string, readonly number[]> = {
  miracle: [300, 900, 2_500, 7_000, 18_000],
  overheat: [600, 1_800, 5_000, 14_000, 36_000],
  phoenix: [1_500, 4_500, 12_000, 32_000, 80_000],
  fateSplit: [2_500, 7_500, 20_000, 55_000, 140_000],
  divine: [5_000, 15_000, 40_000, 110_000, 300_000],
};

/** Gold spent on the old chain, from a save's levels. */
export function legacyRefund(levels: Partial<Record<string, number>> | undefined): number {
  if (!levels) return 0;
  let sum = 0;
  for (const [id, lv] of Object.entries(levels)) {
    const costs = LEGACY_SKILL_COSTS[id];
    if (!costs || !lv) continue;
    for (let i = 0; i < Math.min(lv, costs.length); i++) sum += costs[i];
  }
  return sum;
}
