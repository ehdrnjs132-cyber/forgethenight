// 왕의 하사품 (user request 2026-11-27, docs/rent-perks.md): every paid rent offers three passive cards and
// the player keeps one. The structure (pick one of three after paying the rent, levels like Lv 0/3) comes from
// the user's reference; every perk is our own and works through this game's systems.
// Perks add onto the same TreeEffects the skill tree fills, so every system that reads treeEffects() sees them.
import type { TreeEffects } from './skillTree';

export type PerkTier = 'bronze' | 'silver' | 'gold' | 'rainbow';

/** Icon drawn by the pick screen (presentation/ui/perkIcons.ts). */
export type PerkIcon =
  | 'hammer' | 'shield' | 'spark' | 'heart' | 'lungs' | 'wing' | 'coins' | 'scale' | 'sun' | 'shard' | 'drop'
  | 'clover' | 'vault' | 'bag' | 'flame' | 'anvil' | 'apprentice' | 'cart' | 'card' | 'dawn' | 'stone' | 'crown'
  | 'scroll' | 'chain' | 'feather' | 'blood' | 'skull' | 'gem' | 'box' | 'twin' | 'furnace' | 'eye';

export interface Perk {
  id: string;
  tier: PerkTier;
  name: string;
  max: number;
  icon: PerkIcon;
  /** What `lv` levels add up to, one short line (e.g. "성공 확률 +1.5%p"). */
  text: (lv: number) => string;
  apply: (e: TreeEffects, lv: number) => void;
  /** A trade-off perk (⚖). */
  tradeoff?: boolean;
}

export const TIER_MAX: Record<PerkTier, number> = { bronze: 3, silver: 3, gold: 2, rainbow: 1 };
export const TIER_NAME: Record<PerkTier, string> = { bronze: '브론즈', silver: '실버', gold: '골드', rainbow: '레인보우' };

/**
 * Tier odds per card (each of the three cards rolls its own tier), by the number of the rent just paid.
 * User decisions 2026-11-27: rainbow 1.5% from the third rent on (gold took the rest).
 */
export const PERK_ODDS: readonly { fromRent: number; odds: Record<PerkTier, number> }[] = [
  { fromRent: 3, odds: { bronze: 35, silver: 40, gold: 23.5, rainbow: 1.5 } },
  { fromRent: 2, odds: { bronze: 55, silver: 35, gold: 10, rainbow: 0 } },
  { fromRent: 1, odds: { bronze: 80, silver: 20, gold: 0, rainbow: 0 } },
];
export const PERK_CHOICES = 3;
/**
 * 다시 뽑기 (user 2026-11-27: "돈 내고 다시 보는걸로"): new three cards for gold. The first costs `share` of the
 * rent just paid (at least `min`), and each further one in the same visit doubles.
 */
export const PERK_REROLL = { share: 0.2, min: 50 } as const;

const n = (x: number) => (Math.round(x * 100) / 100).toString();
const pct = (x: number) => `${n(x * 100)}%`;

function P(id: string, tier: PerkTier, name: string, icon: PerkIcon, text: Perk['text'], apply: Perk['apply'], extra: Partial<Perk> = {}): Perk {
  return { id, tier, name, icon, text, apply, max: TIER_MAX[tier], ...extra };
}

