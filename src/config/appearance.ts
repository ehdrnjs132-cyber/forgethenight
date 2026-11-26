// Weapon appearance stages (§9) and high-enhancement milestones (§7.4).
import { MAX_LEVEL } from './weapons';

/** Levels at which the weapon changes form (user decision 2026-11-26: every +2, up to +100 → 51 forms). */
export const FORM_STEP = 2;
export const APPEARANCE_STAGES: readonly number[] = Array.from({ length: MAX_LEVEL / FORM_STEP + 1 }, (_, i) => i * FORM_STEP);

export function appearanceStage(level: number): number {
  let stage = 0;
  for (let i = 0; i < APPEARANCE_STAGES.length; i++) {
    if (level >= APPEARANCE_STAGES[i]) stage = i;
  }
  return stage;
}

/** Stage for drawing strength (glow, placeholder blade width): stops growing at +50 so the art stays readable. */
export function visualStage(level: number): number {
  return appearanceStage(Math.min(level, 50));
}

/**
 * Display size of a weapon relative to its base length (user decision 2026-11-18: swords must grow a lot).
 * Small at +0, normal around +10, and about 2.4× the +0 size at +50. Presentation only; reach in combat is unchanged.
 */
// max 1.7: at +50 the blade tip just stops short of the right-hand panel in the forge, so above +50 the
// size holds and the form, glow and badge carry the growth.
export const WEAPON_SIZE = { min: 0.7, max: 1.7, curve: 0.8 } as const;

export function weaponSizeScale(level: number): number {
  const t = Math.max(0, Math.min(1, level / 50));
  return WEAPON_SIZE.min + (WEAPON_SIZE.max - WEAPON_SIZE.min) * Math.pow(t, WEAPON_SIZE.curve);
}

export interface Milestone {
  level: number;
  name: string;
  /** 0 = none, 1..5 = increasingly grand presentation (5 is the top; later milestones reuse it). */
  tier: number;
}

export const MILESTONES: readonly Milestone[] = [
  { level: 10, name: '첫 번째 각성', tier: 1 },
  { level: 20, name: '영웅급', tier: 2 },
  { level: 30, name: '전설급', tier: 3 },
  { level: 40, name: '신화급', tier: 4 },
  { level: 50, name: '궁극의 무기', tier: 5 },
  // cap raised to +100 (2026-11-26)
  { level: 60, name: '초월급', tier: 5 },
  { level: 70, name: '차원을 넘은 무기', tier: 5 },
  { level: 80, name: '창세급', tier: 5 },
  { level: 90, name: '신을 벤 무기', tier: 5 },
  { level: 100, name: '절대의 무기', tier: 5 },
];

/** Presentation tier for a level: 0 below +10, 5 from +50. */
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
