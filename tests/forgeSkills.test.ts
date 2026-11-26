// The star-disc skill tree (2026-11-26: five sectors of small +5% / +0.5%p stars and big special stars),
// the rules it drives, stamina, plus unpaid rent ending the run.
import { describe, expect, it } from 'vitest';
import { ENHANCE_TABLE, OUTCOMES, type EnhanceRow, type Outcome } from '../src/config/enhancement';
import { DIVINE_STEP, legacyRefund } from '../src/config/forgeSkills';
import { BASE_SPEED, LEGACY_TREE_COSTS, STAMINA, TREE, TREE_BY_ID, starCost } from '../src/config/skillTree';
import { DAILY_WEAPON_LIMIT, RENT } from '../src/config/economy';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager, migrate } from '../src/core/save/save';
import { Rng } from '../src/core/rng';
import type { GameState, Weapon } from '../src/core/state/types';
import { beginSplit, chooseSplit, collectEnhanceMods, effectiveRow, enhance } from '../src/core/systems/enhancement';
import { fateSplitLeft, greatConversionChance, phoenixLeft, phoenixLevel, rollCandidate, staminaLeft, staminaMax, strikeCost, strikesLeft } from '../src/core/systems/forgeSkills';
import { buyNode, checkBuyNode, nodeVisible, treeEffects } from '../src/core/systems/skillTree';
import { enhanceCost, enhanceCostFor, sellPrice } from '../src/core/systems/economy';
import { collectRent, rentAmount, rentFor } from '../src/core/systems/rent';
import { dailyWeaponLimit } from '../src/core/systems/weapons';
import { STATE_VERSION } from '../src/core/state/initial';
import { runWith } from './helpers';

/** A state owning the given nodes, one weapon w1 and a spare. */
function withNodes(nodes: string[], w1: Partial<Weapon> = {}): GameState {
  const s = runWith([{ level: 10, ...w1 }, {}]);
  return { ...s, gold: 1_000_000, treeNodes: nodes };
}

/** A fresh morning: today's counters (stamina included) start over. */
const rested = (s: GameState): GameState => ({ ...s, daily: undefined });

/** A row that always gives `o`. */
const only = (o: Outcome): EnhanceRow => ({ great: 0, success: 0, keep: 0, down: 0, destroy: 0, [o]: 100 }) as EnhanceRow;

/** An RNG seed whose 2nd and 3rd numbers satisfy a test. */
function seedWhere(test: (divine: number, great: number, fourth: number) => boolean): number {
  for (let s = 1; s < 200_000; s++) {
    const r = new Rng(s);
    r.next();
    const d = r.next() * 100;
    const g = r.next() * 100;
    const f = r.next() * 100;
    if (test(d, g, f)) return s;
  }
  throw new Error('no seed');
}

/** Every node from the anvil out to `id`. */
function pathTo(id: string): string[] {
  const out: string[] = [];
  for (let n = TREE_BY_ID[id]; n && n.id !== 'root'; n = TREE_BY_ID[n.from!]) out.unshift(n.id);
  return out;
}

/** Every node of a sector. */
const sectorNodes = (dir: string) => TREE.filter((n) => n.dir === dir).map((n) => n.id);

