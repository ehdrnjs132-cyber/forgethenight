// First-day lines (user request 2026-11-18): the smith comments on almost everything on DAY 1, and the
// rivals taunt during the first night. Lines are picked at random from each list.

export const SMITH_LINES = {
  /** First morning, before anything (prologue). */
  prologueArrive: ['…또 아침이군. 망치가 무겁다.', '세계에서 무기 두 자루가 도착했다. 오늘 밤 전에 강화해 둬야 해.'],
  /** DAY 1 again, after the scripted defeat. */
  afterPrologue: ['…살아 있다? 밤이 나를 돌려보냈다.', '새벽에 무기 두 자루가 다시 도착했다.', '이번엔… 제대로 강화한다.'],
  select: ['좋은 쇠다. 이걸로 해 보자.', '이 녀석, 가능성이 보인다.', '손에 착 감기는군.', '흠, 결이 곱다.'],
  enhanceStart: ['흐읍—!', '이번엔 된다!', '집중해라, 손목…', '불꽃아, 버텨 줘!'],
  great: ['이거다! 손이 돌아왔어!', '두 단계?! 오늘 운이 좋은데!'],
  success: ['좋아, 한 단계 올랐다.', '그래, 이 느낌이야.', '조금씩, 조금씩 강해진다.'],
  keep: ['변화가 없군. 다시.', '쇠가 아직 마음을 안 여는군.'],
  down: ['윽, 한 단계 내려갔다.', '서둘렀다… 손이 떨렸어.'],
  destroy: ['또 부서졌어… 그래도 멈출 순 없다.', '산산조각… 다음엔 신중하게.'],
  /** Prologue: the n-th weapon shattered (index = how many are left). */
  prologueDestroy: [
    '전부… 부서졌다. 남은 건 이 낡은 망치뿐이다.',
    '두 자루째… 손이 기억을 잃은 건가.',
    '뭐…? 쇠가 산산조각 났다고?',
  ],
  equip: ['오늘 밤은 이 녀석과 함께다.', '좋아, 너로 정했다.'],
  sell: ['돈이 있어야 다시 강화하지.', '아깝지만… 다음을 위해서다.'],
  buy: ['새 쇠다. 이번엔 끝까지 가 보자.', '쇠는 얼마든지 있다. 문제는 내 손이지.'],
  sellPrologue: ['팔 생각은 없다. 오늘은 강화해야 해.'],
  skills: ['기술보다 손부터 풀어야겠어.', '별자리가 희미하다. 경험이 더 필요해.'],
  nightStart: ['누가 오든 막는다.', '해가 진다. 가자.'],
  nightStartHammer: ['이 망치 하나로… 버텨야 한다.'],
  noGold: ['돈이 모자라… 뭐라도 팔아야겠군.'],
  needEquip: ['맨손으로 나갈 순 없지. 무기부터 쥐자.'],
};

/**
 * Day-1 guide (2026-11-19, the new rules): each step plays once, when its moment comes.
 * Ids double as tutorial flags so a step never repeats.
 */
export const COACH = {
  coachArrive: [
    '…아침이군. 세상 곳곳에서 무기가 또 도착했다.',
    '무기걸이에서 하나 골라 「강화」를 눌러 보자. 단계가 오를수록 비싸게 팔린다.',
  ],
  coachEnhance: ['좋아. 강화한 무기는 「판매」로 골드가 된다. +1부터 값이 붙고, 높을수록 크게 뛴다.'],
  coachSell: [
    '골드는 강화비, 「스킬트리」, 그리고 왕의 월세에 쓴다.',
    '왕은 사흘쯤 뒤에 월세를 걷으러 온다. 못 내면… 대장간을 통째로 빼앗긴다.',
  ],
  coachSkill: ['골드가 좀 모였다. 해가 지면 「스킬트리」에서 기술을 하나 배워 둘까. 싼 것부터 금방 열린다.'],
  coachDay: [
    '하루를 마치려면 아래 「다음 날」을 누르자.',
    '밤에는 다른 세계의 대장장이가 내기를 걸어온다. 받아들일지는 내 마음이다.',
  ],
} as const;

export type CoachStep = keyof typeof COACH;

export const NARRATOR_LINES = {
  allShattered: '해가 진다. 무기는 모두 부서졌다 — 낡은 망치를 들고 밤을 맞이하라. (밤 전투 시작)',
  prologueNight: '균열 너머에서 같은 얼굴들이 걸어 나온다. 머리 위 숫자가 그들이 강화해 온 단계다.',
  prologueDeath: '첫 밤은 누구에게나 진다. 하지만 대장장이는 다시 일어난다.',
};

/** Rival taunts in the night (every night on DAY 1, now and then later). */
export const TAUNTS = [
  '망치 한 자루로 버티겠다고?',
  '넌 강화도 제대로 못 하잖아.',
  '부서진 쇠붙이 냄새가 나는군.',
  '포기해. 너는 우리 중 가장 약하다.',
  'THE FIRST가 널 지우라 했다.',
  '그 망치, 곧 너랑 같이 부서질 거다.',
  '몇 강이냐고? 너보다는 높지.',
  '같은 얼굴인데 이렇게 다를 수가.',
  '네 세계는 오늘 밤 끝난다.',
  '나는 파괴를 세 번 겪고도 여기까지 왔다.',
  '도망쳐 봐. 어디로 가든 내가 있다.',
  '+0으로 나를 상대하겠다고? 하하!',
];

/** The player's last words when the first night ends in defeat. */
export const LAST_WORDS = ['…이렇게 끝나는 건가.', '아직… 아직 강화할 게 남았는데…'];

export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
