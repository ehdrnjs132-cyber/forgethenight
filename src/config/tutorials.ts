// Tutorial text (§8). Wording for the first-enhance tutorial is taken verbatim from the design document.

export interface TutorialStep {
  title: string;
  body: string;
  tone: 'normal' | 'danger';
}

export interface TutorialSpec {
  steps: TutorialStep[];
  /** Checkbox on the last step; completion requires it (§8.2). */
  confirmLabel: string;
}

// 2026-11-19: rewritten for the new rules (enhance and sell is the game; the night is an optional bet).
export const FIRST_ENHANCE_TUTORIAL: TutorialSpec = {
  steps: [
    {
      title: '강화하고, 팔아라',
      body: '아침마다 무기 3자루가 도착하고, 무기걸이의 「새 무기 받기」로 하루 3자루를 더 받을 수 있습니다. 강화해서 단계를 올린 무기를 팔면 골드가 됩니다. 단계가 높을수록 값이 크게 뜁니다.',
      tone: 'normal',
    },
    {
      title: '골드는 어디에 쓰나',
      body: '강화할 때마다 약간의 골드가 듭니다. 모은 골드로 「스킬트리」의 기술을 하나씩 사고, 3~5일마다 찾아오는 왕에게 월세를 냅니다. 월세를 못 내면 대장간을 잃고 처음부터 다시 시작합니다. 미리 내면 그때까지 망치질이 빨라집니다.',
      tone: 'normal',
    },
    {
      title: '파괴된 무기는 돌아오지 않습니다',
      body: '강화 도중 무기가 파괴되면 영구히 사라집니다. 처음엔 파괴 확률이 꽤 높으니, 적당한 단계에서 팔지 더 밀어붙일지 판단하세요. 「불사조의 모루」 스킬을 배우면 파괴된 무기를 되살릴 수 있습니다.',
      tone: 'danger',
    },
  ],
  confirmLabel: '무기 영구 파괴 규칙을 이해했습니다.',
};
