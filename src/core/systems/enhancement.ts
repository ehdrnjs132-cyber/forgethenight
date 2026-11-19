// EnhancementSystem (§6). Decides outcomes only; presentation is separate (§6.4).
import { DESTROY_FLOOR, ENHANCE_TABLE, OUTCOMES, OUTCOME_INFO, type EnhanceRow, type Outcome } from '../../config/enhancement';
import { MAX_LEVEL } from '../../config/weapons';
import { appearanceStage, milestoneCrossed, type Milestone } from '../../config/appearance';
import { Rng } from '../rng';
import type { EnhanceCandidate, GameState, Weapon } from '../state/types';
import { daily, fateSplitLeft, phoenixLeft, rollCandidate, skillLevel, withDaily } from './forgeSkills';
import { SKILL_TABLE } from '../../config/forgeSkills';
import { findWeapon, removeWeapon } from './weapons';
import { isTutorialDone } from './tutorial';
import { consume, enhanceCost, isArmed } from './economy';
import { skillTotals } from './skills';
import { LUCK_BONUS, MASTER_DESTROY_MUL, type EnhanceItem } from '../../config/economy';

/** Percentage-point adjustments from totems, skills and items (§16). Keep absorbs the rest. */
export interface EnhanceMods {
  great?: number;
  success?: number;
  down?: number;
  destroy?: number;
}

/** Bonuses for the next attempt: switched-on stones now; totems and skills hook in here (M5, M6). */
export function collectEnhanceMods(state: GameState, weapon: Weapon): EnhanceMods {
  const sk = skillTotals(state, null);
  const mods: EnhanceMods = {
    ...(sk.enhanceGreat ? { great: sk.enhanceGreat } : {}),
    ...(sk.enhanceSuccess ? { success: sk.enhanceSuccess } : {}),
    ...(sk.enhanceSafety ? { destroy: -sk.enhanceSafety } : {}),
  };
  if (isArmed(state, 'luck')) {
    mods.great = (mods.great ?? 0) + LUCK_BONUS.great;
    mods.success = (mods.success ?? 0) + LUCK_BONUS.success;
  }
  if (isArmed(state, 'master')) {
    const base = ENHANCE_TABLE[Math.min(weapon.level, ENHANCE_TABLE.length - 1)].destroy;
    mods.destroy = (mods.destroy ?? 0) - base * (1 - MASTER_DESTROY_MUL);
  }
  return mods;
}

/**
 * The row actually used for a roll: base row + percentage-point mods,
 * destroy clamped to the floor, keep recomputed so the total is exactly 100.
 */
export function effectiveRow(level: number, mods: EnhanceMods = {}): EnhanceRow {
  const base = ENHANCE_TABLE[Math.min(level, ENHANCE_TABLE.length - 1)];
  let great = Math.max(0, base.great + (mods.great ?? 0));
  let success = Math.max(0, base.success + (mods.success ?? 0));
  const down = Math.max(0, base.down + (mods.down ?? 0));
  const destroy = Math.max(DESTROY_FLOOR, base.destroy + (mods.destroy ?? 0));
  let keep = 100 - (great + success + down + destroy);
  if (keep < 0) {
    // Positive bonuses overflowed: shrink the upward outcomes proportionally.
    const room = Math.max(0, 100 - down - destroy);
    const scale = great + success > 0 ? room / (great + success) : 0;
    great *= scale;
    success *= scale;
    keep = 100 - (great + success + down + destroy);
  }
  return { great, success, keep, down, destroy };
}

/** Map a uniform roll in [0,1) to an outcome, in table order. */
export function rollOutcome(row: EnhanceRow, roll: number): Outcome {
  let acc = 0;
  const x = roll * 100;
  for (const o of OUTCOMES) {
    acc += row[o];
    if (x < acc) return o;
  }
  return 'destroy';
}

/** New level after an outcome, or null when destroyed. Clamped to 0..50 (§6.2). */
export function levelAfter(level: number, outcome: Outcome): number | null {
  if (outcome === 'destroy') return null;
  return Math.min(MAX_LEVEL, Math.max(0, level + OUTCOME_INFO[outcome].delta));
}

export type EnhanceBlock = 'no-weapon' | 'max-level' | 'tutorial' | 'gold' | 'confirm-last';

