// Skill tree rules (§17): learning, prerequisites, reset, and the totals other systems read.
import { RESONANCE_RATE, ROOT_ID, SKILL_BY_ID, SKILL_NEIGHBOURS, SKILL_NODES, type SkillEffects, type SkillStat } from '../../config/skills';
import type { Element } from '../../config/weapons';
import type { GameState } from '../state/types';
import { consume, itemCount } from './economy';

export function isLearned(state: GameState, id: string): boolean {
  return id === ROOT_ID || (state.skills[id] ?? 0) > 0;
}

export type LearnBlock = 'unknown' | 'learned' | 'locked' | 'points' | 'night';

/** §29-16: a node needs a learned neighbour (constellation adjacency) and enough points. */
export function checkLearn(state: GameState, id: string): LearnBlock | null {
  const node = SKILL_BY_ID[id];
  if (!node) return 'unknown';
  if (isLearned(state, id)) return 'learned';
  if (state.phase !== 'day') return 'night';
  if (!(SKILL_NEIGHBOURS[id] ?? []).some((n) => isLearned(state, n))) return 'locked';
  if (state.player.skillPoints < node.cost) return 'points';
  return null;
}

export function learn(prev: GameState, id: string): { ok: true; state: GameState } | { ok: false; reason: LearnBlock } {
  const blocked = checkLearn(prev, id);
  if (blocked) return { ok: false, reason: blocked };
  const cost = SKILL_BY_ID[id].cost;
  return {
    ok: true,
    state: { ...prev, skills: { ...prev.skills, [id]: 1 }, player: { ...prev.player, skillPoints: prev.player.skillPoints - cost } },
  };
}

export function spentPoints(state: GameState): number {
  return SKILL_NODES.reduce((sum, n) => sum + (n.id !== ROOT_ID && isLearned(state, n.id) ? n.cost : 0), 0);
}

export type ResetBlock = 'no-book' | 'nothing' | 'night';

/** 스킬 초기화 서적: refund every point. */
export function resetSkills(prev: GameState): { ok: true; state: GameState; refunded: number } | { ok: false; reason: ResetBlock } {
  if (prev.phase !== 'day') return { ok: false, reason: 'night' };
  if (itemCount(prev, 'resetBook') <= 0) return { ok: false, reason: 'no-book' };
  const refunded = spentPoints(prev);
  if (refunded === 0) return { ok: false, reason: 'nothing' };
  const state = consume({ ...prev, skills: {}, player: { ...prev.player, skillPoints: prev.player.skillPoints + refunded } }, 'resetBook');
  return { ok: true, state, refunded };
}

/**
 * Sum of learned effects. Element nodes count fully only with a weapon of their element;
 * with 원소 공명 the others count at 50%. `element` null (starter hammer, menus) skips element gating
 * only when `includeAllElements` is set (for display).
 */
export function skillTotals(state: GameState, element: Element | null, includeAllElements = false): Required<SkillEffects> {
  const out = {} as Record<SkillStat, number>;
  const learned = SKILL_NODES.filter((n) => n.id !== ROOT_ID && isLearned(state, n.id));
  const resonance = learned.some((n) => (n.effects.resonance ?? 0) > 0);
  for (const n of learned) {
    let rate = 1;
    if (n.element && !includeAllElements) {
      if (n.element === element) rate = 1;
      else if (resonance && element) rate = RESONANCE_RATE;
      else rate = 0;
    }
    for (const [k, v] of Object.entries(n.effects) as [SkillStat, number][]) out[k] = (out[k] ?? 0) + v * rate;
  }
  return new Proxy(out, { get: (t, k) => (t as Record<string | symbol, number>)[k] ?? 0 }) as Required<SkillEffects>;
}
