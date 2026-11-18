// EnhancementPresentation (§7, §24): hammer, impact, result effects and banners.
// It only plays back a result the core already decided and saved (§6.4); it never rolls anything.
import Phaser from 'phaser';
import { OUTCOME_INFO } from '../../config/enhancement';
import { ELEMENT_INFO } from '../../config/weapons';
import { weaponDisplayName } from '../../config/swordNames';
import { milestoneTier } from '../../config/appearance';
import type { EnhanceResult } from '../../core/systems/enhancement';
import { C, DISPLAY, FONT, css } from '../theme';
import type { Sfx } from '../audio/sfx';
import type { WeaponView } from '../ui/weaponView';

/** Whoever swings the hammer: the blacksmith sprite, or the drawn hammer as a fallback. */
export interface Swing {
  raise(): Promise<void>;
  strike(): Promise<void>;
  recover(): void;
}

export interface PresentationParts {
  weapon: WeaponView;
  swing: Swing;
  /** World point where the hammer meets the weapon. */
  impact: { x: number; y: number };
  /** Where result banners appear. */
  bannerAt: { x: number; y: number };
  sfx: Sfx;
}

export interface PlayHooks {
  /** Called on the impact frame, so the new level appears exactly as the hammer lands. */
  onImpact: () => void;
}

export const HAMMER_IDLE = 32;

export class EnhancementPresentation {
  /** Accessibility: shake and flash can be reduced (§21.8). */
  reduceMotion = false;

