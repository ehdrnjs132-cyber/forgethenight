// EnhancementPresentation (§7, §24): hammer, impact, result effects and banners.
// It only plays back a result the core already decided and saved (§6.4); it never rolls anything.
import Phaser from 'phaser';
import { OUTCOME_INFO } from '../../config/enhancement';
import { ELEMENT_INFO } from '../../config/weapons';
import { weaponDisplayName } from '../../config/swordNames';
import { MILESTONES, milestoneTier } from '../../config/appearance';
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
  /**
   * The awakening holds the input longer than a normal strike: true when that extra wait starts, false
   * when it ends. The forge stops the stamina drain meanwhile (QA 2026-11-27: 40 → 31 during it).
   */
  onHold?: (held: boolean) => void;
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

  /** Result texts still on screen; the next attempt clears them so two results never overlap. */
  private live: Phaser.GameObjects.Text[] = [];
  /** Weapons that already had their +10 awakening pause (bouncing around +10 only pauses once). */
  private awakened = new Set<string>();

  private clearBanners() {
    for (const o of this.live) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.live = [];
  }

  /**
   * Big result text, popped in on the impact frame; it fades on its own after `hold` ms.
   * `hold` is short for everyday results and longer for rare ones.
   */
  banner(title: string, sub: string, color: number, size = 54, dy = 0, hold = 950) {
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
      this.live.push(o);
      o.setAlpha(0).setScale(0.6);
      this.scene.tweens.add({ targets: o, alpha: 1, scale: 1, duration: 140, ease: 'Back.easeOut' });
      this.scene.tweens.add({
        targets: o,
        alpha: 0,
        y: o.y - 14,
        delay: hold,
        duration: 260,
        onComplete: () => {
          this.live = this.live.filter((l) => l !== o);
          o.destroy();
        },
      });
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
      // short and sharp: the pieces fly out fast and are gone in about half a second
      const vx = Phaser.Math.Between(-300, 300);
      this.scene.tweens.add({ targets: shard, x: sx + vx, duration: 560, ease: 'Cubic.easeOut' });
      this.scene.tweens.add({ targets: shard, y: sy + Phaser.Math.Between(120, 280), duration: 560, ease: 'Quad.easeIn' });
      this.scene.tweens.add({ targets: shard, angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: 560, onComplete: () => shard.destroy() });
    }
    const cam = this.scene.cameras.main;
    const dim = this.scene.add.rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, 0x000000, 0).setDepth(18);
    this.scene.tweens.add({ targets: dim, fillAlpha: 0.45, duration: 90, yoyo: true, hold: 200, onComplete: () => dim.destroy() });
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

    // QA 2026-11-20: the previous result's text goes the moment a new attempt starts, so results never overlap
    this.clearBanners();

    // 1–2: raise (starts on the click itself), then a fast drop
    sfx.raise();
    await swing.raise();
    await swing.strike();

    // 3–7: ONE frame — metal sound, shake, sparks, the new number and the result banner all land together
    sfx.strike(tier);
    this.shake(120 + tier * 30, 0.004 + tier * 0.0016);
    this.ring(0xffe2a0, 0.9, 140);
    swing.recover();
    hooks.onImpact();

    const density = 1 + tier * 0.35;
    // a +10 awakening the player has not seen on this weapon: the new look and name get a moment
    const m = result.milestone;
    const firstAwakening = !!m && m.level === MILESTONES[0].level && !this.awakened.has(result.weaponBefore.id);
    if (firstAwakening) this.awakened.add(result.weaponBefore.id);
    // how long the result stays before the next attempt may start (short for everyday results)
    let settle = 140;
    switch (result.outcome) {
      case 'great':
        // sharper: brighter metal, white-gold flash, a bigger number
        sfx.great();
        this.flash(120, 0xffd34d);
        this.shake(200, 0.012 + tier * 0.002);
        this.ring(0xffd34d, 3.2, 420);
        this.ring(0xffffff, 1.8, 260);
        this.burst(Math.round(70 * density), [0xffd34d, 0xffe9a8, 0xffffff], { speed: [220, 700], life: 700 });
        weapon.flare(0xffd34d, 1.4);
        // skill-made great successes say where they came from
        this.banner(
          result.divine ? '신의 망치!' : result.miracle ? '기적의 불꽃!' : `${info.name}!`,
          `+${before} → +${after}${renamed}`,
          result.divine ? 0xffe27a : info.color,
          result.divine ? 72 : 66,
          0,
          900,
        );
        // 기적의 불꽃 / 과열 단조 actually fired (QA 2026-11-27): its own tag and colour above the result,
        // so it never reads like a plain great success from the table
        if (result.miracle && !result.divine) {
          this.ring(0xff7ad9, 2.6, 380);
          // under the result; further down when a milestone banner takes that spot
          this.banner('✦ 기적의 불꽃 발동', '성공이 대성공으로 바뀌었다', 0xff8ae0, 30, result.milestone ? 178 : 92, 1100);
        }
        settle = 220;
        break;
      case 'success':
        // short: one ping, a quick burst, the number
        sfx.success();
        this.ring(0xff9a3c, 2.0, 300);
        this.burst(Math.round(30 * density), [0xff9a3c, 0xffc46b, 0xff6a1f], { life: 420 });
        weapon.flare(0xff9a3c, 0.7);
        this.banner(info.name, `+${before} → +${after}${renamed}`, info.color, 50, 0, 520);
        break;
      case 'keep':
        sfx.keep();
        this.burst(Math.round(10 * density), [0x9a8d7a, 0xc9b79a], { speed: [60, 200], life: 320 });
        this.banner(info.name, `+${before} 그대로`, info.color, 42, 0, 480);
        break;
      case 'down':
        sfx.down();
        this.crack();
        this.burst(Math.round(14 * density), [0xff4a4a, 0x8a1a1a], { speed: [80, 260], life: 420 });
        // at +0 there is nothing lower: say so instead of "+0 → +0" (QA 2026-11-20)
        this.banner(info.name, before === after ? `+${before} · 최저 단계로 유지` : `+${before} → +${after}${renamed}`, info.color, 48, 0, 560);
        break;
      case 'destroy':
        // short and dry: crack, shards, a beat of silence
        sfx.shatter();
        sfx.silence(260);
        this.flash(160, C.danger);
        this.shake(240, 0.016);
        this.shatter(result);
        this.banner(
          info.name,
          result.phoenix !== null
            ? `불사조의 모루 — 잿더미에서 +${result.phoenix}으로 되살아난다`
            : `${weaponDisplayName(result.weaponBefore)} +${before}이(가) 영구히 사라졌습니다`,
          C.dangerHi,
          60,
          0,
          900,
        );
        settle = 420;
        if (result.phoenix !== null) {
          // the revived weapon rises from the ashes
          settle = 640;
          this.scene.time.delayedCall(420, () => {
            weapon.setVisible(true).setAlpha(0);
            this.scene.tweens.add({ targets: weapon, alpha: 1, duration: 360 });
            weapon.flare(0xff4fa0, 1.2);
            this.ring(0xff4fa0, 2.6, 460);
          });
        }
        break;
    }

    // the strike's own wait; anything a milestone adds on top is held time (no stamina drain)
    const normalSettle = settle;
    // §7.4: milestone on top, in the same moment (no second beat)
    if (m) {
      const glow = ELEMENT_INFO[result.weaponBefore.element].glow;
      sfx.awaken(m.tier);
      this.ring(glow, 3.6, 700);
      this.ring(0xffd34d, 2.6, 560);
      this.burst(40 + m.tier * 18, [glow, 0xffffff, 0xffd34d], { speed: [150, 520], life: 1000, gravity: 120, spread: [0, 360] });
      weapon.flare(glow, 1.6);
      this.flash(140, 0xffffff); // neutral, not the element colour
      if (firstAwakening) {
        // the first awakening: room to see the new form and its name
        this.banner(m.name, `+${m.level} 도달${renamed}`, 0xffe2a0, 46, 104, 1500);
        settle = Math.max(settle, 1100);
      } else {
        this.banner(m.name, `+${m.level} 도달`, 0xffe2a0, 40, 104, 700);
      }
    }

    await this.wait(normalSettle);
    if (settle > normalSettle) {
      hooks.onHold?.(true);
      try {
        await this.wait(settle - normalSettle);
      } finally {
        hooks.onHold?.(false);
      }
    }
  }
}
