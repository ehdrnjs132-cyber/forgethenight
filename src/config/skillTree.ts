// Skill tree — a star disc (user request 2026-11-26, after a constellation-style reference): five
// sectors around the anvil, each a constellation of SMALL stars (+5% / +0.5%p steps) with BIG stars
// (special skills) along the way. Every star is bought once with gold, only next to an owned one, and
// stars further from the anvil cost more. Every number is a tunable balance value.
//   확률 (odds) · 속도 (speed) · 체력 (stamina) · 골드 (gold) · 보험 (insurance), clockwise from the top.
// (2026-11-20 → 2026-11-26: the old 4-direction tree of 29 big nodes was split into these small steps;
//  old saves get the gold for their old nodes back, see LEGACY_TREE_COSTS.)

export type Direction = 'odds' | 'speed' | 'stamina' | 'gold' | 'insure';

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
  /** Hammer speed: 1 = normal, 2 = twice as fast. Starts at BASE_SPEED. */
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
  /** 체력: added to STAMINA.max. */
  staminaMax: number;
  /** 체력: share taken off the drain per second (0.05 = −5%, capped at STAMINA.maxCut). */
  drainCut: number;
  /** % chance a strike wins back STAMINA.refundSec seconds of stamina (굳은 살). */
  staminaSave: number;
  /** 두 번째 바람: once a day, stamina that runs out comes back by this % of the maximum. */
  secondWind: number;
}

export const RHYTHM_SECONDS = 4;
export const GOLDEN_SELL_MUL = 2;
/** Hammer speed before any skill: 50% slower than the old normal (user decision 2026-11-26). */
export const BASE_SPEED = 0.5;
/**
 * The blacksmith's stamina (user decisions 2026-11-26). It used to cost 20 per strike; the user then asked
 * for a slow drain instead, because a per-strike cost made the speed stars pointless: from the first strike
 * of the day stamina drains `drainPerSec` every second while the forge is open, refilled each morning.
 * At first that is only ten seconds of work a day — harsh on purpose ("유저를 화나게") — and the 체력 stars
 * make it bearable: more stamina, a slower drain (up to −maxCut), stamina won back on lucky strikes.
 */
export const STAMINA = { max: 100, drainPerSec: 10, maxCut: 0.6, refundSec: 1 } as const;

export interface TreeNode {
  id: string;
  dir: Direction | 'root';
  /** Position on the star disc in px from the anvil at (0, 0): x to the right, y downward. */
  x: number;
  y: number;
  /** Ring (distance step) from the anvil; prices grow with it. */
  ring: number;
  /** A big star: a special skill. Small stars are +5% / +0.5%p steps. */
  major: boolean;
  name: string;
  desc: string;
  cost: number;
  /** Node that must be owned first (the one it grows from). */
  from: string | null;
  apply: (e: TreeEffects) => void;
}

export const DIRECTION_INFO: Record<Direction, { name: string; color: number; arrow: string }> = {
  odds: { name: '확률', color: 0x6fe0ff, arrow: '✦' },
  speed: { name: '속도', color: 0xffd04a, arrow: '⚡' },
  stamina: { name: '체력', color: 0x7dff8a, arrow: '♥' },
  gold: { name: '골드', color: 0xffa13d, arrow: '◆' },
  insure: { name: '보험', color: 0xff6f9a, arrow: '✚' },
};

/** Sector centres on the disc (degrees, 0 = right, clockwise because y points down). */
export const SECTOR_DEG: Record<Direction, number> = { odds: -90, speed: -18, stamina: 54, gold: 126, insure: 198 };
/** Distance of ring 1 from the anvil, and between rings, in px. */
export const RING_PX = { first: 120, step: 50 } as const;
/** Price of a star: grows with the ring; big stars cost three small ones. */
export const COST = { base: 150, growth: 1.62, majorMul: 3 } as const;

