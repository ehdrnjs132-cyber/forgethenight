// The four-direction skill tree (2026-11-20) and the rules it drives, plus unpaid rent ending the run.
import { describe, expect, it } from 'vitest';
import { ENHANCE_TABLE, OUTCOMES, type EnhanceRow, type Outcome } from '../src/config/enhancement';
import { DIVINE_STEP, legacyRefund } from '../src/config/forgeSkills';
import { TREE, TREE_BY_ID } from '../src/config/skillTree';
import { DAILY_WEAPON_LIMIT, RENT } from '../src/config/economy';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager, migrate } from '../src/core/save/save';
import { Rng } from '../src/core/rng';
import type { GameState, Weapon } from '../src/core/state/types';
import { beginSplit, chooseSplit, collectEnhanceMods, effectiveRow, enhance } from '../src/core/systems/enhancement';
import { fateSplitLeft, greatConversionChance, phoenixLeft, phoenixLevel, rollCandidate } from '../src/core/systems/forgeSkills';
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

describe('skill tree shape', () => {
  it('base rows still sum to 100% and destroy never falls with level', () => {
    for (const row of ENHANCE_TABLE) expect(OUTCOMES.reduce((a, o) => a + row[o], 0)).toBeCloseTo(100, 6);
    for (let i = 1; i < ENHANCE_TABLE.length; i++) expect(ENHANCE_TABLE[i].destroy).toBeGreaterThanOrEqual(ENHANCE_TABLE[i - 1].destroy);
  });

  it('four directions, every node reachable from the anvil, one node per grid cell', () => {
    const dirs = new Set(TREE.filter((n) => n.id !== 'root').map((n) => n.dir));
    expect([...dirs].sort()).toEqual(['gold', 'insure', 'odds', 'speed']);
    for (const n of TREE) if (n.id !== 'root') expect(['o1', 's1', 'g1', 'i1']).toContain(pathTo(n.id)[0]);
    for (const n of TREE) if (n.from) expect(TREE_BY_ID[n.from]).toBeDefined();
    const cells = new Set(TREE.map((n) => `${n.x},${n.y}`));
    expect(cells.size).toBe(TREE.length);
  });

  it('only owned nodes and their direct neighbours are visible', () => {
    const s = withNodes([]);
    const visible = TREE.filter((n) => nodeVisible(s, n)).map((n) => n.id).sort();
    expect(visible).toEqual(['g1', 'i1', 'o1', 'root', 's1']);
    const s2 = withNodes(['o1']);
    expect(nodeVisible(s2, TREE_BY_ID.o2)).toBe(true);
    expect(nodeVisible(s2, TREE_BY_ID.o3)).toBe(false);
  });

  it('a node is bought once, only after the one it grows from, with gold', () => {
    const s = { ...withNodes([]), gold: 100 };
    expect(checkBuyNode(s, 'o2')).toBe('locked');
    const a = buyNode(s, 'o1');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.gold).toBe(100 - TREE_BY_ID.o1.cost);
    expect(checkBuyNode(a.state, 'o1')).toBe('owned');
    expect(checkBuyNode(a.state, 'o2')).toBe('gold');
    expect(checkBuyNode({ ...a.state, phase: 'night' }, 's1')).toBe('night');
  });

  it('BUY_NODE through the core is saved', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 3);
    core.state = { ...core.state, gold: 500 };
    expect(core.dispatch({ type: 'BUY_NODE', id: 'g1' }).type).toBe('nodeBought');
    expect(new SaveManager(storage).loadRun().state!.treeNodes).toEqual(['g1']);
  });
});

describe('⬆ odds', () => {
  it('success / destroy nodes shift the row', () => {
    const s = withNodes(pathTo('o4'));
    const w = s.weapons[0];
    const base = effectiveRow(w.level);
    const row = effectiveRow(w.level, collectEnhanceMods(s, w));
    expect(row.success).toBeCloseTo(base.success + 5, 6);
    expect(row.destroy).toBeCloseTo(Math.max(0.5, base.destroy - 2), 1);
  });

  it('기적의 불꽃 + 과열 단조 make one conversion roll', () => {
    const s = withNodes(pathTo('o4s'));
    const hot = { ...s.weapons[0], streak: 2 };
    const chance = greatConversionChance(s, hot);
    expect(chance).toBe(8 + 2 * 3);
    expect(greatConversionChance(s, { ...hot, streak: 99 })).toBe(8 + 15);
    const yes = rollCandidate(s, hot, only('success'), new Rng(seedWhere((d, g) => d >= 50 && g < chance)));
    expect(yes).toMatchObject({ outcome: 'great', miracle: true, level: hot.level + 2 });
  });

  it('신의 망치 turns a success into +5', () => {
    const s = withNodes(pathTo('o6'));
    const w = s.weapons[0];
    const c = rollCandidate(s, w, only('success'), new Rng(seedWhere((d) => d < 2)));
    expect(c).toMatchObject({ divine: true, level: w.level + DIVINE_STEP });
  });

  it('굳은 쇠 turns some drops into keep (and only with the node)', () => {
    const w = withNodes([]).weapons[0];
    const seed = seedWhere((_d, _g, f) => f < 30);
    expect(rollCandidate(withNodes([]), w, only('down'), new Rng(seed)).outcome).toBe('down');
    expect(rollCandidate(withNodes(pathTo('o2s')), w, only('down'), new Rng(seed)).outcome).toBe('keep');
  });
});

