import Phaser from 'phaser';
import { C, label } from '../theme';

export type Variant = 'gold' | 'dark' | 'danger' | 'ghost';

export interface ButtonOpts {
  variant?: Variant;
  sub?: string;
  size?: number;
  /** Font size of the sub line (default 12). */
  subSize?: number;
  onClick: () => void;
}

const LOOK: Record<Variant, { fill: number; hover: number; edge: number; text: number; sub: number }> = {
  gold: { fill: 0xc98a2e, hover: 0xe3a443, edge: 0xffe2a0, text: 0x1a0f05, sub: 0x3a2208 },
  dark: { fill: 0x1f1a16, hover: 0x2b241e, edge: 0x5a4632, text: C.text, sub: C.mute },
  danger: { fill: 0x9e1c22, hover: 0xc02830, edge: 0xff8a8a, text: 0xfff1f1, sub: 0xffcaca },
  ghost: { fill: 0x000000, hover: 0x1a1612, edge: 0x4a3c2c, text: C.mute, sub: C.dim },
};

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly main: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text | null;
  private enabled = true;
  private hover = false;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bw: number,
    private readonly bh: number,
    text: string,
    private readonly opts: ButtonOpts,
  ) {
    super(scene, x, y);
    const look = LOOK[opts.variant ?? 'dark'];
    const size = opts.size ?? 18;
    this.bg = scene.add.graphics();
    const subSize = opts.subSize ?? 12;
    this.main = label(scene, 0, opts.sub ? -Math.round(subSize * 0.75) : 0, text, size, look.text, { weight: 700, origin: [0.5, 0.5] });
    this.subText = opts.sub ? label(scene, 0, size * 0.55 + subSize / 3, opts.sub, subSize, look.sub, { weight: subSize > 12 ? 700 : 400, origin: [0.5, 0.5] }) : null;
    this.add([this.bg, this.main, ...(this.subText ? [this.subText] : [])]);
    this.setSize(bw, bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { this.hover = true; this.redraw(); });
    this.on('pointerout', () => { this.hover = false; this.pressed = false; this.redraw(); });
    this.on('pointerdown', () => { this.pressed = true; this.redraw(); });
    this.on('pointerup', () => {
      const fire = this.pressed && this.enabled;
      this.pressed = false;
      this.redraw();
      if (fire) this.opts.onClick();
    });
    scene.add.existing(this);
    this.redraw();
  }

  private redraw() {
    const look = LOOK[this.opts.variant ?? 'dark'];
    const fill = this.enabled && this.hover ? look.hover : look.fill;
    const g = this.bg;
    g.clear();
    const dy = this.pressed && this.enabled ? 2 : 0;
    if (this.opts.variant === 'gold' && this.enabled) {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-this.bw / 2, -this.bh / 2 + 4, this.bw, this.bh, 9);
    }
    g.fillStyle(fill, this.opts.variant === 'ghost' ? 0.6 : 1);
    g.fillRoundedRect(-this.bw / 2, -this.bh / 2 + dy, this.bw, this.bh, 9);
    g.lineStyle(this.hover && this.enabled ? 2 : 1, look.edge, this.enabled ? 1 : 0.4);
    g.strokeRoundedRect(-this.bw / 2 + 0.5, -this.bh / 2 + 0.5 + dy, this.bw - 1, this.bh - 1, 9);
    this.main.y = (this.subText ? -9 : 0) + dy;
    if (this.subText) this.subText.y = (this.opts.size ?? 18) * 0.55 + 4 + dy;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.42);
    if (this.input) this.input.cursor = on ? 'pointer' : 'default';
    this.redraw();
    return this;
  }

  isEnabled() {
    return this.enabled;
  }

  setLabel(text: string, sub?: string): this {
    this.main.setText(text);
    if (this.subText && sub !== undefined) this.subText.setText(sub);
    return this;
  }
}