const nice = (v: number) => (v < 1_000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100);
export function starCost(ring: number, major: boolean): number {
  return nice(COST.base * Math.pow(COST.growth, ring - 1) * (major ? COST.majorMul : 1));
}

type Fx = (e: TreeEffects) => void;
/** A small star: [short name, description, effect]. */
type Minor = readonly [string, string, Fx];

// ── small stars (each one a small step, user request 2026-11-26)
const SUCCESS: Minor = ['성공 +0.5%p', '성공 확률 +0.5%p', (e) => void (e.success += 0.5)];
const SAFE: Minor = ['파괴 −0.5%p', '파괴 확률 −0.5%p', (e) => void (e.destroy += 0.5)];
const GREAT: Minor = ['대성공 +0.5%p', '대성공 확률 +0.5%p', (e) => void (e.great += 0.5)];
const SPEED: Minor = ['속도 +5%', '망치질 속도 +5%', (e) => void (e.speed += 0.05)];
const RHYTHM: Minor = ['리듬 +0.5%p', `리듬 성공 보너스 +0.5%p`, (e) => void (e.rhythm += 0.5)];
const SELL: Minor = ['판매가 +5%', '무기 판매가 +5%', (e) => void (e.sell += 0.05)];
const THRIFT: Minor = ['강화비 −5%', '강화 비용 −5%', (e) => void (e.costCut += 0.05)];
const RENT: Minor = ['월세 −5%', '월세 −5%', (e) => void (e.rentCut += 0.05)];
const GOLDEN: Minor = ['황금 +5%', '새 무기가 황금 무기일 확률 +5%', (e) => void (e.golden += 5)];
const REFUND: Minor = ['파편 +5%', '무기가 파괴되면 판매가의 5%를 더 돌려받는다', (e) => void (e.destroyRefund += 5)];
/** 최대 체력 stars grow outward (+10 at the anvil … +80 at the edge) so the sector reaches 1000 (user 2026-11-26). */
const vigor = (n: number): Minor => [`체력 +${n}`, `최대 체력 +${n}`, (e) => void (e.staminaMax += n)];
const EASE: Minor = ['감소 −5%', '체력이 줄어드는 속도 −5%', (e) => void (e.drainCut += 0.05)];
/** Lucky-strike chance: +2% per star, every source the same (user 2026-11-26). */
const CALLUS: Minor = ['아끼기 +2%', `망치질할 때 2% 확률로 체력 ${STAMINA.refundSec}초분을 되찾는다`, (e) => void (e.staminaSave += 2)];

/** [id, from, ring, angle within the sector (deg), small star | big star [name, desc, effect]]. */
type Spec = readonly [string, string, number, number, Minor | { name: string; desc: string; apply: Fx }];
const BIG = (name: string, desc: string, apply: Fx) => ({ name, desc, apply });

function sector(dir: Direction, specs: readonly Spec[]): TreeNode[] {
  return specs.map(([id, from, ring, ang, s]) => {
    const major = !Array.isArray(s);
    const rad = ((SECTOR_DEG[dir] + ang) * Math.PI) / 180;
    const r = RING_PX.first + (ring - 1) * RING_PX.step;
    const [name, desc, apply] = major ? [(s as { name: string }).name, (s as { desc: string }).desc, (s as { apply: Fx }).apply] : (s as Minor);
    return { id, dir, x: Math.round(Math.cos(rad) * r), y: Math.round(Math.sin(rad) * r), ring, major, name, desc, apply, from, cost: starCost(ring, major) };
  });
}

