import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { SaveManager } from '../src/core/save/save';
import { NIGHT_ARENA } from '../src/config/economy';
import { nightUnlocked } from '../src/core/systems/daynight';
import { atNightDay, runWith } from './helpers';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('the arena is gone (user 2026-11-27: "밤결투기능 없애줘")', () => {
  it('is switched off, so no day opens it', () => {
    expect(NIGHT_ARENA.enabled).toBe(false);
    const s = atNightDay(runWith([{ level: 5 }]));
    expect(nightUnlocked({ ...s, day: 40 })).toBe(false);
  });

  it('START_NIGHT is refused', () => {
    const storage = memory();
    const core = new GameCore(storage, 1);
    core.state = atNightDay(runWith([{ level: 5 }]));
    expect(core.dispatch({ type: 'START_NIGHT' })).toEqual({ type: 'nightBlocked', reason: 'early' });
  });

  it('a save left mid-fight comes back to its evening with nothing lost', () => {
    const storage = memory();
    const before = { ...atNightDay(runWith([{ level: 5 }])), gold: 1000 };
    const { nightSnapshot: _n, ...snap } = before;
    new SaveManager(storage).saveRun({ ...before, phase: 'night', gold: 1000, nightSnapshot: structuredClone(snap) });
    const core = new GameCore(storage, 1);
    expect(core.state.phase).toBe('day');
    expect(core.state.gold).toBe(1000);
    expect(core.notice).toBeNull();
  });
});