  constructor(private readonly scene: Phaser.Scene, private readonly p: PresentationParts) {}

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(ms, () => resolve()));
  }

  private shake(ms: number, intensity: number) {
    if (!this.reduceMotion) this.scene.cameras.main.shake(ms, intensity);
  }

  private flash(ms: number, color: number) {
    if (this.reduceMotion) return;
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(ms, c.red, c.green, c.blue, false);
  }

  private burst(count: number, tint: number | number[], o: { speed?: [number, number]; life?: number; gravity?: number; scale?: number; spread?: [number, number] } = {}) {
    const { x, y } = this.p.impact;
    const life = o.life ?? 520;
    const e = this.scene.add.particles(x, y, 'spark', {
      speed: { min: o.speed?.[0] ?? 120, max: o.speed?.[1] ?? 420 },
      angle: { min: o.spread?.[0] ?? 195, max: o.spread?.[1] ?? 345 },
      lifespan: { min: life * 0.6, max: life },
      gravityY: o.gravity ?? 700,
      scale: { start: o.scale ?? 0.55, end: 0 },
      tint,
      blendMode: 'ADD',
      emitting: false,
    });
    e.setDepth(20);
    e.explode(count);
    this.scene.time.delayedCall(life + 200, () => e.destroy());
  }

  private ring(color: number, to = 2.2, ms = 380) {
    const { x, y } = this.p.impact;
    const r = this.scene.add.image(x, y, 'ring').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.15).setAlpha(0.95).setDepth(19);
    this.scene.tweens.add({ targets: r, scale: to, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  /** Big result text. Returns when it has popped in; it fades on its own. */
  banner(title: string, sub: string, color: number, size = 54, dy = 0) {
    const { x } = this.p.bannerAt;
    const y = this.p.bannerAt.y + dy;
    const t = this.scene.add
      .text(x, y, title, { fontFamily: `${DISPLAY}`, fontSize: `${size}px`, fontStyle: '800', color: css(color), stroke: '#000000', strokeThickness: 8, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(30);
    const s = this.scene.add
      .text(x, y + size * 0.72, sub, { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: css(C.text), stroke: '#000000', strokeThickness: 5, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(30);
    for (const o of [t, s]) {
      o.setAlpha(0).setScale(0.6);
      this.scene.tweens.add({ targets: o, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: o, alpha: 0, y: o.y - 14, delay: 950, duration: 320, onComplete: () => o.destroy() });
    }
  }

  private shatter(result: EnhanceResult) {
    const { weapon } = this.p;
    const el = ELEMENT_INFO[result.weaponBefore.element];
    weapon.setVisible(false);
    for (let i = 0; i < 16; i++) {
      const sx = weapon.x + Phaser.Math.Between(-180, 180);
      const sy = weapon.y + Phaser.Math.Between(-10, 10);
      const shard = this.scene.add
        .image(sx, sy, 'shard')
        .setTint(i % 3 === 0 ? el.color : 0xb9bec8)
        .setScale(Phaser.Math.FloatBetween(0.8, 2.1))
        .setRotation(Math.random() * Math.PI)
        .setDepth(21);
      const vx = Phaser.Math.Between(-260, 260);
      this.scene.tweens.add({ targets: shard, x: sx + vx, duration: 900, ease: 'Linear' });
      this.scene.tweens.add({ targets: shard, y: sy + Phaser.Math.Between(140, 320), duration: 900, ease: 'Quad.easeIn' });
      this.scene.tweens.add({ targets: shard, angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: 900, onComplete: () => shard.destroy() });
    }
    const dim = this.scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0).setDepth(18);
    this.scene.tweens.add({ targets: dim, fillAlpha: 0.45, duration: 120, yoyo: true, hold: 420, onComplete: () => dim.destroy() });
  }

  private crack() {
    const { weapon } = this.p;
    const g = this.scene.add.graphics().setDepth(19);
    g.lineStyle(3, C.danger, 1);
    for (let n = 0; n < 3; n++) {
      let x = weapon.x - 120 + n * 110 + Phaser.Math.Between(-20, 20);
      let y = weapon.y - 18;
      g.beginPath();
      g.moveTo(x, y);
      for (let i = 0; i < 5; i++) {
        x += Phaser.Math.Between(-12, 12);
        y += 8;
        g.lineTo(x, y);
      }
      g.strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, delay: 350, duration: 400, onComplete: () => g.destroy() });
  }

  async play(result: EnhanceResult, hooks: PlayHooks): Promise<void> {
    const { swing, sfx, weapon } = this.p;
    const tier = milestoneTier(result.weaponBefore.level);
    const info = OUTCOME_INFO[result.outcome];
    const before = result.weaponBefore.level;
    const after = result.weaponAfter?.level ?? null;

    // A sword that reaches a new form shows its new name under the result.
    const newName = result.weaponAfter ? weaponDisplayName(result.weaponAfter) : '';
    const renamed = result.weaponAfter !== null && newName !== weaponDisplayName(result.weaponBefore) ? `  ·  「${newName}」` : '';

    // 1–2: raise, then a fast drop
    sfx.raise();
    await swing.raise();
    await swing.strike();

    // 3–5: impact, shake, metal
    sfx.strike(tier);
    this.shake(140 + tier * 30, 0.004 + tier * 0.0016);
    this.ring(0xffe2a0, 0.9, 160);
    swing.recover();
    hooks.onImpact();

    // 6–7: sparks and the result itself
    const density = 1 + tier * 0.35;
    switch (result.outcome) {
      case 'great':
        sfx.great();
        this.flash(160, 0xffd34d);
        this.shake(260, 0.012 + tier * 0.002);
        this.ring(0xffd34d, 3.2, 480);
        this.ring(0xffffff, 1.8, 300);
        this.burst(Math.round(70 * density), [0xffd34d, 0xffe9a8, 0xffffff], { speed: [200, 680], life: 800 });
        weapon.flare(0xffd34d, 1.4);
        this.banner(`${info.name}!`, `+${before} → +${after}${renamed}`, info.color, 64);
        break;
      case 'success':
        sfx.success();
        this.ring(0xff9a3c, 2.2);
        this.burst(Math.round(36 * density), [0xff9a3c, 0xffc46b, 0xff6a1f]);
        weapon.flare(0xff9a3c, 0.8);
        this.banner(info.name, `+${before} → +${after}${renamed}`, info.color);
        break;
      case 'keep':
        sfx.keep();
        this.burst(Math.round(10 * density), [0x9a8d7a, 0xc9b79a], { speed: [60, 200], life: 360 });
        this.banner(info.name, `+${before} 그대로`, info.color, 44);
        break;
      case 'down':
        sfx.down();
        this.crack();
        this.burst(Math.round(14 * density), [0xff4a4a, 0x8a1a1a], { speed: [80, 260] });
        this.banner(info.name, `+${before} → +${after}${renamed}`, info.color, 50);
        break;
      case 'destroy':
        sfx.shatter();
        sfx.silence(520);
        this.flash(220, C.danger);
        this.shake(320, 0.016);
        this.shatter(result);
        this.banner(
          info.name,
          `${weaponDisplayName(result.weaponBefore)} +${before}이(가) 영구히 사라졌습니다`,
          C.dangerHi,
          60,
        );
        break;
    }

    await this.wait(result.outcome === 'destroy' ? 760 : 420);

    // §7.4: milestone presentation on top
    if (result.milestone) {
      const m = result.milestone;
      const glow = ELEMENT_INFO[result.weaponBefore.element].glow;
      sfx.awaken(m.tier);
      this.ring(glow, 3.6, 700);
      this.ring(0xffd34d, 2.6, 560);
      this.burst(40 + m.tier * 18, [glow, 0xffffff, 0xffd34d], { speed: [150, 520], life: 1000, gravity: 120, spread: [0, 360] });
      weapon.flare(glow, 1.6);
      this.flash(160, 0xffffff); // neutral, not the element colour
      this.banner(m.name, `+${m.level} 도달`, 0xffe2a0, 46, 104);
      await this.wait(700);
    }
  }
}
