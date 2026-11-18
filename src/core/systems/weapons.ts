// WeaponManager: daily grant, equip, lookup (§4, §24). Pure functions over GameState.
import { DAILY_GRANT, ELEMENTS, type Element, type WeaponClass } from '../../config/weapons';
import { SALE_PRICES } from '../../config/economy';
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
