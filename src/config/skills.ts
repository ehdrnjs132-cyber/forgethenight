// Skill constellation (§17, §18). Vertical-slice set of 40 nodes; the format scales to 400+:
// every node is plain data (position, links, effects), so new nodes are appended without code changes.
import type { Element } from './weapons';

export type Branch = 'attack' | 'survival' | 'element' | 'smith';

export const BRANCHES: Record<Branch, { name: string; color: number }> = {
  attack: { name: '공격', color: 0xff6a4a },
  survival: { name: '생존', color: 0x6fd08c },
  element: { name: '원소', color: 0x7fb8ff },
  smith: { name: '대장장이·경제', color: 0xe9b65c },
};

/** Every number a node can add. All effects are additive across nodes. */
export interface SkillEffects {
  /** +% weapon damage (0.1 = +10%). */
  damage?: number;
  attackSpeed?: number;
  critChance?: number;
  /** Added to the 1.5× base crit multiplier. */
  critDamage?: number;
  /** +% attack reach. */
  area?: number;
  knockback?: number;
  maxHp?: number;
  /** HP per second. */
  regen?: number;
  /** Damage reduction fraction (capped). */
  armor?: number;
  moveSpeed?: number;
  /** Dodge cooldown reduction fraction. */
  dodgeCooldown?: number;
  /** Extra seconds of invulnerability after a hit. */
  iframes?: number;
  /** Extra damage reduction while below 30% HP. */
  lastStand?: number;
  pickup?: number;
  xp?: number;
  // fire
  burn?: number;
  blastChance?: number;
  blastDamage?: number;
  // lightning
  chainCount?: number;
  chainDamage?: number;
  // ice
  chill?: number;
  freezeChance?: number;
  shatter?: number;
  // earth
  quake?: number;
  stun?: number;
  // water
  healOnKill?: number;
  waterKnock?: number;
  /** Element nodes of other elements work at 50%. */
  resonance?: number;
  // smith & economy
  sellBonus?: number;
  discount?: number;
  heartChance?: number;
  /** Percentage points on enhancement outcomes. */
  enhanceSuccess?: number;
  enhanceGreat?: number;
  /** Percentage points taken off the destroy chance. */
  enhanceSafety?: number;
  /** +% damage with every weapon class (숙련). */
  mastery?: number;
  /** +% damage while the weapon is +20 or higher. */
  highLevel?: number;
}

export type SkillStat = keyof SkillEffects;

export interface SkillNode {
  id: string;
  branch: Branch;
  name: string;
  desc: string;
  /** Polar position from the centre: degrees (0 = right, -90 = up) and radius in px. */
  at: [number, number];
  cost: number;
  /** Neighbours. A node can be learned once any neighbour is owned. Links are treated as two-way. */
  links: string[];
  effects: SkillEffects;
  /** Major node (§17 "주요 노드"): bigger, with a detailed description. */
  keystone?: boolean;
  /** Element nodes only work with a weapon of this element (unless 원소 공명). */
  element?: Element;
}

export const ROOT_ID = 'origin';
export const CRIT_BASE = 1.5;
export const ARMOR_CAP = 0.6;
export const LAST_STAND_HP = 0.3;
/** Fire chain explosions (§18, §19): generation cap and damage falloff per generation. */
export const BLAST = { radius: 95, maxGen: 5, falloff: 0.8, perFrame: 24 };
export const CHAIN = { range: 230 };
export const CHILL = { seconds: 2, freezeSeconds: 1.4, shatterRadius: 90 };
export const QUAKE = { every: 4, radius: 170 };
export const HEAL_ON_KILL = 4;
export const RESONANCE_RATE = 0.5;

const N = (n: SkillNode) => n;

