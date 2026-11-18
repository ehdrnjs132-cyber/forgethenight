// Weapon appearance stages (§9) and high-enhancement milestones (§7.4).

/** Levels at which the weapon's look changes. 23 stages, as listed in the design document. */
export const APPEARANCE_STAGES: readonly number[] = [
  0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40, 44, 48, 50,
];

export function appearanceStage(level: number): number {
  let stage = 0;
  for (let i = 0; i < APPEARANCE_STAGES.length; i++) {
    if (level >= APPEARANCE_STAGES[i]) stage = i;
  }
  return stage;
}

/**
 * Display size of a weapon relative to its base length (user decision 2026-11-18: swords must grow a lot).
 * Small at +0, normal around +10, and about 2.4× the +0 size at +50. Presentation only; reach in combat is unchanged.
 */
// max 1.7: at +50 the blade tip just stops short of the right-hand panel in the forge.
export const WEAPON_SIZE = { min: 0.7, max: 1.7, curve: 0.8 } as const;

export function weaponSizeScale(level: number): number {
  const t = Math.max(0, Math.min(1, level / 50));
  return WEAPON_SIZE.min + (WEAPON_SIZE.max - WEAPON_SIZE.min) * Math.pow(t, WEAPON_SIZE.curve);
}

export interface Milestone {
  level: number;
  name: string;
  /** 0 = none, 1..5 = increasingly grand presentation. */
  tier: number;
}

export const MILESTONES: readonly Milestone[] = [
  { level: 10, name: '첫 번째 각성', tier: 1 },
  { level: 20, name: '영웅급', tier: 2 },
  { level: 30, name: '전설급', tier: 3 },
  { level: 40, name: '신화급', tier: 4 },
  { level: 50, name: '궁극의 무기', tier: 5 },
];

/** Presentation tier for a level: 0 below +10, 5 at +50. */
export function milestoneTier(level: number): number {
  let tier = 0;
  for (const m of MILESTONES) if (level >= m.level) tier = m.tier;
  return tier;
}

/** The milestone newly reached when going from `before` to `after`, if any. */
export function milestoneCrossed(before: number, after: number): Milestone | null {
  let hit: Milestone | null = null;
  for (const m of MILESTONES) if (before < m.level && after >= m.level) hit = m;
  return hit;
}
