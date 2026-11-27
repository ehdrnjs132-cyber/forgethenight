// The star-disc skill tree (2026-11-26: five sectors of small +5% / +0.5%p stars and big special stars),
// the rules it drives, stamina, plus unpaid rent ending the run.
import { describe, expect, it } from 'vitest';
import { ENHANCE_TABLE, OUTCOMES, type EnhanceRow, type Outcome } from '../src/config/enhancement';
import { DIVINE_STEP, legacyRefund } from '../src/config/forgeSkills';
import { BASE_SPEED, FINAL_STARS, REFUND_CAP, STAMINA, TREE, TREE_BY_ID, starPrice } from '../src/config/skillTree';
import { DAILY_WEAPON_LIMIT, RENT } from '../src/config/economy';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager, migrate } from '../src/core/save/save';
import { Rng } from '../src/core/rng';
import type { GameState, Weapon } from '../src/core/state/types';
import { beginSplit, chooseSplit, collectEnhanceMods, effectiveRow, enhance } from '../src/core/systems/enhancement';
import {
  drainRate,
  drainStamina,
  fateSplitLeft,
  greatConversionChance,
  phoenixLeft,
  phoenixLevel,
  rollCandidate,
  staminaLeft,
  staminaMax,
  staminaStarted,
  strike,
  workSecondsLeft,
} from '../src/core/systems/forgeSkills';
import { buyNode, checkBuyNode, nodeVisible, treeEffects } from '../src/core/systems/skillTree';
import { nodeCost } from '../src/core/systems/skillTree';
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

/** An RNG seed whose first number (×100) satisfies a test. */
function seedWhereFirst(test: (x: number) => boolean): number {
  for (let s = 1; s < 200_000; s++) if (test(new Rng(s).next() * 100)) return s;
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

  it('no two stars touch on the disc (radius 40 anvil · 24 big · 13 small, 6 px apart at least)', () => {
    const rad = (n: (typeof TREE)[number]) => (n.id === 'root' ? 40 : n.major ? 24 : 13);
    for (let i = 0; i < TREE.length; i++)
      for (let j = i + 1; j < TREE.length; j++) {
        const [a, b] = [TREE[i], TREE[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(rad(a) + rad(b) + 6);
      }
  });

  it('three times the stars of the 2026-11-26 disc: two new stars on every link, named mid-tier stars, the same finals (2026-11-27)', () => {
    // 2026-11-27: doubled, then 1.5× again ("스킬들 1.5배 많이"): 108 → 216 → 324 stars around the anvil
    expect(TREE.length).toBe(3 * 108 + 1);
    for (const n of TREE) {
      if (n.id === 'root' || TREE_BY_ID[n.id.slice(0, -1)]) continue;
      expect(TREE_BY_ID[`${n.id}m`]?.from, n.id).toBe(`${n.id}n`);
      expect(n.from).toBe(`${n.id}m`);
    }
    expect(TREE.filter((n) => n.major && n.id.endsWith('m') && TREE_BY_ID[n.id.slice(0, -1)]).length).toBeGreaterThanOrEqual(15);
    // the finals are still the end of their lines
    for (const id of FINAL_STARS) expect(TREE.some((n) => n.from === id), id).toBe(false);
  });

  it('each line gets dearer as it is learned: 20, 50, 100, 200, 400, 600, 1000, then on up (user 2026-11-27)', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => starPrice(n))).toEqual([20, 50, 100, 200, 400, 600, 1000]);
    for (let n = 1; n < 80; n++) expect(starPrice(n + 1)).toBeGreaterThan(starPrice(n));
    // big stars twice, a sector's final star three times (×2 again for being big)
    expect(Math.abs(starPrice(10, true) / starPrice(10) - 2)).toBeLessThan(0.1); // rounded to 100s
    expect(starPrice(30, true, true)).toBeGreaterThan(starPrice(30, true) * 2.9);
    // the price follows the count of the star's own line: three odds stars make odds dearer, not speed
    const three = withNodes(['od1n', 'od1m', 'od1']);
    expect(nodeCost(three, 'od2n')).toBe(200);
    expect(nodeCost(three, 'sp1n')).toBe(20);
  });

  it('buyable stars are the ones next to an owned star', () => {
    const s = withNodes([]);
    const visible = TREE.filter((n) => nodeVisible(s, n)).map((n) => n.id).sort();
    expect(visible).toEqual(['gd1n', 'in1n', 'od1n', 'root', 'sp1n', 'st1n']);
  });

  it('a star is bought once, only after the one it grows from, with gold', () => {
    const s = { ...withNodes([]), gold: 200 };
    expect(checkBuyNode(s, 'od1m')).toBe('locked'); // grows from od1n now
    const a = buyNode(s, 'od1n');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.gold).toBe(180); // the first star of a line costs 20
    expect(checkBuyNode(a.state, 'od1n')).toBe('owned');
    expect(checkBuyNode({ ...a.state, gold: 0 }, 'od1m')).toBe('gold');
    expect(checkBuyNode({ ...a.state, phase: 'night' }, 'sp1')).toBe('night');
  });

  it('stars are learned only after sunset: from the forge the tree is view-only (user 2026-11-27)', () => {
    const s = { ...withNodes([]), gold: 10_000 };
    expect(checkBuyNode(s, 'od1n', false)).toBe('day');
    expect(buyNode(s, 'od1n', false)).toEqual({ ok: false, reason: 'day' });
    expect(checkBuyNode(s, 'od1n', true)).toBeNull();
    const core = new GameCore(new MemoryStorage(), 3);
    core.state = { ...core.state, gold: 500 };
    expect(core.dispatch({ type: 'BUY_NODE', id: 'gd1n' })).toEqual({ type: 'nodeBlocked', reason: 'day' });
    expect(core.state.gold).toBe(500);
  });

  it('BUY_NODE from the evening screen is saved', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 3);
    core.state = { ...core.state, gold: 500 };
    expect(core.dispatch({ type: 'BUY_NODE', id: 'gd1n', evening: true }).type).toBe('nodeBought');
    expect(new SaveManager(storage).loadRun().state!.treeNodes).toEqual(['gd1n']);
  });
});