export const SKILL_NODES: SkillNode[] = [
  N({ id: ROOT_ID, branch: 'smith', name: '대장장이의 맹세', desc: '아버지의 망치를 처음 쥔 날의 맹세. 모든 길은 여기서 시작된다.', at: [0, 0], cost: 0, links: ['a1', 's1', 'e0', 'm1'], effects: {} }),

  // ── 공격 (north)
  N({ id: 'a1', branch: 'attack', name: '날카로운 일격', desc: '피해 +8%', at: [-90, 110], cost: 1, links: ['a2', 'a3'], effects: { damage: 0.08 } }),
  N({ id: 'a2', branch: 'attack', name: '단련된 손목', desc: '공격 속도 +6%', at: [-105, 200], cost: 1, links: ['a4', 'a6'], effects: { attackSpeed: 0.06 } }),
  N({ id: 'a3', branch: 'attack', name: '무게 실은 휘두름', desc: '피해 +10%', at: [-75, 200], cost: 1, links: ['a6', 'a9'], effects: { damage: 0.1 } }),
  N({ id: 'a4', branch: 'attack', name: '급소 노리기', desc: '치명타 확률 +5%', at: [-115, 290], cost: 1, links: ['a5'], effects: { critChance: 0.05 } }),
  N({ id: 'a6', branch: 'attack', name: '넓은 궤적', desc: '공격 범위 +10%', at: [-92, 290], cost: 1, links: ['a7'], effects: { area: 0.1 } }),
  N({ id: 'a9', branch: 'attack', name: '육중한 타격', desc: '넉백 +30%, 피해 +5%', at: [-68, 290], cost: 1, links: ['a10'], effects: { knockback: 0.3, damage: 0.05 } }),
  N({ id: 'a5', branch: 'attack', name: '잔혹한 일격', desc: '치명타 피해 +50%', at: [-120, 380], cost: 1, links: ['a8'], effects: { critDamage: 0.5 } }),
  N({ id: 'a7', branch: 'attack', name: '연속 공격', desc: '공격 속도 +8%', at: [-98, 380], cost: 1, links: ['a8', 'a11'], effects: { attackSpeed: 0.08 } }),
  N({ id: 'a10', branch: 'attack', name: '광폭한 궤적', desc: '공격 범위 +15%', at: [-76, 380], cost: 1, links: ['a11'], effects: { area: 0.15 } }),
  N({ id: 'a8', branch: 'attack', name: '치명의 눈', desc: '치명타 확률 +7%', at: [-110, 470], cost: 1, links: ['a12'], effects: { critChance: 0.07 } }),
  N({ id: 'a11', branch: 'attack', name: '학살자', desc: '피해 +15%', at: [-86, 470], cost: 1, links: ['a12'], effects: { damage: 0.15 } }),
  N({ id: 'a12', branch: 'attack', name: '처형인', desc: '치명타 확률 +10%, 치명타 피해 +100%.\n한 번의 휘두름이 무리를 끝낸다.', at: [-98, 570], cost: 2, links: [], effects: { critChance: 0.1, critDamage: 1 }, keystone: true }),

  // ── 생존 (west)
  N({ id: 's1', branch: 'survival', name: '단단한 몸', desc: '최대 HP +20', at: [180, 110], cost: 1, links: ['s2', 's3'], effects: { maxHp: 20 } }),
  N({ id: 's2', branch: 'survival', name: '가죽 앞치마', desc: '받는 피해 −6%', at: [165, 200], cost: 1, links: ['s4', 's6'], effects: { armor: 0.06 } }),
  N({ id: 's3', branch: 'survival', name: '숨 고르기', desc: '초당 HP 0.6 회복', at: [195, 200], cost: 1, links: ['s6', 's5'], effects: { regen: 0.6 } }),
  N({ id: 's4', branch: 'survival', name: '날랜 발', desc: '이동 속도 +6%', at: [153, 290], cost: 1, links: ['s7', 's9'], effects: { moveSpeed: 0.06 } }),
  N({ id: 's6', branch: 'survival', name: '질긴 근육', desc: '최대 HP +30', at: [180, 290], cost: 1, links: ['s7', 's8'], effects: { maxHp: 30 } }),
  N({ id: 's5', branch: 'survival', name: '구르기 달인', desc: '회피 대기시간 −15%', at: [207, 290], cost: 1, links: ['s8'], effects: { dodgeCooldown: 0.15 } }),
  N({ id: 's9', branch: 'survival', name: '수집가', desc: '경험치 흡수 범위 +40%, 경험치 +5%', at: [140, 380], cost: 1, links: [], effects: { pickup: 0.4, xp: 0.05 } }),
  N({ id: 's7', branch: 'survival', name: '쇠 앞치마', desc: '받는 피해 −8%', at: [166, 380], cost: 1, links: ['s10'], effects: { armor: 0.08 } }),
  N({ id: 's8', branch: 'survival', name: '잔상', desc: '피격 후 무적 시간 +0.2초', at: [194, 380], cost: 1, links: ['s10'], effects: { iframes: 0.2 } }),
  N({ id: 's10', branch: 'survival', name: '불굴', desc: 'HP 30% 미만일 때 받는 피해 −35%, 초당 HP 1 회복.\n쓰러지기 직전의 대장장이가 가장 단단하다.', at: [180, 470], cost: 2, links: [], effects: { lastStand: 0.35, regen: 1 }, keystone: true }),

  // ── 원소 (east): a hub, five element spokes, and resonance at the tip
  N({ id: 'e0', branch: 'element', name: '원소 감응', desc: '피해 +5%', at: [0, 110], cost: 1, links: ['f1', 'l1', 'i1', 'q1', 'w1'], effects: { damage: 0.05 } }),
  N({ id: 'f1', branch: 'element', element: 'fire', name: '불씨', desc: '화염 무기: 적중한 적이 2초 동안 피해의 20%만큼 불탄다', at: [-40, 230], cost: 1, links: ['f2'], effects: { burn: 0.2 } }),
  N({ id: 'f2', branch: 'element', element: 'fire', name: '화염 폭발', desc: '화염 무기: 처치한 적이 25% 확률로 폭발해 주변에 피해 60%.\n폭발로 쓰러진 적도 다시 폭발한다 (최대 5세대, 세대마다 −20%).', at: [-40, 360], cost: 2, links: ['e9'], effects: { blastChance: 0.25, blastDamage: 0.6 }, keystone: true }),
  N({ id: 'l1', branch: 'element', element: 'lightning', name: '정전기', desc: '번개 무기: 공격이 근처 적 1명에게 연쇄 (피해 40%)', at: [-20, 230], cost: 1, links: ['l2'], effects: { chainCount: 1, chainDamage: 0.4 } }),
  N({ id: 'l2', branch: 'element', element: 'lightning', name: '번개 연쇄', desc: '번개 무기: 연쇄 대상 +2, 연쇄 피해 +20%.\n번개가 무리 사이를 뛰어다닌다.', at: [-20, 360], cost: 2, links: ['e9'], effects: { chainCount: 2, chainDamage: 0.2 }, keystone: true }),
  N({ id: 'i1', branch: 'element', element: 'ice', name: '서리', desc: '얼음 무기: 적중한 적의 이동 속도 −30% (2초)', at: [0, 230], cost: 1, links: ['i2'], effects: { chill: 0.3 } }),
  N({ id: 'i2', branch: 'element', element: 'ice', name: '빙결', desc: '얼음 무기: 15% 확률로 적을 얼린다 (1.4초).\n얼어붙은 적을 처치하면 산산조각 나며 주변에 피해 80%.', at: [0, 360], cost: 2, links: ['e9'], effects: { freezeChance: 0.15, shatter: 0.8 }, keystone: true }),
  N({ id: 'q1', branch: 'element', element: 'earth', name: '진동', desc: '대지 무기: 4번째 공격마다 충격파 (피해 50%, 넉백)', at: [20, 230], cost: 1, links: ['q2'], effects: { quake: 0.5 } }),
  N({ id: 'q2', branch: 'element', element: 'earth', name: '대지 충격파', desc: '대지 무기: 충격파 피해 +50%, 맞은 적 0.8초 기절.\n다가오는 무리를 땅이 밀어낸다.', at: [20, 360], cost: 2, links: ['e9'], effects: { quake: 0.5, stun: 0.8 }, keystone: true }),
  N({ id: 'w1', branch: 'element', element: 'water', name: '물보라', desc: '물 무기: 넉백 +40%, 처치 시 10% 확률로 HP 4 회복', at: [40, 230], cost: 1, links: ['w2'], effects: { waterKnock: 0.4, healOnKill: 0.1 } }),
  N({ id: 'w2', branch: 'element', element: 'water', name: '밀물', desc: '물 무기: 처치 시 회복 확률 +15%, 넉백 +40%.\n밀려오는 물처럼 적을 밀어내며 버틴다.', at: [40, 360], cost: 2, links: ['e9'], effects: { healOnKill: 0.15, waterKnock: 0.4 }, keystone: true }),
  N({ id: 'e9', branch: 'element', name: '원소 공명', desc: '다른 속성의 원소 노드도 50% 효과로 작동한다.\n속성 간 시너지의 시작.', at: [0, 490], cost: 2, links: [], effects: { resonance: 1 }, keystone: true }),

  // ── 대장장이·경제 (south)
  N({ id: 'm1', branch: 'smith', name: '상인의 눈', desc: '무기 판매 가격 +15%', at: [90, 110], cost: 1, links: ['m2', 'm3'], effects: { sellBonus: 0.15 } }),
  N({ id: 'm2', branch: 'smith', name: '단골', desc: `상인 가격 −10%`, at: [72, 205], cost: 1, links: ['m4'], effects: { discount: 0.1 } }),
  N({ id: 'm3', branch: 'smith', name: '숙련된 망치질', desc: '강화 성공 확률 +2%p', at: [108, 205], cost: 1, links: ['m5'], effects: { enhanceSuccess: 2 } }),
  N({ id: 'm4', branch: 'smith', name: '무기 숙련', desc: '모든 무기 피해 +10%', at: [64, 300], cost: 1, links: ['m6'], effects: { mastery: 0.1 } }),
  N({ id: 'm5', branch: 'smith', name: '고강화 장인', desc: '+20 이상 무기 피해 +15%, 강화 대성공 +1%p', at: [116, 300], cost: 1, links: ['m6'], effects: { highLevel: 0.15, enhanceGreat: 1 } }),
  N({ id: 'm6', branch: 'smith', name: '대장장이의 직감', desc: '강화 파괴 확률 −1%p (최소 1%), 상인의 생명의 심장 등장 +15%.\n쇠가 깨지기 직전의 소리를 듣는다.', at: [90, 395], cost: 2, links: [], effects: { enhanceSafety: 1, heartChance: 0.15 }, keystone: true }),
];

export const SKILL_BY_ID: Record<string, SkillNode> = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));

/** Two-way adjacency, built once from the one-way `links` lists. */
export const SKILL_NEIGHBOURS: Record<string, string[]> = (() => {
  const m: Record<string, Set<string>> = {};
  for (const n of SKILL_NODES) m[n.id] ??= new Set();
  for (const n of SKILL_NODES)
    for (const l of n.links) {
      m[n.id].add(l);
      (m[l] ??= new Set()).add(n.id);
    }
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
})();

/** Cartesian position of a node in tree space. */
export function nodePos(n: SkillNode): { x: number; y: number } {
  const a = (n.at[0] * Math.PI) / 180;
  return { x: Math.cos(a) * n.at[1], y: Math.sin(a) * n.at[1] };
}
