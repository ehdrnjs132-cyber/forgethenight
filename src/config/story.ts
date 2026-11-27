// First-time dialogue cutscene (user request 2026-11-27, script approved: docs/story-script.md).
// Why the king collects rent, then the merchant Morr explains enhancing, selling, the skill tree at
// night and the rent D-day. Plays once, the first time the player enters the forge.

export type Speaker = 'narration' | 'king' | 'me' | 'morr';

/** A one-off moment that happens as the line starts. */
export type Beat =
  | 'kingEnters' // the door bursts open, the king appears and opens his eyes
  | 'kingGrins' // he leans in and the grin shows, red flash
  | 'kingLeaves' // he fades into the dark
  | 'morning' // daylight, Morr leans in
  | 'stamp'; // a big "월세 D-7" stamp hits the screen

export interface StoryLine {
  speaker: Speaker;
  text: string;
  /** Topic banner shown above the box (Morr's four tips). */
  topic?: string;
  beat?: Beat;
}

export const SPEAKER_NAME: Record<Speaker, string> = {
  narration: '',
  king: '왕',
  me: '나',
  morr: '모르',
};

export const STORY_SEEN_ID = 'story';

// One sentence per click (user 2026-11-27: "클릭하면 한 문장대화 사라지는 형식으로").
export const STORY: readonly StoryLine[] = [
  // ── 장면 1 · 왕의 방문 (밤)
  { speaker: 'narration', text: '변방의 낡은 대장간.' },
  { speaker: 'narration', text: '오늘부터 이곳이 당신의 일터다.' },
  { speaker: 'king', text: '네가 새로 온 대장장이냐.', beat: 'kingEnters' },
  { speaker: 'me', text: '…폐하?' },
  { speaker: 'king', text: '이 땅의 모든 대장간은 왕의 것이다.' },
  { speaker: 'king', text: '너는 빌려 쓸 뿐이지.' },
  { speaker: 'king', text: '그러니 7일마다 월세를 바쳐라.' },
  { speaker: 'king', text: '첫 수금은 7일 뒤다.' },
  { speaker: 'king', text: '못 내면?', beat: 'kingGrins' },
  { speaker: 'king', text: '…대장간도, 네 목숨도 내 것이다.' },
  { speaker: 'me', text: '(7일 안에… 월세를 벌어야 한다.)', beat: 'kingLeaves' },
  // ── 장면 2 · 모르의 요령 (아침)
  { speaker: 'morr', text: '허허, 왕이 다녀갔구먼.', beat: 'morning' },
  { speaker: 'morr', text: '처음인가? 요령 몇 가지만 알려 주지.' },
  { speaker: 'morr', topic: '① 무기 강화', text: '무기걸이에서 무기를 고르고 「강화」를 누르면 망치를 내려친다네.' },
  { speaker: 'morr', topic: '① 무기 강화', text: '성공하면 단계가 오르고, 실패하면 떨어지거나… 부서지지.' },
  { speaker: 'morr', topic: '① 무기 강화 · 체력', text: '망치질을 시작하면 체력이 조금씩 줄어든다네.' },
  { speaker: 'morr', topic: '① 무기 강화 · 체력', text: '바닥나면 그날 일은 끝이니 서두르게.' },
  { speaker: 'morr', topic: '② 무기 판매', text: '돈은 무기를 팔아서 번다네.' },
  { speaker: 'morr', topic: '② 무기 판매', text: '단계가 높을수록 값이 크게 뛰지.' },
  { speaker: 'morr', topic: '② 무기 판매', text: '부서지기 전에 파는 것도 실력이야.' },
  { speaker: 'morr', topic: '③ 밤의 스킬트리', text: '하루를 마치면 「다음 날」을 누르게.' },
  { speaker: 'morr', topic: '③ 밤의 스킬트리', text: '해가 지면 저녁 화면의 「스킬트리」에서 골드로 별을 새길 수 있다네.' },
  { speaker: 'morr', topic: '③ 밤의 스킬트리', text: '낮에는 구경만 할 수 있지.' },
  { speaker: 'morr', topic: '④ 수금일', text: '저녁마다 왕이 오는 날까지 며칠 남았는지 크게 보일 거야.', beat: 'stamp' },
  { speaker: 'morr', topic: '④ 수금일', text: '그 숫자가 0이 되는 밤에 월세를 낼 골드가 없으면… 알지?' },
  { speaker: 'me', text: '강화하고, 팔고, 밤에 배우고, 월세를 낸다.' },
  { speaker: 'me', text: '…해 보자.' },
];

