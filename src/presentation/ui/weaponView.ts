import Phaser from 'phaser';
import { ELEMENT_INFO } from '../../config/weapons';
import { milestoneTier } from '../../config/appearance';
import { drawWeapon, type WeaponLook } from '../weaponArt';

/** The big weapon lying on the anvil, with an aura that grows with its milestone tier. */
export class WeaponView extends Phaser.GameObjects.Container {
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly art: Phaser.GameObjects.Graphics;
  private auraTween: Phaser.Tweens.Tween | null = null;
  look: WeaponLook | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly len: number) {
    super(scene, x, y);
    this.aura = scene.add.graphics();
    this.art = scene.add.graphics();
    this.add([this.aura, this.art]);
    scene.add.existing(this);
  }

  setLook(look: WeaponLook | null) {
    this.look = look;
    this.auraTween?.stop();
    this.aura.clear();
    this.art.clear();
    this.setVisible(look !== null);
    if (!look) return;
    drawWeapon(this.art, look, this.len);
    const tier = milestoneTier(look.level);
    if (tier > 0) {
      const glow = ELEMENT_INFO[look.element].glow;
      for (let i = 4; i >= 1; i--) {
        this.aura.fillStyle(glow, 0.03 * tier);
        this.aura.fillEllipse(0, 0, this.len * (0.9 + i * 0.12), 40 + i * 18 + tier * 8);
      }
      this.aura.setAlpha(0.7);
      this.auraTween = this.scene.tweens.add({ targets: this.aura, alpha: 1, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** Brief bright pulse used on success results and milestones. */
  flare(color: number, strength = 1) {
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.35 * strength);
    g.fillEllipse(0, 0, this.len * 1.15, 90);
    this.add(g);
    this.sendToBack(g);
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.15, scaleY: 1.5, duration: 520, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }
}
