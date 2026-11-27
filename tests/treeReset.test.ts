import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { buyNode, resetTree, treeSpent } from '../src/core/systems/skillTree';
import { starPrice } from '../src/config/skillTree';
import { withNodes } from './helpers';

const books = (n: number) => ({ resetBook: n });

describe('스킬 초기화 서적 (user 2026-11-27: refunds the gold paid for the stars)', () => {
  it('gives back exactly what the stars cost and forgets them; one book is used', () => {
    let s = { ...withNodes([]), gold: 10_000 };
    for (const id of ['od1n', 'od1m', 'sp1n']) {
      const r = buyNode(s, id);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    const paid = 10_000 - s.gold;
    expect(paid).toBe(starPrice(1) + starPrice(2) + starPrice(1)); // 20 + 50 + 20
    expect(treeSpent(s)).toBe(paid);
    const r = resetTree({ ...s, items: { ...s.items, ...books(1) } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refunded).toBe(paid);
    expect(r.state.gold).toBe(10_000);
    expect(r.state.treeNodes).toEqual([]);
    expect(r.state.items.resetBook).toBe(0);
  });

  it('needs a book, a star, and the evening', () => {
    const s = withNodes(['od1n']);
    expect(resetTree(s)).toEqual({ ok: false, reason: 'no-book' });
    expect(resetTree({ ...withNodes([]), items: books(1) })).toEqual({ ok: false, reason: 'nothing' });
    expect(resetTree({ ...s, items: books(1) }, false)).toEqual({ ok: false, reason: 'day' });
  });

  it('older saves without the record are priced line by line at today\'s prices', () => {
    const s = withNodes(['od1n', 'od1m', 'od1']);
    expect(s.treeSpent).toBeUndefined();
    expect(treeSpent(s)).toBe(starPrice(1) + starPrice(2) + starPrice(3));
  });

  it('RESET_TREE through the core from the evening screen', () => {
    const core = new GameCore(new MemoryStorage(), 2);
    core.state = { ...core.state, gold: 1000, items: { ...core.state.items, ...books(1) } };
    core.dispatch({ type: 'BUY_NODE', id: 'gd1n', evening: true });
    expect(core.dispatch({ type: 'RESET_TREE' })).toEqual({ type: 'treeResetBlocked', reason: 'day' });
    expect(core.dispatch({ type: 'RESET_TREE', evening: true })).toEqual({ type: 'treeReset', refunded: 20 });
    expect(core.state.gold).toBe(1000);
  });
});
