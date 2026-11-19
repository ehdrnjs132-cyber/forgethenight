// §20 game over: shown when the last life is lost. The run has already been wiped and a
// fresh DAY 1 saved (so quitting here cannot bring the old run back); the button just enters it.
import Phaser from 'phaser';
import type { GameOverSummary } from '../../core/state/types';
import { formatDamage } from '../../combat/rules';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';

export interface GameOverData {
  summary: GameOverSummary;
  /** 'closed' when the run ended because the game was closed during the last night. */
  reason?: 'died' | 'closed';
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData) {
    const s = data.summary;
    const sfx = new Sfx();
    this.cameras.main.fadeIn(900, 0, 0, 0);
    const g = this.add.graphics();
    g.fillGradientStyle(0x050407, 0x050407, 0x1a0606, 0x1a0606, 1);
    g.fillRect(0, 0, W, H);
    // a dying ember where the forge used to burn
    const ember = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      ember.fillStyle(0xff4a1a, 0.02 * i);
      ember.fillEllipse(W / 2, H + 40, 200 + i * 90, 120 + i * 40);
    }
    this.tweens.add({ targets: ember, alpha: 0.35, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // portrait (narrow, tall): the block sits lower and the long lines wrap
    const narrow = W < 1000;
    const OY = narrow ? Math.round((H - 720) / 2) - 40 : 0;
    const wrap = { align: 'center' as const, wrap: W - 60 };
    const title = label(this, W / 2, 132 + OY, 'YOUR FORGE HAS FALLEN', narrow ? 38 : 46, C.dangerHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    const line = label(this, W / 2, 190 + OY, '불꽃은 꺼졌다. 하지만 아버지의 맹세는 사라지지 않는다.', 19, C.text, { weight: 700, origin: [0.5, 0.5], ...wrap });
    const why = label(this, W / 2, 222 + OY + (narrow ? 14 : 0), data.reason === 'closed' ? '마지막 목숨이 남은 밤에 게임이 종료되어 패배로 처리되었습니다.' : '마지막 목숨을 잃었습니다. 모든 성장이 초기화되었습니다.', 14, C.mute, { origin: [0.5, 0.5], ...wrap });

    const m = Math.floor(s.nightSeconds / 60);
    const sec = String(Math.floor(s.nightSeconds % 60)).padStart(2, '0');
    const rows: [string, string][] = [
      ['최종 도달 날짜', `DAY ${s.day}`],
      ['최고 강화 단계', `+${s.bestLevel}`],
      ['처치한 몬스터', formatDamage(s.kills)],
      ['처치한 보스', `${s.bossesKilled}`],
      ['최종 생존 시간', `${m}:${sec}`],
    ];
    const items: Phaser.GameObjects.GameObject[] = [title, line, why];
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.45);
    const py = 262 + OY + (narrow ? 30 : 0);
    panel.fillRoundedRect(W / 2 - 260, py, 520, rows.length * 44 + 28, 12);
    panel.lineStyle(1, 0x5a1a1a, 1);
    panel.strokeRoundedRect(W / 2 - 259.5, py + 0.5, 519, rows.length * 44 + 27, 12);
    items.push(panel);
    rows.forEach(([k, v], i) => {
      const y = py + 34 + i * 44;
      items.push(label(this, W / 2 - 220, y, k, 17, C.mute, { weight: 700, origin: [0, 0.5] }));
      items.push(label(this, W / 2 + 220, y, v, 22, C.text, { weight: 900, origin: [1, 0.5] }));
    });
    const btn = new Button(this, W / 2, H - 92, 320, 60, 'BEGIN A NEW FORGE', { variant: 'gold', size: 20, sub: 'Enter · DAY 1부터', onClick: () => this.begin() });
    items.push(btn);
    items.forEach((o, i) => {
      (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, delay: 500 + i * 70, duration: 600 });
    });
    this.input.keyboard!.once('keydown-ENTER', () => this.begin());
    this.time.delayedCall(300, () => sfx.fall());
  }

  private begin() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Forge'));
  }
}
