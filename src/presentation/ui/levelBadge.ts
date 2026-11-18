// "+N" enhancement badge (user feedback 2026-11-18: the serif numbers looked unfamiliar).
// The look players know from enhancement games: a rounded pill in a tier colour with a bright rim and
// heavy white Noto Sans KR numbers with a dark outline.
import Phaser from 'phaser';
import { FONT } from '../theme';

export interface Tier {
  fill: number;
  rim: number;
  name: string;
}

/** Colour grade by level: grey, blue, purple, orange, red, gold. */
export function levelTier(level: number): Tier {
  if (level >= 50) return { fill: 0xb8860b, rim: 0xffe27a, name: '궁극' };
  if (level >= 40) return { fill: 0xa3122a, rim: 0xff6a7a, name: '신화' };
  if (level >= 30) return { fill: 0xb5530d, rim: 0xffb24a, name: '전설' };
  if (level >= 20) return { fill: 0x5b23a8, rim: 0xc69bff, name: '영웅' };
  if (level >= 10) return { fill: 0x1d4fa8, rim: 0x7fb8ff, name: '희귀' };
  return { fill: 0x3a4250, rim: 0xaab4c4, name: '일반' };
}

/**
 * A badge centred on (x, y). `size` is the number's font size in px.
 * Returns a container; call `setLevel` to change it.
 */
export class LevelBadge extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly t: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, level: number, private readonly size: number) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.t = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '900', color: '#ffffff', stroke: '#0b0705', strokeThickness: Math.max(4, Math.round(size / 7)), resolution: 2 })
      .setOrigin(0.5, 0.52);
    this.add([this.g, this.t]);
    scene.add.existing(this);
    this.setLevel(level);
  }

  setLevel(level: number): this {
    const tier = levelTier(level);
    this.t.setText(`+${level}`);
    const w = this.t.width + this.size * 0.9;
    const h = this.size * 1.32;
    const r = h / 2;
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);
    g.fillStyle(tier.fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.42, { tl: r - 3, tr: r - 3, bl: 4, br: 4 });
    g.lineStyle(Math.max(2, this.size / 14), tier.rim, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    return this;
  }
}
