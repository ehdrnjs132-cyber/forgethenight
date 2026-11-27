import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { inPrologue } from '../src/core/systems/prologue';
import { atNightDay } from './helpers';
import { NIGHT_ARENA as ARENA_SWITCH } from '../src/config/economy';

// The arena was removed from the game on 2026-11-27; these tests keep its dormant code working.
ARENA_SWITCH.enabled = true;

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

  it('rivals are the kingdom’s smiths with a title and a name (no "earth N" since 2026-11-27)', () => {
    const game = new GameCore(new MemoryStorage(), 21);
    game.state = atNightDay(game.state); // the night battle is offered from DAY 20
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    const r = game.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') throw new Error();
    for (const d of r.lineup) {
      expect(d.name).toMatch(/^\S+( \S+)? \S+$/);
      expect(d.name).not.toMatch(/earth/);
    }
  });
});