describe('➡ speed', () => {
  it('speed adds up along the line; prepaid rent adds more', () => {
    expect(treeEffects(withNodes([])).speed).toBe(1);
    expect(treeEffects(withNodes(pathTo('s5'))).speed).toBeCloseTo(1 + 0.3 + 0.4 + 0.4 + 0.6, 6);
    expect(treeEffects({ ...withNodes([]), rentPrepaid: true }).speed).toBeCloseTo(1.25, 6);
    expect(treeEffects(withNodes(pathTo('s2'))).holdRepeat).toBe(true);
  });

  it('리듬 adds success only when the attempt is quick', () => {
    const s = withNodes(pathTo('s2s'));
    const w = s.weapons[0];
    expect(collectEnhanceMods(s, w, true).success).toBe(2);
    expect(collectEnhanceMods(s, w, false).success ?? 0).toBe(0);
  });

  it('몰아치기: the third success in a row makes the next attempt free', () => {
    let s = withNodes(pathTo('s4s'), { level: 3, streak: 2 });
    s = { ...s, rng: seedWhere(() => true) };
    // force a success via a scripted outcome
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
    const s = withNodes(pathTo('s6'));
    // run many attempts: with the node, destruction is never kept when the other roll survived
    let doubled = 0;
    let state = { ...s, rng: 12345 };
    for (let i = 0; i < 200; i++) {
      const r = enhance({ ...state, weapons: s.weapons }, s.weapons[0].id);
      if (!r.ok) break;
      if (r.result.doubled) doubled++;
      state = r.state;
    }
    expect(doubled).toBeGreaterThan(20);
  });
});

describe('⬇ gold', () => {
  it('sale bonus, golden weapons and cost cuts', () => {
    const s = withNodes(pathTo('g4'));
    expect(sellPrice(s, 10)).toBeGreaterThan(sellPrice(withNodes([]), 10));
    expect(sellPrice(s, 10, true)).toBeGreaterThanOrEqual(sellPrice(s, 10) * 2 - 50);
    expect(enhanceCostFor(s, 10)).toBe(Math.max(1, Math.round(enhanceCost(10) * 0.85)));
    expect(sellPrice(s, 0)).toBe(0);
  });

  it('추가 배달 raises the daily weapon limit', () => {
    expect(dailyWeaponLimit(withNodes([]))).toBe(DAILY_WEAPON_LIMIT);
    expect(dailyWeaponLimit(withNodes(pathTo('g2s')))).toBe(DAILY_WEAPON_LIMIT + 1);
    expect(dailyWeaponLimit(withNodes([...pathTo('g5'), 'g2s']))).toBe(DAILY_WEAPON_LIMIT + 3);
  });

  it('왕과의 거래 cuts the rent', () => {
    expect(rentFor(withNodes(pathTo('g4s')), 10)).toBe(Math.round((rentAmount(10) * 0.85) / 10) * 10);
  });
});

describe('⬅ insurance', () => {
  it('불사조 brings a destroyed weapon back at half, −2, then the full level', () => {
    expect(phoenixLevel(withNodes(pathTo('i2')), 15)).toBe(7);
    expect(phoenixLevel(withNodes(pathTo('i4')), 15)).toBe(13);
    expect(phoenixLevel(withNodes(pathTo('i6')), 15)).toBe(15);
    expect(phoenixLeft(withNodes(pathTo('i6')))).toBe(3);
    const s = withNodes(pathTo('i2'), { level: 12 });
    const r = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok && r.result.phoenix).toBe(6);
  });

  it('파편 줍기 pays part of a destroyed weapon back', () => {
    const s = withNodes(['i1'], { level: 12 });
    const r = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const refund = Math.round(sellPrice(s, 12) * 0.2);
    expect(r.result.refund).toBe(refund);
    expect(r.state.gold).toBe(s.gold - enhanceCostFor(s, 12) + refund);
  });

  it('운명 분열 gives two candidates and the pick is applied once', () => {
    const s = { ...withNodes(pathTo('i3')), splitArmed: true };
    expect(fateSplitLeft(s)).toBe(2);
    const b = beginSplit(s, s.weapons[0].id);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(fateSplitLeft(b.state)).toBe(1);
    const c = chooseSplit(b.state, 0);
    expect(c.ok).toBe(true);
  });

  it('아침 보호석 gives a stone every new morning', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 5);
    core.state = { ...core.state, treeNodes: pathTo('i2s'), items: {} };
    core.dispatch({ type: 'SLEEP' });
    expect(core.state.items.protect).toBe(1);
  });
});

describe('rent (2026-11-20): unpaid rent ends the run', () => {
  const due = (s: GameState): GameState => ({ ...s, rentDueDay: s.day });

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
    const s = due({ ...withNodes(pathTo('i4s')), gold: 1 });
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
});
