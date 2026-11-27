import { describe, expect, it } from 'vitest';
import { atNightDay, runWith, seedFor } from './helpers';
import { SALE_AWAKEN, SALE_MULTIPLIER } from '../src/config/economy';
import { keyPrice, buy, enhanceCost, isMerchantDay, openMerchant, salePrice, sell, sellPrice, toggleArmed, undoEnhance } from '../src/core/systems/economy';
import { effectiveRow, enhance } from '../src/core/systems/enhancement';
import { ENHANCE_TABLE } from '../src/config/enhancement';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { START_GOLD } from '../src/config/rules';

describe('sale prices (§14)', () => {
  it('matches the table rows and grows between them', () => {
    expect(salePrice(0)).toBe(10);
    expect(salePrice(10)).toBe(150);
    expect(salePrice(20)).toBe(1_500);
    expect(salePrice(50)).toBe(1_500_000);
    for (let l = 1; l <= 50; l++) expect(salePrice(l)).toBeGreaterThan(salePrice(l - 1));
  });
});

describe('selling (QA 6, 7)', () => {
  it('pays gold and removes the weapon, unequipping it', () => {
    const s = { ...runWith([{ level: 10 }, {}]), equippedId: 'w1' };
    const r = sell(s, 'w1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.gold).toBe(s.gold + Math.round((150 * SALE_MULTIPLIER * SALE_AWAKEN.mul) / 50) * 50);
    expect(r.state.weapons.map((w) => w.id)).toEqual(['w2']);
    expect(r.state.equippedId).toBeNull();
    expect(r.state.stats.sold).toBe(1);
  });

  it('awakened weapons (+10 and up) sell for ×2.5: the jump is right at +10 (2026-11-27)', () => {
    const s = runWith([]);
    expect(SALE_AWAKEN).toEqual({ level: 10, mul: 2.5 });
    expect(sellPrice(s, 9)).toBe(345);
    expect(sellPrice(s, 10)).toBe(1_150); // 1,125 rounded to 50 G
    expect(sellPrice(s, 15)).toBe(3_750);
    // a strike on the way to +10 pays clearly better than stopping at +8 (≈ 22 strikes per +10 made vs ≈ 15 per +8)
    expect(sellPrice(s, 10) / 22).toBeGreaterThan((sellPrice(s, 8) / 15.3) * 2.5);
  });

  it('cannot sell the same weapon twice', () => {
    const r = sell(runWith([{ level: 5 }]), 'w1');
    if (!r.ok) throw new Error();
    expect(sell(r.state, 'w1')).toEqual({ ok: false, reason: 'no-weapon' });
  });

  it('a sale before a lost night stays sold, and its gold stays (decision #4)', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 3);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    // a +1 weapon (an untouched +0 one sells for nothing since weapons became free)
    game.state = atNightDay({ ...game.state, weapons: game.state.weapons.map((w, i) => (i === 0 ? { ...w, level: 1 } : w)) });
    const [a, b] = game.state.weapons;
    const price = sellPrice(game.state, 1);
    game.dispatch({ type: 'SELL', weaponId: a.id });
    game.dispatch({ type: 'EQUIP', weaponId: b.id });
    game.dispatch({ type: 'START_NIGHT' });
    game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 5 });
    expect(price).toBeGreaterThan(0);
    // the sale stands; the lost gamble then halves whatever gold there was (sale included)
    const expected = Math.floor((START_GOLD + price) / 2) + game.lastOverflow.gold;
    expect(game.state.gold).toBe(expected);
    expect(game.state.weapons.find((w) => w.id === a.id)).toBeUndefined();
    expect(new GameCore(storage).state.gold).toBe(expected);
  });

  it('the sale is on disk immediately (§25: closing mid-sale cannot duplicate gold)', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 3);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    game.state = { ...game.state, weapons: game.state.weapons.map((w, i) => (i === 0 ? { ...w, level: 1 } : w)) };
    game.dispatch({ type: 'SELL', weaponId: game.state.weapons[0].id });
    const saved = new SaveManager(storage).loadRun().state!;
    expect(saved.gold).toBe(START_GOLD + sellPrice(saved, 1));
    expect(saved.weapons).toHaveLength(1); // 2 delivered, 1 sold
  });
});

