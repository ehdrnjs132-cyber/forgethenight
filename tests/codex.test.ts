import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { codexKey } from '../src/config/swordNames';
import { runWith } from './helpers';

describe('무기 도감 (user 2026-11-27)', () => {
  it('a sword form is recorded the moment the player holds it, and survives a new run', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 1);
    core.state = runWith([{ level: 0, element: 'fire' }]);
    core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' }); // any action commits the state
    expect(core.records.forged).toContain(codexKey('fire', 0));
    core.state = runWith([{ level: 12, element: 'ice' }]);
    core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    expect(core.records.forged).toContain('ice:6');
    core.dispatch({ type: 'NEW_RUN' });
    expect(new SaveManager(storage).loadRecords().forged).toEqual(expect.arrayContaining(['fire:0', 'ice:6']));
  });

  it('forms are counted once', () => {
    const core = new GameCore(new MemoryStorage(), 1);
    core.state = runWith([{ level: 4, element: 'water' }, { level: 5, element: 'water' }]);
    core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    expect((core.records.forged ?? []).filter((k) => k === 'water:2').length).toBe(1);
  });
});
