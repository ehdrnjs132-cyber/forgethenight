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
  /** Hold the 강화 button to keep enhancing. Built in since 2026-11-27 (QA); no node sets it any more. */
  holdRepeat: boolean;
  /** Extra 신의 망치 charges the hammer can hold (on top of GOD_HAMMER.cap). */
  godHammerCap: number;
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
  /** 불멸의 모루: the day's first N revivals keep the whole level. */
  phoenixFull: number;
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
  // ── 왕의 하사품 (config/rentPerks.ts, 2026-11-27): only the rent perks set these
  /** Gold every new morning. */
  morningGold: number;
  /** % chance a sale pays double. */
  saleDouble: number;
  /** Extra sale bonus for weapons at SALE_AWAKEN.level and above (0.1 = +10%). */
  awakenSell: number;
  /** All sale prices × this (황금 모루). */
  saleMul: number;
  /** The day's first sale gets this extra bonus. */
  firstSale: number;
  /** % of KEEP results that become SUCCESS. */
  keepUp: number;
  /** The day's first N strikes cost nothing. */
  freeStrikes: number;
  /** Merchant price cut (0.05 = −5%). */
  shopCut: number;
  /** Share of a lost card bet paid back. */
  cardRefund: number;
  /** Extra 운명의 카드 games a day. */
  cardExtra: number;
  /** Seconds of work each day before stamina starts to drain. */
  graceSec: number;
  /** Stones handed out with every paid rent. */
  rentProtect: number;
  rentLuck: number;
  /** Share of a paid rent given back. */
  rentKickback: number;
  /** Days added to every next rent visit. */
  rentDelay: number;
  /** %p success on the strike right after a great success. */
  greatEcho: number;
  /** %p success on the strike after every 3rd success in a row. */
  comboStrike: number;
  /** %p success per success in a row (capped at 5 × this). */
  chainSuccess: number;
  /** % chance a destroyed weapon stays, at +0. */
  grit: number;
  /** Destructions a day turned into drops. */
  secondChance: number;
  /** Destroyed weapons a day that come back at half their level. */
  feather: number;
  /** Strikes cost nothing on the day a rent was paid. */
  festival: number;
  /** Share taken off the maximum stamina (피의 거래). */
  staminaPenalty: number;
  /** Times a day an empty stamina bar refills completely. */
  refill: number;
}

export const RHYTHM_SECONDS = 4;
export const GOLDEN_SELL_MUL = 2;
/**
 * Shard refunds (skill tree and rent perks together) stop at this % of the sale price (2026-11-27: the
 * whole 보험 branch used to give back 101%, so breaking a weapon paid more than selling it).
 */
export const REFUND_CAP = 40;
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
/**
 * Distance of ring 1 from the anvil, and between rings, in px. Twice as many rings since 2026-11-27 (a star
 * was added between every two), so the step is tighter.
 */
export const RING_PX = { first: 110, step: 44 } as const;
/** Rings per step of the original layout: 3 since 2026-11-27 (two new stars on every link; it was 2, before that 1). */
export const RING_SCALE = 3;
/**
 * Price of a star: grows with the ring; big stars cost three small ones; the final star of each sector
 * three times more again (2026-11-27: "마지막 단계는 더욱 비싸지겠지"). The growth per ring is √1.62, so a
 * star that moved from ring r to ring 2r keeps the price it had.
 */
// 2026-11-27 ("후반에 갈수록 가격 갭이 좀 더 커지게"): the growth itself grows toward the edge. Per step of the
// original layout the price rises ×1.45 near the anvil and ×1.9 at the edge (it used to be ×1.62 everywhere).
export const COST = { base: 150, rate: 0.36, curve: 0.014, majorMul: 3, finalMul: 1.2 } as const;

const nice = (v: number) => (v < 1_000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100);
export function starCost(ring: number, major: boolean, final = false): number {
  const t = ring / RING_SCALE - 1;
  return nice(COST.base * Math.exp(COST.rate * t + COST.curve * t * t) * (major ? COST.majorMul : 1) * (final ? COST.finalMul : 1));
}