// 2026-11-27 (user: "왕의 하사품들 전체적으로 버프"): the numbers went up about ×1.5 (the weakest ones more)
export const PERKS: readonly Perk[] = [
  // ───────────── bronze (Lv 0/3)
  P('b_grip', 'bronze', '단단한 손잡이', 'hammer', (l) => `성공 확률 +${n(0.8 * l)}%p`, (e, l) => { e.success += 0.8 * l; }),
  P('b_whet', 'bronze', '고운 숫돌', 'shield', (l) => `파괴 확률 −${n(0.5 * l)}%p`, (e, l) => { e.destroy += 0.5 * l; }),
  P('b_shine', 'bronze', '반짝 망치', 'spark', (l) => `대성공 확률 +${n(0.5 * l)}%p`, (e, l) => { e.great += 0.5 * l; }),
  P('b_breath', 'bronze', '숨 고르기', 'heart', (l) => `최대 체력 +${15 * l}`, (e, l) => { e.staminaMax += 15 * l; }),
  P('b_pulse', 'bronze', '느린 맥박', 'lungs', (l) => `체력이 줄어드는 속도 −${5 * l}%`, (e, l) => { e.drainCut += 0.05 * l; }),
  P('b_light', 'bronze', '가벼운 망치', 'wing', (l) => `망치질 속도 +${5 * l}%`, (e, l) => { e.speed += 0.05 * l; }),
  P('b_haggle', 'bronze', '흥정 한마디', 'coins', (l) => `무기 판매가 +${5 * l}%`, (e, l) => { e.sell += 0.05 * l; }),
  P('b_thrift', 'bronze', '아끼는 손', 'scale', (l) => `강화 비용 −${6 * l}%`, (e, l) => { e.costCut += 0.06 * l; }),
  P('b_gift', 'bronze', '이웃의 덤', 'sun', (l) => `아침마다 골드 +${60 * l}G`, (e, l) => { e.morningGold += 60 * l; }),
  P('b_scrap', 'bronze', '고철 줍기', 'shard', (l) => `무기가 부서지면 판매가의 ${5 * l}%를 돌려받음`, (e, l) => { e.destroyRefund += 5 * l; }),
  P('b_bucket', 'bronze', '담금질 물통', 'drop', (l) => `하락의 ${8 * l}%가 유지로 바뀜`, (e, l) => { e.downKeep += 8 * l; }),
  P('b_charm', 'bronze', '행운 부적', 'clover', (l) => `망치질할 때 ${2 * l}% 확률로 체력 1초분을 되찾음`, (e, l) => { e.staminaSave += 2 * l; }),
  P('b_safe', 'bronze', '작은 금고', 'vault', (l) => `월세 −${5 * l}%`, (e, l) => { e.rentCut += 0.05 * l; }),
  P('b_purse', 'bronze', '동전 주머니', 'bag', (l) => `무기를 팔 때 ${5 * l}% 확률로 판매가 2배`, (e, l) => { e.saleDouble += 5 * l; }),
  P('b_awake', 'bronze', '각성 손질', 'flame', (l) => `+10 이상 무기 판매가 +${8 * l}%`, (e, l) => { e.awakenSell += 0.08 * l; }),
  P('b_grit', 'bronze', '끈기', 'anvil', (l) => `유지 결과의 ${4 * l}%가 성공으로 바뀜`, (e, l) => { e.keepUp += 4 * l; }),
  P('b_appr', 'bronze', '견습생', 'apprentice', (l) => `하루 첫 강화 ${2 * l}번 비용 무료`, (e, l) => { e.freeStrikes += 2 * l; }),
  P('b_regular', 'bronze', '상인 단골', 'cart', (l) => `상인 Morr의 물건 −${8 * l}%`, (e, l) => { e.shopCut += 0.08 * l; }),
  P('b_cards', 'bronze', '카드 감각', 'card', (l) => `운명의 카드에서 지면 건 돈의 ${20 * l}%를 돌려받음`, (e, l) => { e.cardRefund += 0.2 * l; }),
  P('b_dawn', 'bronze', '새벽 기상', 'dawn', (l) => `하루 첫 ${2 * l}초는 체력이 줄지 않음`, (e, l) => { e.graceSec += 2 * l; }),

  // ───────────── silver (Lv 0/3)
  P('s_focus', 'silver', '장인의 집중', 'hammer', (l) => `성공 확률 +${n(1.5 * l)}%p`, (e, l) => { e.success += 1.5 * l; }),
  P('s_will', 'silver', '강철 의지', 'shield', (l) => `파괴 확률 −${n(1 * l)}%p`, (e, l) => { e.destroy += 1 * l; }),
  P('s_bolt', 'silver', '번개 손목', 'wing', (l) => `망치질 속도 +${10 * l}%`, (e, l) => { e.speed += 0.1 * l; }),
  P('s_hide', 'silver', '두꺼운 가죽', 'heart', (l) => `최대 체력 +${40 * l}`, (e, l) => { e.staminaMax += 40 * l; }),
  P('s_deep', 'silver', '깊은 호흡', 'lungs', (l) => `체력이 줄어드는 속도 −${10 * l}%`, (e, l) => { e.drainCut += 0.1 * l; }),
  P('s_market', 'silver', '시장 감각', 'coins', (l) => `무기 판매가 +${10 * l}%`, (e, l) => { e.sell += 0.1 * l; }),
  P('s_ledger', 'silver', '거래 장부', 'scroll', (l) => `강화 비용 −${12 * l}%`, (e, l) => { e.costCut += 0.12 * l; }),
  P('s_protect', 'silver', '보호석 주머니', 'stone', (l) => `월세를 낼 때마다 강화 보호석 +${2 * l}개`, (e, l) => { e.rentProtect += 2 * l; }),
  P('s_luck', 'silver', '행운석 주머니', 'clover', (l) => `월세를 낼 때마다 행운 강화석 +${2 * l}개`, (e, l) => { e.rentLuck += 2 * l; }),
  P('s_awake', 'silver', '각성의 값', 'flame', (l) => `+10 이상 무기 판매가 +${15 * l}%`, (e, l) => { e.awakenSell += 0.15 * l; }),
  P('s_wind', 'silver', '둘째 숨', 'lungs', (l) => `체력이 바닥나면 하루 1번, 최대 체력의 ${20 * l}%를 되찾음`, (e, l) => { e.secondWind += 20 * l; }),
  P('s_careful', 'silver', '꼼꼼한 손', 'drop', (l) => `하락의 ${18 * l}%가 유지로 바뀜`, (e, l) => { e.downKeep += 18 * l; }),
  P('s_echo', 'silver', '대성공의 여운', 'spark', (l) => `대성공 직후 다음 강화 성공 +${3 * l}%p`, (e, l) => { e.greatEcho += 3 * l; }),
  P('s_combo', 'silver', '연속 타격', 'chain', (l) => `3연속 성공마다 다음 강화 성공 +${5 * l}%p`, (e, l) => { e.comboStrike += 5 * l; }),
  P('s_kick', 'silver', '왕의 하사금', 'crown', (l) => `월세를 내면 낸 금액의 ${8 * l}%를 돌려받음`, (e, l) => { e.rentKickback += 0.08 * l; }),
  P('s_tough', 'silver', '근성', 'anvil', (l) => `무기가 부서질 때 ${8 * l}% 확률로 +0으로 남음`, (e, l) => { e.grit += 8 * l; }),
  P('s_fate', 'silver', '운명 읽기', 'card', () => '운명의 카드 하루 1번 더', (e, l) => { e.cardExtra += l; }, { max: 1 }),
  // (the doc's 무기걸이 확장 became 첫 손님: the rack is fixed at 4 slots since 2026-11-27)
  P('s_first', 'silver', '첫 손님', 'bag', (l) => `하루 첫 무기 판매가 +${30 * l}%`, (e, l) => { e.firstSale += 0.3 * l; }),
  P('s_risky', 'silver', '위험한 거래', 'scale', (l) => `판매가 +${25 * l}%, 대신 강화 비용 +${8 * l}%`, (e, l) => { e.sell += 0.25 * l; e.costCut -= 0.08 * l; }, { tradeoff: true }),
  P('s_hasty', 'silver', '서두르는 망치', 'wing', (l) => `망치질 속도 +${18 * l}%, 대신 파괴 확률 +${n(0.2 * l)}%p`, (e, l) => { e.speed += 0.18 * l; e.destroy -= 0.2 * l; }, { tradeoff: true }),

  // ───────────── gold (Lv 0/2)
  P('g_master', 'gold', '명장의 손', 'hammer', (l) => `성공 확률 +${3 * l}%p`, (e, l) => { e.success += 3 * l; }),
  P('g_iron', 'gold', '불굴의 쇠', 'shield', (l) => `파괴 확률 −${n(2 * l)}%p`, (e, l) => { e.destroy += 2 * l; }),
  P('g_thunder', 'gold', '천둥 망치', 'wing', (l) => `망치질 속도 +${18 * l}%`, (e, l) => { e.speed += 0.18 * l; }),
  P('g_giant', 'gold', '거인의 폐', 'heart', (l) => `최대 체력 +${100 * l}`, (e, l) => { e.staminaMax += 100 * l; }),
  P('g_calm', 'gold', '고요한 맥', 'lungs', (l) => `체력이 줄어드는 속도 −${18 * l}%`, (e, l) => { e.drainCut += 0.18 * l; }),
  P('g_royal', 'gold', '왕실 납품', 'crown', (l) => `무기 판매가 +${25 * l}%`, (e, l) => { e.sell += 0.25 * l; }),
  P('g_guild', 'gold', '길드 할인', 'scroll', (l) => `강화 비용 −${20 * l}%, 상인 물건 −${15 * l}%`, (e, l) => { e.costCut += 0.2 * l; e.shopCut += 0.15 * l; }),
  P('g_miracle', 'gold', '기적의 손끝', 'spark', (l) => `성공이 대성공으로 바뀔 확률 +${6 * l}%`, (e, l) => { e.miracle += 6 * l; }),
  P('g_second', 'gold', '두 번째 기회', 'shield', (l) => `하루 ${l}번, 파괴를 하락으로 바꿈`, (e, l) => { e.secondChance += l; }),
  P('g_breath', 'gold', '신의 숨결', 'gem', (l) => `신의 망치 최대 충전 +${l} (고를 때 1회 충전)`, (e, l) => { e.godHammerCap += l; }),
  P('g_thread', 'gold', '운명의 실타래', 'chain', (l) => `운명 분열 하루 +${l}번`, (e, l) => { e.fateSplit += l; }),
  P('g_golden', 'gold', '황금 손', 'coins', (l) => `새 무기가 황금 무기일 확률 +${12 * l}%`, (e, l) => { e.golden += 12 * l; }),
  P('g_awake', 'gold', '각성의 불꽃', 'flame', (l) => `+10 이상 무기 판매가 +${40 * l}%`, (e, l) => { e.awakenSell += 0.4 * l; }),
  P('g_vault', 'gold', '깊은 금고', 'vault', (l) => `월세 −${15 * l}%`, (e, l) => { e.rentCut += 0.15 * l; }),
  P('g_supply', 'gold', '아침 보급', 'box', () => '하루 받는 무기 +1자루', (e, l) => { e.extraWeapons += l; }, { max: 1 }),
  P('g_chain', 'gold', '연쇄 성공', 'chain', (l) => `연속 성공마다 성공 +${n(1.5 * l)}%p (최대 +${n(7.5 * l)}%p)`, (e, l) => { e.chainSuccess += 1.5 * l; }),
  P('g_fest', 'gold', '대장간 축제', 'furnace', () => '월세를 낸 날은 하루 종일 강화 비용 0', (e, l) => { e.festival += l; }, { max: 1 }),
  P('g_feather', 'gold', '불사조 깃털', 'feather', (l) => `하루 ${l}번, 부서진 무기가 절반 단계로 돌아옴`, (e, l) => { e.feather += l; }),
  P('g_blood', 'gold', '피의 거래', 'blood', (l) => `판매가 +${60 * l}%, 대신 최대 체력 −${25 * l}%`, (e, l) => { e.sell += 0.6 * l; e.staminaPenalty += 0.25 * l; }, { tradeoff: true }),
  P('g_reckless', 'gold', '무모한 망치', 'skull', (l) => `대성공 확률 +${5 * l}%p, 대신 파괴 확률 +${l}%p`, (e, l) => { e.great += 5 * l; e.destroy -= l; }, { tradeoff: true }),

  // ───────────── rainbow (Lv 0/1)
  P('r_favor', 'rainbow', '왕의 총애', 'crown', () => '이후 모든 월세 −40%, 수금일이 매번 하루 늦어짐', (e, l) => { e.rentCut += 0.4 * l; e.rentDelay += l; }),
  P('r_bless', 'rainbow', '대장장이 신의 축복', 'gem', () => '모든 강화 성공 +6%p, 파괴 −3%p', (e, l) => { e.success += 6 * l; e.destroy += 3 * l; }),
  P('r_furnace', 'rainbow', '꺼지지 않는 화로', 'furnace', () => '최대 체력 +50, 체력이 바닥나면 하루 1번 가득 다시 참', (e, l) => { e.refill += l; e.staminaMax += 50 * l; }),
  P('r_anvil', 'rainbow', '황금 모루', 'anvil', () => '모든 무기 판매가 ×2', (e, l) => { e.saleMul *= 1 + l; }),
  P('r_twin', 'rainbow', '쌍둥이 망치', 'twin', () => '강화할 때 45% 확률로 두 번 굴려 더 좋은 결과를 가짐', (e, l) => { e.doubleRoll += 45 * l; }),
];

export const PERK_BY_ID: Readonly<Record<string, Perk>> = Object.fromEntries(PERKS.map((p) => [p.id, p]));

/** Add the owned perks onto effects the tree already filled. */
export function applyPerks(e: TreeEffects, perks: Readonly<Record<string, number>> | undefined): void {
  if (!perks) return;
  for (const p of PERKS) {
    const lv = Math.min(p.max, perks[p.id] ?? 0);
    if (lv > 0) p.apply(e, lv);
  }
}

export { pct as perkPct };
