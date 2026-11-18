// Night combat balance (§10, §11). Every number here is a starting point for play testing.
import type { WeaponClass } from './weapons';

export const PLAYER = {
  maxHp: 100,
  speed: 230,
  radius: 16,
  /** Seconds of invulnerability after taking a hit. */
  hurtInvuln: 0.6,
  dodge: { distance: 180, duration: 0.17, cooldown: 1.1, iframes: 0.32 },
  /** XP gems fly to the player inside this radius. */
  pickupRadius: 110,
};

/** §10.3 suggestion: Damage = 100 × 1.35 ^ level. */
export const BASE_DAMAGE = 100;
export const DAMAGE_GROWTH = 1.35;

export type AttackKind = 'arc' | 'line' | 'circle';

export interface AttackShape {
  kind: AttackKind;
  /** Reach in px from the player's centre. */
  range: number;
  /** Arc width in degrees (arc only). */
  arcDeg?: number;
  /** Thrust width in px (line only). */
  width?: number;
  /** Seconds between automatic attacks (§5). */
  interval: number;
  /** Multiplier on the level damage, so slower weapons hit harder. */
  damageMul: number;
  knockback: number;
  /** Start swinging when the nearest enemy is within range × this. */
  engage: number;
}

export const WEAPON_ATTACK: Record<WeaponClass, AttackShape> = {
  sword: { kind: 'arc', range: 135, arcDeg: 130, interval: 0.85, damageMul: 1.0, knockback: 140, engage: 1.25 },
  spear: { kind: 'line', range: 250, width: 52, interval: 1.05, damageMul: 1.2, knockback: 100, engage: 1.1 },
  axe: { kind: 'circle', range: 155, interval: 1.35, damageMul: 1.6, knockback: 220, engage: 1.15 },
};

export type EnemyKind = 'skeleton' | 'slime';

export interface EnemyDef {
  name: string;
  /** Multipliers on the day's base HP and attack (§11 table). */
  hpMul: number;
  atkMul: number;
  speed: number;
  radius: number;
  xp: number;
  /** Spawn weight. */
  weight: number;
  /** Death explosion (폭발 슬라임). */
  explode?: { radius: number; atkMul: number; delay: number };
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  skeleton: { name: '스켈레톤', hpMul: 1, atkMul: 1, speed: 78, radius: 15, xp: 3, weight: 3 },
  slime: { name: '폭발 슬라임', hpMul: 0.6, atkMul: 0.8, speed: 60, radius: 14, xp: 4, weight: 1, explode: { radius: 86, atkMul: 1.8, delay: 0.45 } },
};

/** §11 growth table: [day, normal enemy HP, attack]. Values between rows are log-interpolated. */
export const ENEMY_GROWTH: readonly [number, number, number][] = [
  [1, 100, 5],
  [5, 350, 12],
  [10, 2_000, 35],
  [15, 12_000, 100],
  [20, 70_000, 300],
  [25, 400_000, 900],
  [30, 2_500_000, 2_700],
  [35, 15_000_000, 8_000],
  [40, 90_000_000, 24_000],
  [45, 500_000_000, 72_000],
  [50, 3_000_000_000, 220_000],
];

/** §11 density: simultaneous enemies at the start and end of a night, DAY 1 and DAY 50. */
export const DENSITY = { day1: [15, 25] as const, day50: [160, 220] as const };

export const SPAWN = {
  /** Distance band from the player where enemies appear (just off screen). */
  minDist: 560,
  maxDist: 720,
  /** Seconds between spawn checks, and the most enemies added per check. */
  every: 0.25,
  burst: 3,
  /** Hard cap for performance (§19). */
  maxAlive: 260,
};

/** §17: XP needed to go from `level` to `level + 1`. */
export const XP_FORMULA = { base: 100, exponent: 1.5 };

export const WORLD = { width: 2600, height: 2600 };
