// Today's forge record for the end-of-day summary (user request 2026-11-27).
import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { dayLog } from '../src/core/systems/dayLog';
import { sell, sellPrice } from '../src/core/systems/economy';
import { enhance } from '../src/core/systems/enhancement';
import { runWith } from './helpers';

describe('day log', () => {
  it('counts every strike by result, the gold spent, and the best level reached', () => {
    let s = runWith([{ level: 5 }]);
    const seen = { great: 0, success: 0, keep: 0, down: 0, destroy: 0 };
    let spent = 0;
    let best = 0;
    for (let seed = 1; seed <= 30 && s.weapons.length; seed++) {
      const before = s.gold;
      const r = enhance({ ...s, rng: seed * 31 }, s.weapons[0].id);
      if (!r.ok) throw new Error(r.blocked);
      seen[r.result.outcome]++;
      spent += before - r.state.gold;
      best = Math.max(best, r.result.weaponAfter?.level ?? 0);
      s = r.state;
    }
    const log = dayLog(s);
    expect(log).toMatchObject({ ...seen, spent });
    expect(log.attempts).toBe(Object.values(seen).reduce((a, b) => a + b, 0));
    expect(log.best?.level ?? 0).toBe(best);
  });

  it('counts sales, and starts over the next morning', () => {
    const s = runWith([{ level: 6 }]);
    const r = sell(s, 'w1');
    if (!r.ok) throw new Error();
    expect(dayLog(r.state)).toMatchObject({ earned: sellPrice(s, 6), sold: 1 });
    expect(dayLog({ ...r.state, day: r.state.day + 1 }).attempts).toBe(0);
    expect(dayLog({ ...r.state, day: r.state.day + 1 }).earned).toBe(0);
  });

  it('is saved with the run (a reload keeps tonight’s summary)', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 3);
    core.state = { ...core.state, gold: 1_000, tutorials: { ...core.state.tutorials, firstEnhance: true, prologueDone: true } };
    core.dispatch({ type: 'ENHANCE', weaponId: core.state.weapons[0].id });
    expect(dayLog(new GameCore(storage).state).attempts).toBe(1);
  });
});
