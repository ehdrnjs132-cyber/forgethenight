// Selling (§14), the merchant Morr (§15) and the consumables he sells. Pure functions over GameState.
import { KEY_BASE_PRICE, ENHANCE_COST_MIN, ENHANCE_COST_RATE, ENHANCE_ITEMS, ITEMS, MERCHANT, SALE_MULTIPLIER, SALE_PRICES, SHOP_ORDER, type EnhanceItem, type ItemId } from '../../config/economy';
import { INVENTORY_CAP, INVENTORY_START, INVENTORY_STEP } from '../../config/weapons';
import { Rng } from '../rng';
import type { GameState, StockEntry } from '../state/types';
import { findWeapon, removeWeapon } from './weapons';
import { skillTotals } from './skills';

/** §14 price, log-interpolated between table rows and rounded to a readable number. */
export function salePrice(level: number): number {
  const rows = SALE_PRICES;
  if (level <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    const [l1, p1] = rows[i];
    if (level <= l1) {
      const [l0, p0] = rows[i - 1];
      const t = (level - l0) / (l1 - l0);
      return roundPrice(Math.exp(Math.log(p0) + t * (Math.log(p1) - Math.log(p0))));
    }
  }
  return rows[rows.length - 1][1];
}

function roundPrice(p: number): number {
  const step = p < 100 ? 1 : p < 1_000 ? 5 : p < 10_000 ? 50 : p < 100_000 ? 500 : 5_000;
  return Math.round(p / step) * step;
}

export type SellBlock = 'no-weapon' | 'night';

export type SellAttempt = { ok: true; state: GameState; price: number } | { ok: false; reason: SellBlock };

/** Sell a weapon for gold. It is removed for good; the sale is saved at once like any day action. */
export function sell(prev: GameState, weaponId: string): SellAttempt {
  if (prev.phase !== 'day') return { ok: false, reason: 'night' };
  const w = findWeapon(prev, weaponId);
  if (!w) return { ok: false, reason: 'no-weapon' };
  const price = sellPrice(prev, w.level);
  const state = removeWeapon(prev, weaponId);
  return {
    ok: true,
    price,
    state: {
      ...state,
      gold: prev.gold + price,
      // A sold weapon can no longer be brought back by the time stone.
      lastEnhance: null,
      stats: { ...state.stats, sold: state.stats.sold + 1, goldEarned: state.stats.goldEarned + price },
    },
  };
}

/** Sale price including 상인의 눈 and other sale bonuses. */
export function sellPrice(state: GameState, level: number): number {
  // fresh weapons are free at the forge, so an untouched +0 one is worth nothing (no free-gold loop)
  if (level <= 0) return 0;
  const bonus = skillTotals(state, null).sellBonus;
  return roundPrice(salePrice(level) * SALE_MULTIPLIER * (1 + bonus));
}

/** What Morr asks today, after 단골 discounts. */
export function shopPrice(state: GameState, entry: StockEntry): number {
  const d = Math.min(0.5, skillTotals(state, null).discount);
  return d > 0 ? Math.round((entry.price * (1 - d)) / 10) * 10 : entry.price;
}

/** Gold for one enhancement attempt: a share of the weapon's sale value (user decision 2026-11-18). */
export function enhanceCost(level: number): number {
  return Math.max(ENHANCE_COST_MIN, Math.round(salePrice(level) * ENHANCE_COST_RATE));
}

/** Next rack key: doubles with every key already bought. */
export function keyPrice(state: GameState): number {
  const bought = Math.max(0, Math.round((state.inventoryCap - INVENTORY_START) / INVENTORY_STEP));
  return KEY_BASE_PRICE * 2 ** bought;
}

// ───────────────────────── merchant

export function isMerchantDay(day: number): boolean {
  return day % MERCHANT.every === 0;
}