describe('star disc shape', () => {
  it('base rows still sum to 100% and destroy never falls with level', () => {
    for (const row of ENHANCE_TABLE) expect(OUTCOMES.reduce((a, o) => a + row[o], 0)).toBeCloseTo(100, 6);
    for (let i = 1; i < ENHANCE_TABLE.length; i++) expect(ENHANCE_TABLE[i].destroy).toBeGreaterThanOrEqual(ENHANCE_TABLE[i - 1].destroy);
  });

  it('five sectors, many small stars, every star reachable from the anvil', () => {
    const dirs = new Set(TREE.filter((n) => n.id !== 'root').map((n) => n.dir));
    expect([...dirs].sort()).toEqual(['gold', 'insure', 'odds', 'speed', 'stamina']);
    expect(TREE.length).toBeGreaterThan(90);
    expect(TREE.filter((n) => n.id !== 'root' && !n.major).length).toBeGreaterThan(TREE.filter((n) => n.major).length * 2);
    for (const n of TREE) if (n.from) expect(TREE_BY_ID[n.from], n.id).toBeDefined();
    for (const n of TREE) if (n.id !== 'root') expect(TREE_BY_ID[pathTo(n.id)[0]].from).toBe('root');
    expect(new Set(TREE.map((n) => n.id)).size).toBe(TREE.length);
  });

  it('no two stars overlap on the disc', () => {
    for (let i = 0; i < TREE.length; i++)
      for (let j = i + 1; j < TREE.length; j++) {
        const [a, b] = [TREE[i], TREE[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(44);
      }
  });

  it('stars cost more further out, big stars three small ones, and far more than the old tree', () => {
    expect(starCost(2, false)).toBeGreaterThan(starCost(1, false));
    expect(starCost(5, true) / starCost(5, false)).toBeGreaterThan(2.8);
    expect(starCost(5, true) / starCost(5, false)).toBeLessThan(3.2);
    for (const n of TREE) if (n.id !== 'root') expect(n.cost).toBe(starCost(n.ring, n.major));
    const total = TREE.reduce((a, n) => a + n.cost, 0);
    const oldTotal = Object.values(LEGACY_TREE_COSTS).reduce((a, v) => a + v, 0);
    expect(total).toBeGreaterThan(oldTotal * 5);
  });

  it('buyable stars are the ones next to an owned star', () => {
    const s = withNodes([]);
    const visible = TREE.filter((n) => nodeVisible(s, n)).map((n) => n.id).sort();
    expect(visible).toEqual(['gd1', 'in1', 'od1', 'root', 'sp1', 'st1']);
  });

  it('a star is bought once, only after the one it grows from, with gold', () => {
    const s = { ...withNodes([]), gold: 200 };
    expect(checkBuyNode(s, 'od2')).toBe('locked');
    const a = buyNode(s, 'od1');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.gold).toBe(200 - TREE_BY_ID.od1.cost);
    expect(checkBuyNode(a.state, 'od1')).toBe('owned');
    expect(checkBuyNode(a.state, 'od2')).toBe('gold');
    expect(checkBuyNode({ ...a.state, phase: 'night' }, 'sp1')).toBe('night');
  });

  it('BUY_NODE through the core is saved', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 3);
    core.state = { ...core.state, gold: 500 };
    expect(core.dispatch({ type: 'BUY_NODE', id: 'gd1' }).type).toBe('nodeBought');
    expect(new SaveManager(storage).loadRun().state!.treeNodes).toEqual(['gd1']);
  });
});

describe('✦ odds', () => {
  it('small stars shift the row by 0.5%p each', () => {
    const s = withNodes(pathTo('od5')); // od1 success, od2 destroy, od3 success, od5 success
    const w = s.weapons[0];
    const base = effectiveRow(w.level);
    const row = effectiveRow(w.level, collectEnhanceMods(s, w));
    expect(row.success).toBeCloseTo(base.success + 1.5, 6);
    expect(row.destroy).toBeCloseTo(base.destroy - 0.5, 1);
  });

  it('the whole sector adds up to +4%p success, −3%p destroy, +2%p great', () => {
    const e = treeEffects(withNodes(sectorNodes('odds')));
    expect(e.success).toBeCloseTo(4, 6);
    expect(e.destroy).toBeCloseTo(3, 6);
    expect(e.great).toBeCloseTo(2, 6);
  });

  it('기적의 불꽃 + 과열 단조 make one conversion roll', () => {
    const s = withNodes([...pathTo('overheat'), 'miracle', ...pathTo('miracle')]);
    const hot = { ...s.weapons[0], streak: 2 };
    const chance = greatConversionChance(s, hot);
    expect(chance).toBe(8 + 2 * 3);
    expect(greatConversionChance(s, { ...hot, streak: 99 })).toBe(8 + 15);
    const yes = rollCandidate(s, hot, only('success'), new Rng(seedWhere((d, g) => d >= 50 && g < chance)));
    expect(yes).toMatchObject({ outcome: 'great', miracle: true, level: hot.level + 2 });
  });

  it('신의 망치 turns a success into +5', () => {
    const s = withNodes(pathTo('divine'));
    const w = s.weapons[0];
    const c = rollCandidate(s, w, only('success'), new Rng(seedWhere((d) => d < 2)));
    expect(c).toMatchObject({ divine: true, level: w.level + DIVINE_STEP });
  });

  it('굳은 쇠 turns some drops into keep (and only with the star)', () => {
    const w = withNodes([]).weapons[0];
    const seed = seedWhere((_d, _g, f) => f < 30);
    expect(rollCandidate(withNodes([]), w, only('down'), new Rng(seed)).outcome).toBe('down');
    expect(rollCandidate(withNodes(pathTo('harden')), w, only('down'), new Rng(seed)).outcome).toBe('keep');
  });
});

