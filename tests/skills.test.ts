import { describe, expect, it } from 'vitest';
import { runWith } from './helpers';
import { checkLearn, learn, resetSkills, skillTotals, spentPoints } from '../src/core/systems/skills';
import { ROOT_ID, SKILL_BY_ID, SKILL_NEIGHBOURS, SKILL_NODES, nodePos } from '../src/config/skills';
import { sell, salePrice, shopPrice } from '../src/core/systems/economy';
import { collectEnhanceMods, effectiveRow } from '../src/core/systems/enhancement';
import { ENHANCE_TABLE } from '../src/config/enhancement';
import type { GameState } from '../src/core/state/types';

const withPoints = (n: number, skills: Record<string, number> = {}): GameState => {
  const s = runWith([{ level: 20 }]);
  return { ...s, skills, player: { ...s.player, skillPoints: n } };
};

describe('skill data', () => {
  it('has 40 learnable nodes plus the root, unique ids, valid links', () => {
    expect(SKILL_NODES.filter((n) => n.id !== ROOT_ID)).toHaveLength(40);
    expect(new Set(SKILL_NODES.map((n) => n.id)).size).toBe(SKILL_NODES.length);
    for (const n of SKILL_NODES) for (const l of n.links) expect(SKILL_BY_ID[l], `${n.id} → ${l}`).toBeDefined();
  });

  it('every node is reachable from the root', () => {
    const seen = new Set([ROOT_ID]);
    const queue = [ROOT_ID];
    while (queue.length) for (const n of SKILL_NEIGHBOURS[queue.shift()!]) if (!seen.has(n)) (seen.add(n), queue.push(n));
    expect(seen.size).toBe(SKILL_NODES.length);
  });

  it('nodes do not overlap on screen', () => {
    for (const a of SKILL_NODES)
      for (const b of SKILL_NODES) {
        if (a.id >= b.id) continue;
        const pa = nodePos(a);
        const pb = nodePos(b);
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y), `${a.id}/${b.id}`).toBeGreaterThan(60);
      }
  });
});

describe('learning (QA 16: prerequisites)', () => {
  it('needs a learned neighbour', () => {
    expect(checkLearn(withPoints(5), 'a1')).toBeNull();
    expect(checkLearn(withPoints(5), 'a2')).toBe('locked');
    expect(checkLearn(withPoints(5, { a1: 1 }), 'a2')).toBeNull();
  });

  it('spends points, refuses without enough, and cannot learn twice', () => {
    const r = learn(withPoints(1), 'a1');
    if (!r.ok) throw new Error();
    expect(r.state.player.skillPoints).toBe(0);
    expect(learn(r.state, 'a2')).toEqual({ ok: false, reason: 'points' });
    expect(learn({ ...r.state, player: { ...r.state.player, skillPoints: 3 } }, 'a1')).toEqual({ ok: false, reason: 'learned' });
    expect(checkLearn(withPoints(1, { a8: 1, a11: 1 }), 'a12')).toBe('points');
  });

  it('cannot be changed during the night', () => {
    expect(checkLearn({ ...withPoints(3), phase: 'night' }, 'a1')).toBe('night');
  });
});

describe('reset book', () => {
  it('refunds every spent point and uses one book', () => {
    const s = { ...withPoints(0, { a1: 1, a3: 1, e0: 1 }), items: { resetBook: 1 } };
    expect(spentPoints(s)).toBe(3);
    const r = resetSkills(s);
    if (!r.ok) throw new Error();
    expect(r.refunded).toBe(3);
    expect(r.state.player.skillPoints).toBe(3);
    expect(r.state.skills).toEqual({});
    expect(r.state.items.resetBook).toBe(0);
    expect(resetSkills(r.state)).toEqual({ ok: false, reason: 'no-book' });
  });
});

describe('effects', () => {
  it('adds up stat nodes', () => {
    const t = skillTotals(withPoints(0, { a1: 1, a3: 1, s1: 1 }), null);
    expect(t.damage).toBeCloseTo(0.18);
    expect(t.maxHp).toBe(20);
    expect(t.critChance).toBe(0);
  });

  it('element nodes need a matching weapon, or work at 50% with resonance', () => {
    const s = withPoints(0, { e0: 1, f1: 1 });
    expect(skillTotals(s, 'fire').burn).toBeCloseTo(0.2);
    expect(skillTotals(s, 'ice').burn).toBe(0);
    expect(skillTotals({ ...s, skills: { ...s.skills, f2: 1, e9: 1 } }, 'ice').burn).toBeCloseTo(0.1);
    expect(skillTotals(s, null).burn).toBe(0);
  });

  it('smith nodes change sale prices, shop prices and enhancement odds', () => {
    const s = withPoints(0, { m1: 1, m2: 1, m3: 1 });
    const r = sell(s, 'w1');
    if (!r.ok) throw new Error();
    expect(r.price).toBeGreaterThan(salePrice(20));
    expect(shopPrice(s, { item: 'protect', price: 1200, left: 1 })).toBe(1080);
    const row = effectiveRow(20, collectEnhanceMods(s, s.weapons[0]));
    expect(row.success).toBeCloseTo(ENHANCE_TABLE[20].success + 2);
  });

  it('the destroy chance never drops below the floor', () => {
    const s = withPoints(0, { m6: 1 });
    expect(effectiveRow(0, collectEnhanceMods(s, s.weapons[0])).destroy).toBeGreaterThanOrEqual(1);
  });
});
