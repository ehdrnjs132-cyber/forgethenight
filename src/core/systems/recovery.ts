// Out of gold (QA 2026-11-27): "무기를 팔아 골드를 마련하세요" is no help when every weapon is +0 and
// sells for 0G. What the player can really do, in order: sell a weapon that is worth something; fill
// the rack with free weapons so tomorrow's delivery overflows (extra deliveries are sold for SALE_PRICES[0]);
// or just go to the next day.
import { SALE_PRICES } from '../../config/economy';
import type { GameState } from '../state/types';
import { sellPrice } from './economy';
import { freeWeaponsLeft } from './weapons';

export type GoldRecovery = 'sell' | 'fill-rack' | 'next-day';

export function goldRecovery(state: GameState): GoldRecovery {
  if (state.weapons.some((w) => sellPrice(state, w.level, w.golden) > 0)) return 'sell';
  if (state.weapons.length < state.inventoryCap && freeWeaponsLeft(state) > 0) return 'fill-rack';
  return 'next-day';
}

/** Gold for each delivered weapon that does not fit on a full rack. */
export const OVERFLOW_GOLD = SALE_PRICES[0][1];

export function goldRecoveryText(state: GameState): string {
  switch (goldRecovery(state)) {
    case 'sell':
      return '무기를 팔아 골드를 마련하세요';
    case 'fill-rack':
      return `팔 수 있는 무기가 없습니다 (+0은 0G) · 「새 무기 받기」로 무기걸이를 채우고 「다음 날」을 누르면, 아침에 넘치는 배달 무기가 ${OVERFLOW_GOLD}G씩 팔립니다`;
    case 'next-day':
      return `팔 수 있는 무기가 없습니다 (+0은 0G) · 「다음 날」을 누르세요 · 무기걸이가 가득 차 있으면 아침 배달 무기가 ${OVERFLOW_GOLD}G씩 팔립니다`;
  }
}
