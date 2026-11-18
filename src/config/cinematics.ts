// Story cutscenes (reboot spec PART 6–8). Video files are made in Higgsfield and dropped into
// public/assets/cinematics/ (see docs/HIGGSFIELD_CINEMATICS.md). A missing file plays as a still
// image with the same subtitles, so the game always runs.

export interface Subtitle {
  /** Seconds from the start of the clip. */
  at: number;
  text: string;
  speaker?: string;
}

export interface Clip {
  id: string;
  file: string;
  /** Length used for the stand-in when the video is missing, and a safety cap for real videos. */
  seconds: number;
  /** Texture shown (slowly zooming) when the video is missing. */
  fallback: string;
  subtitles: Subtitle[];
}

const path = (name: string) => `assets/cinematics/${name}.mp4`;

export const CLIPS: Record<string, Clip> = {
  intro_01: { id: 'intro_01', file: path('intro_01'), seconds: 8, fallback: 'art-forge_bg', subtitles: [{ at: 1, text: '태초에 세계는 창조되지 않았다.' }, { at: 4.2, text: '벼려졌다.' }] },
  intro_02: { id: 'intro_02', file: path('intro_02'), seconds: 8, fallback: 'art-smith_raise', subtitles: [{ at: 1, text: '그리고 모든 세계에는 같은 운명을 가진 대장장이가 태어났다.' }] },
  intro_03: { id: 'intro_03', file: path('intro_03'), seconds: 8, fallback: 'art-forge_rack_bg', subtitles: [{ at: 1, text: '그러나 그중 단 한 명이 모든 세계의 진실을 깨달았다.' }, { at: 5, text: 'THE FIRST' }] },
  intro_04: { id: 'intro_04', file: path('intro_04'), seconds: 8, fallback: 'art-night_ground', subtitles: [{ at: 1, text: '그는 모든 세계에 명령했다.' }, { at: 4, text: '다른 세계의 너를 죽여라.' }] },
  intro_05: { id: 'intro_05', file: path('intro_05'), seconds: 8, fallback: 'art-smith_anvil', subtitles: [{ at: 1, text: '그리고 마지막까지 남겨진 한 세계.' }, { at: 4.2, text: '그곳에는 특별한 모루가 있었다. 심장의 모루.' }] },
  intro_06: { id: 'intro_06', file: path('intro_06'), seconds: 8, fallback: 'art-forge_rack_bg', subtitles: [{ at: 1, text: '밤이 되면, 다른 세계의 네가 찾아온다.' }, { at: 4.5, text: '그들이 어떤 무기를 벼려왔는지는 아무도 모른다.' }] },
  boss_25: { id: 'boss_25', file: path('boss_25'), seconds: 8, fallback: 'art-forge_rack_bg', subtitles: [{ at: 1, text: '하나의 세계라면, 비극도 하나로 끝낼 수 있다.', speaker: 'THE FIRST' }] },
  boss_40: { id: 'boss_40', file: path('boss_40'), seconds: 8, fallback: 'art-night_ground', subtitles: [{ at: 1, text: '세계가 무너진다. 그리고 모든 균열은 너의 모루를 향하고 있다.' }] },
  boss_50: {
    id: 'boss_50',
    file: path('boss_50'),
    seconds: 12,
    fallback: 'art-smith_anvil',
    subtitles: [
      { at: 0.5, text: '너는 내가 몇 번째 너인지 알고 있느냐?', speaker: 'THE FIRST' },
      { at: 3.5, text: '모든 세계에서 너는 실패했다.', speaker: 'THE FIRST' },
      { at: 6, text: '이번에는 다를 것 같으냐?', speaker: 'THE FIRST' },
      { at: 8.5, text: '다를 필요는 없어.', speaker: '대장장이' },
      { at: 10.3, text: '나는 다시 벼리면 되니까.', speaker: '대장장이' },
    ],
  },
  ending_a: { id: 'ending_a', file: path('ending_a'), seconds: 12, fallback: 'art-forge_bg', subtitles: [{ at: 1.5, text: '전쟁은 끝났다. 수많은 가능성과 함께.' }, { at: 7, text: 'ENDING A — ONE WORLD' }] },
  ending_b: { id: 'ending_b', file: path('ending_b'), seconds: 12, fallback: 'art-forge_rack_bg', subtitles: [{ at: 1.5, text: '모든 세계는 저마다의 불꽃으로 타오른다.' }, { at: 7, text: 'ENDING B — INFINITE FLAMES' }] },
  ending_c: { id: 'ending_c', file: path('ending_c'), seconds: 12, fallback: 'art-smith_anvil', subtitles: [{ at: 1.5, text: '대장장이가 서로를 죽여야 한다는 법칙은, 다시 벼려졌다.' }, { at: 7, text: 'ENDING C — THE UNFORGED' }] },
};

export const INTRO = ['intro_01', 'intro_02', 'intro_03', 'intro_04', 'intro_05', 'intro_06'];

/** Story beats by day (reboot spec PART 2): cutscene before that night, shown once per run. */
export const STORY_BEATS: { day: number; clip: string }[] = [
  { day: 25, clip: 'boss_25' },
  { day: 40, clip: 'boss_40' },
  { day: 50, clip: 'boss_50' },
];

export const STORY_ACTS = [
  { from: 1, to: 10, title: '최초의 균열', text: '다른 세계의 자신들이 공격해 온다.' },
  { from: 11, to: 20, title: '저마다의 사연', text: '도플갱어마다 서로 다른 사연과 목적이 있다.' },
  { from: 21, to: 30, title: 'THE FIRST', text: 'THE FIRST가 모든 세계를 통합하려 한다는 사실이 드러난다.' },
  { from: 31, to: 40, title: '붕괴', text: '평행우주들이 무너지고, 심장의 모루가 핵심임이 밝혀진다.' },
  { from: 41, to: 50, title: '마지막 대장간', text: '모든 세계의 운명을 결정한다.' },
];