describe('⚡ speed', () => {
  it('starts 50% slower; every small star adds 5%; prepaid rent adds more', () => {
    expect(BASE_SPEED).toBe(0.5);
    expect(treeEffects(withNodes([])).speed).toBe(0.5);
    expect(treeEffects(withNodes(['sp1'])).speed).toBeCloseTo(0.55, 6);
    expect(treeEffects(withNodes(pathTo('sp5'))).speed).toBeCloseTo(0.5 + 4 * 0.05, 6);
    expect(treeEffects({ ...withNodes([]), rentPrepaid: true }).speed).toBeCloseTo(0.75, 6);
    expect(treeEffects(withNodes(pathTo('hold'))).holdRepeat).toBe(true);
    expect(treeEffects(withNodes(sectorNodes('speed'))).speed).toBeCloseTo(0.5 + 15 * 0.05, 6);
  });

  it('리듬 adds success only when the attempt is quick', () => {
    const s = withNodes(pathTo('rhythm'));
    const w = s.weapons[0];
    expect(collectEnhanceMods(s, w, true).success).toBe(2);
    expect(collectEnhanceMods(s, w, false).success ?? 0).toBe(0);
  });

  it('몰아치기: the third success in a row makes the next attempt free', () => {
    let s = withNodes(pathTo('combo'), { level: 3, streak: 2 });
    s = { ...s, rng: seedWhere(() => true) };
    const r = enhance(s, s.weapons[0].id, { force: 'success' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.nextFree).toBe(true);
    expect(enhanceCostFor(r.state, r.state.weapons[0].level)).toBe(0);
    const again = enhance(r.state, r.state.weapons[0].id, { force: 'keep' });
    expect(again.ok && again.state.gold).toBe(r.state.gold);
    expect(again.ok && again.state.freeEnhance).toBe(false);
  });

  it('두 번 내려치기 keeps the better of two rolls', () => {
    const s = withNodes(pathTo('double'));
    let doubled = 0;
    let state = { ...s, rng: 12345 };
    for (let i = 0; i < 200; i++) {
      const r = enhance(rested({ ...state, weapons: s.weapons }), s.weapons[0].id);
      if (!r.ok) break;
      if (r.result.doubled) doubled++;
      state = r.state;
    }
    expect(doubled).toBeGreaterThan(20);
  });
});

describe('♥ stamina (2026-11-26)', () => {
  it('every strike takes 20%: five strikes on a fresh morning, then blocked', () => {
    let s = withNodes([]);
    expect(staminaMax(s)).toBe(100);
    expect(strikeCost(s)).toBe(20);
    expect(strikesLeft(s)).toBe(5);
    for (let i = 0; i < 5; i++) {
      const r = enhance(s, s.weapons[0].id);
      expect(r.ok, `strike ${i + 1}`).toBe(true);
      if (!r.ok) return;
      expect(r.result.staminaCost).toBe(20);
      s = r.result.weaponAfter ? r.state : { ...r.state, weapons: withNodes([]).weapons };
    }
    expect(staminaLeft(s)).toBe(0);
    const blocked = enhance(s, s.weapons[0].id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blocked).toBe('stamina');
  });

  it('refills the next morning', () => {
    const core = new GameCore(new MemoryStorage(), 4);
    core.state = { ...core.state, daily: { day: core.state.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: 100 } };
    expect(staminaLeft(core.state)).toBe(0);
    core.dispatch({ type: 'SLEEP' });
    expect(staminaLeft(core.state)).toBe(staminaMax(core.state));
  });

  it('체력 stars: max stamina up to 1000, cheaper strikes, +2% free strikes each, a second wind', () => {
    const all = withNodes(sectorNodes('stamina'));
    const e = treeEffects(all);
    expect(staminaMax(all)).toBe(1000);
    expect(strikeCost(all)).toBe(STAMINA.strikeCost - 5 - 3);
    // every free-strike source gives 2% (user 2026-11-26)
    expect(e.staminaSave).toBe(4 * 2);
    expect(e.secondWind).toBe(30);
    expect(strikesLeft(all)).toBe(Math.floor(1000 / 12));
  });

  it('두 번째 바람 gives 30% of the maximum back once a day when stamina runs out', () => {
    let s = withNodes(pathTo('wind'));
    const cost = strikeCost(s);
    const max = staminaMax(s);
    s = { ...s, daily: { day: s.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: max - cost } };
    const r = enhance(s, s.weapons[0].id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.secondWind).toBe(Math.round(max * 0.3));
    expect(staminaLeft(r.state)).toBe(Math.round(max * 0.3));
    // only once a day
    const used = { ...r.state, daily: { ...r.state.daily!, staminaUsed: max - cost } };
    const r2 = enhance(used, used.weapons[0].id);
    expect(r2.ok && r2.result.secondWind).toBe(0);
  });

  it('the scripted prologue strikes cost nothing', () => {
    const s = withNodes([]);
    const r = enhance(s, s.weapons[0].id, { force: 'keep' });
    expect(r.ok && staminaLeft(r.state)).toBe(100);
  });
});

describe('◆ gold', () => {
  it('sale bonus and cost cuts in 5% steps', () => {
    const s = withNodes(pathTo('gd3')); // sell +5, cost −5, sell +5
    expect(sellPrice(s, 10)).toBeGreaterThan(sellPrice(withNodes([]), 10));
    expect(treeEffects(s).sell).toBeCloseTo(0.1, 6);
    expect(enhanceCostFor(s, 10)).toBe(Math.max(1, Math.round(enhanceCost(10) * 0.95)));
    expect(sellPrice(s, 0)).toBe(0);
  });

  it('추가 배달 / 큰 배달 raise the daily weapon limit', () => {
    expect(dailyWeaponLimit(withNodes([]))).toBe(DAILY_WEAPON_LIMIT);
    expect(dailyWeaponLimit(withNodes(pathTo('delivery')))).toBe(DAILY_WEAPON_LIMIT + 1);
    expect(dailyWeaponLimit(withNodes([...pathTo('bigDelivery'), ...pathTo('delivery')]))).toBe(DAILY_WEAPON_LIMIT + 3);
  });

  it('rent stars cut the rent 5% each', () => {
    expect(rentFor(withNodes(pathTo('gd10')), 10)).toBe(Math.round((rentAmount(10) * 0.85) / 10) * 10);
  });
});

describe('✚ insurance', () => {
  it('불사조 brings a destroyed weapon back at half, −2, then the full level', () => {
    expect(phoenixLevel(withNodes(pathTo('phoenix')), 15)).toBe(7);
    expect(phoenixLevel(withNodes(pathTo('wings')), 15)).toBe(13);
    expect(phoenixLevel(withNodes(pathTo('immortal')), 15)).toBe(15);
    expect(phoenixLeft(withNodes(pathTo('immortal')))).toBe(3);
    const s = withNodes(pathTo('phoenix'), { level: 12 });
    const r = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok && r.result.phoenix).toBe(6);
  });

  it('파편 줍기 pays 5% of a destroyed weapon back per star', () => {
    const s = withNodes(['in1'], { level: 12 });
    const r = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const refund = Math.round(sellPrice(s, 12) * 0.05);
    expect(r.result.refund).toBe(refund);
    expect(r.state.gold).toBe(s.gold - enhanceCostFor(s, 12) + refund);
  });

  it('운명 분열 gives two candidates, costs one strike, and the pick is applied once', () => {
    const s = { ...withNodes(pathTo('split')), splitArmed: true };
    expect(fateSplitLeft(s)).toBe(2);
    const b = beginSplit(s, s.weapons[0].id);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(fateSplitLeft(b.state)).toBe(1);
    expect(staminaLeft(b.state)).toBe(100 - 20);
    const c = chooseSplit(b.state, 0);
    expect(c.ok).toBe(true);
    expect(c.ok && staminaLeft(c.state)).toBe(80);
  });

  it('아침 보호석 gives a stone every new morning', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 5);
    core.state = { ...core.state, treeNodes: pathTo('stones'), items: {} };
    core.dispatch({ type: 'SLEEP' });
    expect(core.state.items.protect).toBe(1);
  });
});

