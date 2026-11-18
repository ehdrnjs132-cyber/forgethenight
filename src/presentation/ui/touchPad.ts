// On-screen controls for phones (user request 2026-11-18: landscape play on a phone).
// Left half: a floating joystick that appears where the thumb lands. Right side: attack (hold to keep
// the combo going), heavy (hold to charge, release to strike), dash and the element skill.
import Phaser from 'phaser';
import { DISPLAY, H, W } from '../theme';

/** True on touch-first devices (phones, tablets); a laptop with a touch screen keeps mouse controls. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

export interface TouchHandlers {
  dash(): void;
  skill(): void;
  heavyStart(): void;
  heavyEnd(): void;
}

const JOY = { radius: 78, knob: 34, zoneRight: W * 0.48 };

export class TouchPad {
  /** Joystick direction, length 0..1. */
  readonly move = new Phaser.Math.Vector2();
  attackHeld = false;
  /** A quick tap can start and end between two frames; this keeps it until the scene reads it. */
  private tapped = false;
  private joyId: number | null = null;
  private readonly origin = new Phaser.Math.Vector2();
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  /** True once per attack-button press. */
  takeTap(): boolean {
    const t = this.tapped;
    this.tapped = false;
    return t;
  }

  constructor(scene: Phaser.Scene, h: TouchHandlers) {
    scene.input.addPointer(3);
    const depth = 120;
    this.base = scene.add.circle(0, 0, JOY.radius, 0x000000, 0.28).setStrokeStyle(3, 0xffffff, 0.35).setScrollFactor(0).setDepth(depth).setVisible(false);
    this.knob = scene.add.circle(0, 0, JOY.knob, 0xffffff, 0.35).setScrollFactor(0).setDepth(depth + 1).setVisible(false);
    // resting hint where the thumb usually goes
    scene.add.circle(170, H - 170, JOY.radius, 0xffffff, 0.06).setStrokeStyle(2, 0xffffff, 0.15).setScrollFactor(0).setDepth(depth - 1);

    const btn = (x: number, y: number, r: number, text: string, color: number, down: () => void, up?: () => void) => {
      const c = scene.add.circle(x, y, r, color, 0.55).setStrokeStyle(4, 0xffffff, 0.55).setScrollFactor(0).setDepth(depth).setInteractive();
      scene.add.text(x, y, text, { fontFamily: DISPLAY, fontSize: `${Math.round(r * 0.42)}px`, fontStyle: '900', color: '#ffffff', stroke: '#140a05', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);
      c.on('pointerdown', () => {
        c.setFillStyle(color, 0.85);
        down();
      });
      const release = () => {
        c.setFillStyle(color, 0.55);
        up?.();
      };
      c.on('pointerup', release);
      c.on('pointerout', release);
      return c;
    };
    btn(W - 130, H - 130, 82, '공격', 0xb3402a, () => {
      this.attackHeld = true;
      this.tapped = true;
    }, () => (this.attackHeld = false));
    btn(W - 285, H - 90, 54, '강공격', 0x7a2a8a, () => h.heavyStart(), () => h.heavyEnd());
    btn(W - 255, H - 235, 50, '대시', 0x2a6a9a, () => h.dash());
    btn(W - 115, H - 295, 50, '속성', 0x9a7a2a, () => h.skill());

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.joyId !== null || over.length > 0 || p.x > JOY.zoneRight || p.y < 110) return;
      this.joyId = p.id;
      this.origin.set(p.x, p.y);
      this.base.setPosition(p.x, p.y).setVisible(true);
      this.knob.setPosition(p.x, p.y).setVisible(true);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyId) return;
      const d = new Phaser.Math.Vector2(p.x - this.origin.x, p.y - this.origin.y);
      const len = Math.min(JOY.radius, d.length());
      if (d.lengthSq() > 0) d.normalize();
      this.move.copy(d).scale(len / JOY.radius);
      this.knob.setPosition(this.origin.x + d.x * len, this.origin.y + d.y * len);
    });
    const end = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyId) return;
      this.joyId = null;
      this.move.set(0, 0);
      this.base.setVisible(false);
      this.knob.setVisible(false);
    };
    scene.input.on('pointerup', end);
    scene.input.on('pointerupoutside', end);
  }
}
