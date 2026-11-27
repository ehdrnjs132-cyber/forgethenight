import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { PERKS, PERK_BY_ID, PERK_ODDS, TIER_MAX } from '../src/config/rentPerks';
import { collectRent, rentFor } from '../src/core/systems/rent';
import { pickPerk, rerollCost, rerollPerks, rollChoices, tierOdds } from '../src/core/systems/rentPerks';
import { treeEffects } from '../src/core/systems/skillTree';
import { enhanceCostFor, enhanceCost, sell, sellPrice } from '../src/core/systems/economy';
import { drainStamina, staminaMax, strike } from '../src/core/systems/forgeSkills';
import { enhance } from '../src/core/systems/enhancement';
import { playCard } from '../src/core/systems/cards';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/core/state/types';
import { runWith, seedFor } from './helpers';

const due = (s: GameState): GameState => ({ ...s, rentDueDay: s.day });
const withPerks = (perks: Record<string, number>, s: GameState = runWith([{ level: 10 }, {}])): GameState => ({ ...s, perks });

describe('왕의 하사품 (rent perks, 2026-11-27)', () => {
  it('65 perks: 20 bronze, 20 silver, 20 gold, 5 rainbow; unique ids and names', () => {
    const count = (t: string) => PERKS.filter((p) => p.tier === t).length;
    expect([count('bronze'), count('silver'), count('gold'), count('rainbow')]).toEqual([20, 20, 20, 5]);
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(65);
    expect(new Set(PERKS.map((p) => p.name)).size).toBe(65);
    for (const p of PERKS) expect(p.max).toBeLessThanOrEqual(TIER_MAX[p.tier]);
  });

  it('tier odds add up to 100 and rainbow is 1.5% from the third rent', () => {
    for (const o of PERK_ODDS) expect(Object.values(o.odds).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(tierOdds(1)).toMatchObject({ bronze: 80, silver: 20, gold: 0, rainbow: 0 });
    expect(tierOdds(2).gold).toBe(10);
    expect(tierOdds(7)).toMatchObject({ gold: 23.5, rainbow: 1.5 });
  });

  it('the first rent only offers bronze and silver; three different cards', () => {
    const s = runWith([]);
    for (let seed = 1; seed < 300; seed++) {
      const ids = rollChoices(s, 1, new Rng(seed));
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(['bronze', 'silver']).toContain(PERK_BY_ID[id].tier);
    }
  });

  it('a paid rent offers cards; an unpaid one does not', () => {
    const paid = collectRent(due({ ...runWith([]), gold: 100_000 })).state;
    expect(paid.perkOffer?.choices.length).toBe(3);
    expect(paid.perkOffer?.rentNo).toBe(1);
    const broke = collectRent(due({ ...runWith([]), gold: 0 })).state;
    expect(broke.perkOffer ?? null).toBeNull();
  });

  it('picking levels the perk up; maxed perks are no longer offered', () => {
    let s: GameState = { ...runWith([]), perkOffer: { day: 1, rentNo: 1, rentPaid: 500, choices: ['b_grip', 'b_whet', 'b_shine'], rerolls: 0 } };
    const r = pickPerk(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.perks).toEqual({ b_grip: 1 });
    expect(r.state.perkOffer).toBeNull();
    s = { ...s, perks: { b_grip: 3 } };
    for (let seed = 1; seed < 300; seed++) expect(rollChoices(s, 1, new Rng(seed))).not.toContain('b_grip');
  });

  it('다시 뽑기 costs gold: 20% of the rent, doubling each time', () => {
    const s: GameState = { ...runWith([]), gold: 1000, perkOffer: { day: 1, rentNo: 3, rentPaid: 1000, choices: ['b_grip', 'b_whet', 'b_shine'], rerolls: 0 } };
    expect(rerollCost(s)).toBe(200);
    const a = rerollPerks(s);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.gold).toBe(800);
    expect(rerollCost(a.state)).toBe(400);
    expect(rerollPerks({ ...a.state, gold: 399 })).toEqual({ ok: false, reason: 'gold' });
  });

  it('perks add onto the skill-tree effects', () => {
    const e = treeEffects(withPerks({ b_grip: 3, g_master: 2, r_bless: 1 }));
    expect(e.success).toBeCloseTo(2.4 + 6 + 6, 6);
    expect(e.destroy).toBeCloseTo(3, 6);
  });

  it('rent perks: cheaper rent, kickback and stones with every paid visit', () => {
    const base = { ...runWith([]), gold: 100_000 };
    const s = withPerks({ b_safe: 3, s_kick: 2, s_protect: 1, s_luck: 2 }, base);
    expect(rentFor(s, 10)).toBeLessThan(rentFor(base, 10));
    const r = collectRent(due(s));
    const paid = r.notice!.amount;
    expect(r.state.gold).toBe(100_000 - paid + Math.round(paid * 0.16));
    expect(r.state.items.protect).toBe((s.items.protect ?? 0) + 2);
    expect(r.state.items.luck).toBe((s.items.luck ?? 0) + 4);
  });

  it('왕의 총애 puts every next visit a day later', () => {
    const s = { ...runWith([]), gold: 100_000 };
    const a = collectRent(due(s)).state.rentDueDay!;
    const b = collectRent(due(withPerks({ r_favor: 1 }, s))).state.rentDueDay!;
    expect(b).toBe(a + 1);
  });

  it('selling: awakened bonus, 황금 모루, first sale of the day', () => {
    const s = runWith([{ level: 12 }, { level: 12 }]);
    const plain = sellPrice(s, 12);
    expect(sellPrice(withPerks({ r_anvil: 1 }, s), 12)).toBeGreaterThan(plain * 1.45);
    expect(sellPrice(withPerks({ g_awake: 2 }, s), 12)).toBeGreaterThan(plain);
    expect(sellPrice(withPerks({ g_awake: 2 }, s), 8)).toBe(sellPrice(s, 8)); // only +10 and up
    const f = withPerks({ s_first: 3 }, s);
    const one = sell(f, 'w1');
    expect(one.ok && one.price).toBeGreaterThan(plain * 1.5);
    if (!one.ok) return;
    const two = sell(one.state, 'w2');
    expect(two.ok && two.price).toBe(plain);
  });

  it('견습생: the day\'s first strikes are free, then the normal price', () => {
    const s = withPerks({ b_appr: 1 }); // Lv 1: two free strikes a day
    expect(enhanceCostFor(s, 10)).toBe(0);
    const a = enhance(s, 'w1');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.gold).toBe(s.gold);
    const b = enhance(a.state, a.state.weapons[0].id);
    if (!b.ok) return;
    expect(b.state.gold).toBe(s.gold);
    const c = b.state;
    expect(enhanceCostFor(c, c.weapons[0].level)).toBe(enhanceCost(c.weapons[0].level));
  });

  it('대장간 축제: strikes are free on the day the rent was paid', () => {
    const s = withPerks({ g_fest: 1 });
    expect(enhanceCostFor(s, 10)).toBe(enhanceCost(10));
    const paidToday = { ...s, lastRent: { day: s.day, amount: 100, paid: 100, lifeLost: false } };
    expect(enhanceCostFor(paidToday, 10)).toBe(0);
  });

  it('두 번째 기회 turns a destruction into a drop once a day', () => {
    const s = seedFor(withPerks({ g_second: 1 }, runWith([{ level: 20 }, {}])), 'w1', 'down');
    // find a destroying seed with the perk off, then replay it with the perk on
    const off = seedFor(runWith([{ level: 20 }, {}]), 'w1', 'destroy');
    const r = enhance({ ...s, rng: off.rng }, 'w1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.outcome).toBe('down');
    expect(r.result.weaponAfter?.level).toBe(19);
  });

  it('불사조 깃털 brings a destroyed weapon back at half its level', () => {
    const off = seedFor(runWith([{ level: 20 }, {}]), 'w1', 'destroy');
    const r = enhance({ ...withPerks({ g_feather: 1 }, off), rng: off.rng }, 'w1');
    expect(r.ok && r.result.weaponAfter?.level).toBe(10);
  });

  it('피의 거래 takes stamina; 꺼지지 않는 화로 refills it once a day', () => {
    expect(staminaMax(withPerks({ g_blood: 1 }))).toBe(75);
    let s = withPerks({ r_furnace: 1 });
    s = strike(s, new Rng(1)).state;
    const d = drainStamina(s, 1000);
    expect(d.state.daily?.staminaUsed).toBe(0);
    const again = drainStamina(d.state, 1000);
    expect(again.state.daily?.staminaUsed).toBe(staminaMax(s));
  });

  it('새벽 기상: the first seconds of the day do not drain', () => {
    let s = withPerks({ b_dawn: 1 }); // Lv 1: two seconds
    s = strike(s, new Rng(1)).state;
    const a = drainStamina(s, 2);
    expect(a.state.daily?.staminaUsed ?? 0).toBe(0);
    const b = drainStamina(a.state, 2);
    expect(b.state.daily?.staminaUsed).toBeGreaterThan(0);
  });

  it('perks belong to the run: unpaid rent ends it and the new run starts with none', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const core = new GameCore(storage, 1);
    core.state = { ...core.state, perks: { b_grip: 3, r_bless: 1 }, gold: 0, rentDueDay: core.state.day + 1 };
    const r = core.dispatch({ type: 'SLEEP' });
    expect(r.type === 'slept' && r.gameOver).toBeTruthy();
    expect(core.state.perks ?? {}).toEqual({});
    core.state = { ...core.state, perks: { b_grip: 1 } };
    core.dispatch({ type: 'NEW_RUN' });
    expect(core.state.perks ?? {}).toEqual({});
  });

  it('cards: 운명 읽기 gives a second game, 카드 감각 pays part of a loss back', () => {
    const s: GameState = { ...withPerks({ s_fate: 1, b_cards: 3 }), day: 12, gold: 1000 };
    const a = playCard(s, 0, 100);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    if (!a.win) expect(a.state.gold).toBe(1000 - 100 + 60);
    const b = playCard(a.state, 0, 10);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(playCard(b.state, 0, 10)).toEqual({ ok: false, reason: 'played' });
  });
});
