import { describe, expect, it } from 'vitest';
import { addXp, aliveTarget, enemyBase, enemyStats, formatDamage, hits, levelDamage, pickEnemy, weaponDamage, xpToNext } from '../src/combat/rules';
import { WEAPON_ATTACK } from '../src/config/combat';

describe('damage (§10.3)', () => {
  it('follows 100 × 1.35^level', () => {
    expect(levelDamage(0)).toBe(100);
    expect(Math.round(levelDamage(10))).toBe(2011);
    // §10.3's table lists "약 40,366"; the formula itself gives 40,427.
    expect(Math.round(levelDamage(20))).toBe(40427);
  });

  it('slower classes hit harder per swing', () => {
    expect(weaponDamage(5, 'axe')).toBeGreaterThan(weaponDamage(5, 'spear'));
    expect(weaponDamage(5, 'spear')).toBeGreaterThan(weaponDamage(5, 'sword'));
  });

  it('formats big numbers compactly', () => {
    expect(formatDamage(100)).toBe('100');
    expect(formatDamage(40437)).toBe('40,437');
    expect(formatDamage(1_234_567)).toBe('1.2M');
    expect(formatDamage(330_000_000)).toBe('330M');
    expect(formatDamage(3_000_000_000)).toBe('3.0B');
  });
});

describe('hit shapes', () => {
  const sword = WEAPON_ATTACK.sword;
  const spear = WEAPON_ATTACK.spear;
  const axe = WEAPON_ATTACK.axe;

  it('sword arc hits in front, misses behind and out of range', () => {
    expect(hits(sword, 0, 0, 0, 100, 0, 10)).toBe(true);
    expect(hits(sword, 0, 0, 0, 60, 60, 10)).toBe(true); // 45° off, inside the 130° arc
    expect(hits(sword, 0, 0, 0, -100, 0, 10)).toBe(false);
    expect(hits(sword, 0, 0, 0, 200, 0, 10)).toBe(false);
  });

  it('spear thrust reaches far but narrow', () => {
    expect(hits(spear, 0, 0, Math.PI / 2, 0, 240, 10)).toBe(true);
    expect(hits(spear, 0, 0, Math.PI / 2, 60, 120, 10)).toBe(false);
  });

  it('axe hits all around', () => {
    expect(hits(axe, 0, 0, 0, -120, 40, 10)).toBe(true);
    expect(hits(axe, 0, 0, 0, 0, -170, 10)).toBe(false);
  });
});

describe('XP (§17)', () => {
  it('needs 100 × level^1.5', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(4)).toBe(800);
  });

  it('levels up across several thresholds at once', () => {
    expect(addXp(1, 0, 250)).toEqual({ level: 2, xp: 150, levelsGained: 1 });
    const r = addXp(1, 0, 100 + 283 + 520);
    expect(r.level).toBe(4);
    expect(r.levelsGained).toBe(3);
  });
});

describe('enemy scaling (§11)', () => {
  it('matches the table on listed days and interpolates between', () => {
    expect(enemyBase(1)).toEqual({ hp: 100, atk: 5 });
    expect(enemyBase(5)).toEqual({ hp: 350, atk: 12 });
    const d3 = enemyBase(3);
    expect(d3.hp).toBeGreaterThan(100);
    expect(d3.hp).toBeLessThan(350);
    expect(enemyBase(50).hp).toBe(3_000_000_000);
  });

  it('applies per-kind multipliers', () => {
    expect(enemyStats('skeleton', 1).hp).toBe(100);
    expect(enemyStats('slime', 1).hp).toBe(60);
  });

  it('ramps density from the start to the end of the night', () => {
    expect(aliveTarget(1, 0, 180)).toBe(15);
    expect(aliveTarget(1, 180, 180)).toBe(25);
    expect(aliveTarget(50, 0, 180)).toBe(160);
    expect(aliveTarget(50, 180, 180)).toBe(220);
  });

  it('picks enemies by weight', () => {
    expect(pickEnemy(0)).toBe('skeleton');
    expect(pickEnemy(0.99)).toBe('slime');
  });
});