/** The last star of each sector: the goal at the edge of the disc. */
export const FINAL_STARS: ReadonlySet<string> = new Set(['divine', 'double', 'giant', 'alchemy', 'immortal']);

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
// 2026-11-27 (보험 too strong): +5 → +3 per star, and all refunds together stop at REFUND_CAP
const REFUND: Minor = ['파편 +3%', '무기가 파괴되면 판매가의 3%를 더 돌려받는다', (e) => void (e.destroyRefund += 3)];
/** 최대 체력 stars grow outward (+10 at the anvil … +80 at the edge) so the sector reaches 1000 (user 2026-11-26). */
const vigor = (n: number): Minor => [`체력 +${n}`, `최대 체력 +${n}`, (e) => void (e.staminaMax += n)];
const EASE: Minor = ['감소 −5%', '체력이 줄어드는 속도 −5%', (e) => void (e.drainCut += 0.05)];
/** Lucky-strike chance: +2% per star, every source the same (user 2026-11-26). */
const CALLUS: Minor = ['아끼기 +2%', `망치질할 때 2% 확률로 체력 ${STAMINA.refundSec}초분을 되찾는다`, (e) => void (e.staminaSave += 2)];

/** [id, from, ring, angle within the sector (deg), small star | big star [name, desc, effect]]. */
type Spec = readonly [string, string, number, number, Minor | { name: string; desc: string; apply: Fx }];
const BIG = (name: string, desc: string, apply: Fx) => ({ name, desc, apply });

// ── the stars added between the old ones (2026-11-27: "스킬트리 두 배로, 중간 스킬들을 많이")
// After skill-tree games (Path of Exile's small passives → notables → keystones, Grim Dawn's constellations):
// a half-step small star on every link, and on the 4th and 8th rings a named mid-tier star (a "notable").
const half = (name: string, desc: string, fx: Fx): Minor => [name, desc, fx];
const MID: Record<Direction, Minor[]> = {
  odds: [
    half('성공 +0.25%p', '성공 확률 +0.25%p', (e) => void (e.success += 0.25)),
    half('파괴 −0.25%p', '파괴 확률 −0.25%p', (e) => void (e.destroy += 0.25)),
    half('대성공 +0.25%p', '대성공 확률 +0.25%p', (e) => void (e.great += 0.25)),
  ],
  speed: [half('속도 +3%', '망치질 속도 +3%', (e) => void (e.speed += 0.03))],
  // the stamina sector keeps its 1000 maximum: its new stars slow the drain or win stamina back instead
  stamina: [half('감소 −3%', '체력이 줄어드는 속도 −3%', (e) => void (e.drainCut += 0.03)), half('아끼기 +1%', '망치질할 때 1% 확률로 체력을 되찾는다', (e) => void (e.staminaSave += 1))],
  gold: [half('판매가 +3%', '무기 판매가 +3%', (e) => void (e.sell += 0.03)), half('강화비 −3%', '강화 비용 −3%', (e) => void (e.costCut += 0.03))],
  insure: [half('파편 +1.5%', '무기가 파괴되면 판매가의 1.5%를 더 돌려받는다', (e) => void (e.destroyRefund += 1.5))],
};
type Notable = { name: string; desc: string; apply: Fx };
const NOTABLES: Record<Direction, Notable[]> = {
  odds: [
    BIG('정밀한 손', '성공 확률 +1.5%p', (e) => void (e.success += 1.5)),
    BIG('담금질', '하락의 10%가 유지로 바뀐다', (e) => void (e.downKeep += 10)),
    BIG('번뜩이는 눈', '대성공 확률 +1.5%p', (e) => void (e.great += 1.5)),
    BIG('단단한 쇠심', '파괴 확률 −1.5%p', (e) => void (e.destroy += 1.5)),
    BIG('불씨 읽기', '기적의 불꽃 +3% (성공이 대성공으로)', (e) => void (e.miracle += 3)),
  ],
  speed: [
    BIG('숙련된 손목', '망치질 속도 +12%', (e) => void (e.speed += 0.12)),
    BIG('박자 감각', '리듬 성공 보너스 +1.5%p', (e) => void (e.rhythm += 1.5)),
    BIG('쉬지 않는 팔', '망치질 속도 +12%', (e) => void (e.speed += 0.12)),
  ],
  stamina: [
    BIG('깊은 숨', '체력이 줄어드는 속도 −8%', (e) => void (e.drainCut += 0.08)),
    BIG('단련된 몸', '망치질할 때 3% 확률로 체력을 되찾는다', (e) => void (e.staminaSave += 3)),
    BIG('강철 심장', '체력이 줄어드는 속도 −6%', (e) => void (e.drainCut += 0.06)),
    BIG('굳은 손바닥', '망치질할 때 2% 확률로 체력을 되찾는다', (e) => void (e.staminaSave += 2)),
  ],
  gold: [
    BIG('흥정꾼', '무기 판매가 +12%', (e) => void (e.sell += 0.12)),
    BIG('알뜰한 대장장이', '강화 비용 −10%', (e) => void (e.costCut += 0.1)),
    BIG('왕실 연줄', '월세 −8%', (e) => void (e.rentCut += 0.08)),
    BIG('금빛 눈', '새 무기가 황금 무기일 확률 +8%', (e) => void (e.golden += 8)),
  ],
  insure: [
    BIG('파편 수집가', '무기가 파괴되면 판매가의 6%를 더 돌려받는다', (e) => void (e.destroyRefund += 6)),
    BIG('보험 증서', '하락의 10%가 유지로 바뀐다', (e) => void (e.downKeep += 10)),
  ],
};
/** Old rings whose incoming link gets a notable instead of a small star. */
const NOTABLE_RINGS: ReadonlySet<number> = new Set([4, 8]);

