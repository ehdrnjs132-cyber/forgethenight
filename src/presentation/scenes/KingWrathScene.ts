// The king's wrath (user request 2026-11-26): when the rent cannot be paid the run ends with the king
// himself — a huge dark figure with a spiked crown and burning eyes — roaring "감히 월세를 못 내?"
// before the game-over screen. About seven seconds; a click or Enter skips it after the first second.
// Drawn in code (no image): silhouette, crown, eyes and a jagged grin.
import Phaser from 'phaser';
import type { GameOverSummary, RentNotice } from '../../core/state/types';
import { FONT, H, W, label } from '../theme';
import { Sfx } from '../audio/sfx';
import { drawKing } from '../fx/kingArt';

export interface KingWrathData {
  summary: GameOverSummary;
  rent: RentNotice | null;
}

export class KingWrathScene extends Phaser.Scene {
  private data0!: KingWrathData;
  private done = false;
  private sfx = new Sfx();

  constructor() {
    super('KingWrath');
  }

  create(data: KingWrathData) {
    this.data0 = data;
    this.done = false;
    const k = Math.min(W / 1280, H / 720) * (W < H ? 1.3 : 0.78);
    const cx = W / 2;
    const kingY = H * (W < H ? 0.6 : 0.7);

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // a red glow behind him, like the throne room burning (many faint layers, so no visible bands)
    const glow = this.add.graphics().setAlpha(0);
    for (let i = 24; i >= 1; i--) glow.fillStyle(0x7a0808, 0.022).fillEllipse(cx, kingY - 160 * k, 240 * k + i * 48 * k, 200 * k + i * 36 * k);
    glow.setPosition(0, 0);

    // ── the king (drawn in fx/kingArt, shared with the first-time story)
    const { king, rim, eyes, eyeGlow, mouth } = drawKing(this, cx, kingY);
    king.setScale(k * 0.85).setAlpha(0);

    // vignette over everything
    const vig = this.add.graphics();
    for (let i = 0; i < 10; i++) vig.lineStyle(60, 0x000000, 0.09).strokeRect(-i * 30 + 30, -i * 30 + 30, W + i * 60 - 60, H + i * 60 - 60);

    const big = W < H ? 1.25 : 1;
    const lead = label(this, cx, H * 0.16, '…왕이 직접 찾아왔다', 26 * big, 0x9a8a8a, { weight: 700, origin: [0.5, 0.5] }).setAlpha(0);
    // "감히" beside his head (never on the crown), the question across his chest
    const dare = this.add
      .text(W < H ? cx : cx - 360 * (W / 1280), H * (W < H ? 0.12 : 0.32), '감히', { fontFamily: FONT, fontSize: `${Math.round(96 * big)}px`, fontStyle: '900', color: '#ff3a2a', stroke: '#000000', strokeThickness: 12, resolution: 2 })
      .setOrigin(0.5)
      .setAngle(W < H ? 0 : -8)
      .setAlpha(0)
      .setDepth(10);
    const line = this.add
      .text(cx, H * (W < H ? 0.8 : 0.82), '월세를 못 내?', { fontFamily: FONT, fontSize: `${Math.round(88 * big)}px`, fontStyle: '900', color: '#ff2a1a', stroke: '#000000', strokeThickness: 12, resolution: 2 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(10);
    const r = data.rent;
    const sub = label(
      this,
      cx,
      H * (W < H ? 0.88 : 0.93),
      `${r ? `DAY ${r.day} 월세 ${r.amount.toLocaleString()}G · ` : ''}대장간은 이제 왕의 것이다.`,
      20 * big,
      0xe8d8d0,
      { weight: 700, origin: [0.5, 0.5] },
    )
      .setStroke('#000000', 6)
      .setAlpha(0)
      .setDepth(10);

    // ── timeline
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, fn);
    this.sfx.rumble(2.2);
    for (const t of [0, 800, 1400, 1800]) at(t, () => this.sfx.heartbeat());
    at(400, () => this.tweens.add({ targets: lead, alpha: 1, duration: 500 }));
    at(1700, () => this.tweens.add({ targets: lead, alpha: 0, duration: 250 }));
    at(2000, () => {
      // the doors burst open and he is there
      this.sfx.slam();
      this.cameras.main.shake(450, 0.02);
      this.cameras.main.flash(260, 120, 0, 0);
      glow.setAlpha(1);
      this.tweens.add({ targets: king, alpha: 1, scale: k, duration: 520, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: rim, alpha: { from: 0.6, to: 1 }, duration: 140, yoyo: true, repeat: -1 });
    });
    at(2600, () => {
      this.tweens.add({ targets: eyes, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: eyeGlow, alpha: 1, duration: 300 });
      this.tweens.add({ targets: eyeGlow, alpha: 0.55, duration: 420, yoyo: true, repeat: -1, delay: 300 });
    });
    at(3300, () => {
      this.sfx.roar(1.1);
      this.slamText(dare, 2.2);
      this.cameras.main.shake(300, 0.012);
    });
    at(4100, () => {
      this.sfx.roar(1.5);
      this.tweens.add({ targets: mouth, alpha: 1, duration: 120 });
      this.slamText(line, 1.8);
      this.cameras.main.shake(500, 0.018);
      // he leans in
      this.tweens.add({ targets: king, scale: k * 1.12, y: kingY + 30 * k, duration: 1600, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: glow, alpha: 1.0, duration: 1600 });
    });
    at(4800, () => this.tweens.add({ targets: sub, alpha: 1, duration: 500 }));
    at(6000, () => {
      this.sfx.shriek();
      this.tweens.add({ targets: eyes, scaleX: 1.6, scaleY: 1.4, duration: 200 });
      this.cameras.main.flash(300, 200, 0, 0);
    });
    at(6500, () => this.finish());

    // skip after the first second
    this.time.delayedCall(1000, () => {
      this.input.once('pointerdown', () => this.finish());
      this.input.keyboard?.once('keydown-ENTER', () => this.finish());
      this.input.keyboard?.once('keydown-SPACE', () => this.finish());
    });
  }

  /** Words that hit the screen: big, then snapping to size. */
  private slamText(t: Phaser.GameObjects.Text, from: number) {
    t.setScale(from).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, x: { from: t.x - 6, to: t.x + 6 }, duration: 50, yoyo: true, repeat: 5, delay: 220 });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameOver', { summary: this.data0.summary, reason: 'died' }));
  }
}
