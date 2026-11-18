// Speech bubbles: a rounded box with a tail and Korean text, shown for a reading-length time.
// `follow` keeps a bubble above a moving sprite (night rivals).
import Phaser from 'phaser';
import { FONT } from '../theme';

export interface BubbleStyle {
  fill: number;
  stroke: number;
  text: string;
  size: number;
  maxWidth: number;
}

export const SMITH_STYLE: BubbleStyle = { fill: 0xfff6e2, stroke: 0x3b2416, text: '#2a170c', size: 17, maxWidth: 300 };
export const RIVAL_STYLE: BubbleStyle = { fill: 0x241431, stroke: 0xb35cff, text: '#f1e2ff', size: 14, maxWidth: 230 };

/** Seconds a line stays up: enough to read it, never less than 2. */
export const readTime = (text: string) => Math.max(2, 1.4 + text.length * 0.07);

export class Bubble extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly t: Phaser.GameObjects.Text;
  private hideTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, private readonly style: BubbleStyle, depth = 60) {
    super(scene, 0, 0);
    this.g = scene.add.graphics();
    this.t = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: `${style.size}px`, fontStyle: '700', color: style.text, align: 'center', wordWrap: { width: style.maxWidth, useAdvancedWrap: true }, lineSpacing: 4, resolution: 2 })
      .setOrigin(0.5, 1);
    this.add([this.g, this.t]);
    this.setDepth(depth).setVisible(false);
    scene.add.existing(this);
  }

  /** Show `text` with the tail tip at (x, y). Resolves when it has gone. */
  say(text: string, x: number, y: number, seconds = readTime(text)): Promise<void> {
    this.setPosition(x, y);
    this.t.setText(text);
    const pad = { x: 14, y: 10 };
    const w = this.t.width + pad.x * 2;
    const h = this.t.height + pad.y * 2;
    const tail = 12;
    this.t.setPosition(0, -tail - pad.y);
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -tail - h + 4, w, h, 12);
    g.fillStyle(this.style.fill, 0.97).fillRoundedRect(-w / 2, -tail - h, w, h, 12);
    g.lineStyle(3, this.style.stroke, 1).strokeRoundedRect(-w / 2, -tail - h, w, h, 12);
    g.fillStyle(this.style.fill, 1).fillTriangle(-9, -tail - 1, 9, -tail - 1, 0, 0);
    g.lineStyle(3, this.style.stroke, 1).lineBetween(-9, -tail, 0, 0).lineBetween(9, -tail, 0, 0);
    this.hideTimer?.remove();
    this.setVisible(true).setAlpha(0).setScale(0.85);
    this.scene.tweens.add({ targets: this, alpha: 1, scale: 1, duration: 160, ease: 'Back.easeOut' });
    return new Promise((resolve) => {
      this.hideTimer = this.scene.time.delayedCall(seconds * 1000, () => {
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => (this.setVisible(false), resolve()) });
      });
    });
  }

  get showing(): boolean {
    return this.visible;
  }
}