describe('merchant Morr (§15)', () => {
  it('visits every third day', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(isMerchantDay)).toEqual([false, false, true, false, false, true, true]);
  });

  it('rolls the shelf once per visiting day; a second call keeps it', () => {
    const s = { ...runWith([]), day: 3 };
    const a = openMerchant(s);
    expect(a.merchant?.day).toBe(3);
    expect(openMerchant(a)).toBe(a);
  });

  it('never stocks the time stone before DAY 15', () => {
    for (let seed = 1; seed < 300; seed++) {
      const m = openMerchant({ ...runWith([], seed), day: 12 }).merchant!;
      expect(m.stock.some((e) => e.item === 'timeStone')).toBe(false);
    }
  });

  it('never offers hearts any more (unpaid rent ends the run, 2026-11-20)', () => {
    for (let seed = 1; seed <= 300; seed++) expect(openMerchant({ ...runWith([], seed), day: 3 }).merchant!.stock.some((e) => e.item === 'heart')).toBe(false);
  });

  it('sells for gold, respects stock and the 10-life cap (QA 14)', () => {
    let s = { ...runWith([]), day: 3, gold: 10_000, lives: 9 };
    s = { ...s, merchant: { day: 3, stock: [{ item: 'heart', price: 3000, left: 1 }, { item: 'protect', price: 1200, left: 2 }] } };
    const r1 = buy(s, 'heart');
    if (!r1.ok) throw new Error();
    expect(r1.state.lives).toBe(10);
    expect(r1.state.gold).toBe(7_000);
    expect(buy(r1.state, 'heart')).toEqual({ ok: false, reason: 'sold-out' });
    const r2 = buy(r1.state, 'protect');
    if (!r2.ok) throw new Error();
    expect(r2.state.items.protect).toBe(1);
    expect(buy({ ...r2.state, gold: 100 }, 'protect')).toEqual({ ok: false, reason: 'gold' });
    const full = { ...s, lives: 10 };
    expect(buy(full, 'heart')).toEqual({ ok: false, reason: 'max-lives' });
    expect(buy({ ...s, day: 4 }, 'protect')).toEqual({ ok: false, reason: 'closed' });
  });

  it('purchases made before a lost night gamble are kept (only the gold is halved)', () => {
    const storage = new MemoryStorage();
    const game = new GameCore(storage, 5);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    game.state = openMerchant({ ...atNightDay(game.state), gold: 5_000, merchant: null });
    game.state = { ...game.state, merchant: { day: game.state.day, stock: [{ item: 'protect', price: 1200, left: 2 }] } };
    game.dispatch({ type: 'BUY', item: 'protect' });
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    game.dispatch({ type: 'START_NIGHT' });
    game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 1 });
    expect(game.state.items.protect).toBe(1);
    expect(game.state.gold).toBe(1_900 + game.lastOverflow.gold);
  });
});

describe('enhancement stones', () => {
  it('protection turns a destruction into keep and is spent only then', () => {
    const base = { ...runWith([{ level: 20 }, {}]), items: { protect: 2 } };
    const destroyRoll = seedFor(base, 'w1', 'destroy');
    const armed = toggleArmed(destroyRoll, 'protect');
    const a = enhance(armed, 'w1');
    if (!a.ok) throw new Error();
    expect(a.result.outcome).toBe('keep');
    expect(a.result.protectedFrom).toBe('destroy');
    expect(a.state.weapons[0].level).toBe(20);
    expect(a.state.items.protect).toBe(1);

    const successRoll = toggleArmed(seedFor(base, 'w1', 'success'), 'protect');
    const b = enhance(successRoll, 'w1');
    if (!b.ok) throw new Error();
    expect(b.result.protectedFrom).toBeNull();
    expect(b.state.items.protect).toBe(2);
  });

  it('luck and master shift the odds and are spent on the attempt', () => {
    const s = toggleArmed(toggleArmed({ ...runWith([{ level: 20 }, {}]), items: { luck: 1, master: 1 } }, 'luck'), 'master');
    const base = ENHANCE_TABLE[20];
    const row = effectiveRow(20, { great: 3, success: 5, destroy: -base.destroy / 2 });
    const a = enhance(s, 'w1');
    if (!a.ok) throw new Error();
    expect(a.result.row.destroy).toBeCloseTo(row.destroy);
    expect(a.result.row.great).toBeCloseTo(row.great);
    expect(a.state.items).toEqual({ luck: 0, master: 0 });
    expect(a.state.armed).toEqual({ luck: false, master: false });
  });

  it('cannot switch on a stone you do not own', () => {
    const s = runWith([{}]);
    expect(toggleArmed(s, 'luck')).toBe(s);
  });
});

