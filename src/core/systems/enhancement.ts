// EnhancementSystem (§6). Decides outcomes only; presentation is separate (§6.4).
import { DESTROY_FLOOR, ENHANCE_TABLE, OUTCOMES, OUTCOME_INFO, type EnhanceRow, type Outcome } from '../../config/enhancement';
import { MAX_LEVEL } from '../../config/weapons';
import { appearanceStage, milestoneCrossed, type Milestone } from '../../config/appearance';
import { Rng } from '../rng';
import type { GameState, Weapon } from '../state/types';
import { findWeapon, isLastWeapon, removeWeapon } from './weapons';
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
}

/** Steps 1–3 of §6.4. Returns why the attempt must not run, or null. */
export function checkEnhance(state: GameState, weaponId: string, opts: EnhanceOptions = {}): EnhanceBlock | null {
  const weapon = findWeapon(state, weaponId);
  if (!weapon) return 'no-weapon';
  if (weapon.level >= MAX_LEVEL) return 'max-level';
  if (!isTutorialDone(state, 'firstEnhance')) return 'tutorial';
  if (state.gold < enhanceCost(weapon.level)) return 'gold';
  if (isLastWeapon(state, weaponId) && !opts.confirmLast) return 'confirm-last';
  return null;
}

export interface EnhanceResult {
  outcome: Outcome;
  weaponBefore: Weapon;
  /** The weapon after the attempt, or null if it was destroyed. */
  weaponAfter: Weapon | null;
  /** The row used for the roll, for display. */
  row: EnhanceRow;
  stageChanged: boolean;
  milestone: Milestone | null;
  /** The roll that the protection stone turned into 'keep', if it fired. */
  protectedFrom: Outcome | null;
  /** Stones spent on this attempt. */
  used: EnhanceItem[];
}

export type EnhanceAttempt =
  | { ok: true; state: GameState; result: EnhanceResult }
  | { ok: false; state: GameState; blocked: EnhanceBlock };

/** Step 4 of §6.4: decide and apply. The caller saves (step 5) before animating (6–8). */
export function enhance(prev: GameState, weaponId: string, opts: EnhanceOptions = {}): EnhanceAttempt {
  const blocked = checkEnhance(prev, weaponId, opts);
  if (blocked) return { ok: false, state: prev, blocked };

  const before = findWeapon(prev, weaponId)!;
  const row = effectiveRow(before.level, collectEnhanceMods(prev, before));
  const rng = new Rng(prev.rng);
  const rolled = rollOutcome(row, rng.next());
  // Protection stone: a drop or destruction becomes keep, and only then is the stone spent.
  const protectedFrom = (rolled === 'down' || rolled === 'destroy') && isArmed(prev, 'protect') ? rolled : null;
  const outcome: Outcome = protectedFrom ? 'keep' : rolled;
  const newLevel = levelAfter(before.level, outcome);
  const used: EnhanceItem[] = [];
  if (isArmed(prev, 'luck')) used.push('luck');
  if (isArmed(prev, 'master')) used.push('master');
  if (protectedFrom) used.push('protect');

  const cost = enhanceCost(before.level);
  let state: GameState = {
    ...prev,
    gold: prev.gold - cost,
    rng: rng.state,
    lastEnhance: {
      day: prev.day,
      weaponBefore: { ...before },
      wasEquipped: prev.equippedId === weaponId,
      outcome,
      index: prev.weapons.findIndex((w) => w.id === weaponId),
    },
    stats: { ...prev.stats, enhanceAttempts: prev.stats.enhanceAttempts + 1, goldSpentEnhancing: prev.stats.goldSpentEnhancing + cost },
  };
  for (const item of used) state = consume(state, item);

  let after: Weapon | null = null;
  if (newLevel === null) {
    state = removeWeapon(state, weaponId);
    state.stats = { ...state.stats, destroyed: state.stats.destroyed + 1 };
  } else {
    after = { ...before, level: newLevel };
    state = {
      ...state,
      weapons: state.weapons.map((w) => (w.id === weaponId ? after! : w)),
      stats: { ...state.stats, bestLevel: Math.max(state.stats.bestLevel, newLevel) },
    };
  }

  const stageChanged = after !== null && appearanceStage(after.level) !== appearanceStage(before.level);
  const milestone = after ? milestoneCrossed(before.level, after.level) : null;
  return { ok: true, state, result: { outcome, weaponBefore: before, weaponAfter: after, row, stageChanged, milestone, protectedFrom, used } };
}
