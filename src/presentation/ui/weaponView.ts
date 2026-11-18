import Phaser from 'phaser';
import { ELEMENT_INFO } from '../../config/weapons';
import { appearanceStage, milestoneTier } from '../../config/appearance';
import { drawWeapon, glowStrength, weaponTexture, type WeaponLook } from '../weaponArt';

/**
 * The big weapon lying on the anvil. Uses the Higgsfield base image when it is loaded
 * (falls back to the placeholder drawing), and shows evolution through an element glow that
 * strengthens with every appearance stage, a slight size increase and an aura per milestone tier.
 */
export class WeaponView extends Phaser.GameObjects.Container {
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly art: Phaser.GameObjects.Graphics;
  private img: Phaser.GameObjects.Image | null = null;
  private tweensOwned: Phaser.Tweens.Tween[] = [];
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
    this.tweensOwned.forEach((t) => t.stop());
    this.tweensOwned = [];
    this.aura.clear();
    this.art.clear();
    this.img?.setVisible(false);
    this.setVisible(look !== null);
    if (!look) return;

    const el = ELEMENT_INFO[look.element];
    const tier = milestoneTier(look.level);
    const stage = appearanceStage(look.level);
    const key = weaponTexture(look.cls, look.element);

    if (this.scene.textures.exists(key)) {
      if (!this.img) {
        this.img = this.scene.add.image(0, 0, key);
        this.add(this.img);
      }
      const img = this.img;
      img.setTexture(key).setVisible(true);
      img.setScale((this.len / img.width) * (1 + stage * 0.008));
      const fx = img.preFX;
      if (fx) {
        fx.clear();
        fx.padding = 40;
        const strength = glowStrength(look.level);
        if (strength > 0) {
          const glow = fx.addGlow(el.glow, strength, 0, false, 0.1, 16);
          if (tier > 0) {
            this.tweensOwned.push(
              this.scene.tweens.add({ targets: glow, outerStrength: strength * 1.35, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
            );
          }
        }
      }
    } else {
      drawWeapon(this.art, look, this.len);
    }

    if (tier > 0) {
      for (let i = 4; i >= 1; i--) {
        this.aura.fillStyle(el.glow, 0.03 * tier);
        this.aura.fillEllipse(0, 0, this.len * (0.9 + i * 0.12), 40 + i * 18 + tier * 8);
      }
      this.aura.setAlpha(0.7);
      this.tweensOwned.push(this.scene.tweens.add({ targets: this.aura, alpha: 1, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
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
