import Phaser from 'phaser';
import { ELEMENT_INFO } from '../../config/weapons';
import { milestoneTier, weaponSizeScale } from '../../config/appearance';
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
    const key = weaponTexture(look.cls, look.element);

    if (this.scene.textures.exists(key)) {
      if (!this.img) {
        this.img = this.scene.add.image(0, 0, key);
        this.add(this.img);
      }
      const img = this.img;
      img.setTexture(key).setVisible(true);
      img.setScale((this.len / img.width) * weaponSizeScale(look.level));
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
      drawWeapon(this.art, look, this.len * weaponSizeScale(look.level));
    }

    // No coloured aura around the weapon any more (2026-11-18 feedback): it washed the blacksmith and
    // the anvil in the element colour. The weapon's own outline glow (above) carries the element.
    void tier;
  }

  /** Brief bright pulse on the weapon itself (never tints the scene around it). */
  flare(_color: number, strength = 1) {
    const img = this.img;
    if (!img || !img.visible) return;
    img.setTintFill(0xffffff);
    this.scene.time.delayedCall(70 + strength * 40, () => img.clearTint());
    const base = img.scale;
    img.setScale(base * (1 + 0.06 * strength));
    this.scene.tweens.add({ targets: img, scale: base, duration: 260, ease: 'Back.easeOut' });
  }
}
