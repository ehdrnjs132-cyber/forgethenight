// Enhancement skill tree (user spec 2026-11-19, "강화 스킬트리 1차"): five skills, five levels each.
// The night is an optional gamble now, so skills are bought with gold (earned by selling weapons),
// never with anything a free action can farm. Every number here is a tunable balance value.

export type ForgeSkillId = 'miracle' | 'overheat' | 'phoenix' | 'fateSplit' | 'divine';

export interface ForgeSkillDef {
  id: ForgeSkillId;
  name: string;
  /** One line on what it does. */
  summary: string;
  /** Gold to reach level 1..5 (index 0 = cost of Lv1). */
  cost: readonly number[];
  /** Skill that must be at least Lv1 before this one appears (the chain reveals one by one). */
  requires: ForgeSkillId | null;
  color: number;
}

export const MAX_SKILL_LEVEL = 5;

/** Display and unlock order: each one appears once the previous one is learned. */
export const FORGE_SKILLS: readonly ForgeSkillDef[] = [
  { id: 'miracle', name: '기적의 불꽃', summary: '성공이 나오면 일정 확률로 대성공(+2)으로 바뀐다', cost: [300, 900, 2_500, 7_000, 18_000], requires: null, color: 0xffb347 },
  { id: 'overheat', name: '과열 단조', summary: '연속 성공할수록 다음 성공이 대성공으로 바뀔 확률이 오른다', cost: [600, 1_800, 5_000, 14_000, 36_000], requires: 'miracle', color: 0xff6a3a },
  { id: 'phoenix', name: '불사조의 모루', summary: '파괴된 무기를 하루 정해진 횟수만큼 되살린다', cost: [1_500, 4_500, 12_000, 32_000, 80_000], requires: 'overheat', color: 0xff4fa0 },
  { id: 'fateSplit', name: '운명 분열', summary: '강화 결과 두 개를 보고 하나를 고른다 (하루 횟수 제한)', cost: [2_500, 7_500, 20_000, 55_000, 140_000], requires: 'phoenix', color: 0x9b7bff },
  { id: 'divine', name: '신의 망치', summary: '성공·대성공이 드물게 +5 상승으로 바뀐다', cost: [5_000, 15_000, 40_000, 110_000, 300_000], requires: 'fateSplit', color: 0xffe27a },
];

export const FORGE_SKILL_BY_ID: Record<ForgeSkillId, ForgeSkillDef> = Object.fromEntries(FORGE_SKILLS.map((s) => [s.id, s])) as Record<ForgeSkillId, ForgeSkillDef>;

/** Level tables: index = level (0 = not learned). */
export const SKILL_TABLE = {
  /** 기적의 불꽃: chance (%) that a SUCCESS becomes a GREAT_SUCCESS. */
  miracle: [0, 3, 6, 9, 12, 15],
  /** 과열 단조: per consecutive success (%p) and the cap (%p). */
  overheat: [
    { per: 0, max: 0 },
    { per: 2, max: 10 },
    { per: 3, max: 15 },
    { per: 4, max: 20 },
    { per: 5, max: 25 },
    { per: 6, max: 30 },
  ],
  /** 불사조의 모루: revivals per day and the level the weapon comes back at. */
  phoenix: [
    { perDay: 0, level: 0 },
    { perDay: 1, level: 0 },
    { perDay: 1, level: 3 },
    { perDay: 1, level: 5 },
    { perDay: 2, level: 5 },
    { perDay: 2, level: 10 },
  ],
  /** 운명 분열: uses per day. */
  fateSplit: [0, 1, 2, 3, 4, 5],
  /** 신의 망치: chance (%) that a SUCCESS or GREAT_SUCCESS becomes +5. */
  divine: [0, 0.5, 1, 1.5, 2, 2.5],
} as const;

/** Levels gained by 신의 망치. */
export const DIVINE_STEP = 5;

/** Plain-language effect of a skill at a level (for the skill screen). */
export function skillEffectText(id: ForgeSkillId, level: number): string {
  if (level <= 0) return '아직 배우지 않음';
  switch (id) {
    case 'miracle':
      return `성공 시 ${SKILL_TABLE.miracle[level]}% 확률로 대성공`;
    case 'overheat': {
      const o = SKILL_TABLE.overheat[level];
      return `연속 성공 1회당 대성공 전환 +${o.per}%p (최대 +${o.max}%p)`;
    }
    case 'phoenix': {
      const p = SKILL_TABLE.phoenix[level];
      return `하루 ${p.perDay}회, 파괴된 무기를 +${p.level}으로 복구`;
    }
    case 'fateSplit':
      return `하루 ${SKILL_TABLE.fateSplit[level]}회, 결과 2개 중 선택`;
    case 'divine':
      return `성공·대성공 시 ${SKILL_TABLE.divine[level]}% 확률로 +${DIVINE_STEP}`;
  }
}
