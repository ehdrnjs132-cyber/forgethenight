// The twelve checks from the enhancement skill-tree spec (2026-11-19).
import { describe, expect, it } from 'vitest';
import { ENHANCE_TABLE, OUTCOMES, type EnhanceRow, type Outcome } from '../src/config/enhancement';
import { DIVINE_STEP, FORGE_SKILLS, SKILL_TABLE, type ForgeSkillId } from '../src/config/forgeSkills';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { Rng } from '../src/core/rng';
import type { GameState, Weapon } from '../src/core/state/types';
import { beginSplit, chooseSplit, enhance } from '../src/core/systems/enhancement';
import { daily, fateSplitLeft, greatConversionChance, phoenixLeft, rollCandidate, skillLevel } from '../src/core/systems/forgeSkills';
import { runWith } from './helpers';

/** A state with the given skill levels and one weapon w1 (plus a spare so it is never the last weapon). */
function withSkills(levels: Partial<Record<ForgeSkillId, number>>, w1: Partial<Weapon> = {}): GameState {
  const s = runWith([{ level: 10, ...w1 }, {}]);
  return { ...s, gold: 1_000_000, forgeSkills: levels };
}

/** A row that always gives `o`. */
const only = (o: Outcome): EnhanceRow => ({ great: 0, success: 0, keep: 0, down: 0, destroy: 0, [o]: 100 }) as EnhanceRow;

/** Find an RNG seed whose next three numbers satisfy a test (base roll is ignored by `only` rows). */
function seedWhere(test: (divine: number, great: number) => boolean): number {
  for (let s = 1; s < 200_000; s++) {
    const r = new Rng(s);
    r.next();
    const d = r.next() * 100;
    const g = r.next() * 100;
    if (test(d, g)) return s;
  }
  throw new Error('no seed');
}

