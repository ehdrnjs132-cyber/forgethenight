// 왕의 하사품 (config/rentPerks.ts): three cards after every paid rent, keep one. Pure functions over GameState.
import { PERKS, PERK_BY_ID, PERK_CHOICES, PERK_ODDS, PERK_REROLL, type Perk, type PerkTier } from '../../config/rentPerks';
import { Rng } from '../rng';
import type { GameState } from '../state/types';
import { godHammer, godHammerCap } from './godHammer';

const TIERS: readonly PerkTier[] = ['rainbow', 'gold', 'silver', 'bronze'];

export function perkLevel(state: GameState, id: string): number {
  return state.perks?.[id] ?? 0;
}

/** Tier odds (%) for one card of the `rentNo`-th paid rent. */
export function tierOdds(rentNo: number): Record<PerkTier, number> {
  return (PERK_ODDS.find((o) => rentNo >= o.fromRent) ?? PERK_ODDS[PERK_ODDS.length - 1]).odds;
}

/** Perks of a tier that can still level up and are not already among `taken`. */
function open(state: GameState, tier: PerkTier, taken: readonly string[]): Perk[] {
  return PERKS.filter((p) => p.tier === tier && perkLevel(state, p.id) < p.max && !taken.includes(p.id));
}

/**
 * Roll three different cards. Each card rolls its own tier; a tier with nothing left falls to the
 * next lower one (then higher ones), so the offer is always full while anything is left.
 */
export function rollChoices(state: GameState, rentNo: number, rng: Rng): string[] {
  const odds = tierOdds(rentNo);
  const out: string[] = [];
  for (let i = 0; i < PERK_CHOICES; i++) {
    let x = rng.next() * 100;
    let tier: PerkTier = 'bronze';
    for (const t of TIERS) {
      if (x < odds[t]) {
        tier = t;
        break;
      }
      x -= odds[t];
    }
    const order = [tier, ...TIERS.slice(TIERS.indexOf(tier) + 1), ...TIERS.slice(0, TIERS.indexOf(tier)).reverse()];
    for (const t of order) {
      const pool = open(state, t, out);
      if (pool.length) {
        out.push(pool[rng.int(pool.length)].id);
        break;
      }
    }
  }
  return out;
}

/** A rent visit was paid: offer the cards (nothing when every perk is maxed). Called by collectRent. */
export function offerPerks(state: GameState, rentPaid: number): GameState {
  const rentNo = godHammer(state).rentsPaid; // already counts this visit
  const rng = new Rng(state.rng);
  const choices = rollChoices(state, rentNo, rng);
  if (!choices.length) return { ...state, rng: rng.state };
  return { ...state, rng: rng.state, perkOffer: { day: state.day, rentNo, rentPaid, choices, rerolls: 0 } };
}

export function rerollCost(state: GameState): number {
  const o = state.perkOffer;
  if (!o) return 0;
  const first = Math.max(PERK_REROLL.min, Math.round((o.rentPaid * PERK_REROLL.share) / 10) * 10);
  return first * 2 ** o.rerolls;
}

export type PerkBlock = 'none' | 'gold' | 'index';

/** 다시 뽑기: pay and see three new cards. */
export function rerollPerks(prev: GameState): { ok: true; state: GameState; cost: number } | { ok: false; reason: PerkBlock } {
  const o = prev.perkOffer;
  if (!o) return { ok: false, reason: 'none' };
  const cost = rerollCost(prev);
  if (prev.gold < cost) return { ok: false, reason: 'gold' };
  const rng = new Rng(prev.rng);
  const choices = rollChoices(prev, o.rentNo, rng);
  return { ok: true, cost, state: { ...prev, gold: prev.gold - cost, rng: rng.state, perkOffer: { ...o, choices, rerolls: o.rerolls + 1 } } };
}

/** Keep one card: its level goes up by one. 신의 숨결 also fills one 신의 망치 charge at once. */
export function pickPerk(prev: GameState, index: number): { ok: true; state: GameState; id: string; level: number } | { ok: false; reason: PerkBlock } {
  const o = prev.perkOffer;
  if (!o) return { ok: false, reason: 'none' };
  const id = o.choices[index];
  const perk = id ? PERK_BY_ID[id] : undefined;
  if (!perk) return { ok: false, reason: 'index' };
  const level = Math.min(perk.max, perkLevel(prev, id) + 1);
  let state: GameState = { ...prev, perkOffer: null, perks: { ...(prev.perks ?? {}), [id]: level } };
  if (id === 'g_breath') {
    const g = godHammer(state);
    state = { ...state, godHammer: { ...g, charges: Math.min(godHammerCap(state), g.charges + 1) } };
  }
  return { ok: true, state, id, level };
}
