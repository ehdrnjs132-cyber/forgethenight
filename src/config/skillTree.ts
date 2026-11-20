// Skill tree (user request 2026-11-20, after Bills Must Be Paid): four directions out of the anvil,
// every node bought ONCE with gold (no levels). Only nodes next to an owned one are shown, so the tree
// grows as you buy. Every number is a tunable balance value.
//   ⬆ 확률 (odds)   ➡ 속도 (speed)   ⬇ 골드 (gold)   ⬅ 보험 (insurance)
// Positions are grid steps from the anvil at (0, 0): x to the right, y downward.

export type Direction = 'odds' | 'speed' | 'gold' | 'insure';

/** What owned nodes add up to. Read by core/systems/skillTree.ts treeEffects(). */
export interface TreeEffects {
  /** %p added to the success / great chance; subtracted from destroy. */
  success: number;
  great: number;
  destroy: number;
  /** % of drops that become keep. */
  downKeep: number;
  /** % chance a SUCCESS becomes GREAT (기적의 불꽃). */
  miracle: number;
  /** 과열 단조: %p per success in a row, capped. */
  overheat: { per: number; max: number };
  /** % chance a SUCCESS / GREAT becomes +5 (신의 망치). */
  divine: number;
  /** Hammer speed: 1 = normal, 2 = twice as fast. */
  speed: number;
  /** Hold the 강화 button to keep enhancing. */
  holdRepeat: boolean;
  /** %p success when enhancing again within RHYTHM_SECONDS. */
  rhythm: number;
  /** Every 3rd success in a row makes the next attempt free. */
  comboFree: boolean;
  /** % chance an attempt rolls twice and keeps the better result. */
  doubleRoll: number;
  /** Sale price bonus (0.15 = +15%). */
  sell: number;
  /** Enhancement cost cut (0.15 = −15%). */
  costCut: number;
  /** Extra weapons per day. */
  extraWeapons: number;
  /** % of new weapons that arrive golden (sell ×GOLDEN_SELL_MUL). */
  golden: number;
  /** Rent cut (0.15 = −15%). */
  rentCut: number;
  /** % of a destroyed weapon's sale value paid back. */
  destroyRefund: number;
  /** 불사조의 모루: revivals per day and how much of the level comes back. */
  phoenix: { perDay: number; mode: 'none' | 'half' | 'minus2' | 'full' };
  /** 운명 분열 uses per day. */
  fateSplit: number;
  /** Protection stones given every morning. */
  morningStones: number;
  /** 왕의 자비: once per run, unpaid rent is put off to the next visit instead of ending the run. */
  mercy: boolean;
}

export const RHYTHM_SECONDS = 4;
export const GOLDEN_SELL_MUL = 2;
/** Paying the rent early (user request 2026-11-20, like paying bills early): until the king's visit. */
export const PREPAY_BONUS = { speed: 0.25, success: 1 };

export interface TreeNode {
  id: string;
  dir: Direction | 'root';
  x: number;
  y: number;
  name: string;
  desc: string;
  cost: number;
  /** Node that must be owned first (the one it grows from). */
  from: string | null;
  apply: (e: TreeEffects) => void;
}

export const DIRECTION_INFO: Record<Direction, { name: string; color: number; arrow: string }> = {
  odds: { name: '확률', color: 0x6fe0ff, arrow: '⬆' },
  speed: { name: '속도', color: 0xffd04a, arrow: '➡' },
  gold: { name: '골드', color: 0xffa13d, arrow: '⬇' },
  insure: { name: '보험', color: 0xff6f9a, arrow: '⬅' },
};

const N = (id: string, dir: TreeNode['dir'], x: number, y: number, from: string | null, cost: number, name: string, desc: string, apply: TreeNode['apply']): TreeNode => ({
  id,
  dir,
  x,
  y,
  from,
  cost,
  name,
  desc,
  apply,
});