describe('enhancement skills (spec 2026-11-19)', () => {
  it('1 · every base row sums to 100%', () => {
    for (const row of ENHANCE_TABLE) expect(OUTCOMES.reduce((a, o) => a + row[o], 0)).toBeCloseTo(100, 6);
  });

  it('2 · base destroy chance never falls as the level rises', () => {
    for (let i = 1; i < ENHANCE_TABLE.length; i++) expect(ENHANCE_TABLE[i].destroy).toBeGreaterThanOrEqual(ENHANCE_TABLE[i - 1].destroy);
  });

  it('3 · 기적의 불꽃 and 과열 단조 add up into ONE conversion roll, capped by the 과열 maximum', () => {
    const s = withSkills({ miracle: 3, overheat: 2 });
    const hot = { ...s.weapons[0], streak: 4 };
    expect(greatConversionChance(s, hot)).toBe(SKILL_TABLE.miracle[3] + 4 * SKILL_TABLE.overheat[2].per);
    const capped = { ...hot, streak: 99 };
    expect(greatConversionChance(s, capped)).toBe(SKILL_TABLE.miracle[3] + SKILL_TABLE.overheat[2].max);
    // a roll just under the combined chance converts, one just over does not
    const chance = greatConversionChance(s, hot);
    const yes = rollCandidate(s, hot, only('success'), new Rng(seedWhere((d, g) => d >= 50 && g < chance)));
    const no = rollCandidate(s, hot, only('success'), new Rng(seedWhere((d, g) => d >= 50 && g >= chance)));
    expect(yes).toMatchObject({ outcome: 'great', miracle: true, level: hot.level + 2 });
    expect(no).toMatchObject({ outcome: 'success', miracle: false, level: hot.level + 1 });
    // only a SUCCESS is converted
    const keep = rollCandidate(s, hot, only('keep'), new Rng(seedWhere((_d, g) => g < chance)));
    expect(keep.outcome).toBe('keep');
  });

  it('4 · 신의 망치 wins over the other conversions (and works on a great success too)', () => {
    const s = withSkills({ divine: 5, miracle: 5 });
    const w = s.weapons[0];
    const seed = seedWhere((d, g) => d < SKILL_TABLE.divine[5] && g < 1);
    const c = rollCandidate(s, w, only('success'), new Rng(seed));
    expect(c).toMatchObject({ divine: true, miracle: false, level: w.level + DIVINE_STEP });
    const g = rollCandidate(s, w, only('great'), new Rng(seed));
    expect(g).toMatchObject({ divine: true, level: w.level + DIVINE_STEP });
    // never on a destruction
    const d = rollCandidate(s, w, only('destroy'), new Rng(seed));
    expect(d).toMatchObject({ divine: false, level: null });
  });

  it('5 · 신의 망치 at +49 stops at +50', () => {
    const s = withSkills({ divine: 5 }, { level: 49 });
    const c = rollCandidate(s, s.weapons[0], only('success'), new Rng(seedWhere((d) => d < SKILL_TABLE.divine[5])));
    expect(c.level).toBe(50);
  });

  it('6 · 불사조의 모루 brings a destroyed weapon back at its level, same class and element', () => {
    const s0 = withSkills({ phoenix: 5 });
    const s = { ...s0, rng: seedWhere(() => true) };
    const before = s.weapons[0];
    // force a destruction through the table: a +49 weapon with an always-destroy roll is easiest via force
    const r = enhance(s, before.id, { force: 'destroy' });
    if (!r.ok) throw new Error(r.blocked);
    expect(r.result.outcome).toBe('destroy');
    expect(r.result.phoenix).toBe(SKILL_TABLE.phoenix[5].level);
    expect(r.result.weaponAfter).toMatchObject({ id: before.id, cls: before.cls, element: before.element, level: SKILL_TABLE.phoenix[5].level, streak: 0 });
    expect(r.state.weapons.find((w) => w.id === before.id)).toBeDefined();
    expect(daily(r.state).phoenix).toBe(1);
    expect(r.state.stats.destroyed).toBe(1); // the destruction is still on record
  });

  it('7 · 불사조 revivals run out for the day and come back the next day', () => {
    let s = withSkills({ phoenix: 1 }); // 1 per day
    let r = enhance(s, 'w1', { force: 'destroy' });
    if (!r.ok) throw new Error();
    expect(r.result.phoenix).toBe(0);
    expect(phoenixLeft(r.state)).toBe(0);
    r = enhance(r.state, 'w1', { force: 'destroy', confirmLast: true });
    if (!r.ok) throw new Error();
    expect(r.result.phoenix).toBeNull();
    expect(r.state.weapons.find((w) => w.id === 'w1')).toBeUndefined();
    s = { ...r.state, day: r.state.day + 1 };
    expect(phoenixLeft(s)).toBe(1);
  });

  it('8 · 운명 분열 rolls two candidates, spends a use, and leaves the weapon untouched', () => {
    const s = { ...withSkills({ fateSplit: 2 }), splitArmed: true };
    const r = beginSplit(s, 'w1');
    if (!r.ok) throw new Error(r.blocked);
    expect(r.candidates).toHaveLength(2);
    expect(r.state.pendingSplit?.weaponId).toBe('w1');
    expect(r.state.weapons[0]).toEqual(s.weapons[0]);
    expect(fateSplitLeft(r.state)).toBe(1);
    expect(r.state.splitArmed).toBe(false);
    expect(r.state.gold).toBeLessThan(s.gold); // paid once
  });

  it('9 · picking a destroyed candidate destroys the weapon (or 불사조 saves it, spending a revival only then)', () => {
    const base = { ...withSkills({ fateSplit: 1, phoenix: 1 }), splitArmed: true };
    const r = beginSplit(base, 'w1');
    if (!r.ok) throw new Error();
    const doom = { rolled: 'destroy' as Outcome, outcome: 'destroy' as Outcome, level: null, miracle: false, divine: false };
    const pending = { ...r.state, pendingSplit: { ...r.state.pendingSplit!, candidates: [doom, r.candidates[1]] as [typeof doom, typeof doom] } };
    expect(phoenixLeft(pending)).toBe(1);
    const picked = chooseSplit(pending, 0);
    if (!picked.ok) throw new Error();
    expect(picked.result.outcome).toBe('destroy');
    expect(picked.result.phoenix).toBe(SKILL_TABLE.phoenix[1].level);
    expect(phoenixLeft(picked.state)).toBe(0);
    expect(picked.state.pendingSplit).toBeNull();
    // without 불사조 the weapon is gone
    const plain = { ...pending, forgeSkills: { fateSplit: 1 } };
    const gone = chooseSplit(plain, 0);
    if (!gone.ok) throw new Error();
    expect(gone.result.weaponAfter).toBeNull();
    expect(gone.state.weapons.find((w) => w.id === 'w1')).toBeUndefined();
  });

  it('10 · a waiting 운명 분열 pick survives a save and reload, and blocks other changes', () => {
    const storage = new MemoryStorage();
    const g = new GameCore(storage, 4);
    g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
    g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    g.state = { ...g.state, gold: 100_000, forgeSkills: { fateSplit: 1 } };
    g.dispatch({ type: 'TOGGLE_SPLIT' });
    const id = g.state.weapons[0].id;
    const r = g.dispatch({ type: 'ENHANCE', weaponId: id });
    expect(r.type).toBe('splitPending');
    expect(g.dispatch({ type: 'ENHANCE', weaponId: id })).toEqual({ type: 'blocked', reason: 'split-pending' });
    const reloaded = new GameCore(storage);
    expect(reloaded.state.pendingSplit?.weaponId).toBe(id);
    expect(new SaveManager(storage).loadRun().state!.pendingSplit?.candidates).toHaveLength(2);
    const chosen = reloaded.dispatch({ type: 'CHOOSE_SPLIT', index: 1 });
    expect(chosen.type).toBe('enhanced');
    expect(reloaded.state.pendingSplit).toBeNull();
  });

  it('11 · the game goes on with no weapons at all (hammer night, sleeping, free weapons)', () => {
    const g = new GameCore(new MemoryStorage(), 6);
    g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    g.state = { ...g.state, weapons: [], equippedId: null };
    expect(g.dispatch({ type: 'SLEEP' }).type).toBe('slept');
    expect(g.state.weapons.length).toBeGreaterThan(0);
    g.state = { ...g.state, weapons: [], equippedId: null };
    expect(g.dispatch({ type: 'BUY_WEAPON' }).type).toBe('weaponBought');
  });

  it('12 · buying a level changes the real effect at once, in the chain order, with gold', () => {
    const g = new GameCore(new MemoryStorage(), 8);
    g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    g.state = { ...g.state, gold: 10_000_000 };
    // the chain: each skill needs the one before it
    expect(g.dispatch({ type: 'BUY_SKILL', id: 'overheat' })).toEqual({ type: 'skillBlocked', reason: 'locked' });
    const cost = FORGE_SKILLS[0].cost[0];
    const r = g.dispatch({ type: 'BUY_SKILL', id: 'miracle' });
    expect(r).toEqual({ type: 'skillBought', id: 'miracle', level: 1, cost });
    expect(skillLevel(g.state, 'miracle')).toBe(1);
    expect(greatConversionChance(g.state, g.state.weapons[0])).toBe(SKILL_TABLE.miracle[1]);
    for (let i = 0; i < 4; i++) g.dispatch({ type: 'BUY_SKILL', id: 'miracle' });
    expect(g.dispatch({ type: 'BUY_SKILL', id: 'miracle' })).toEqual({ type: 'skillBlocked', reason: 'max' });
    expect(g.dispatch({ type: 'BUY_SKILL', id: 'overheat' }).type).toBe('skillBought');
  });

  it('extra · the forge gives at most 6 weapons a day including the morning three', () => {
    const g = new GameCore(new MemoryStorage(), 2);
    g.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' });
    g.state = { ...g.state, inventoryCap: 8 };
    let got = 0;
    for (let i = 0; i < 10; i++) if (g.dispatch({ type: 'BUY_WEAPON' }).type === 'weaponBought') got++;
    expect(got).toBe(3);
    expect(g.dispatch({ type: 'BUY_WEAPON' })).toEqual({ type: 'weaponBuyBlocked', reason: 'daily' });
  });
});
