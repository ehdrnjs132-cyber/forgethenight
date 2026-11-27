// First-time dialogue cutscene (user request 2026-11-27; lines in config/story.ts).
// Scene 1 at night: the king (the same code-drawn king as the wrath scene) says why he collects rent.
// Scene 2 in the morning: the merchant Morr explains enhancing, selling, the skill tree at night and
// the rent D-day. One sentence at a time in a dialogue box; click / Space / Enter: it fades and the next one comes.
// 「건너뛰기」 or Esc ends it. Then "DAY 1" and the forge.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { SPEAKER_NAME, STORY, STORY_SEEN_ID, type Beat, type StoryLine } from '../../config/story';
import { C, DISPLAY, FONT, H, W, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';
import { drawKing, type KingParts } from '../fx/kingArt';

export interface StoryData {
  /** Scene to start afterwards. */
  next: string;
}

const BOX = PORTRAIT ? { x: 24, w: W - 48, h: 250, y: H - 280 } : { x: 120, w: W - 240, h: 170, y: H - 196 };
const NAME_COLOR: Record<string, number> = { king: 0xff5a4a, me: 0x9ad0ff, morr: C.goldHi, narration: C.mute };

export class StoryScene extends Phaser.Scene {
  private next = 'Forge';
  private index = -1;
  private done = false;
  private sfx = new Sfx();
  private night!: Phaser.GameObjects.Rectangle;
  private morningTint!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Graphics;
  private king!: KingParts;
  private kingScale = 1;
  private morr: Phaser.GameObjects.Image | null = null;
  private nameTag!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private nameBg!: Phaser.GameObjects.Graphics;
  private body_!: Phaser.GameObjects.Text;
  private topic!: Phaser.GameObjects.Container;
  private topicText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('Story');
  }

  create(data: StoryData) {
    this.next = data?.next ?? 'Forge';
    this.index = -1;
    this.done = false;
    this.morr = null;
    this.stampObj = null;
    this.switching = false;

    // the forge behind everything; night over it first, a warm morning later
    const bgKey = this.textures.exists('art-forge_rack_bg') ? 'art-forge_rack_bg' : 'art-forge_bg';
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(W / 2, H / 2, bgKey);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    }
    this.morningTint = this.add.rectangle(W / 2, H / 2, W, H, 0xffb36a, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.night = this.add.rectangle(W / 2, H / 2, W, H, 0x05030a, 0.86);
    this.add.rectangle(W / 2, H / 2, W, H, 0, 0).setInteractive().on('pointerdown', () => this.advance());

    // the king, hidden until the door bursts open
    const k = Math.min(W / 1280, H / 720) * (PORTRAIT ? 0.95 : 0.62);
    this.kingScale = k;
    const kingY = PORTRAIT ? H * 0.52 : H * 0.6;
    this.glow = this.add.graphics().setAlpha(0);
    for (let i = 24; i >= 1; i--) this.glow.fillStyle(0x7a0808, 0.022).fillEllipse(W / 2, kingY - 160 * k, 240 * k + i * 48 * k, 200 * k + i * 36 * k);
    this.king = drawKing(this, W / 2, kingY);
    this.king.king.setScale(k * 0.85).setAlpha(0);

    this.buildBox();
    new Button(this, W - (PORTRAIT ? 100 : 90), PORTRAIT ? 50 : 34, PORTRAIT ? 170 : 150, PORTRAIT ? 52 : 40, '건너뛰기 ▶▶', {
      variant: 'ghost',
      size: PORTRAIT ? 17 : 15,
      sub: PORTRAIT ? undefined : 'Esc',
      onClick: () => this.finish(),
    }).setDepth(50);
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.advance());
    kb.on('keydown-ENTER', () => this.advance());
    kb.on('keydown-ESC', () => this.finish());

    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.time.delayedCall(500, () => this.advance());
  }

  private buildBox() {
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BOX.x + 6, BOX.y + 8, BOX.w, BOX.h, 18);
    g.fillStyle(0x120c08, 0.94).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 18);
    g.lineStyle(3, 0x8a6a3a, 1).strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 18);
    g.lineStyle(1, 0xe9b65c, 0.3).strokeRoundedRect(BOX.x + 7, BOX.y + 7, BOX.w - 14, BOX.h - 14, 13);
    const big = PORTRAIT ? 1.2 : 1;
    // speaker name on a tab above the box
    this.nameBg = this.add.graphics();
    this.nameText = label(this, 0, 0, '', 20 * big, C.goldHi, { weight: 900, origin: [0, 0.5] });
    this.nameTag = this.add.container(BOX.x + 28, BOX.y).setDepth(21);
    this.nameTag.add([this.nameBg, this.nameText]);
    // one sentence at a time, centred in the box
    this.body_ = this.add
      .text(W / 2, BOX.y + BOX.h / 2, '', { fontFamily: FONT, fontSize: `${Math.round(26 * big)}px`, fontStyle: '700', color: '#fff4e2', align: 'center', lineSpacing: 10, wordWrap: { width: BOX.w - 90, useAdvancedWrap: true }, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(21);
    this.hint = label(this, BOX.x + BOX.w - 26, BOX.y + BOX.h - 22, '클릭 · Space ▼', 13 * big, C.mute, { weight: 700, origin: [1, 0.5] }).setDepth(21);
    this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    // Morr's topic banner above the box
    const tg = this.add.graphics();
    this.topicText = label(this, 0, 0, '', 22 * big, 0x1a0f05, { weight: 900, origin: [0.5, 0.5] });
    this.topic = this.add.container(W / 2, BOX.y - (PORTRAIT ? 60 : 46)).setDepth(21).setAlpha(0);
    this.topic.add([tg, this.topicText]);
    this.topic.setData('g', tg);
  }

  /** Click: finish the line being typed, else go to the next one. */
  private advance() {
    if (this.done || this.switching) return;
    this.index++;
    const line = STORY[this.index];
    if (!line) {
      this.finish();
      return;
    }
    this.sfx.click();
    this.show(line);
  }

  private show(line: StoryLine) {
    if (this.stampObj && line.topic !== '④ 수금일') {
      const s = this.stampObj;
      this.stampObj = null;
      this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
    }
    if (line.beat) this.beat(line.beat);
    // name tab
    const name = SPEAKER_NAME[line.speaker];
    this.nameTag.setVisible(!!name);
    if (name) {
      const col = NAME_COLOR[line.speaker];
      this.nameText.setText(name).setColor(Phaser.Display.Color.IntegerToColor(col).rgba);
      const w = this.nameText.width + 40;
      const h = PORTRAIT ? 44 : 38;
      this.nameBg.clear().fillStyle(0x1e140c, 1).fillRoundedRect(-14, -h / 2, w, h, 10);
      this.nameBg.lineStyle(2, col, 1).strokeRoundedRect(-14, -h / 2, w, h, 10);
      this.nameText.setPosition(6, 0);
    }
    // topic banner (Morr's tips)
    const g = this.topic.getData('g') as Phaser.GameObjects.Graphics;
    if (line.topic) {
      const changed = this.topicText.text !== line.topic;
      this.topicText.setText(line.topic);
      const w = this.topicText.width + 60;
      const h = PORTRAIT ? 54 : 46;
      g.clear().fillStyle(0xe9b65c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      g.lineStyle(3, 0xffe7a8, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      if (changed) {
        this.topic.setAlpha(0).setScale(0.7);
        this.tweens.add({ targets: this.topic, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
    } else if (this.topic.alpha > 0) {
      this.tweens.add({ targets: this.topic, alpha: 0, duration: 200 });
      this.topicText.setText('');
    }
    // narration in grey italics, inner thoughts in light blue
    const color = line.speaker === 'narration' ? '#c9bfae' : line.speaker === 'me' ? '#d6ecff' : '#fff4e2';
    this.body_.setColor(color).setFontStyle(line.speaker === 'narration' ? 'italic 700' : '700');
    this.type(line.text);
  }

  /** One sentence per click: the last one fades away, the new one rises in (user 2026-11-27). */
  private type(text: string) {
    this.switching = true;
    this.hint.setVisible(false);
    const y = BOX.y + BOX.h / 2;
    this.tweens.killTweensOf(this.body_);
    this.tweens.add({
      targets: this.body_,
      alpha: 0,
      duration: this.body_.text ? 140 : 0,
      onComplete: () => {
        this.body_.setText(text).setY(y + 10);
        this.tweens.add({
          targets: this.body_,
          alpha: 1,
          y,
          duration: 240,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.switching = false;
            this.hint.setVisible(true);
          },
        });
      },
    });
  }

  /** A sentence is fading in or out: clicks wait for it. */
  private switching = false;

  private beat(b: Beat) {
    const { king, rim, eyes, eyeGlow, mouth } = this.king;
    const k = this.kingScale;
    switch (b) {
      case 'kingEnters':
        this.sfx.slam();
        this.cameras.main.shake(420, 0.016);
        this.cameras.main.flash(240, 120, 0, 0);
        this.glow.setAlpha(1);
        this.tweens.add({ targets: king, alpha: 1, scale: k, duration: 520, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: rim, alpha: { from: 0.6, to: 1 }, duration: 160, yoyo: true, repeat: -1 });
        this.time.delayedCall(600, () => {
          this.tweens.add({ targets: eyes, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
          this.tweens.add({ targets: eyeGlow, alpha: 1, duration: 300 });
          this.tweens.add({ targets: eyeGlow, alpha: 0.55, duration: 420, yoyo: true, repeat: -1, delay: 300 });
        });
        break;
      case 'kingGrins':
        this.sfx.roar(1.2);
        this.tweens.add({ targets: mouth, alpha: 1, duration: 120 });
        this.cameras.main.shake(450, 0.014);
        this.cameras.main.flash(260, 170, 0, 0);
        this.tweens.add({ targets: king, scale: k * 1.12, y: king.y + 26 * k, duration: 1200, ease: 'Sine.easeIn' });
        break;
      case 'kingLeaves':
        this.tweens.add({ targets: [king, this.glow], alpha: 0, duration: 900, ease: 'Sine.easeIn' });
        break;
      case 'morning': {
        this.tweens.add({ targets: this.night, alpha: 0.25, duration: 1200 });
        this.tweens.add({ targets: this.morningTint, alpha: 0.12, duration: 1200 });
        if (this.textures.exists('art-morr')) {
          const x = PORTRAIT ? W / 2 : W * 0.24;
          this.morr = this.add.image(x - 80, BOX.y + 12, 'art-morr').setOrigin(0.5, 1).setDepth(10).setAlpha(0);
          this.morr.setScale(PORTRAIT ? 0.8 : 0.82);
          this.tweens.add({ targets: this.morr, x, alpha: 1, duration: 600, ease: 'Cubic.easeOut' });
        }
        break;
      }
      case 'stamp': {
        // the same D-day the evening screen shows from now on
        const cx = PORTRAIT ? W / 2 : W * 0.62;
        const cy = PORTRAIT ? H * 0.3 : H * 0.36;
        const stamp = this.add.container(cx, cy).setDepth(30).setAngle(-8);
        const sg = this.add.graphics();
        sg.fillStyle(0x2a0808, 0.92).fillRoundedRect(-170, -90, 340, 180, 22);
        sg.lineStyle(6, 0xff3a2a, 1).strokeRoundedRect(-170, -90, 340, 180, 22);
        sg.lineStyle(2, 0xff3a2a, 0.6).strokeRoundedRect(-158, -78, 316, 156, 16);
        const head = label(this, 0, -54, '👑 왕의 수금까지', 20, 0xffb0a0, { weight: 900, origin: [0.5, 0.5] });
        const big = this.add
          .text(0, 12, '월세 D-7', { fontFamily: DISPLAY, fontSize: '70px', fontStyle: '900', color: '#ff3a2a', stroke: '#000000', strokeThickness: 8, resolution: 2 })
          .setOrigin(0.5);
        stamp.add([sg, head, big]);
        stamp.setScale(2.4).setAlpha(0);
        this.tweens.add({
          targets: stamp,
          scale: 1,
          alpha: 1,
          duration: 240,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.sfx.slam();
            this.cameras.main.shake(260, 0.012);
          },
        });
        this.stampObj = stamp; // stays while Morr talks about the D-day
        break;
      }
    }
  }

  private stampObj: Phaser.GameObjects.Container | null = null;

  private finish() {
    if (this.done) return;
    this.done = true;
    (this.registry.get('core') as GameCore).markSeen(STORY_SEEN_ID);
    // "DAY 1", then the forge
    const black = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(60);
    const day = label(this, W / 2, H / 2, 'DAY 1', PORTRAIT ? 64 : 60, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setDepth(61).setAlpha(0);
    day.setStroke('#140a05', 8);
    this.tweens.add({ targets: black, fillAlpha: 1, duration: 500 });
    this.tweens.add({ targets: day, alpha: 1, duration: 500, delay: 400 });
    this.time.delayedCall(1900, () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.next));
    });
  }
}
