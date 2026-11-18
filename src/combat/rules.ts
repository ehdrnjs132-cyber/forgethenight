// Pure combat rules (no Phaser): damage, hit shapes, XP, enemy scaling, spawn density.
import { BASE_DAMAGE, DAMAGE_GROWTH, DENSITY, ENEMIES, ENEMY_GROWTH, WEAPON_ATTACK, XP_FORMULA, type AttackShape, type EnemyKind } from '../config/combat';
import type { WeaponClass } from '../config/weapons';

/** Damage of one hit from a weapon class at an enhancement level (§10.3). */
export function weaponDamage(level: number, cls: WeaponClass): number {
  return Math.round(BASE_DAMAGE * Math.pow(DAMAGE_GROWTH, level) * WEAPON_ATTACK[cls].damageMul);
}

/** Base damage before the class multiplier, as listed in §10.3. */
export function levelDamage(level: number): number {
  return BASE_DAMAGE * Math.pow(DAMAGE_GROWTH, level);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Whether a circle of radius `r` at (ex, ey) is hit by an attack from (px, py) aimed at `angle` (radians).
 * Arc: within range and angular half-width (padded by the target's size). Line: inside the thrust rectangle.
 */
export function hits(shape: AttackShape, px: number, py: number, angle: number, ex: number, ey: number, r: number): boolean {
  const dx = ex - px;
  const dy = ey - py;
  const dist = Math.hypot(dx, dy);
  if (shape.kind === 'circle') return dist <= shape.range + r;
  if (shape.kind === 'arc') {
    if (dist > shape.range + r) return false;
    if (dist <= r) return true;
    const half = ((shape.arcDeg ?? 90) * Math.PI) / 360;
    const pad = Math.asin(Math.min(1, r / dist));
    return Math.abs(wrap(Math.atan2(dy, dx) - angle)) <= half + pad;
  }
  // line: project onto the thrust direction
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return along >= -r && along <= shape.range + r && Math.abs(across) <= (shape.width ?? 40) / 2 + r;
}

export function xpToNext(level: number): number {
  return Math.round(XP_FORMULA.base * Math.pow(level, XP_FORMULA.exponent));
}

/** Add XP, levelling up as many times as it covers. */
export function addXp(level: number, xp: number, gain: number): { level: number; xp: number; levelsGained: number } {
  let l = level;
  let x = xp + gain;
  let gained = 0;
  while (x >= xpToNext(l)) {
    x -= xpToNext(l);
    l++;
    gained++;
  }
  return { level: l, xp: x, levelsGained: gained };
}

/** Normal enemy HP and attack on a day, log-interpolated through the §11 table. */
export function enemyBase(day: number): { hp: number; atk: number } {
  const rows = ENEMY_GROWTH;
  if (day <= rows[0][0]) return { hp: rows[0][1], atk: rows[0][2] };
  for (let i = 1; i < rows.length; i++) {
    const [d1, h1, a1] = rows[i];
    if (day <= d1) {
      const [d0, h0, a0] = rows[i - 1];
      const t = (day - d0) / (d1 - d0);
      return { hp: Math.round(h0 * Math.pow(h1 / h0, t)), atk: Math.round(a0 * Math.pow(a1 / a0, t)) };
    }
  }
  const last = rows[rows.length - 1];
  return { hp: last[1], atk: last[2] };
}

export function enemyStats(kind: EnemyKind, day: number): { hp: number; atk: number } {
  const b = enemyBase(day);
  const def = ENEMIES[kind];
  return { hp: Math.max(1, Math.round(b.hp * def.hpMul)), atk: Math.max(1, Math.round(b.atk * def.atkMul)) };
}

/** How many enemies should be alive `t` seconds into a night of `duration` seconds (§11 density). */
export function aliveTarget(day: number, t: number, duration: number): number {
  const k = Math.min(1, Math.max(0, (day - 1) / 49));
  const start = DENSITY.day1[0] + (DENSITY.day50[0] - DENSITY.day1[0]) * k;
  const end = DENSITY.day1[1] + (DENSITY.day50[1] - DENSITY.day1[1]) * k;
  const p = Math.min(1, Math.max(0, t / duration));
  return Math.round(start + (end - start) * p);
}

/** Pick an enemy kind by spawn weight from a uniform roll in [0,1). */
export function pickEnemy(roll: number): EnemyKind {
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  const total = kinds.reduce((a, k) => a + ENEMIES[k].weight, 0);
  let acc = 0;
  for (const k of kinds) {
    acc += ENEMIES[k].weight / total;
    if (roll < acc) return k;
  }
  return kinds[kinds.length - 1];
}

/** Compact, readable damage numbers: 1,234 / 56,789 / 1.2M / 3.4B. */
export function formatDamage(n: number): string {
  if (n < 1_000_000) return Math.round(n).toLocaleString('en-US');
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(n < 10_000_000_000 ? 1 : 0)}B`;
}
