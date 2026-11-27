// 운명의 카드 (user request 2026-11-26): two face-down cards, one O and one X. Pick one, drag to bet part
// of your gold, then the card turns: O pays the bet back doubled (stake + the same again), X loses it.
// Opens from DAY CARD_GAME.unlockDay (user: "day 10부터 나오는 게임"); one game a day.
// Pure functions over GameState.
import { CARD_GAME, WEAPON_CARD } from '../../config/economy';
import { MAX_LEVEL } from '../../config/weapons';
import { Rng } from '../rng';
import type { GameState } from '../state/types';
import { treeEffects } from './skillTree';
import { daily, withDaily } from './forgeSkills';

export type CardFace = 'O' | 'X';
export type CardBlock = 'locked' | 'played' | 'night' | 'bet';

/** Open from DAY 10 of the run. */
export function cardUnlocked(state: GameState): boolean {
  return state.day >= CARD_GAME.unlockDay;
}

/** Games played today (older saves kept only the day: 1). */
export function cardPlays(state: GameState): number {
  return state.cardDay === state.day ? (daily(state).cardPlays ?? 1) : 0;
}

/** No game left today (운명 읽기 adds one more). */
export function cardPlayedToday(state: GameState): boolean {
  return cardPlays(state) >= 1 + treeEffects(state).cardExtra;
}

export function checkCard(state: GameState, bet: number): CardBlock | null {
  if (state.phase !== 'day') return 'night';
  if (!cardUnlocked(state)) return 'locked';
  if (cardPlayedToday(state)) return 'played';
  if (!Number.isInteger(bet) || bet < 1 || bet > maxBet(state.gold)) return 'bet';
  return null;
}

/** The most one card can take: half the gold (CARD_GAME.maxShare), at least 1G. */
export function maxBet(gold: number): number {
  return gold <= 0 ? 0 : Math.max(1, Math.floor(gold * CARD_GAME.maxShare));
}

/** Bet from a slider position 0..1: that share of the most you may bet, at least 1G once the handle has moved. */
export function betFromShare(gold: number, share: number): number {
  const t = Math.max(0, Math.min(1, share));
  const cap = maxBet(gold);
  if (t <= 0 || cap <= 0) return 0;
  return Math.max(1, Math.min(cap, Math.round(cap * t)));
}

// ───────────────────────── 운명의 무기 카드 (DAY 30): the stake is ONE weapon the player picks from the rack
// (user 2026-11-26: first every weapon, then "가지고있는 무기중 선택", then "하나만 선택")
export type WeaponCardBlock = 'locked' | 'played' | 'night' | 'no-weapons' | 'pick';

export function weaponCardUnlocked(state: GameState): boolean {
  return state.day >= WEAPON_CARD.unlockDay;
}

export function weaponCardPlayedToday(state: GameState): boolean {
  return state.weaponCardDay === state.day;
}

export function checkWeaponCard(state: GameState): WeaponCardBlock | null {
  if (state.phase !== 'day') return 'night';
  if (!weaponCardUnlocked(state)) return 'locked';
  if (weaponCardPlayedToday(state)) return 'played';
  if (state.weapons.length === 0) return 'no-weapons';
  return null;
}

/** Exactly one weapon from the rack is at stake (user 2026-11-26: "하나만 선택"). */
function validStake(state: GameState, ids: readonly string[]): boolean {
  return ids.length === 1 && state.weapons.some((w) => w.id === ids[0]);
}

/** O: the chosen weapons +WEAPON_CARD.levels (up to the cap). X: the chosen weapons are destroyed. The rest are untouched. */
export function playWeaponCard(
  prev: GameState,
  pick: 0 | 1,
  weaponIds: readonly string[],
): { ok: true; state: GameState; win: boolean; faces: [CardFace, CardFace]; count: number } | { ok: false; reason: WeaponCardBlock } {
  const block = checkWeaponCard(prev);
  if (block) return { ok: false, reason: block };
  if (!validStake(prev, weaponIds)) return { ok: false, reason: 'pick' };
  const rng = new Rng(prev.rng);
  const oAt = rng.int(2) as 0 | 1;
  const faces: [CardFace, CardFace] = oAt === 0 ? ['O', 'X'] : ['X', 'O'];
  const win = pick === oAt;
  const staked = new Set(weaponIds);
  const count = staked.size;
  let state: GameState = { ...prev, rng: rng.state, weaponCardDay: prev.day, lastEnhance: null };
  if (win) {
    const weapons = prev.weapons.map((w) => (staked.has(w.id) ? { ...w, level: Math.min(MAX_LEVEL, w.level + WEAPON_CARD.levels) } : w));
    const best = Math.max(prev.stats.bestLevel, ...weapons.map((w) => w.level));
    state = { ...state, weapons, stats: { ...state.stats, bestLevel: best } };
  } else {
    const weapons = prev.weapons.filter((w) => !staked.has(w.id));
    const equippedId = prev.equippedId && staked.has(prev.equippedId) ? null : prev.equippedId;
    state = { ...state, weapons, equippedId, stats: { ...state.stats, destroyed: state.stats.destroyed + count } };
  }
  return { ok: true, state, win, faces, count };
}

export function playCard(
  prev: GameState,
  pick: 0 | 1,
  bet: number,
): { ok: true; state: GameState; win: boolean; faces: [CardFace, CardFace]; payout: number } | { ok: false; reason: CardBlock } {
  const block = checkCard(prev, bet);
  if (block) return { ok: false, reason: block };
  const rng = new Rng(prev.rng);
  const oAt = rng.int(2) as 0 | 1;
  const faces: [CardFace, CardFace] = oAt === 0 ? ['O', 'X'] : ['X', 'O'];
  const win = pick === oAt;
  // 카드 감각 (왕의 하사품): a lost bet comes partly back
  const payout = win ? bet * CARD_GAME.payoutMul : Math.floor(bet * Math.min(1, treeEffects(prev).cardRefund));
  const plays = cardPlays(prev) + 1;
  const state: GameState = withDaily({ ...prev, rng: rng.state, gold: prev.gold - bet + payout, cardDay: prev.day }, { cardPlays: plays });
  return { ok: true, state, win, faces, payout };
}
