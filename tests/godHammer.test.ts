// 신의 망치 as a chosen one-shot (QA proposal, user request 2026-11-27).
import { describe, expect, it } from 'vitest';
import { GOD_HAMMER } from '../src/config/forgeSkills';
import { MAX_LEVEL } from '../src/config/weapons';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { enhance } from '../src/core/systems/enhancement';
import { countRentPaid, godHammer, godHammerUnlocked, toggleGodHammer } from '../src/core/systems/godHammer';
import { collectRent } from '../src/core/systems/rent';
import type { GameState } from '../src/core/state/types';
import { pathTo, runWith, withNodes } from './helpers';

const armed = (s: GameState, charges = 1): GameState => ({ ...s, godHammer: { rentsPaid: 2, charges, armed: true, counted: [8, 15] } });

describe('신의 망치: unlocking and charging', () => {
  it('opens on the second paid rent with one charge; each later rent adds one, up to the cap', () => {
    expect(GOD_HAMMER).toEqual({ unlockRents: 2, cap: 1 });
    let s = runWith([{}]);
    s = countRentPaid(s, 8);
    expect(godHammerUnlocked(s)).toBe(false);
    expect(godHammer(s).charges).toBe(0);
    s = countRentPaid(s, 15);
    expect(godHammerUnlocked(s)).toBe(true);
    expect(godHammer(s).charges).toBe(1);
    s = countRentPaid(s, 22);
    expect(godHammer(s).charges).toBe(1); // capped at 1
    expect(godHammer(s).rentsPaid).toBe(3);
  });

  it('신의 손길 lets it hold two charges', () => {
    let s = withNodes(pathTo('divine'));
    for (const d of [8, 15, 22, 29]) s = countRentPaid(s, d);
    expect(godHammer(s).charges).toBe(2);
  });

  it('a rent visit counts only once, however often it is replayed', () => {
    let s = countRentPaid(countRentPaid(runWith([{}]), 8), 15);
    const again = countRentPaid(s, 15);
    expect(again).toBe(s);
    s = countRentPaid({ ...s, godHammer: { ...godHammer(s), charges: 0 } }, 15);
    expect(godHammer(s).charges).toBe(0);
  });

  it('collectRent counts a paid visit; unpaid and mercy visits do not', () => {
    const due = { ...runWith([{}]), day: 8, rentDueDay: 8, gold: 10_000 };
    expect(godHammer(collectRent(due).state).rentsPaid).toBe(1);
    expect(godHammer(collectRent({ ...due, gold: 0 }).state).rentsPaid).toBe(0);
  });
});

describe('신의 망치: the chosen strike', () => {
  it('arming needs a charge and turns 운명 분열 off', () => {
    const s = runWith([{ level: 4 }]);
    expect(toggleGodHammer(s)).toEqual({ ok: false, reason: 'locked' });
    expect(toggleGodHammer({ ...s, godHammer: { rentsPaid: 2, charges: 0, armed: false, counted: [] } })).toEqual({ ok: false, reason: 'empty' });
    const r = toggleGodHammer({ ...s, splitArmed: true, godHammer: { rentsPaid: 2, charges: 1, armed: false, counted: [] } });
    expect(r.ok && r.state.splitArmed).toBe(false);
    expect(r.ok && godHammer(r.state).armed).toBe(true);
  });

  it('a success or a great success lands at +5; the charge is spent', () => {
    for (const force of ['success', 'great'] as const) {
      const s = armed(runWith([{ level: 7 }]));
      // force skips the hammer (scripted strikes); roll for real with a seed that gives `force`
      const seed = seedFor(s, force);
      const r = enhance({ ...s, rng: seed }, 'w1');
      if (!r.ok) throw new Error(r.blocked);
      expect(r.result.outcome).toBe('great');
      expect(r.result.divine).toBe(true);
      expect(r.result.godHammer).toBe(true);
      expect(r.state.weapons[0].level).toBe(12);
      expect(godHammer(r.state)).toMatchObject({ charges: 0, armed: false });
    }
  });

  it('keep, drop or destruction happen as rolled, and the charge is still spent', () => {
    for (const force of ['keep', 'down', 'destroy'] as const) {
      const s = armed(runWith([{ level: 7 }]));
      const r = enhance({ ...s, rng: seedFor(s, force) }, 'w1');
      if (!r.ok) throw new Error(r.blocked);
      expect(r.result.outcome).toBe(force);
      expect(r.result.divine).toBe(false);
      expect(r.result.godHammer).toBe(true);
      expect(godHammer(r.state)).toMatchObject({ charges: 0, armed: false });
    }
  });

  it('never goes past the enhancement cap', () => {
    const s = armed({ ...runWith([{ level: MAX_LEVEL - 2 }]), gold: 1e13 }); // +98 strikes are expensive
    const r = enhance({ ...s, rng: seedFor(s, 'success') }, 'w1');
    expect(r.ok && r.state.weapons[0].level).toBe(MAX_LEVEL);
  });

  it('rolls exactly like an unarmed strike (one roll, no extra draw)', () => {
    const base = runWith([{ level: 9 }]);
    for (let seed = 1; seed <= 40; seed++) {
      const plain = enhance({ ...base, rng: seed }, 'w1');
      const god = enhance({ ...armed(base), rng: seed }, 'w1');
      if (!plain.ok || !god.ok) throw new Error();
      expect(god.state.rng).toBe(plain.state.rng);
      const up = plain.result.outcome === 'success' || plain.result.outcome === 'great';
      expect(god.result.outcome).toBe(up ? 'great' : plain.result.outcome);
    }
  });

  it('through the core: result, cost, weapon and charge are one save; a reload or a second click draws nothing more', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 11);
    const s0 = armed({ ...core.state, gold: 1_000, weapons: runWith([{ level: 6 }]).weapons, equippedId: null, tutorials: { ...core.state.tutorials, firstEnhance: true, prologueDone: true } });
    core.state = s0;
    const r = core.dispatch({ type: 'ENHANCE', weaponId: 'w1' });
    if (r.type !== 'enhanced') throw new Error(r.type);
    const saved = new SaveManager(storage).loadRun().state!;
    expect(saved.gold).toBe(core.state.gold);
    expect(saved.weapons).toEqual(core.state.weapons);
    expect(godHammer(saved)).toMatchObject({ charges: 0, armed: false });
    // reloading gives the same state: nothing re-rolled, nothing refunded
    const reloaded = new GameCore(storage);
    expect(godHammer(reloaded.state).charges).toBe(0);
    expect(reloaded.state.weapons).toEqual(saved.weapons);
    // a second (unarmed) strike right away is a normal strike
    const r2 = core.dispatch({ type: 'ENHANCE', weaponId: core.state.weapons[0]?.id ?? 'w1' });
    if (r2.type === 'enhanced') expect(r2.result.godHammer).toBe(false);
    expect(core.dispatch({ type: 'TOGGLE_GOD_HAMMER' })).toEqual({ type: 'godHammerBlocked', reason: 'empty' });
  });
});

/** A seed whose first roll for `s.weapons[0]` gives `outcome` (search, deterministic). */
function seedFor(s: GameState, outcome: string): number {
  for (let seed = 1; seed < 20_000; seed++) {
    const r = enhance({ ...s, rng: seed, godHammer: undefined }, s.weapons[0].id);
    if (r.ok && r.result.outcome === outcome) return seed;
  }
  throw new Error(`no seed for ${outcome}`);
}