/** Today's stock when Morr visits. Rolled once per visiting day and saved, so a retry sees the same shelf. */
export function openMerchant(prev: GameState): GameState {
  if (!isMerchantDay(prev.day) || prev.merchant?.day === prev.day) return prev;
  const rng = new Rng(prev.rng);
  const stock: StockEntry[] = [];
  for (const item of SHOP_ORDER) {
    const def = ITEMS[item];
    if (prev.day < def.fromDay) continue;
    const chance = def.chance + (item === 'heart' ? skillTotals(prev, null).heartChance : 0);
    if (rng.next() >= chance) continue;
    if (item === 'key' && prev.inventoryCap >= INVENTORY_CAP) continue;
    stock.push({ item, price: item === 'key' ? keyPrice(prev) : def.price, left: def.perVisit });
  }
  return { ...prev, rng: rng.state, merchant: { day: prev.day, stock } };
}

/** Morr is in the forge today and the day has not turned to night. */
export function merchantHere(state: GameState): boolean {
  return state.phase === 'day' && state.merchant?.day === state.day;
}

export type BuyBlock = 'closed' | 'sold-out' | 'gold' | 'max-lives';

export type BuyAttempt = { ok: true; state: GameState } | { ok: false; reason: BuyBlock };

export function buy(prev: GameState, item: ItemId): BuyAttempt {
  if (!merchantHere(prev)) return { ok: false, reason: 'closed' };
  const entry = prev.merchant!.stock.find((s) => s.item === item);
  if (!entry || entry.left <= 0) return { ok: false, reason: 'sold-out' };
  const price = shopPrice(prev, entry);
  if (prev.gold < price) return { ok: false, reason: 'gold' };
  if (item === 'heart' && prev.lives >= MERCHANT.maxLives) return { ok: false, reason: 'max-lives' };
  const stock = prev.merchant!.stock.map((s) => (s.item === item ? { ...s, left: s.left - 1 } : s));
  let state: GameState = { ...prev, gold: prev.gold - price, merchant: { ...prev.merchant!, stock } };
  if (item === 'heart') state = { ...state, lives: state.lives + 1 };
  else if (item === 'key') state = { ...state, inventoryCap: Math.min(INVENTORY_CAP, state.inventoryCap + INVENTORY_STEP) };
  else state = { ...state, items: { ...state.items, [item]: itemCount(state, item) + 1 } };
  return { ok: true, state };
}

// ───────────────────────── consumables

export function itemCount(state: GameState, item: ItemId): number {
  return state.items[item] ?? 0;
}

export function consume(prev: GameState, item: ItemId): GameState {
  const n = itemCount(prev, item);
  if (n <= 0) return prev;
  const armed = ENHANCE_ITEMS.includes(item as EnhanceItem) && n === 1 ? { ...prev.armed, [item]: false } : prev.armed;
  return { ...prev, items: { ...prev.items, [item]: n - 1 }, armed };
}

/** An enhancement item counts only when it is switched on and owned. */
export function isArmed(state: GameState, item: EnhanceItem): boolean {
  return state.armed[item] === true && itemCount(state, item) > 0;
}

export function toggleArmed(prev: GameState, item: EnhanceItem): GameState {
  if (itemCount(prev, item) <= 0) return prev;
  return { ...prev, armed: { ...prev.armed, [item]: !prev.armed[item] } };
}

export type UndoBlock = 'no-stone' | 'nothing-to-undo';

/** Time stone (decision H): undo only the most recent attempt, before any other action. */
export function canUndo(state: GameState): UndoBlock | null {
  if (itemCount(state, 'timeStone') <= 0) return 'no-stone';
  const last = state.lastEnhance;
  if (!last || last.day !== state.day || state.phase !== 'day') return 'nothing-to-undo';
  return null;
}

export function undoEnhance(prev: GameState): { ok: true; state: GameState } | { ok: false; reason: UndoBlock } {
  const blocked = canUndo(prev);
  if (blocked) return { ok: false, reason: blocked };
  const last = prev.lastEnhance!;
  const restored = { ...last.weaponBefore };
  const exists = prev.weapons.some((w) => w.id === restored.id);
  let weapons: typeof prev.weapons;
  if (exists) weapons = prev.weapons.map((w) => (w.id === restored.id ? restored : w));
  else {
    weapons = [...prev.weapons];
    weapons.splice(Math.min(last.index, weapons.length), 0, restored);
  }
  const state = consume({ ...prev, weapons, equippedId: last.wasEquipped ? restored.id : prev.equippedId, lastEnhance: null }, 'timeStone');
  return { ok: true, state };
}
