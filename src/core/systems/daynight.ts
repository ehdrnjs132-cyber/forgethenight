// DayNightManager + LifeSystem (§3, §13, DECISIONS.md #4).
// Night start snapshots the run; a won night advances the day and keeps XP; a lost night
// restores the snapshot with one life fewer and throws away that night's XP.
import { addXp } from '../../combat/rules';
import { LAST_DAY } from '../../config/rules';
import { NIGHT_ARENA, NIGHT_STAKE, NIGHT_UNLOCK_DAY } from '../../config/economy';
import type { GameOverSummary, GameState, NightSnapshot, Weapon } from '../state/types';
import { equippedWeapon } from './weapons';
import { inPrologue } from './prologue';

/** What the player fights with tonight: the equipped weapon, or the starter hammer when they own none (§13). */
export type NightWeapon = { kind: 'weapon'; weapon: Weapon } | { kind: 'hammer' };

export function nightWeapon(state: GameState): NightWeapon | null {
  const eq = equippedWeapon(state);
  if (eq) return { kind: 'weapon', weapon: { ...eq } };
  if (state.weapons.length === 0) return { kind: 'hammer' };
  return null; // owns weapons but none equipped
}

export type NightBlock = 'not-day' | 'no-weapon' | 'early';

/** The dwarf battle is offered from DAY 20 (2026-11-26); the scripted first-day prologue night is the exception. */
export function nightUnlocked(state: GameState, arena: boolean = NIGHT_ARENA.enabled): boolean {
  return (arena && state.day >= NIGHT_UNLOCK_DAY) || inPrologue(state);
}

export function startNight(prev: GameState): { ok: true; state: GameState; weapon: NightWeapon } | { ok: false; reason: NightBlock } {
  if (prev.phase !== 'day') return { ok: false, reason: 'not-day' };
  if (!nightUnlocked(prev)) return { ok: false, reason: 'early' };
  const weapon = nightWeapon(prev);
  if (!weapon) return { ok: false, reason: 'no-weapon' };
  const { nightSnapshot: _old, ...rest } = prev;
  const snapshot: NightSnapshot = structuredClone(rest);
  return { ok: true, state: { ...prev, phase: 'night', nightSnapshot: snapshot }, weapon };
}

export interface NightReport {
  kills: number;
  /** Seconds survived this night. */
  seconds: number;
}

export interface WinResult {
  state: GameState;
  levelBefore: number;
  levelsGained: number;
  /** True when DAY 50 was survived. */
  cleared: boolean;
}

/** Survived until dawn: keep the XP, move to the next day. The next day's weapons are granted by the caller. */
export function winNight(prev: GameState, report: NightReport & { xp: number }): WinResult {
  const r = addXp(prev.player.level, prev.player.xp, report.xp);
  const cleared = prev.day >= LAST_DAY;
  const state: GameState = {
    ...prev,
    phase: 'day',
    nightSnapshot: null,
    day: cleared ? prev.day : prev.day + 1,
    player: { level: r.level, xp: r.xp, skillPoints: prev.player.skillPoints + r.levelsGained },
    story: cleared ? { ...prev.story, flags: { ...prev.story.flags, cleared: true } } : prev.story,
    stats: {
      ...prev.stats,
      kills: prev.stats.kills + report.kills,
      nightSeconds: prev.stats.nightSeconds + report.seconds,
      nightsWon: prev.stats.nightsWon + 1,
    },
  };
  return { state, levelBefore: prev.player.level, levelsGained: r.levelsGained, cleared };
}

/** Night gamble won (user decision 2026-11-19): gold × NIGHT_STAKE.winMul, on top of the usual win. */
export function winGamble(prev: GameState, report: NightReport & { xp: number }): WinResult & { goldBefore: number } {
  const r = winNight(prev, report);
  const goldBefore = prev.gold;
  return { ...r, goldBefore, state: { ...r.state, gold: Math.floor(goldBefore * NIGHT_STAKE.winMul) } };
}

/**
 * Night gamble lost (or abandoned): back to the state the night began with, half the gold gone, and on to
 * the next morning. No life is lost (lives now go only to unpaid rent).
 */
export function loseGamble(prev: GameState, report: NightReport): { state: GameState; goldBefore: number; goldAfter: number } {
  const base: GameState = prev.nightSnapshot ? { ...prev.nightSnapshot, nightSnapshot: null } : { ...prev, nightSnapshot: null };
  const goldAfter = Math.floor(base.gold * NIGHT_STAKE.loseMul);
  const stats = {
    ...base.stats,
    kills: base.stats.kills + report.kills,
    nightSeconds: base.stats.nightSeconds + report.seconds,
    deaths: base.stats.deaths + 1,
  };
  return { state: { ...base, phase: 'day', day: base.day + 1, gold: goldAfter, stats, lastEnhance: null }, goldBefore: base.gold, goldAfter };
}

/** Skip the night (user decision 2026-11-19: the night is optional): straight to the next morning. */
export function sleep(prev: GameState): GameState {
  return { ...prev, phase: 'day', day: prev.day + 1, nightSnapshot: null, lastEnhance: null };
}

export interface LoseResult {
  state: GameState;
  livesLeft: number;
  gameOver: GameOverSummary | null;
}

/**
 * Died (or abandoned the fight). Back to the same day as it was when the night began,
 * one life fewer, that night's XP gone. Day actions were already committed, so nothing to replay.
 */
export function loseNight(prev: GameState, report: NightReport): LoseResult {
  const base: GameState = prev.nightSnapshot ? { ...prev.nightSnapshot, nightSnapshot: null } : { ...prev, nightSnapshot: null };
  const lives = Math.max(0, prev.lives - 1);
  const stats = {
    ...base.stats,
    kills: base.stats.kills + report.kills,
    nightSeconds: base.stats.nightSeconds + report.seconds,
    deaths: base.stats.deaths + 1,
  };
  const state: GameState = { ...base, phase: 'day', lives, stats };
  const gameOver: GameOverSummary | null =
    lives === 0
      ? { day: prev.day, bestLevel: stats.bestLevel, kills: stats.kills, bossesKilled: stats.bossesKilled, nightSeconds: stats.nightSeconds, playSeconds: Math.round(prev.playSeconds ?? 0), goldEarned: stats.goldEarned }
      : null;
  return { state, livesLeft: lives, gameOver };
}
