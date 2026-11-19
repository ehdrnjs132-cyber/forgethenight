import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { WEAPON_BASE_PRICE } from '../src/config/economy';
import { weaponPrice } from '../src/core/systems/weapons';

function game(gold = 10_000) {
  const storage = new MemoryStorage();
  const g = new GameCore(storage, 9);
  g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
  g.state = { ...g.state, gold, inventoryCap: 8 };
  return { g, storage };
}

describe('buying weapons at the forge (user decision 2026-11-19)', () => {
  it('adds a fresh +0 weapon and doubles the price every time', () => {
    const { g } = game();
    const prices: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = g.dispatch({ type: 'BUY_WEAPON' });
      if (r.type !== 'weaponBought') throw new Error(r.type);
      expect(r.weapon.level).toBe(0);
      prices.push(r.price);
    }
    expect(prices).toEqual([WEAPON_BASE_PRICE, WEAPON_BASE_PRICE * 2, WEAPON_BASE_PRICE * 4, WEAPON_BASE_PRICE * 8]);
    expect(g.state.weapons).toHaveLength(3 + 4);
    expect(g.state.gold).toBe(10_000 - WEAPON_BASE_PRICE * 15);
    expect(weaponPrice(g.state)).toBe(WEAPON_BASE_PRICE * 16);
  });

  it('needs a free rack slot and enough gold', () => {
    const full = game().g;
    full.state = { ...full.state, inventoryCap: 3 };
    expect(full.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'full' });
    const poor = game(WEAPON_BASE_PRICE - 1).g;
    expect(poor.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'gold' });
  });

  it('is saved at once, and is not possible in the first-day prologue', () => {
    const { g, storage } = game();
    g.dispatch({ type: 'BUY_WEAPON' });
    expect(new SaveManager(storage).loadRun().state!.weaponsBought).toBe(1);
    const fresh = new GameCore(new MemoryStorage(), 9);
    expect(fresh.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'prologue' });
  });
});
