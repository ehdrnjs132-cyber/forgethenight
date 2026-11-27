// Game-over screen (user 2026-11-27): real play time and the gold the run made, no monster counts.
import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { playTime } from '../src/presentation/format';

describe('play time and the game-over summary', () => {
  it('PLAY_TIME adds up, at most a minute per report, and is saved', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 4);
    core.dispatch({ type: 'PLAY_TIME', seconds: 10 });
    core.dispatch({ type: 'PLAY_TIME', seconds: 10.5 });
    core.dispatch({ type: 'PLAY_TIME', seconds: 3600 }); // a sleeping tab: capped
    core.dispatch({ type: 'PLAY_TIME', seconds: -5 });
    expect(core.state.playSeconds).toBeCloseTo(80.5, 6);
    expect(new SaveManager(storage).loadRun().state!.playSeconds).toBeCloseTo(80.5, 6);
  });

  it('unpaid rent ends the run with its play time and the gold it made from sales', () => {
    const core = new GameCore(new MemoryStorage(), 4);
    core.state = {
      ...core.state,
      day: 7,
      rentDueDay: 8,
      gold: 0,
      playSeconds: 4321,
      stats: { ...core.state.stats, goldEarned: 98_765 },
      tutorials: { ...core.state.tutorials, prologueDone: true },
    };
    const r = core.dispatch({ type: 'SLEEP' });
    if (r.type !== 'slept' || !r.gameOver) throw new Error('expected the run to end');
    expect(r.gameOver).toMatchObject({ day: 8, playSeconds: 4321, goldEarned: 98_765 });
    expect(core.state.playSeconds ?? 0).toBe(0); // the new run starts at zero
  });

  it('reads as hours, minutes and seconds', () => {
    expect(playTime(45)).toBe('45초');
    expect(playTime(12 * 60 + 5)).toBe('12분 5초');
    expect(playTime(3600 + 12 * 60 + 5)).toBe('1시간 12분 5초');
  });
});