describe('rent (2026-11-20): unpaid rent ends the run', () => {
  const due = (s: GameState): GameState => ({ ...s, rentDueDay: s.day });

  it('the king comes every 7 days (2026-11-26)', () => {
    const s0 = withNodes([]);
    expect(RENT.firstAfter).toBe(7);
    let s = due({ ...s0, gold: 10_000_000 });
    for (let i = 0; i < 3; i++) {
      const r = collectRent(s);
      expect(r.state.rentDueDay).toBe(s.day + 7);
      s = due({ ...r.state, day: r.state.rentDueDay! });
    }
  });

  it('paid when there is enough gold', () => {
    const s = due({ ...withNodes([]), gold: 100_000 });
    const r = collectRent(s);
    expect(r.notice!.paid).toBe(rentFor(s, s.day));
    expect(r.state.lives).toBe(s.lives);
  });

  it('short of gold: lives drop to 0 (game over), nothing taken', () => {
    const s = due({ ...withNodes([]), gold: 1 });
    const r = collectRent(s);
    expect(r.notice!.lifeLost).toBe(true);
    expect(r.state.lives).toBe(0);
  });

  it('왕의 자비 lets it go once per run', () => {
    const s = due({ ...withNodes(pathTo('mercy')), gold: 1 });
    const r1 = collectRent(s);
    expect(r1.notice!.mercy).toBe(true);
    expect(r1.state.lives).toBe(s.lives);
    const r2 = collectRent(due(r1.state));
    expect(r2.state.lives).toBe(0);
  });

  it('the core starts a new run when the rent cannot be paid', () => {
    const core = new GameCore(new MemoryStorage(), 9);
    core.state = { ...core.state, gold: 0, rentDueDay: core.state.day + 1 };
    const r = core.dispatch({ type: 'SLEEP' });
    expect(r.type === 'slept' && r.gameOver).toBeTruthy();
    expect(core.state.day).toBe(1);
    expect(core.lastRentNotice).toBeNull();
    void RENT;
  });
});

describe('legacy skills are refunded', () => {
  it('gold spent on the old chain comes back and the levels are dropped', () => {
    const s = { ...withNodes([]), gold: 10, forgeSkills: { miracle: 2, phoenix: 1 } } as GameState;
    const m = migrate(s, STATE_VERSION)!;
    expect(m.gold).toBe(10 + 300 + 900 + 1_500);
    expect(m.forgeSkills).toBeUndefined();
    expect(legacyRefund({ divine: 5 })).toBe(5_000 + 15_000 + 40_000 + 110_000 + 300_000);
  });

  it('nodes of the old 4-direction tree are dropped and their gold comes back (2026-11-26)', () => {
    const s = { ...withNodes(['o1', 'o2', 's1', 'i2s', 'gd1']), gold: 10 } as GameState;
    const m = migrate(s, STATE_VERSION)!;
    expect(m.gold).toBe(10 + 60 + 200 + 60 + 320);
    expect(m.treeNodes).toEqual(['gd1']);
  });
});
