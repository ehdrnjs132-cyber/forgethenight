import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { KEYS, MemoryStorage, SaveManager } from '../src/core/save/save';
import { createRun } from '../src/core/state/initial';

describe('save and load (QA 17)', () => {
  it('round-trips the run', () => {
    const storage = new MemoryStorage();
    const save = new SaveManager(storage);
    const s = createRun(99);
    s.gold = 1234;
    save.saveRun(s);
    const loaded = save.loadRun();
    expect(loaded.source).toBe('saved');
    expect(loaded.state).toEqual(s);
  });

  it('falls back to the backup when the main save is corrupted', () => {
    const storage = new MemoryStorage();
    const save = new SaveManager(storage);
    const first = createRun(1);
    first.gold = 10;
    save.saveRun(first);
    save.saveRun({ ...first, gold: 20 });
    storage.setItem(KEYS.run, storage.getItem(KEYS.run)!.replace('"gold":20', '"gold":999999'));
    const loaded = save.loadRun();
    expect(loaded.source).toBe('backup');
    expect(loaded.recovered).toBe(true);
    expect(loaded.state?.gold).toBe(10);
    expect(storage.getItem(KEYS.runCorrupt)).not.toBeNull();
  });

  it('clearing the run keeps the records', () => {
    const storage = new MemoryStorage();
    const save = new SaveManager(storage);
    save.saveRun(createRun(1));
    save.saveRecords({ bestDay: 4, bestLevel: 22, kills: 10, deaths: 2, bossesKilled: [], runs: 3 });
    save.clearRun();
    expect(save.loadRun().state).toBeNull();
    expect(save.loadRecords().bestLevel).toBe(22);
  });
});

describe('GameCore persistence', () => {
  it('remembers that the tutorial was completed (QA 12)', () => {
    const storage = new MemoryStorage();
    const a = new GameCore(storage, 5);
    a.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    const b = new GameCore(storage);
    expect(b.state.tutorials.firstEnhance).toBe(true);
  });

  it('saves the enhancement result before the presentation hears about it (QA 20)', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 5);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    const id = game.state.weapons[0].id;
    let savedAtEvent: string | null = null;
    game.on('enhanced', () => {
      savedAtEvent = storage.getItem(KEYS.run);
    });
    game.dispatch({ type: 'ENHANCE', weaponId: id });
    const reloaded = new SaveManager(storage).loadRun().state!;
    expect(savedAtEvent).not.toBeNull();
    expect(reloaded.stats.enhanceAttempts).toBe(1);
    expect(reloaded).toEqual(game.state);
  });

  it('does not hand out the daily weapons again after a reload on the same day (QA 8)', () => {
    const storage = new MemoryStorage();
    const a = new GameCore(storage, 5);
    expect(a.state.weapons).toHaveLength(3);
    const b = new GameCore(storage);
    expect(b.state.weapons).toHaveLength(3);
    expect(b.state.weapons.map((w) => w.id)).toEqual(a.state.weapons.map((w) => w.id));
  });

  it('starting a new run resets the run but counts it in the records', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 5);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    game.dispatch({ type: 'NEW_RUN', seed: 9 });
    expect(game.state.tutorials.firstEnhance).toBeUndefined();
    expect(game.state.weapons).toHaveLength(3);
    expect(game.records.runs).toBe(2);
  });
});