export const TREE: readonly TreeNode[] = [
  { id: 'root', dir: 'root', x: 0, y: 0, ring: 0, major: true, name: '심장의 모루', desc: '모든 기술은 이 모루에서 뻗어 나간다', cost: 0, from: null, apply: () => {} },

  // ✦ 확률 — success / destroy / great in 0.5%p steps; 굳은 쇠, 기적의 불꽃, 과열 단조, 명장의 감, 신의 망치
  ...sector('odds', [
    ['od1', 'root', 1, 0, SUCCESS],
    ['od2', 'od1', 2, -6, SAFE],
    ['od3', 'od2', 3, 0, SUCCESS],
    ['harden', 'od3', 3, 18, BIG('굳은 쇠', '하락의 30%가 유지로 바뀐다', (e) => void (e.downKeep += 30))],
    ['od5', 'od3', 4, -5, SUCCESS],
    ['miracle', 'od5', 5, 3, BIG('기적의 불꽃', '성공 시 8% 확률로 대성공(+2)', (e) => void (e.miracle += 8))],
    ['od7', 'miracle', 5, -19, GREAT],
    ['od8', 'od7', 6, -26, GREAT],
    ['od9', 'miracle', 6, 6, SUCCESS],
    ['od10', 'od9', 7, 0, SAFE],
    ['od11', 'harden', 4, 24, SAFE],
    ['od12', 'od11', 5, 27, SUCCESS],
    ['od13', 'od12', 6, 22, SAFE],
    ['overheat', 'od13', 7, 19, BIG('과열 단조', '연속 성공 1회마다 대성공 전환 +3%p (최대 +15%p)', (e) => void (e.overheat = { per: 3, max: 15 }))],
    ['od15', 'od10', 8, -5, SUCCESS],
    ['od16', 'od15', 8, -18, GREAT],
    ['od17', 'od8', 7, -29, SUCCESS],
    ['od18', 'od17', 8, -27, SAFE],
    ['master', 'od15', 9, 2, BIG('명장의 감', '기적의 불꽃 +7% (총 15%)', (e) => void (e.miracle += 7))],
    ['od20', 'od16', 9, -16, GREAT],
    ['od21', 'master', 10, 8, SUCCESS],
    ['od22', 'od20', 10, -19, SAFE],
    ['divine', 'od21', 11, 0, BIG('신의 망치', '성공·대성공 시 2% 확률로 단숨에 +5', (e) => void (e.divine += 2))],
  ]),

  // ⚡ 속도 — hammer speed in 5% steps; 연속 강화, 리듬, 몰아치기, 두 번 내려치기
  ...sector('speed', [
    ['sp1', 'root', 1, 0, SPEED],
    ['sp2', 'sp1', 2, 5, SPEED],
    ['hold', 'sp2', 3, 0, BIG('연속 강화', '강화 버튼을 길게 누르면 계속 강화한다', (e) => void (e.holdRepeat = true))],
    ['sp4', 'hold', 4, -8, SPEED],
    ['sp5', 'sp4', 5, -14, SPEED],
    ['rhythm', 'sp5', 6, -21, BIG('리듬', `강화 후 ${RHYTHM_SECONDS}초 안에 다시 강화하면 성공 +2%p`, (e) => void (e.rhythm += 2))],
    ['sp7', 'hold', 4, 11, SPEED],
    ['sp8', 'sp7', 5, 18, SPEED],
    ['sp9', 'sp8', 6, 11, SPEED],
    ['sp20', 'sp8', 6, 27, SPEED],
    ['sp10', 'sp9', 7, 5, SPEED],
    ['combo', 'sp10', 8, 10, BIG('몰아치기', '3연속 성공마다 다음 강화비 무료', (e) => void (e.comboFree = true))],
    ['sp12', 'rhythm', 7, -26, RHYTHM],
    ['sp13', 'sp12', 8, -19, SPEED],
    ['sp14', 'sp13', 9, -11, SPEED],
    ['sp15', 'combo', 9, 19, SPEED],
    ['sp16', 'sp15', 10, 24, SPEED],
    ['sp17', 'sp14', 10, -5, SPEED],
    ['double', 'sp17', 11, 2, BIG('두 번 내려치기', '강화할 때 25% 확률로 두 번 굴려 더 좋은 결과를 가진다', (e) => void (e.doubleRoll += 25))],
    ['sp19', 'sp16', 11, 21, SPEED],
  ]),

  // ♥ 체력 — max stamina +10…+80 (100 → 1000 with the whole sector), drain −5%, lucky strikes +2%;
  // 굳은 살 (small), 든든한 아침, 두 번째 바람, 불굴, 거인의 심장
  ...sector('stamina', [
    ['st1', 'root', 1, 0, vigor(10)],
    ['st2', 'st1', 2, -6, EASE],
    ['st3', 'st2', 3, 0, vigor(20)],
    ['callus', 'st3', 4, -10, ['굳은 살', `망치질할 때 2% 확률로 체력 ${STAMINA.refundSec}초분을 되찾는다`, (e) => void (e.staminaSave += 2)]],
    ['st5', 'st3', 4, 10, vigor(30)],
    ['st6', 'st5', 5, 15, EASE],
    ['breakfast', 'st6', 6, 8, BIG('든든한 아침', '최대 체력 +50', (e) => void (e.staminaMax += 50))],
    ['st8', 'callus', 5, -18, CALLUS],
    ['st9', 'st8', 6, -21, vigor(40)],
    ['st10', 'st9', 7, -18, EASE],
    ['st11', 'breakfast', 7, 11, vigor(50)],
    ['st12', 'st11', 8, 6, EASE],
    ['wind', 'st12', 9, 0, BIG('두 번째 바람', '하루 한 번, 체력이 바닥나면 최대 체력의 30%를 되찾는다', (e) => void (e.secondWind = Math.max(e.secondWind, 30)))],
    ['st14', 'st10', 8, -16, CALLUS],
    ['st15', 'st14', 9, -11, vigor(60)],
    ['st16', 'wind', 10, 5, vigor(70)],
    ['st17', 'st15', 10, -8, EASE],
    ['iron', 'st16', 11, 1, BIG('불굴', '체력이 줄어드는 속도 −15% · 되찾기 확률 +2%', (e) => void ((e.drainCut += 0.15), (e.staminaSave += 2)))],
    ['st19', 'st17', 11, -13, vigor(80)],
    // the outer arc of pure stamina, out to the biggest heart
    ['st20', 'st5', 5, 28, vigor(30)],
    ['st21', 'st20', 6, 28, vigor(40)],
    ['st22', 'st21', 7, 26, vigor(50)],
    ['st23', 'st22', 8, 22, vigor(60)],
    ['st24', 'st23', 9, 18, vigor(60)],
    ['st25', 'st24', 10, 20, vigor(70)],
    ['st26', 'st25', 11, 18, vigor(80)],
    ['giant', 'st26', 12, 10, BIG('거인의 심장', '최대 체력 +100', (e) => void (e.staminaMax += 100))],
  ]),

  // ◆ 골드 — sale +5%, cost −5%, rent −5%, golden +5%; 추가 배달, 황금 무기, 큰 배달, 연금술
  ...sector('gold', [
    ['gd1', 'root', 1, 0, SELL],
    ['gd2', 'gd1', 2, -6, THRIFT],
    ['gd3', 'gd2', 3, 0, SELL],
    ['delivery', 'gd3', 4, -11, BIG('추가 배달', '하루 받을 수 있는 무기 +1', (e) => void (e.extraWeapons += 1))],
    ['gd5', 'gd3', 4, 10, THRIFT],
    ['gd6', 'gd5', 5, 16, SELL],
    ['golden', 'gd6', 6, 22, BIG('황금 무기', `새 무기의 10%가 황금 무기 (판매가 ×${GOLDEN_SELL_MUL})`, (e) => void (e.golden += 10))],
    ['gd8', 'delivery', 5, -18, RENT],
    ['gd9', 'gd8', 6, -24, RENT],
    ['gd10', 'gd9', 7, -27, RENT],
    ['gd11', 'gd6', 6, 6, THRIFT],
    ['gd12', 'gd11', 7, 2, SELL],
    ['bigDelivery', 'gd12', 8, -5, BIG('큰 배달', '하루 무기 +2', (e) => void (e.extraWeapons += 2))],
    ['gd14', 'golden', 7, 27, GOLDEN],
    ['gd15', 'gd14', 8, 24, SELL],
    ['gd16', 'bigDelivery', 9, 0, THRIFT],
    ['gd17', 'gd16', 10, -6, SELL],
    ['gd18', 'gd15', 9, 18, GOLDEN],
    ['gd19', 'gd10', 8, -24, SELL],
    ['alchemy', 'gd17', 11, 0, BIG('연금술', '강화비 −15% · 판매가 +20%', (e) => void ((e.costCut += 0.15), (e.sell += 0.2)))],
    ['gd21', 'gd18', 10, 15, THRIFT],
  ]),

  // ✚ 보험 — shard refund +5%; 불사조의 모루, 아침 보호석, 운명 분열, 불사조의 날개, 왕의 자비, 운명의 실, 불멸의 모루
  ...sector('insure', [
    ['in1', 'root', 1, 0, REFUND],
    ['in2', 'in1', 2, 6, REFUND],
    ['phoenix', 'in2', 3, 0, BIG('불사조의 모루', '하루 1회, 파괴된 무기가 절반 단계로 되살아난다', (e) => void (e.phoenix = { perDay: 1, mode: 'half' }))],
    ['in4', 'phoenix', 4, -11, REFUND],
    ['stones', 'in4', 5, -18, BIG('아침 보호석', '매일 아침 강화 보호석 1개', (e) => void (e.morningStones += 1))],
    ['in6', 'phoenix', 4, 10, REFUND],
    ['split', 'in6', 5, 13, BIG('운명 분열', '하루 2회, 강화 결과 둘 중 하나를 고른다', (e) => void (e.fateSplit = Math.max(e.fateSplit, 2)))],
    ['in8', 'split', 6, 8, REFUND],
    ['in9', 'in8', 7, 3, REFUND],
    ['wings', 'in9', 8, -3, BIG('불사조의 날개', '불사조 하루 2회 · 2단계만 내려가 되살아난다', (e) => void (e.phoenix = { perDay: 2, mode: 'minus2' }))],
    ['in11', 'stones', 6, -24, REFUND],
    ['mercy', 'in11', 7, -26, BIG('왕의 자비', '월세를 못 내도 한 번은 다음 방문까지 미뤄 준다 (한 판에 1회)', (e) => void (e.mercy = true))],
    ['in14', 'wings', 9, 5, REFUND],
    ['thread', 'in14', 10, 11, BIG('운명의 실', '운명 분열 하루 5회', (e) => void (e.fateSplit = Math.max(e.fateSplit, 5)))],
    ['in16', 'wings', 9, -11, REFUND],
    ['in17', 'in16', 10, -8, REFUND],
    ['immortal', 'in17', 11, -2, BIG('불멸의 모루', '불사조 하루 3회 · 원래 단계 그대로 되살아난다', (e) => void (e.phoenix = { perDay: 3, mode: 'full' }))],
  ]),
];

export const TREE_BY_ID: Record<string, TreeNode> = Object.fromEntries(TREE.map((n) => [n.id, n]));

/** Gold paid for the nodes of the old 4-direction tree (2026-11-20); refunded once when a save still has them. */
export const LEGACY_TREE_COSTS: Record<string, number> = Object.fromEntries(
  ['o', 's', 'g', 'i'].flatMap((p) =>
    Object.entries({ '1': 60, '2': 200, '2s': 320, '3': 650, '4': 1_900, '4s': 2_800, '5': 5_500, '6': 16_000 }).map(([k, v]) => [`${p}${k}`, v]),
  ),
);

export function baseEffects(): TreeEffects {
  return {
    success: 0,
    great: 0,
    destroy: 0,
    downKeep: 0,
    miracle: 0,
    overheat: { per: 0, max: 0 },
    divine: 0,
    speed: BASE_SPEED,
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
    staminaMax: 0,
    drainCut: 0,
    staminaSave: 0,
    secondWind: 0,
  };
}
