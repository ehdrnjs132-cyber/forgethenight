import { describe, expect, it } from 'vitest';
import { DESTROY_FLOOR, ENHANCE_TABLE, OUTCOMES } from '../src/config/enhancement';
import { effectiveRow, enhance, levelAfter, rollOutcome } from '../src/core/systems/enhancement';
import { createRun } from '../src/core/state/initial';
import { runWith, seedFor } from './helpers';

const sum = (r: Record<string, number>) => OUTCOMES.reduce((a, o) => a + r[o], 0);

describe('enhancement table (QA 1)', () => {
  it('has a row for +0..+49', () => {
    expect(ENHANCE_TABLE).toHaveLength(50);
  });

  it('every row sums to exactly 100 and has no negative chance', () => {
    ENHANCE_TABLE.forEach((row, level) => {
      expect(sum(row as never), `+${level}`).toBeCloseTo(100, 9);
      for (const o of OUTCOMES) expect(row[o], `+${level} ${o}`).toBeGreaterThanOrEqual(0);
    });
  });

  it('respects the destroy range (raised again 2026-11-19): 5% at +0, rising to at most 30%', () => {
    expect(ENHANCE_TABLE[0].destroy).toBe(5);
    for (let i = 1; i < ENHANCE_TABLE.length; i++) expect(ENHANCE_TABLE[i].destroy).toBeGreaterThanOrEqual(ENHANCE_TABLE[i - 1].destroy);
    for (const row of ENHANCE_TABLE) expect(row.destroy).toBeLessThanOrEqual(30);
  });

  it('modifiers keep the total at 100 and destroy at or above the floor', () => {
    for (const level of [0, 10, 25, 49]) {
      const r = effectiveRow(level, { great: 5, success: 10, destroy: -50 });
      expect(sum(r as never)).toBeCloseTo(100, 9);
      expect(r.destroy).toBe(DESTROY_FLOOR);
    }
    const overflow = effectiveRow(0, { great: 60, success: 60 });
    expect(sum(overflow as never)).toBeCloseTo(100, 9);
    expect(overflow.keep).toBeCloseTo(0, 9);
  });
});

describe('outcome and level rules', () => {
  it('maps rolls to outcomes in table order', () => {
    const row = { great: 10, success: 50, keep: 20, down: 15, destroy: 5 };
    expect(rollOutcome(row, 0)).toBe('great');
    expect(rollOutcome(row, 0.0999)).toBe('great');
    expect(rollOutcome(row, 0.1)).toBe('success');
    expect(rollOutcome(row, 0.6)).toBe('keep');
    expect(rollOutcome(row, 0.8)).toBe('down');
    expect(rollOutcome(row, 0.95)).toBe('destroy');
    expect(rollOutcome(row, 0.99999)).toBe('destroy');
  });

  it('caps at +50 (QA 2) and floors at +0 (QA 3)', () => {
    expect(levelAfter(49, 'great')).toBe(50);
    expect(levelAfter(50, 'success')).toBe(50);
    expect(levelAfter(0, 'down')).toBe(0);
    expect(levelAfter(10, 'down')).toBe(9);
    expect(levelAfter(10, 'destroy')).toBeNull();
  });

  it('refuses to enhance a +50 weapon (QA 2)', () => {
    const s = runWith([{ level: 50 }, {}]);
    const attempt = enhance(s, 'w1');
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.blocked).toBe('max-level');
  });
});

describe('enhance()', () => {
  it('is blocked until the first-enhance tutorial is done (QA 11)', () => {
    const s = createRun(1);
    s.weapons = [
      { id: 'w1', cls: 'sword', element: 'fire', level: 0, bornDay: 1 },
      { id: 'w2', cls: 'axe', element: 'ice', level: 0, bornDay: 1 },
    ];
    const attempt = enhance(s, 'w1');
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.blocked).toBe('tutorial');
    expect(attempt.state).toBe(s);
  });

  it('no longer asks before risking the last weapon (user decision 2026-11-19)', () => {
    expect(enhance(runWith([{}]), 'w1').ok).toBe(true);
  });

  it('does not ask when other weapons remain', () => {
    expect(enhance(runWith([{}, {}]), 'w1').ok).toBe(true);
  });

  it('removes a destroyed weapon from the inventory (QA 4) and unequips it (QA 5)', () => {
    let s = runWith([{ level: 30 }, { level: 3 }]);
    s.equippedId = 'w1';
    s = seedFor(s, 'w1', 'destroy');
    const attempt = enhance(s, 'w1');
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.result.weaponAfter).toBeNull();
    expect(attempt.state.weapons.map((w) => w.id)).toEqual(['w2']);
    expect(attempt.state.equippedId).toBeNull();
    expect(attempt.state.stats.destroyed).toBe(1);
  });

  it('applies great success as +2 and records the attempt', () => {
    const s = seedFor(runWith([{ level: 7 }, {}]), 'w1', 'great');
    const attempt = enhance(s, 'w1');
    if (!attempt.ok) throw new Error('blocked');
    expect(attempt.state.weapons[0].level).toBe(9);
    expect(attempt.state.lastEnhance?.weaponBefore.level).toBe(7);
    expect(attempt.state.stats.enhanceAttempts).toBe(1);
  });

  it('is deterministic for the same RNG state and advances the RNG', () => {
    const s = runWith([{ level: 20 }, {}], 12345);
    const a = enhance(s, 'w1');
    const b = enhance(s, 'w1');
    if (!a.ok || !b.ok) throw new Error('blocked');
    expect(a.result.outcome).toBe(b.result.outcome);
    expect(a.state.rng).not.toBe(s.rng);
  });

  it('does not mutate the previous state', () => {
    const s = runWith([{ level: 5 }, {}]);
    const snapshot = JSON.stringify(s);
    enhance(s, 'w1');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('flags a milestone when crossing +10', () => {
    const s = seedFor(runWith([{ level: 9 }, {}]), 'w1', 'success');
    const attempt = enhance(s, 'w1');
    if (!attempt.ok) throw new Error('blocked');
    expect(attempt.result.milestone?.level).toBe(10);
  });
});
