import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { sellPrice } from '../src/core/systems/economy';

function game(gold = 0) {
  const storage = new MemoryStorage();
  const g = new GameCore(storage, 9);
  g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
  g.state = { ...g.state, gold, inventoryCap: 8 };
  return { g, storage };
}

describe('free weapons at the forge (user decision 2026-11-19)', () => {
  it('hands out fresh +0 weapons for nothing, up to 2 more a day (4 with the morning delivery, since 2026-11-27)', () => {
    const { g } = game(0);
    for (let i = 0; i < 2; i++) {
      const r = g.dispatch({ type: 'BUY_WEAPON' });
      if (r.type !== 'weaponBought') throw new Error(r.type);
      expect(r.weapon.level).toBe(0);
      expect(r.price).toBe(0);
    }
    expect(g.state.weapons).toHaveLength(4);
    expect(g.state.gold).toBe(0);
    expect(g.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'daily' });
  });

  it('also needs a free rack slot', () => {
    const { g } = game(0);
    g.state = { ...g.state, inventoryCap: 2 }; // the 2 delivered weapons fill it
    expect(g.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'full' });
  });

  it('a free +0 weapon sells for nothing, so taking and selling never makes gold', () => {
    const { g } = game(0);
    expect(sellPrice(g.state, 0)).toBe(0);
    const r = g.dispatch({ type: 'BUY_WEAPON' });
    if (r.type !== 'weaponBought') throw new Error(r.type);
    g.dispatch({ type: 'SELL', weaponId: r.weapon.id });
    expect(g.state.gold).toBe(0);
  });

  it('is saved at once', () => {
    const { g, storage } = game();
    g.dispatch({ type: 'BUY_WEAPON' });
    expect(new SaveManager(storage).loadRun().state!.weapons).toHaveLength(3);
  });
});
