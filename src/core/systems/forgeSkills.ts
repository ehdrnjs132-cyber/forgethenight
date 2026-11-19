// Enhancement skills (user spec 2026-11-19): levels, daily counters, buying levels with gold, and the
// result conversions. Conversions are applied AFTER the base roll; the base table is never changed:
//   1. 신의 망치: a SUCCESS or GREAT_SUCCESS becomes +5 (then no other conversion).
//   2. otherwise, a SUCCESS becomes GREAT_SUCCESS with one roll at
//      기적의 불꽃 % + min(streak × 과열 per, 과열 max)  (capped at 100%), never two separate rolls.
// Pure functions over GameState.
import { MAX_LEVEL } from '../../config/weapons';
import { DIVINE_STEP, FORGE_SKILL_BY_ID, MAX_SKILL_LEVEL, SKILL_TABLE, type ForgeSkillId } from '../../config/forgeSkills';
import type { Outcome } from '../../config/enhancement';
import type { Rng } from '../rng';
import type { DailyCounters, EnhanceCandidate, GameState, Weapon } from '../state/types';
import { levelAfter, rollOutcome } from './enhancement';
import type { EnhanceRow } from '../../config/enhancement';

export function skillLevel(state: GameState, id: ForgeSkillId): number {
  return Math.max(0, Math.min(MAX_SKILL_LEVEL, state.forgeSkills?.[id] ?? 0));
}

/** Today's counters (fresh ones when the stored day is not today). */
export function daily(state: GameState): DailyCounters {
  const d = state.daily;
  return d && d.day === state.day ? d : { day: state.day, phoenix: 0, fateSplit: 0, freeWeapons: 0 };
}

export function withDaily(state: GameState, patch: Partial<Omit<DailyCounters, 'day'>>): GameState {
  return { ...state, daily: { ...daily(state), ...patch } };
}

export function phoenixLeft(state: GameState): number {
  return Math.max(0, SKILL_TABLE.phoenix[skillLevel(state, 'phoenix')].perDay - daily(state).phoenix);
}

export function fateSplitLeft(state: GameState): number {
  return Math.max(0, SKILL_TABLE.fateSplit[skillLevel(state, 'fateSplit')] - daily(state).fateSplit);
}

/** Chance (%) that a plain SUCCESS on this weapon becomes a GREAT_SUCCESS. */
export function greatConversionChance(state: GameState, weapon: Weapon): number {
  const o = SKILL_TABLE.overheat[skillLevel(state, 'overheat')];
  const heat = Math.min((weapon.streak ?? 0) * o.per, o.max);
  return Math.min(100, SKILL_TABLE.miracle[skillLevel(state, 'miracle')] + heat);
}

/** Current 과열 단조 bonus (%p) on a weapon, for display. */
export function overheatBonus(state: GameState, weapon: Weapon): number {
  const o = SKILL_TABLE.overheat[skillLevel(state, 'overheat')];
  return Math.min((weapon.streak ?? 0) * o.per, o.max);
}

/**
 * Roll one result for `weapon` with the given row and apply the skill conversions.
 * Uses up to three numbers from `rng` (base roll, 신의 망치, 기적/과열) — always all three, so the
 * sequence does not depend on which skills are learned.
 */
export function rollCandidate(state: GameState, weapon: Weapon, row: EnhanceRow, rng: Rng, force?: Outcome): EnhanceCandidate {
  const baseRoll = rng.next();
  const divineRoll = rng.next() * 100;
  const greatRoll = rng.next() * 100;
  const rolled = force ?? rollOutcome(row, baseRoll);
  let outcome = rolled;
  let miracle = false;
  let divine = false;
  let level = levelAfter(weapon.level, rolled);
  if (!force && (rolled === 'success' || rolled === 'great')) {
    if (divineRoll < SKILL_TABLE.divine[skillLevel(state, 'divine')]) {
      divine = true;
      outcome = 'great';
      level = Math.min(MAX_LEVEL, weapon.level + DIVINE_STEP);
    } else if (rolled === 'success' && greatRoll < greatConversionChance(state, weapon)) {
      miracle = true;
      outcome = 'great';
      level = levelAfter(weapon.level, 'great');
    }
  }
  return { rolled, outcome, level, miracle, divine };
}

export type SkillBuyBlock = 'unknown' | 'max' | 'locked' | 'gold' | 'night';

export function nextSkillCost(state: GameState, id: ForgeSkillId): number | null {
  const lv = skillLevel(state, id);
  return lv >= MAX_SKILL_LEVEL ? null : FORGE_SKILL_BY_ID[id].cost[lv];
}

export function skillUnlocked(state: GameState, id: ForgeSkillId): boolean {
  const req = FORGE_SKILL_BY_ID[id]?.requires;
  return !req || skillLevel(state, req) >= 1;
}

export function checkBuySkill(state: GameState, id: ForgeSkillId): SkillBuyBlock | null {
  if (!FORGE_SKILL_BY_ID[id]) return 'unknown';
  if (state.phase !== 'day') return 'night';
  if (!skillUnlocked(state, id)) return 'locked';
  const cost = nextSkillCost(state, id);
  if (cost === null) return 'max';
  if (state.gold < cost) return 'gold';
  return null;
}

/** Buy the next level of a skill with gold. */
export function buySkill(prev: GameState, id: ForgeSkillId): { ok: true; state: GameState; level: number; cost: number } | { ok: false; reason: SkillBuyBlock } {
  const block = checkBuySkill(prev, id);
  if (block) return { ok: false, reason: block };
  const cost = nextSkillCost(prev, id)!;
  const level = skillLevel(prev, id) + 1;
  return { ok: true, state: { ...prev, gold: prev.gold - cost, forgeSkills: { ...prev.forgeSkills, [id]: level } }, level, cost };
}
