// Modal overlay (§8.4): pauses the scene underneath, blocks all background input,
// 200 ms transitions, keyboard support. Used for the first-enhance tutorial and confirmations.
import Phaser from 'phaser';
import { FIRST_ENHANCE_TUTORIAL } from '../../config/tutorials';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';

export interface TutorialModal {
  kind: 'tutorial';
  /** Replaying from the help button: the rule was already accepted. */
  replay?: boolean;
  onComplete?: () => void;
}

export interface ConfirmModal {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export type ModalRequest = TutorialModal | ConfirmModal;
export type ModalData = ModalRequest & { returnTo: string };

export class ModalScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private closing = false;
  private returnTo = 'Forge';

  constructor() {
    super('Modal');
  }

  create(data: ModalData) {
    this.closing = false;
    this.input.enabled = true;
    this.returnTo = data.returnTo;
    // Full-screen dim that swallows every click (§8.4 배경 입력 차단).
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.74).setInteractive();
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    this.root = this.add.container(W / 2, H / 2).setAlpha(0).setScale(0.97);
    this.tweens.add({ targets: this.root, alpha: 1, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    if (data.kind === 'tutorial') this.buildTutorial(data);
    else this.buildConfirm(data);
  }

  private close(after?: () => void) {
    if (this.closing) return;
    this.closing = true;
    this.input.enabled = false;
    this.input.keyboard?.removeAllListeners();
    this.tweens.add({
      targets: this.children.list,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.scene.resume(this.returnTo);
        this.scene.stop();
        after?.();
      },
    });
  }

  private frame(w: number, h: number, accent: number) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 10, w, h, 14);
    g.fillStyle(0x15110e, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(1, 0x4a3825, 1);
    g.strokeRoundedRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, 14);
    g.fillStyle(accent, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, 4, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.root.add(g);
    return g;
  }

  // ───────────────────────── first-enhance tutorial (§8.2)
  private buildTutorial(data: TutorialModal) {
    const spec = FIRST_ENHANCE_TUTORIAL;
    const pw = 720;
    const ph = 440;
    let step = 0;
    let checked = data.replay === true;

    this.frame(pw, ph, C.gold);
    const header = label(this, -pw / 2 + 32, -ph / 2 + 26, data.replay ? '강화 규칙 다시 보기' : '첫 강화 전에 꼭 알아 두세요', 14, C.mute, { weight: 700 });
    const counter = label(this, pw / 2 - 70, -ph / 2 + 26, '', 14, C.mute, { weight: 700, origin: [1, 0] });
    const dots = this.add.graphics();
    const content = this.add.container(0, 0);
    const title = label(this, -pw / 2 + 48, -ph / 2 + 92, '', 30, C.goldHi, { weight: 900 });
    const body = label(this, -pw / 2 + 48, -ph / 2 + 150, '', 19, C.text, { wrap: pw - 96, lineSpacing: 10 });
    content.add([title, body]);

    // checkbox (step 3 only)
    const check = this.add.container(-pw / 2 + 48, ph / 2 - 136);
    const box = this.add.graphics();
    const checkText = label(this, 38, 0, spec.confirmLabel, 18, C.text, { weight: 700, origin: [0, 0.5] });
    const hit = this.add.zone(-6, -20, 40 + checkText.width + 12, 40).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    check.add([box, checkText, hit]);
    const drawBox = () => {
      box.clear();
      box.fillStyle(checked ? C.danger : 0x0c0a08, 1);
      box.fillRoundedRect(0, -13, 26, 26, 5);
      box.lineStyle(2, checked ? C.dangerHi : C.danger, 1);
      box.strokeRoundedRect(0, -13, 26, 26, 5);
      if (checked) {
        box.lineStyle(4, 0xffffff, 1);
        box.beginPath();
        box.moveTo(6, 0);
        box.lineTo(11, 6);
        box.lineTo(21, -6);
        box.strokePath();
      }
    };

    const prev = new Button(this, -pw / 2 + 110, ph / 2 - 52, 150, 48, '이전', { variant: 'ghost', onClick: () => go(-1) });
    const next = new Button(this, pw / 2 - 120, ph / 2 - 52, 180, 52, '다음', { variant: 'gold', onClick: () => go(1) });
    const closeBtn = new Button(this, pw / 2 - 34, -ph / 2 + 30, 40, 34, '×', { variant: 'ghost', size: 22, onClick: () => this.close() });
    this.root.add([header, counter, dots, content, check, prev, next, closeBtn]);

    const last = spec.steps.length - 1;
    const render = () => {
      const s = spec.steps[step];
      title.setText(s.title).setColor(s.tone === 'danger' ? '#ff6b6b' : '#ffe2a0');
      body.setText(s.body);
      counter.setText(`${step + 1} / ${spec.steps.length}`);
      dots.clear();
      spec.steps.forEach((_, i) => {
        const x = -24 + i * 24;
        dots.fillStyle(i === step ? (s.tone === 'danger' ? C.danger : C.gold) : 0x3a2f24, 1);
        dots.fillCircle(x, -ph / 2 + 34, i === step ? 6 : 4);
      });
      check.setVisible(step === last);
      drawBox();
      prev.setVisible(step > 0);
      if (step === last) {
        next.setLabel(data.replay ? '닫기' : '완료');
        next.setEnabled(checked);
      } else {
        next.setLabel('다음');
        next.setEnabled(true);
      }
    };

    const go = (dir: number) => {
      if (dir > 0 && step === last) {
        if (!checked) return;
        this.close(data.replay ? undefined : data.onComplete);
        return;
      }
      const target = Phaser.Math.Clamp(step + dir, 0, last);
      if (target === step) return;
      this.tweens.add({
        targets: content,
        alpha: 0,
        x: -16 * dir,
        duration: 100,
        onComplete: () => {
          step = target;
          render();
          content.x = 16 * dir;
          this.tweens.add({ targets: content, alpha: 1, x: 0, duration: 100 });
        },
      });
    };

    hit.on('pointerup', () => {
      checked = !checked;
      render();
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => go(-1));
    kb.on('keydown-RIGHT', () => go(1));
    kb.on('keydown-ENTER', () => go(1));
    kb.on('keydown-SPACE', () => {
      if (step === last) {
        checked = !checked;
        render();
      }
    });
    kb.on('keydown-ESC', () => this.close());
    render();
  }

  // ───────────────────────── confirmation (§7.5 last weapon)
  private buildConfirm(data: ConfirmModal) {
    const pw = 580;
    const ph = 300;
    const accent = data.danger ? C.danger : C.gold;
    this.frame(pw, ph, accent);
    const title = label(this, 0, -ph / 2 + 54, data.title, 26, data.danger ? C.dangerHi : C.goldHi, { weight: 900, origin: [0.5, 0.5] });
    const body = label(this, 0, -12, data.body, 17, C.text, { wrap: pw - 80, align: 'center', origin: [0.5, 0.5], lineSpacing: 8 });
    const cancel = new Button(this, -130, ph / 2 - 52, 200, 52, data.cancelLabel ?? '취소', { variant: 'dark', sub: 'Esc', onClick: () => this.close(data.onCancel) });
    const ok = new Button(this, 130, ph / 2 - 52, 200, 52, data.confirmLabel, { variant: data.danger ? 'danger' : 'gold', onClick: () => this.close(data.onConfirm) });
    this.root.add([title, body, cancel, ok]);
    this.input.keyboard!.on('keydown-ESC', () => this.close(data.onCancel));
  }
}
