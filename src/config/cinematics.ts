// Story intro (2026-11-18 user decision): three short clips in the game's own hand-drawn style,
// one subtitle line each, no boss cutscenes and no endings. Files live in public/assets/cinematics/
// (made with tools/art/gen-cine.ts, see docs/HIGGSFIELD_CINEMATICS.md). A missing file plays as a
// still with the same subtitle, so the game always runs.

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
  intro_1: { id: 'intro_1', file: path('intro_1'), seconds: 5, fallback: 'art-forge_bg', subtitles: [{ at: 0.6, text: '모든 세계에는 같은 대장장이가 산다.' }] },
  intro_2: { id: 'intro_2', file: path('intro_2'), seconds: 5, fallback: 'art-forge_rack_bg', subtitles: [{ at: 0.4, text: 'THE FIRST가 명령했다.' }, { at: 2.3, text: '다른 세계의 너를 죽여라.' }] },
  intro_3: { id: 'intro_3', file: path('intro_3'), seconds: 5, fallback: 'art-forge_rack_bg', subtitles: [{ at: 0.4, text: '밤이 오면, 그들이 온다.' }, { at: 2.4, text: '그들이 몇 강까지 강화해 왔는지, 직접 확인해라.' }] },
};

export const INTRO = ['intro_1', 'intro_2', 'intro_3'];
