import { describe, expect, it } from 'vitest';
import { forgeWeapon, generateNight, weaponLabel } from '../src/core/systems/doppelganger';
import { Rng } from '../src/core/rng';
import { nightPlan } from '../src/config/doppelganger';

describe('doppelganger forging (spec §3.3)', () => {
  it('DAY 1 brings three, deterministically for the same seed', () => {
    const a = generateNight(1, 1234);
    const b = generateNight(1, 1234);
    expect(a.doppelgangers).toHaveLength(3);
    expect(a).toEqual(b);
    expect(generateNight(1, 99).doppelgangers).not.toEqual(a.doppelgangers);
  });

  it('the record matches the weapon it brought (spec §3.6)', () => {
    for (let seed = 1; seed < 400; seed++) {
      for (const d of generateNight(1 + (seed % 30), seed).doppelgangers) {
        const r = d.record;
        expect(r.great + r.success + r.keep + r.down).toBe(r.attempts);
        expect(r.path).toHaveLength(r.attempts);
        expect(r.path.at(-1) ?? 0).toBe(d.weapon.level);
        if (r.lastStep) expect(r.lastStep[1]).toBe(d.weapon.level);
        expect(d.weapon.level).toBeGreaterThanOrEqual(0);
        expect(d.weapon.level).toBeLessThanOrEqual(50);
        // replaying the path step by step only ever moves by the table's outcomes
        let prev = 0;
        for (const l of r.path) {
          expect([-1, 0, 1, 2]).toContain(l - prev === -1 && prev === 0 ? 0 : l - prev);
          prev = l;
        }
      }
    }
  });

  it('never spends more than the attempt budget, lost weapons included', () => {
    for (let seed = 1; seed < 300; seed++) {
      const r = forgeWeapon(new Rng(seed), 'allIn', 40, 10).record;
      expect(r.attempts + r.lostAttempts).toBeLessThanOrEqual(40);
    }
  });

  it('all-in smiths are the wild cards: higher peaks, more shattered weapons (high variance)', () => {
    const stats = (t: 'stable' | 'allIn') => {
      const levels: number[] = [];
      let lost = 0;
      for (let s = 1; s <= 600; s++) {
        const f = forgeWeapon(new Rng(s * 7), t, 160, 20);
        levels.push(f.level);
        lost += f.record.destroyedWeapons;
      }
      levels.sort((a, b) => a - b);
      return { p90: levels[Math.floor(levels.length * 0.9)], max: levels.at(-1)!, lost: lost / 600 };
    };
    const stable = stats('stable');
    const allIn = stats('allIn');
    // Since the destroy odds went up (2026-11-18) an all-in smith usually ends low after shattering its
    // weapons, so only its peak and its losses are higher, not its 90th percentile.
    expect(allIn.max).toBeGreaterThan(stable.max);
    expect(allIn.lost).toBeGreaterThan(stable.lost);
  });

  it('later days send more rivals with bigger budgets', () => {
    expect(nightPlan(1).count).toBe(3);
    expect(nightPlan(30).count).toBeGreaterThan(3);
    expect(nightPlan(30).attemptBudget).toBeGreaterThan(nightPlan(1).attemptBudget);
  });

  it('hides the level until revealed', () => {
    const d = generateNight(5, 42).doppelgangers[0];
    expect(weaponLabel(d, false)).toMatch(/\+\?\?$/);
    expect(weaponLabel(d, true)).toMatch(new RegExp(`^\\+${d.weapon.level} `));
  });
});