// ───────────────────────── 상인 모르의 방문 (user 2026-11-27, script: docs/merchant-script.md)
// The first visit introduces the shop once; every later visit opens with a short greeting.

export const MERCHANT_FIRST_SEEN_ID = 'merchant-first';

export const MERCHANT_FIRST: readonly StoryLine[] = [
  { speaker: 'morr', text: '똑똑, 계신가?', beat: 'morning' },
  { speaker: 'morr', text: '허허, 아직 살아 있구먼.' },
  { speaker: 'me', text: '모르 씨?' },
  { speaker: 'morr', text: '사흘마다 이 길을 지나간다네.' },
  { speaker: 'morr', text: '오늘부터 자네 대장간에도 들르기로 했지.' },
  { speaker: 'morr', text: '쓸 만한 물건 몇 가지를 보여 주지.' },
  { speaker: 'morr', topic: '강화 보호석', text: '켜 두면 하락이나 파괴가 나와도 단계를 지켜 준다네.' },
  { speaker: 'morr', topic: '행운 강화석', text: '켜 두면 다음 강화의 성공 확률이 오르지.' },
  { speaker: 'morr', topic: '장인의 강화석', text: '파괴 확률을 절반으로 줄여 준다네.' },
  { speaker: 'morr', topic: '장인의 강화석', text: '높은 단계를 노릴 때 아껴 쓰게.' },
  { speaker: 'morr', topic: '무기보관함 열쇠', text: '무기걸이의 잠긴 칸을 열어 주지.' },
  { speaker: 'morr', topic: '스킬 초기화 서적', text: '스킬트리에 쓴 골드를 전부 돌려받을 수 있다네.' },
  { speaker: 'morr', text: '운이 좋으면 아주 귀한 물건도 들고 오지.' },
  { speaker: 'morr', text: '시간을 되돌리는 돌이라든가… 허허.' },
  { speaker: 'morr', text: '물론 공짜는 없네.' },
  { speaker: 'morr', text: '월세 낼 돈까지 털어 쓰진 말게나.' },
  { speaker: 'me', text: '…명심하죠.' },
  { speaker: 'morr', text: '오늘 하루는 문 앞에 있겠네.' },
  { speaker: 'morr', text: '「상인」 버튼을 누르면 언제든 들르게.' },
];

/** Which short greeting a later visit gets (one; the most pressing). */
export type MerchantGreeting = 'basic' | 'broke' | 'rent' | 'rare' | 'big';

export const MERCHANT_GREETINGS: Record<MerchantGreeting, readonly StoryLine[]> = {
  basic: [
    { speaker: 'morr', text: '사흘 만이구먼.', beat: 'morning' },
    { speaker: 'morr', text: '오늘도 물건을 좀 가져왔네.' },
    { speaker: 'morr', text: '「상인」 버튼을 누르면 보여 주지.' },
  ],
  broke: [
    { speaker: 'morr', text: '쇳조각 냄새가 나는군.', beat: 'morning' },
    { speaker: 'morr', text: '그새 하나 부숴 먹었나 보지?' },
    { speaker: 'morr', topic: '강화 보호석', text: '보호석을 켜 두면 그런 일은 없을 텐데 말이야.' },
  ],
  rent: [
    { speaker: 'morr', text: '왕의 행렬이 이쪽으로 오고 있더군.', beat: 'morning' },
    { speaker: 'morr', text: '월세는 마련했나?' },
    { speaker: 'morr', text: '돈이 모자라면 오늘은 아무것도 사지 말게.' },
  ],
  rare: [
    { speaker: 'morr', text: '쉿, 오늘은 특별한 물건이 있네.', beat: 'morning' },
    { speaker: 'morr', topic: '시간 역행석', text: '직전 강화 한 번을 되돌리는 돌이지.' },
    { speaker: 'morr', topic: '시간 역행석', text: '부서진 무기도 되살린다네.' },
    { speaker: 'morr', text: '이런 건 자주 안 들어오니 잘 생각하게.' },
  ],
  big: [
    { speaker: 'morr', text: '오오, 그 무기 좀 보게.', beat: 'morning' },
    { speaker: 'morr', text: '이 근방에서 그런 물건은 처음 보는군.' },
    { speaker: 'morr', topic: '장인의 강화석', text: '장인의 강화석이 필요할 걸세.' },
  ],
};