export interface EnhanceOptions {
  /** Player confirmed enhancing their last remaining weapon (§7.5). */
  confirmLast?: boolean;
  /** Scripted result (first-day prologue); skips the roll. */
  force?: Outcome;
}

/** Steps 1–3 of §6.4. Returns why the attempt must not run, or null. */
export function checkEnhance(state: GameState, weaponId: string, opts: EnhanceOptions = {}): EnhanceBlock | null {
  const weapon = findWeapon(state, weaponId);
  if (!weapon) return 'no-weapon';
  if (weapon.level >= MAX_LEVEL) return 'max-level';
  if (!isTutorialDone(state, 'firstEnhance')) return 'tutorial';
  if (state.gold < enhanceCost(weapon.level)) return 'gold';
  // (2026-11-19: no "last weapon" warning any more; weapons are free and the forge always gives more)
  void opts;
  return null;
}

export interface EnhanceResult {
  outcome: Outcome;
  weaponBefore: Weapon;
  /** The weapon after the attempt, or null if it was destroyed (and not revived). */
  weaponAfter: Weapon | null;
  /** The row used for the roll, for display. */
  row: EnhanceRow;
  stageChanged: boolean;
  milestone: Milestone | null;
  /** The roll that the protection stone turned into 'keep', if it fired. */
  protectedFrom: Outcome | null;
  /** Stones spent on this attempt. */
  used: EnhanceItem[];
  /** 기적의 불꽃 / 과열 단조 turned a success into a great success. */
  miracle: boolean;
  /** 신의 망치: +5. */
  divine: boolean;
  /** 불사조의 모루 revived the destroyed weapon at this level (outcome stays 'destroy'). */
  phoenix: number | null;
}

export type EnhanceAttempt =
  | { ok: true; state: GameState; result: EnhanceResult }
  | { ok: false; state: GameState; blocked: EnhanceBlock };

/** Cost, stones and RNG of an attempt that passed its checks; shared by a normal attempt and 운명 분열. */
interface Prepared {
  state: GameState;
  before: Weapon;
  row: EnhanceRow;
  rng: Rng;
  /** luck / master stones spent on the roll itself. */
  used: EnhanceItem[];
}

function prepare(prev: GameState, weaponId: string): Prepared {
  const before = findWeapon(prev, weaponId)!;
  const row = effectiveRow(before.level, collectEnhanceMods(prev, before));
  const used: EnhanceItem[] = [];
  if (isArmed(prev, 'luck')) used.push('luck');
  if (isArmed(prev, 'master')) used.push('master');
  const cost = enhanceCost(before.level);
  let state: GameState = {
    ...prev,
    gold: prev.gold - cost,
    stats: { ...prev.stats, enhanceAttempts: prev.stats.enhanceAttempts + 1, goldSpentEnhancing: prev.stats.goldSpentEnhancing + cost },
  };
  for (const item of used) state = consume(state, item);
  return { state, before, row, rng: new Rng(prev.rng), used };
}

/**
 * Make a candidate real: protection stone, 불사조의 모루, the 과열 단조 streak, stats and the undo record.
 * Exactly one call per attempt, so a destruction or a counter can never be applied twice.
 */