export const TREE: readonly TreeNode[] = [
  N('root', 'root', 0, 0, null, 0, '심장의 모루', '모든 기술은 이 모루에서 뻗어 나간다', () => {}),

  // ⬆ 확률
  N('o1', 'odds', 0, -1, 'root', 60, '단단한 손목', '성공 확률 +2%p', (e) => void (e.success += 2)),
  N('o2', 'odds', 0, -2, 'o1', 200, '정밀한 눈', '파괴 확률 −1%p', (e) => void (e.destroy += 1)),
  N('o2s', 'odds', 1, -2, 'o2', 320, '굳은 쇠', '하락의 30%가 유지로 바뀐다', (e) => void (e.downKeep += 30)),
  N('o3', 'odds', 0, -3, 'o2', 650, '기적의 불꽃', '성공 시 8% 확률로 대성공(+2)', (e) => void (e.miracle += 8)),
  N('o4', 'odds', 0, -4, 'o3', 1_900, '불 조절', '성공 +3%p · 파괴 −1%p', (e) => void ((e.success += 3), (e.destroy += 1))),
  N('o4s', 'odds', -1, -4, 'o4', 2_800, '과열 단조', '연속 성공 1회마다 대성공 전환 +3%p (최대 +15%p)', (e) => void (e.overheat = { per: 3, max: 15 })),
  N('o5', 'odds', 0, -5, 'o4', 5_500, '명장의 감', '대성공 +2%p · 기적의 불꽃 +7% (총 15%)', (e) => void ((e.great += 2), (e.miracle += 7))),
  N('o6', 'odds', 0, -6, 'o5', 16_000, '신의 망치', '성공·대성공 시 2% 확률로 단숨에 +5', (e) => void (e.divine += 2)),

  // ➡ 속도
  N('s1', 'speed', 1, 0, 'root', 60, '가벼운 망치', '망치질 속도 +30%', (e) => void (e.speed += 0.3)),
  N('s2', 'speed', 2, 0, 's1', 200, '연속 강화', '강화 버튼을 길게 누르면 계속 강화한다', (e) => void (e.holdRepeat = true)),
  N('s2s', 'speed', 2, 1, 's2', 320, '리듬', `강화 후 ${RHYTHM_SECONDS}초 안에 다시 강화하면 성공 +2%p`, (e) => void (e.rhythm += 2)),
  N('s3', 'speed', 3, 0, 's2', 650, '빠른 손놀림', '망치질 속도 +40%', (e) => void (e.speed += 0.4)),
  N('s4', 'speed', 4, 0, 's3', 1_900, '짧은 숨', '결과 연출이 짧아진다 (속도 +40%)', (e) => void (e.speed += 0.4)),
  N('s4s', 'speed', 4, -1, 's4', 2_800, '몰아치기', '3연속 성공마다 다음 강화비 무료', (e) => void (e.comboFree = true)),
  N('s5', 'speed', 5, 0, 's4', 5_500, '번개 손', '망치질 속도 +60% · 리듬 +1%p', (e) => void ((e.speed += 0.6), (e.rhythm += 1))),
  N('s6', 'speed', 6, 0, 's5', 16_000, '두 번 내려치기', '강화할 때 25% 확률로 두 번 굴려 더 좋은 결과를 가진다', (e) => void (e.doubleRoll += 25)),

  // ⬇ 골드
  N('g1', 'gold', 0, 1, 'root', 60, '흥정', '판매가 +15%', (e) => void (e.sell += 0.15)),
  N('g2', 'gold', 0, 2, 'g1', 200, '절약', '강화비 −15%', (e) => void (e.costCut += 0.15)),
  N('g2s', 'gold', -1, 2, 'g2', 320, '추가 배달', '하루 받을 수 있는 무기 +1', (e) => void (e.extraWeapons += 1)),
  N('g3', 'gold', 0, 3, 'g2', 650, '황금 무기', `새 무기의 10%가 황금 무기 (판매가 ×${GOLDEN_SELL_MUL})`, (e) => void (e.golden += 10)),
  N('g4', 'gold', 0, 4, 'g3', 1_900, '단골 손님', '판매가 +25%', (e) => void (e.sell += 0.25)),
  N('g4s', 'gold', 1, 4, 'g4', 2_800, '왕과의 거래', '월세 −15%', (e) => void (e.rentCut += 0.15)),
  N('g5', 'gold', 0, 5, 'g4', 5_500, '큰 배달', '하루 무기 +2 · 황금 무기 +10%', (e) => void ((e.extraWeapons += 2), (e.golden += 10))),
  N('g6', 'gold', 0, 6, 'g5', 16_000, '연금술', '강화비 −30% · 판매가 +30%', (e) => void ((e.costCut += 0.3), (e.sell += 0.3))),

  // ⬅ 보험
  N('i1', 'insure', -1, 0, 'root', 60, '파편 줍기', '무기가 파괴되면 판매가의 20%를 돌려받는다', (e) => void (e.destroyRefund += 20)),
  N('i2', 'insure', -2, 0, 'i1', 200, '불사조의 모루', '하루 1회, 파괴된 무기가 절반 단계로 되살아난다', (e) => void (e.phoenix = { perDay: 1, mode: 'half' })),
  N('i2s', 'insure', -2, -1, 'i2', 320, '아침 보호석', '매일 아침 강화 보호석 1개', (e) => void (e.morningStones += 1)),
  N('i3', 'insure', -3, 0, 'i2', 650, '운명 분열', '하루 2회, 강화 결과 둘 중 하나를 고른다', (e) => void (e.fateSplit = Math.max(e.fateSplit, 2))),
  N('i4', 'insure', -4, 0, 'i3', 1_900, '불사조의 날개', '불사조 하루 2회 · 2단계만 내려가 되살아난다', (e) => void (e.phoenix = { perDay: 2, mode: 'minus2' })),
  N('i4s', 'insure', -4, 1, 'i4', 2_800, '왕의 자비', '월세를 못 내도 한 번은 다음 방문까지 미뤄 준다 (한 판에 1회)', (e) => void (e.mercy = true)),
  N('i5', 'insure', -5, 0, 'i4', 5_500, '운명의 실', '운명 분열 하루 5회 · 파편 줍기 +20%', (e) => void ((e.fateSplit = Math.max(e.fateSplit, 5)), (e.destroyRefund += 20))),
  N('i6', 'insure', -6, 0, 'i5', 16_000, '불멸의 모루', '불사조 하루 3회 · 원래 단계 그대로 되살아난다', (e) => void (e.phoenix = { perDay: 3, mode: 'full' })),
];

export const TREE_BY_ID: Record<string, TreeNode> = Object.fromEntries(TREE.map((n) => [n.id, n]));

export function baseEffects(): TreeEffects {
  return {
    success: 0,
    great: 0,
    destroy: 0,
    downKeep: 0,
    miracle: 0,
    overheat: { per: 0, max: 0 },
    divine: 0,
    speed: 1,
    holdRepeat: false,
    rhythm: 0,
    comboFree: false,
    doubleRoll: 0,
    sell: 0,
    costCut: 0,
    extraWeapons: 0,
    golden: 0,
    rentCut: 0,
    destroyRefund: 0,
    phoenix: { perDay: 0, mode: 'none' },
    fateSplit: 0,
    morningStones: 0,
    mercy: false,
  };
}