describe('time stone (decision H)', () => {
  it('brings back a destroyed weapon in its old slot and equipped', () => {
    const s = { ...seedFor(runWith([{}, { level: 30 }, {}]), 'w2', 'destroy'), equippedId: 'w2', items: { timeStone: 1 } };
    const a = enhance(s, 'w2');
    if (!a.ok) throw new Error();
    expect(a.state.weapons).toHaveLength(2);
    const u = undoEnhance(a.state);
    if (!u.ok) throw new Error();
    expect(u.state.weapons.map((w) => [w.id, w.level])).toEqual([['w1', 0], ['w2', 30], ['w3', 0]]);
    expect(u.state.equippedId).toBe('w2');
    expect(u.state.items.timeStone).toBe(0);
    expect(undoEnhance(u.state)).toEqual({ ok: false, reason: 'no-stone' });
  });

  it('only undoes the last attempt and nothing after a sale or the night', () => {
    const s = { ...runWith([{ level: 5 }, {}]), items: { timeStone: 2 } };
    expect(undoEnhance(s)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    const a = enhance(s, 'w1');
    if (!a.ok) throw new Error();
    const sold = sell(a.state, 'w2');
    if (!sold.ok) throw new Error();
    expect(undoEnhance(sold.state)).toEqual({ ok: false, reason: 'nothing-to-undo' });
  });
});

describe('revive stone', () => {
  it('is spent during the night, and returned if that night is lost anyway', () => {
    const game = new GameCore(new MemoryStorage(), 7);
    game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    game.state = atNightDay({ ...game.state, items: { revive: 1 } });
    game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
    expect(game.dispatch({ type: 'USE_REVIVE' })).toEqual({ type: 'noRevive' });
    game.dispatch({ type: 'START_NIGHT' });
    expect(game.dispatch({ type: 'USE_REVIVE' })).toEqual({ type: 'revived' });
    expect(game.state.items.revive).toBe(0);
    expect(game.dispatch({ type: 'USE_REVIVE' })).toEqual({ type: 'noRevive' });
    game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 1 });
    expect(game.state.items.revive).toBe(1);
  });
});

describe('enhancement cost and inventory upgrades (2026-11-18 feedback)', () => {
  it('each attempt costs gold (user decision 2026-11-18), and is refused without enough', () => {
    const s = { ...runWith([{ level: 10 }, {}]), gold: 1_000 };
    const a = enhance(s, 'w1');
    if (!a.ok) throw new Error();
    expect(a.state.gold).toBe(1_000 - enhanceCost(10));
    expect(enhanceCost(0)).toBeGreaterThanOrEqual(1);
    expect(enhanceCost(20)).toBeGreaterThan(enhanceCost(10));
    expect(enhance({ ...s, gold: 0 }, 'w1')).toMatchObject({ ok: false, blocked: 'gold' });
  });

  it('a key opens one rack slot and the next one costs double', () => {
    let s = { ...runWith([]), day: 3, gold: 10_000, inventoryCap: 3 };
    s = openMerchant({ ...s, merchant: null });
    const key = s.merchant!.stock.find((e) => e.item === 'key')!;
    expect(key.price).toBe(keyPrice(s));
    const r = buy(s, 'key');
    if (!r.ok) throw new Error();
    expect(r.state.inventoryCap).toBe(4);
    expect(keyPrice(r.state)).toBe(key.price * 2);
  });
});