function apply(prepared: Prepared, cand: EnhanceCandidate): { state: GameState; result: EnhanceResult } {
  const { before, row } = prepared;
  let state = prepared.state;
  const used = [...prepared.used];
  // Protection stone: a drop or destruction becomes keep, and only then is the stone spent.
  const protectedFrom = (cand.outcome === 'down' || cand.outcome === 'destroy') && isArmed(state, 'protect') ? cand.outcome : null;
  const outcome: Outcome = protectedFrom ? 'keep' : cand.outcome;
  let newLevel = protectedFrom ? before.level : cand.level;
  if (protectedFrom) {
    used.push('protect');
    state = consume(state, 'protect');
  }
  const upward = outcome === 'success' || outcome === 'great';
  let phoenix: number | null = null;
  if (newLevel === null && phoenixLeft(state) > 0) {
    // 불사조의 모루: the weapon comes back (same class and element) instead of being lost
    phoenix = Math.min(MAX_LEVEL, SKILL_TABLE.phoenix[skillLevel(state, 'phoenix')].level);
    newLevel = phoenix;
    state = withDaily(state, { phoenix: daily(state).phoenix + 1 });
  }
  state = {
    ...state,
    lastEnhance: {
      day: state.day,
      weaponBefore: { ...before },
      wasEquipped: state.equippedId === before.id,
      outcome,
      index: state.weapons.findIndex((w) => w.id === before.id),
    },
  };
  let after: Weapon | null = null;
  if (newLevel === null) {
    state = removeWeapon(state, before.id);
    state.stats = { ...state.stats, destroyed: state.stats.destroyed + 1 };
  } else {
    after = { ...before, level: newLevel, streak: upward && phoenix === null ? (before.streak ?? 0) + 1 : 0 };
    state = {
      ...state,
      weapons: state.weapons.map((w) => (w.id === before.id ? after! : w)),
      stats: {
        ...state.stats,
        bestLevel: Math.max(state.stats.bestLevel, newLevel),
        ...(phoenix !== null ? { destroyed: state.stats.destroyed + 1 } : {}),
      },
    };
  }
  const stageChanged = after !== null && appearanceStage(after.level) !== appearanceStage(before.level);
  const milestone = after && phoenix === null ? milestoneCrossed(before.level, after.level) : null;
  return {
    state,
    result: {
      outcome,
      weaponBefore: before,
      weaponAfter: after,
      row,
      stageChanged,
      milestone,
      protectedFrom,
      used,
      miracle: !protectedFrom && cand.miracle,
      divine: !protectedFrom && cand.divine,
      phoenix,
    },
  };
}

/** Step 4 of §6.4: decide and apply. The caller saves (step 5) before animating (6–8). */
export function enhance(prev: GameState, weaponId: string, opts: EnhanceOptions = {}): EnhanceAttempt {
  const blocked = checkEnhance(prev, weaponId, opts);
  if (blocked) return { ok: false, state: prev, blocked };
  const p = prepare(prev, weaponId);
  const cand = rollCandidate(p.state, p.before, p.row, p.rng, opts.force);
  p.state = { ...p.state, rng: p.rng.state };
  const r = apply(p, cand);
  return { ok: true, state: r.state, result: r.result };
}

// ───────────────────────── 운명 분열 (Fate Split)

export type SplitBlock = EnhanceBlock | 'no-uses' | 'pending';

/**
 * Pay for the attempt and roll two independent candidates (skills included). The weapon is not touched
 * yet; the pick is saved, so closing the game keeps it waiting. The use is spent here.
 */
export function beginSplit(prev: GameState, weaponId: string, opts: EnhanceOptions = {}): { ok: true; state: GameState; candidates: [EnhanceCandidate, EnhanceCandidate] } | { ok: false; blocked: SplitBlock } {
  if (prev.pendingSplit) return { ok: false, blocked: 'pending' };
  const blocked = checkEnhance(prev, weaponId, opts);
  if (blocked) return { ok: false, blocked };
  if (fateSplitLeft(prev) <= 0) return { ok: false, blocked: 'no-uses' };
  const p = prepare(prev, weaponId);
  const a = rollCandidate(p.state, p.before, p.row, p.rng);
  const b = rollCandidate(p.state, p.before, p.row, p.rng);
  const candidates: [EnhanceCandidate, EnhanceCandidate] = [a, b];
  let state: GameState = { ...p.state, rng: p.rng.state, splitArmed: false, pendingSplit: { weaponId, before: { ...p.before }, candidates } };
  state = withDaily(state, { fateSplit: daily(state).fateSplit + 1 });
  return { ok: true, state, candidates };
}

/** Commit the chosen candidate. Only now does the weapon change (and 불사조 spend a revival). */
export function chooseSplit(prev: GameState, index: 0 | 1): EnhanceAttempt {
  const pending = prev.pendingSplit;
  if (!pending || !findWeapon(prev, pending.weaponId)) return { ok: false, state: prev, blocked: 'no-weapon' };
  const p: Prepared = { state: { ...prev, pendingSplit: null }, before: { ...pending.before }, row: effectiveRow(pending.before.level), rng: new Rng(prev.rng), used: [] };
  const r = apply(p, pending.candidates[index]);
  return { ok: true, state: r.state, result: r.result };
}
