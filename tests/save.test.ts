import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { KEYS, MemoryStorage, SaveManager, checksum } from '../src/core/save/save';
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
    save.saveRecords({ bestDay: 4, bestLevel: 22, kills: 10, deaths: 2, bossesKilled: [], runs: 3, seen: ['intro'] });
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

  it('starting a new run resets the run, keeps tutorial progress and counts the run', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 5);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    game.dispatch({ type: 'NEW_RUN', seed: 9 });
    expect(game.state.tutorials.firstEnhance).toBe(true);
    expect(game.state.equippedId).toBeNull();
    expect(game.state.weapons).toHaveLength(3);
    expect(game.records.runs).toBe(2);
  });

  it('remembers watched cutscenes across runs, and old records load with an empty list', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 1);
    expect(game.hasSeen('intro')).toBe(false);
    game.markSeen('intro');
    game.dispatch({ type: 'NEW_RUN' });
    expect(new GameCore(storage).hasSeen('intro')).toBe(true);
    const legacy = new MemoryStorage();
    const body = JSON.stringify({ bestDay: 1, bestLevel: 0, kills: 0, deaths: 0, bossesKilled: [], runs: 1 });
    legacy.setItem(KEYS.records, JSON.stringify({ v: 1, sum: checksum(body), data: JSON.parse(body) }));
    expect(new SaveManager(legacy).loadRecords().seen).toEqual([]);
  });

  it('migrates a version 1 save', () => {
    const storage = new MemoryStorage();
    const save = new SaveManager(storage);
    const v1 = createRun(3) as unknown as Record<string, unknown>;
    v1.version = 1;
    v1.stats = { enhanceAttempts: 4, destroyed: 1, bestLevel: 7 };
    storage.setItem(KEYS.run, JSON.stringify({ v: 1, sum: checksum(JSON.stringify(v1)), data: v1 }));
    const loaded = save.loadRun().state!;
    expect(loaded.version).toBe(4);
    expect(loaded.inventoryCap).toBe(3);
    expect(loaded.stats.enhanceAttempts).toBe(4);
    expect(loaded.stats.kills).toBe(0);
    expect(loaded.stats.deaths).toBe(0);
    expect(loaded.stats.sold).toBe(0);
    expect(loaded.armed).toEqual({});
    expect(loaded.merchant).toBeNull();
  });
});
