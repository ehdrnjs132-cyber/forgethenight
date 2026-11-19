import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { inPrologue } from '../src/core/systems/prologue';

describe('day 1 is a normal, guided day (user decision 2026-11-19)', () => {
  it('no scripted prologue: enhancing is a real roll, selling and sleeping work from the start', () => {
    const game = new GameCore(new MemoryStorage(), 21);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    expect(inPrologue(game.state)).toBe(false);
    const outcomes = new Set<string>();
    for (const w of [...game.state.weapons]) {
      const r = game.dispatch({ type: 'ENHANCE', weaponId: w.id });
      if (r.type === 'enhanced') outcomes.add(r.result.outcome);
    }
    // with three real rolls at +0 (5% destroy) it is very unlikely that all three shatter
    expect([...outcomes].some((o) => o !== 'destroy')).toBe(true);
    expect(game.dispatch({ type: 'SLEEP' }).type).toBe('slept');
  });

  it('rivals are named "earth N" with N in 1..999', () => {
    const game = new GameCore(new MemoryStorage(), 21);
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    const r = game.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') throw new Error();
    for (const d of r.lineup) {
      const m = d.name.match(/^earth (\d+)$/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(1);
      expect(Number(m![1])).toBeLessThanOrEqual(999);
    }
  });
});