describe('✦ odds', () => {
  it('small stars shift the row by 0.5%p, the new ones between them by 0.25%p, notables by 1.5%p', () => {
    // twelve stars to od5: success 0.25 + 0.5 + 0.25 + 0.5 + 1.5 (정밀한 손) + 0.5, destroy 0.25 + 0.5 + 0.25
    const s = withNodes(pathTo('od5'));
    const w = s.weapons[0];
    const base = effectiveRow(w.level);
    const row = effectiveRow(w.level, collectEnhanceMods(s, w));
    expect(row.success).toBeCloseTo(base.success + 3.5, 6);
    expect(row.destroy).toBeCloseTo(base.destroy - 1, 1);
  });

  it('the whole sector adds up to +14%p success, −11%p destroy, +8.75%p great (대장장이 신의 손 included)', () => {
    const e = treeEffects(withNodes(sectorNodes('odds')));
    expect(e.success).toBeCloseTo(14, 6);
    expect(e.destroy).toBeCloseTo(11, 6);
    expect(e.great).toBeCloseTo(8.75, 6);
    const hand = treeEffects(withNodes(['divine']));
    expect(hand).toMatchObject({ success: 5, great: 2, destroy: 3, godHammerCap: 1 });
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

  it('the 신의 망치 star no longer fires on its own (2026-11-27: the hammer is a chosen one-shot); it holds a second charge', () => {
    const s = withNodes(pathTo('divine'));
    const w = s.weapons[0];
    const c = rollCandidate(s, w, only('success'), new Rng(seedWhere((d) => d < 2)));
    expect(c.divine).toBe(false);
    expect(c.level).toBe(w.level + 1);
    expect(treeEffects(s).godHammerCap).toBe(1);
    expect(DIVINE_STEP).toBe(5);
  });

  it('굳은 쇠 turns some drops into keep (and only with the star)', () => {
    const w = withNodes([]).weapons[0];
    const seed = seedWhere((_d, _g, f) => f < 30);
    expect(rollCandidate(withNodes([]), w, only('down'), new Rng(seed)).outcome).toBe('down');
    expect(rollCandidate(withNodes(pathTo('harden')), w, only('down'), new Rng(seed)).outcome).toBe('keep');
  });
});

describe('⚡ speed', () => {
  it('starts 50% slower; every small star adds 5%; a prepaid visit (older saves) adds nothing any more', () => {
    expect(BASE_SPEED).toBe(0.5);
    expect(treeEffects(withNodes([])).speed).toBe(0.5);
    expect(treeEffects(withNodes(['sp1'])).speed).toBeCloseTo(0.55, 6);
    expect(treeEffects(withNodes(['sp1n'])).speed).toBeCloseTo(0.53, 6); // the new stars between: +3%
    expect(treeEffects(withNodes(pathTo('sp5'))).speed).toBeCloseTo(1.19, 6); // crosses 단련된 팔 and 숙련된 손목
    expect(treeEffects({ ...withNodes([]), rentPrepaid: true }).speed).toBeCloseTo(0.5, 6);
    // 단련된 팔 (was 연속 강화 until 2026-11-27: holding the button is built in now) adds +10%
    expect(treeEffects(withNodes(pathTo('hold'))).speed).toBeCloseTo(0.88, 6);
    expect(treeEffects(withNodes(pathTo('hold'))).holdRepeat).toBe(false);
    expect(treeEffects(withNodes(sectorNodes('speed'))).speed).toBeCloseTo(2.7, 6);
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

describe('♥ stamina (2026-11-26: drains slowly from the first strike)', () => {
  it('nothing drains before the first strike; the strike starts the clock but costs nothing itself', () => {
    let s = withNodes([]);
    expect(staminaMax(s)).toBe(100);
    expect(drainStamina(s, 5).state).toBe(s);
    const r = enhance(s, s.weapons[0].id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(staminaStarted(s)).toBe(true);
    expect(staminaLeft(s)).toBe(100);
  });

  it('then 15 a second (2026-11-27; was 10): under seven seconds of work on a fresh morning, then the hammer stops', () => {
    let s = withNodes([]);
    const r = enhance(s, s.weapons[0].id);
    if (!r.ok) throw new Error('blocked');
    s = r.state;
    expect(drainRate(s)).toBe(STAMINA.drainPerSec);
    expect(workSecondsLeft(s)).toBeCloseTo(100 / 15, 6);
    s = drainStamina(s, 4).state;
    expect(staminaLeft(s)).toBeCloseTo(40, 6);
    s = drainStamina(s, 100).state;
    expect(staminaLeft(s)).toBe(0);
    const blocked = enhance(s, s.weapons[0].id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blocked).toBe('stamina');
  });

  it('faster hammering fits more strikes into the same stamina (why the speed stars matter)', () => {
    expect(workSecondsLeft(withNodes([]))).toBe(workSecondsLeft(withNodes(sectorNodes('speed'))));
    expect(treeEffects(withNodes(sectorNodes('speed'))).speed).toBeGreaterThan(treeEffects(withNodes([])).speed * 2);
  });

  it('the core drains through DRAIN_STAMINA, saves it, and refills the next morning', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 4);
    core.state = { ...core.state, daily: { day: core.state.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: 0, staminaStarted: true } };
    const r = core.dispatch({ type: 'DRAIN_STAMINA', seconds: 3 });
    expect(r).toMatchObject({ type: 'drained', left: 55 });
    expect(staminaLeft(new SaveManager(storage).loadRun().state!)).toBe(55);
    core.dispatch({ type: 'DRAIN_STAMINA', seconds: 60 });
    expect(staminaLeft(core.state)).toBe(0);
    core.dispatch({ type: 'SLEEP' });
    expect(staminaLeft(core.state)).toBe(staminaMax(core.state));
    expect(staminaStarted(core.state)).toBe(false);
  });

  it('체력 stars: max stamina still 1000; the new stars slow the drain (capped at −60%) and win stamina back', () => {
    const all = withNodes(sectorNodes('stamina'));
    const e = treeEffects(all);
    expect(staminaMax(all)).toBe(1000);
    expect(e.drainCut).toBeCloseTo(1.37, 6);
    expect(drainRate(all)).toBeCloseTo(STAMINA.drainPerSec * (1 - STAMINA.maxCut), 6);
    expect(e.staminaSave).toBe(37);
    expect(e.secondWind).toBe(30);
    expect(workSecondsLeft(all)).toBeGreaterThan(workSecondsLeft(withNodes([])) * 15);
  });

  it('a lucky strike wins back one second of stamina', () => {
    let s = withNodes(pathTo('callus'));
    s = { ...s, daily: { day: s.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: 50, staminaStarted: true } };
    const lucky = strike(s, new Rng(seedWhereFirst((x) => x < 2)));
    expect(lucky.refund).toBeCloseTo(drainRate(s) * STAMINA.refundSec, 6);
    expect(staminaLeft(lucky.state)).toBeCloseTo(staminaLeft(s) + lucky.refund, 6);
    const plain = strike(s, new Rng(seedWhereFirst((x) => x >= 2)));
    expect(plain.refund).toBe(0);
  });

  it('두 번째 바람 gives 30% of the maximum back once a day when stamina runs out', () => {
    let s = withNodes(pathTo('wind'));
    const max = staminaMax(s);
    s = { ...s, daily: { day: s.day, phoenix: 0, fateSplit: 0, freeWeapons: 0, staminaUsed: max - 5, staminaStarted: true } };
    const d = drainStamina(s, 60);
    expect(d.secondWind).toBe(Math.round(max * 0.3));
    expect(staminaLeft(d.state)).toBe(Math.round(max * 0.3));
    // only once a day
    const again = drainStamina(d.state, 600);
    expect(again.secondWind).toBe(0);
    expect(staminaLeft(again.state)).toBe(0);
  });

  it('the scripted prologue strikes do not start the drain', () => {
    const s = withNodes([]);
    const r = enhance(s, s.weapons[0].id, { force: 'keep' });
    expect(r.ok && staminaStarted(r.state)).toBe(false);
  });
});

describe('◆ gold', () => {
  it('sale bonus and cost cuts in 5% steps', () => {
    // nine stars to gd3: sale 3 + 5 + 3 + 3 + 5 = +19%, cost 3 + 3 + 5 + 3 = −14%
    const s = withNodes(pathTo('gd3'));
    expect(sellPrice(s, 10)).toBeGreaterThan(sellPrice(withNodes([]), 10));
    expect(treeEffects(s).sell).toBeCloseTo(0.19, 6);
    expect(enhanceCostFor(s, 10)).toBe(Math.max(1, Math.round(enhanceCost(10) * 0.86)));
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
  it('불사조 brings a destroyed weapon back at half, −2, then (불멸의 모루) the first one of the day at the full level', () => {
    expect(phoenixLevel(withNodes(pathTo('phoenix')), 15)).toBe(7);
    expect(phoenixLevel(withNodes(pathTo('wings')), 15)).toBe(13);
    const imm = withNodes(pathTo('immortal'));
    expect(phoenixLevel(imm, 15)).toBe(15);
    expect(phoenixLeft(imm)).toBe(2); // 2026-11-27: was 3 full revivals a day
    const second = { ...imm, daily: { day: imm.day, phoenix: 1, fateSplit: 0, freeWeapons: 0 } };
    expect(phoenixLevel(second, 15)).toBe(13);
    // only the weapon the player chose to protect is revived (QA 2026-11-27)
    const s = withNodes(pathTo('phoenix'), { level: 12 });
    const unguarded = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(unguarded.ok && unguarded.result.phoenix).toBe(null);
    const guarded = { ...s, phoenixTarget: s.weapons[0].id };
    const r = enhance(guarded, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok && r.result.phoenix).toBe(6);
    // once a day: the next destruction of the same weapon is final
    if (!r.ok) return;
    const again = enhance(r.state, s.weapons[0].id, { force: 'destroy' });
    expect(again.ok && again.result.phoenix).toBe(null);
  });

  it('불사조의 모루 comes later, behind 운명 분열 (user 2026-11-27)', () => {
    expect(TREE_BY_ID.phoenix.ring).toBeGreaterThan(TREE_BY_ID.split.ring);
    expect(pathTo('phoenix')).toContain('split');
  });

  it('all shard refunds together stop at 40% of the sale price (the whole branch used to give 101%)', () => {
    const all = withNodes(TREE.filter((n) => n.dir === 'insure').map((n) => n.id), { level: 12 });
    expect(treeEffects(all).destroyRefund).toBeGreaterThan(REFUND_CAP);
    const r = enhance(all, all.weapons[0].id, { force: 'destroy' });
    expect(r.ok && r.result.refund).toBe(Math.round((sellPrice(all, 12) * REFUND_CAP) / 100));
  });

  it('파편 줍기 pays 3% of a destroyed weapon back per star', () => {
    const s = withNodes(['in1'], { level: 12 });
    const r = enhance(s, s.weapons[0].id, { force: 'destroy' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const refund = Math.round(sellPrice(s, 12) * 0.03);
    expect(r.result.refund).toBe(refund);
    expect(r.state.gold).toBe(s.gold - enhanceCostFor(s, 12) + refund);
  });

  it('운명 분열 gives two candidates, counts as a strike, and the pick is applied once', () => {
    const s = { ...withNodes(pathTo('split')), splitArmed: true };
    expect(fateSplitLeft(s)).toBe(2);
    const b = beginSplit(s, s.weapons[0].id);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(fateSplitLeft(b.state)).toBe(1);
    expect(staminaStarted(b.state)).toBe(true);
    const c = chooseSplit(b.state, 0);
    expect(c.ok).toBe(true);
    expect(c.ok && staminaLeft(c.state)).toBe(100);
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

  it('the king comes every 5 days (2026-11-27; it was 7)', () => {
    const s0 = withNodes([]);
    expect(RENT.firstAfter).toBe(5);
    let s = due({ ...s0, gold: 10_000_000 });
    for (let i = 0; i < 3; i++) {
      const r = collectRent(s);
      expect(r.state.rentDueDay).toBe(s.day + 5);
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

  it('the run-ending visit is still reported, so the king wrath scene can play (bug 2026-11-26)', () => {
    const core = new GameCore(new MemoryStorage(), 9);
    core.state = { ...core.state, gold: 0, rentDueDay: core.state.day + 1 };
    const r = core.dispatch({ type: 'SLEEP' });
    if (r.type !== 'slept') throw new Error(r.type);
    expect(r.gameOver).toBeTruthy();
    expect(r.rent).toMatchObject({ lifeLost: true, day: 2 });
    expect(r.rent!.amount).toBeGreaterThan(0);
    expect(core.gameOverRent).toEqual(r.rent);
    // a normal paid morning reports no run-ending visit
    const ok = new GameCore(new MemoryStorage(), 9);
    ok.state = { ...ok.state, gold: 1_000_000, rentDueDay: ok.state.day + 1 };
    const r2 = ok.dispatch({ type: 'SLEEP' });
    expect(r2.type === 'slept' && r2.gameOver).toBeFalsy();
    expect(ok.gameOverRent).toBeNull();
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
    // and a star owned before 2026-11-27 gets the new star on its link for free (gd1m)
    expect(m.treeNodes).toEqual(['gd1', 'gd1m']);
  });

  it('saves from before the disc doubled keep every star connected (2026-11-27)', () => {
    const owned = pathTo('miracle').filter((id) => !id.endsWith('m'));
    const m = migrate({ ...withNodes(owned), gold: 0 } as GameState, STATE_VERSION)!;
    expect(new Set(m.treeNodes)).toEqual(new Set(pathTo('miracle')));
    expect(m.gold).toBe(0);
  });
});
