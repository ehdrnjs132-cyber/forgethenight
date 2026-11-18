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

export const FIRST_ENHANCE_TUTORIAL: TutorialSpec = {
  steps: [
    {
      title: '하루에 단 3자루',
      body: '매일 새로운 기본 무기 3자루를 받습니다. 강화한 무기는 전투에 사용하거나 판매할 수 있습니다.',
      tone: 'normal',
    },
    {
      title: '강화는 무료입니다',
      body: '심장의 모루는 재료나 골드 없이 무기를 벼립니다. 성공하면 무기가 강해지지만 강화 단계가 유지되거나 하락할 수도 있습니다.',
      tone: 'normal',
    },
    {
      title: '파괴된 무기는 돌아오지 않습니다',
      body: '강화 도중 무기가 파괴되면 영구적으로 사라집니다. 강화를 계속할지, 전투에 사용할지, 판매할지 신중하게 결정하세요.',
      tone: 'danger',
    },
  ],
  confirmLabel: '무기 영구 파괴 규칙을 이해했습니다.',
};
