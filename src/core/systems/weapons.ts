// WeaponManager: daily grant, equip, lookup (§4, §24). Pure functions over GameState.
import { DAILY_GRANT, DROP_CLASSES, ELEMENTS, type Element, type WeaponClass } from '../../config/weapons';
import { DAILY_WEAPON_LIMIT, SALE_PRICES, WEAPON_BASE_PRICE } from '../../config/economy';
import { daily, withDaily } from './forgeSkills';
import { Rng } from '../rng';
import type { GameState, Weapon } from '../state/types';

export function findWeapon(state: GameState, id: string): Weapon | undefined {
  return state.weapons.find((w) => w.id === id);
}

export function equippedWeapon(state: GameState): Weapon | undefined {
  return state.equippedId ? findWeapon(state, state.equippedId) : undefined;
}

/** True when `id` is the only weapon left (the starter hammer, added in M3, does not count). */
export function isLastWeapon(state: GameState, id: string): boolean {
  return state.weapons.length === 1 && state.weapons[0].id === id;
}

function makeWeapon(state: GameState, cls: WeaponClass, element: Element): Weapon {
  state.weaponSeq += 1;
  return { id: `w${state.weaponSeq}`, cls, element, level: 0, bornDay: state.day };
}

export interface GrantResult {
  state: GameState;
  granted: Weapon[];
  /** Weapons that did not fit in the inventory; they are sold at the +0 price. */
  overflow: number;
  overflowGold: number;
}

/**
 * Hand out today's three weapons once per day (§4, decision #3: one per class, random element).
 * Calling it again on the same day — e.g. after dying and retrying — gives nothing.
 */
export function grantDaily(prev: GameState): GrantResult {
  if (prev.grantedDays.includes(prev.day)) return { state: prev, granted: [], overflow: 0, overflowGold: 0 };
  const state: GameState = { ...prev, weapons: [...prev.weapons], grantedDays: [...prev.grantedDays, prev.day] };
  const rng = new Rng(state.rng);
  const granted: Weapon[] = [];
  let overflow = 0;
  for (const cls of DAILY_GRANT) {
    const element = rng.pick(ELEMENTS);
    if (state.weapons.length >= state.inventoryCap) {
      overflow++;
      continue;
    }
    const w = makeWeapon(state, cls, element);
    state.weapons.push(w);
    granted.push(w);
  }
  state.rng = rng.state;
  // A full inventory sells the extra deliveries straight away (+0 price), so nothing silently vanishes.
  const overflowGold = overflow * SALE_PRICES[0][1];
  if (overflowGold) state.gold += overflowGold;
  return { state, granted, overflow, overflowGold };
}

/** Price of the next weapon bought at the forge: base × 2^(weapons already bought this run). */
export function weaponPrice(state: GameState): number {
  return WEAPON_BASE_PRICE * 2 ** (state.weaponsBought ?? 0);
}

export type WeaponBuyBlock = 'night' | 'full' | 'gold' | 'daily';

/** Extra weapons the forge button can still give today (the morning delivery counts toward the day's 6). */
export function freeWeaponsLeft(state: GameState): number {
  return Math.max(0, DAILY_WEAPON_LIMIT - DAILY_GRANT.length - daily(state).freeWeapons);
}

/** Take one fresh +0 weapon: random class and element, like the daily delivery. */
export function buyWeapon(prev: GameState): { ok: true; state: GameState; weapon: Weapon; price: number } | { ok: false; reason: WeaponBuyBlock } {
  if (prev.phase !== 'day') return { ok: false, reason: 'night' };
  if (freeWeaponsLeft(prev) <= 0) return { ok: false, reason: 'daily' };
  if (prev.weapons.length >= prev.inventoryCap) return { ok: false, reason: 'full' };
  const price = weaponPrice(prev);
  if (prev.gold < price) return { ok: false, reason: 'gold' };
  const counted = withDaily(prev, { freeWeapons: daily(prev).freeWeapons + 1 });
  const state: GameState = { ...counted, weapons: [...prev.weapons], gold: prev.gold - price, weaponsBought: (prev.weaponsBought ?? 0) + 1 };
  const rng = new Rng(state.rng);
  const w = makeWeapon(state, rng.pick(DROP_CLASSES), rng.pick(ELEMENTS));
  state.rng = rng.state;
  state.weapons.push(w);
  return { ok: true, state, weapon: w, price };
}

export function equip(prev: GameState, id: string): GameState {
  if (!findWeapon(prev, id) || prev.equippedId === id) return prev;
  return { ...prev, equippedId: id };
}

/** Remove a weapon from the inventory and unequip it if needed. */
export function removeWeapon(prev: GameState, id: string): GameState {
  return {
    ...prev,
    weapons: prev.weapons.filter((w) => w.id !== id),
    equippedId: prev.equippedId === id ? null : prev.equippedId,
  };
}