/**
 * A sector's stars. Each spec is laid out on ring 2r, and a new star (`<id>m`) is put on the link from its
 * parent, halfway in ring and angle; the spec now grows from that new star.
 */
function sector(dir: Direction, specs: readonly Spec[]): TreeNode[] {
  const place = (id: string, ring: number, ang: number, s: Minor | Notable, from: string, final = false): TreeNode => {
    const major = !Array.isArray(s);
    const rad = ((SECTOR_DEG[dir] + ang) * Math.PI) / 180;
    const r = RING_PX.first + (ring - 1) * RING_PX.step;
    const [name, desc, apply] = major ? [(s as Notable).name, (s as Notable).desc, (s as Notable).apply] : (s as Minor);
    return { id, dir, x: Math.round(Math.cos(rad) * r), y: Math.round(Math.sin(rad) * r), ring, major, name, desc, apply, from, cost: starCost(ring, major, final) };
  };
  const at = new Map<string, { ring: number; ang: number }>([['root', { ring: 0, ang: 0 }]]);
  const nodes: TreeNode[] = [];
  let mid = 0;
  let notable = 0;
  const bigIds = new Set<string>(['root']);
  for (const [id, from, oldRing, ang, s] of specs) {
    const ring = oldRing * RING_SCALE;
    const p = at.get(from) ?? { ring: ring - RING_SCALE, ang };
    const pAng = from === 'root' ? ang : p.ang;
    const step = (k: number) => Math.max(k, Math.round(p.ring + ((ring - p.ring) * k) / 3));
    // the star next to the spec may be a notable, but never right beside a big star (they would touch)
    const between: Minor | Notable = NOTABLE_RINGS.has(oldRing) && Array.isArray(s) ? NOTABLES[dir][notable++ % NOTABLES[dir].length] : MID[dir][mid++ % MID[dir].length];
    const near: Minor = MID[dir][mid++ % MID[dir].length];
    if (!Array.isArray(s)) bigIds.add(id);
    // 2026-11-27 ("스킬들 1.5배"): a second new star on every link, next to the parent (`<id>n`)
    nodes.push(place(`${id}n`, step(1), pAng + (ang - pAng) / 3, near, from));
    nodes.push(place(`${id}m`, step(2), pAng + ((ang - pAng) * 2) / 3, between, `${id}n`));
    nodes.push(place(id, ring, ang, s, `${id}m`, FINAL_STARS.has(id)));
    at.set(id, { ring, ang });
  }
  return nodes;
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
    // the sector's final star (2026-11-27: "신의 손길은 너무 약하다, 더 좋은 걸로"): a big step on every
    // strike, and the chosen 신의 망치 can hold a second charge
    [
      'divine',
      'od21',
      11,
      0,
      BIG('대장장이 신의 손', '성공 +5%p · 대성공 +2%p · 파괴 −3%p · 신의 망치 2회까지 충전', (e) => {
        e.success += 5;
        e.great += 2;
        e.destroy += 3;
        e.godHammerCap += 1;
      }),
    ],
  ]),

  // ⚡ 속도 — hammer speed in 5% steps; 연속 강화, 리듬, 몰아치기, 두 번 내려치기
  ...sector('speed', [
    ['sp1', 'root', 1, 0, SPEED],
    ['sp2', 'sp1', 2, 5, SPEED],
    // 2026-11-27 (QA): holding the button is built in now; this star speeds the hammer instead
    ['hold', 'sp2', 3, 0, BIG('단련된 팔', '망치질 속도 +10%', (e) => void (e.speed += 0.1))],
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
    // 불사조의 모루 moved from ring 3 to ring 7, behind 운명 분열 (user 2026-11-27: "좀 나중에 나와야"); its old
    // spot is a small star now (it swapped places with in9, so saves keep what they paid for)
    ['in9', 'in2', 3, 0, REFUND],
    ['in4', 'in9', 4, -11, REFUND],
    ['stones', 'in4', 5, -18, BIG('아침 보호석', '매일 아침 강화 보호석 1개', (e) => void (e.morningStones += 1))],
    ['in6', 'in9', 4, 10, REFUND],
    ['split', 'in6', 5, 13, BIG('운명 분열', '하루 2회, 강화 결과 둘 중 하나를 고른다', (e) => void (e.fateSplit = Math.max(e.fateSplit, 2)))],
    ['in8', 'split', 6, 8, REFUND],
    ['phoenix', 'in8', 7, 3, BIG('불사조의 모루', '하루 1회, 보호로 지정한 무기가 파괴되면 절반 단계로 되살아난다', (e) => void (e.phoenix = { perDay: 1, mode: 'half' }))],
    ['wings', 'phoenix', 8, -3, BIG('불사조의 날개', '불사조 하루 2회 · 2단계만 내려가 되살아난다', (e) => void (e.phoenix = { perDay: 2, mode: 'minus2' }))],
    ['in11', 'stones', 6, -24, REFUND],
    ['mercy', 'in11', 7, -26, BIG('왕의 자비', '월세를 못 내도 한 번은 다음 방문까지 미뤄 준다 (한 판에 1회)', (e) => void (e.mercy = true))],
    ['in14', 'wings', 9, 5, REFUND],
    ['thread', 'in14', 10, 11, BIG('운명의 실', '운명 분열 하루 3회', (e) => void (e.fateSplit = Math.max(e.fateSplit, 3)))],
    ['in16', 'wings', 9, -11, REFUND],
    ['in17', 'in16', 10, -8, REFUND],
    // 2026-11-27 (보험 too strong): 3 full revivals a day → 1 full a day, the 2nd one like 불사조의 날개
    ['immortal', 'in17', 11, -2, BIG('불멸의 모루', '불사조 하루 2회 · 그중 첫 번째는 원래 단계 그대로 되살아난다', (e) => void ((e.phoenix = { perDay: 2, mode: 'minus2' }), (e.phoenixFull = 1)))],
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
    godHammerCap: 0,
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
    phoenixFull: 0,
    fateSplit: 0,
    morningStones: 0,
    mercy: false,
    staminaMax: 0,
    drainCut: 0,
    staminaSave: 0,
    secondWind: 0,
    morningGold: 0,
    saleDouble: 0,
    awakenSell: 0,
    saleMul: 1,
    firstSale: 0,
    keepUp: 0,
    freeStrikes: 0,
    shopCut: 0,
    cardRefund: 0,
    cardExtra: 0,
    graceSec: 0,
    rentProtect: 0,
    rentLuck: 0,
    rentKickback: 0,
    rentDelay: 0,
    greatEcho: 0,
    comboStrike: 0,
    chainSuccess: 0,
    grit: 0,
    secondChance: 0,
    feather: 0,
    festival: 0,
    staminaPenalty: 0,
    refill: 0,
  };
}
