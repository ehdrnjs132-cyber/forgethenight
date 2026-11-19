import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { START_LIVES } from '../src/config/rules';
import { inPrologue } from '../src/core/systems/prologue';

function fresh() {
  const game = new GameCore(new MemoryStorage(), 21);
  game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
  return game;
}

describe('first-day prologue (user decision 2026-11-18)', () => {
  it('starts on a new save, and every enhancement shatters the weapon', () => {
    const game = fresh();
    expect(inPrologue(game.state)).toBe(true);
    const ids = game.state.weapons.map((w) => w.id);
    for (const id of ids) {
      const r = game.dispatch({ type: 'ENHANCE', weaponId: id, confirmLast: true });
      expect(r.type).toBe('enhanced');
      if (r.type === 'enhanced') expect(r.result.outcome).toBe('destroy');
    }
    expect(game.state.weapons).toHaveLength(0);
  });

  it('blocks selling, so the weapons cannot be cashed in instead', () => {
    const game = fresh();
    expect(game.dispatch({ type: 'SELL', weaponId: game.state.weapons[0].id })).toEqual({ type: 'sellBlocked', reason: 'prologue' });
  });

  it('the scripted defeat costs no life and gives DAY 1 three new weapons, once', () => {
    const game = fresh();
    for (const w of [...game.state.weapons]) game.dispatch({ type: 'ENHANCE', weaponId: w.id, confirmLast: true });
    expect(game.dispatch({ type: 'START_NIGHT' }).type).toBe('nightStarted');
    const r = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 20 });
    expect(r).toMatchObject({ type: 'nightLost', prologue: true, livesLeft: START_LIVES });
    expect(game.state.day).toBe(1);
    expect(game.state.phase).toBe('day');
    expect(game.state.weapons).toHaveLength(3);
    expect(inPrologue(game.state)).toBe(false);

    // from now on the night is the normal gamble: a loss halves the gold and moves to DAY 2
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    game.dispatch({ type: 'START_NIGHT' });
    const again = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 20 });
    expect(again).toMatchObject({ type: 'nightLost', livesLeft: START_LIVES });
    expect(game.state.day).toBe(2);
  });

  it('rivals are named "earth N" with N in 1..999', () => {
    const game = fresh();
    for (const w of [...game.state.weapons]) game.dispatch({ type: 'ENHANCE', weaponId: w.id, confirmLast: true });
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
