// Gold and the merchant (§14, §15). Every number is a tunable balance value.

/** §14 sale prices: [level, gold]. Levels between rows are log-interpolated. */
export const SALE_PRICES: readonly [number, number][] = [
  [0, 10],
  [5, 40],
  [10, 150],
  [15, 500],
  [20, 1_500],
  [25, 5_000],
  [30, 15_000],
  [35, 50_000],
  [40, 150_000],
  [45, 500_000],
  [50, 1_500_000],
];

/** Selling a weapon at or above this level asks for confirmation. */
export const SALE_CONFIRM_LEVEL = 10;

/**
 * Enhancing costs gold (user decision 2026-11-18, replacing §5 "강화 골드 비용 없음"):
 * each attempt costs this share of the weapon's current sale price, at least ENHANCE_COST_MIN.
 */
// User decision 2026-11-18 (after the reboot spec said free): enhancing costs gold again.
// Set both to 0 to make the Heart Anvil free.
export const ENHANCE_COST_RATE = 0.1;
export const ENHANCE_COST_MIN = 1;

/** Rack keys at the merchant: each opens one locked slot; price doubles with each key bought. */
export const KEY_BASE_PRICE = 300;

export type ItemId = 'heart' | 'protect' | 'revive' | 'luck' | 'master' | 'timeStone' | 'resetBook' | 'key';

/** Items that can be switched on before an enhancement attempt. */
export type EnhanceItem = 'protect' | 'luck' | 'master';
export const ENHANCE_ITEMS: readonly EnhanceItem[] = ['protect', 'luck', 'master'];

export interface ItemDef {
  name: string;
  desc: string;
  price: number;
  /** Most copies offered in one visit. */
  perVisit: number;
  /** Chance the item is in stock on a visit (1 = always considered). */
  chance: number;
  /** First day it can appear. */
  fromDay: number;
  color: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  heart: { name: '생명의 심장', desc: '즉시 목숨 +1 (최대 10)', price: 3_000, perVisit: 1, chance: 0.3, fromDay: 1, color: 0xff5a6a },
  protect: { name: '강화 보호석', desc: '켜 두면 하락·파괴를 유지로 바꾸고 소모', price: 1_200, perVisit: 2, chance: 1, fromDay: 1, color: 0x6fc3ff },
  revive: { name: '부활석', desc: '밤에 쓰러지면 목숨 감소 없이 HP 50% 부활', price: 1_500, perVisit: 1, chance: 0.8, fromDay: 1, color: 0xffd36b },
  luck: { name: '행운 강화석', desc: '켜 두면 다음 강화 대성공 +3%p, 성공 +5%p', price: 800, perVisit: 2, chance: 0.8, fromDay: 1, color: 0x8fe07a },
  master: { name: '장인의 강화석', desc: '켜 두면 다음 강화의 파괴 확률 절반', price: 2_000, perVisit: 1, chance: 0.5, fromDay: 1, color: 0xc89bff },
  timeStone: { name: '시간 역행석', desc: '직전 강화 1회를 되돌림 · 파괴된 무기도 복원', price: 3_000, perVisit: 1, chance: 0.15, fromDay: 15, color: 0x7fe9e0 },
  key: { name: '무기보관함 열쇠', desc: '무기걸이의 잠긴 칸 하나를 엽니다 (최대 8칸)', price: KEY_BASE_PRICE, perVisit: 1, chance: 1, fromDay: 1, color: 0xc8a06a },
  resetBook: { name: '스킬 초기화 서적', desc: '스킬 포인트를 모두 돌려받아 다시 찍는다', price: 1_000, perVisit: 1, chance: 0.4, fromDay: 1, color: 0xd9c7a0 },
};

/** Display order in the shop. */
export const SHOP_ORDER: readonly ItemId[] = ['key', 'heart', 'timeStone', 'protect', 'master', 'revive', 'luck', 'resetBook'];

export const LUCK_BONUS = { great: 3, success: 5 };
/** The master stone multiplies the destroy chance by this. */
export const MASTER_DESTROY_MUL = 0.5;

export const MERCHANT = {
  name: 'Morr',
  /** Visits on DAY 3, 6, 9 … (§15). */
  every: 3,
  maxLives: 10,
};

export const REVIVE = { hpFraction: 0.5, invuln: 3 };
