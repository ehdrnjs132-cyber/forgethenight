// 운명의 카드 (user request 2026-11-26), opened from the evening screen from DAY 10, once a day.
//   1. two face-down cards: tap one (you may change your mind until you bet)
//   2. drag the bar from left to right: the bet grows from 0 to all of your gold
//   3. 베팅 완료: the result is decided and saved, then your card turns — O pays the bet doubled,
//      X loses it — and the other card turns too.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { betFromShare } from '../../core/systems/cards';
import { CARD_GAME, WEAPON_CARD } from '../../config/economy';
import { C, DISPLAY, FONT, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

const CARD_W = PORTRAIT ? 230 : 170;
const CARD_H = PORTRAIT ? 330 : 240;
const CARD_Y = PORTRAIT ? H * 0.35 : H * 0.41;
const CARD_GAP = PORTRAIT ? 40 : 60;
const BAR = { y: PORTRAIT ? H * 0.68 : H * 0.765, w: PORTRAIT ? W - 120 : 560, h: 16 };

interface CardView {
  c: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Graphics;
  face: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  baseY: number;
}

export class CardScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private cards: CardView[] = [];
  private pick: 0 | 1 | null = null;
  private share = 0;
  private dragging = false;
  private done = false;
  private revealed = false;
  private closing = false;
  private betUi!: Phaser.GameObjects.Container;
  private barG!: Phaser.GameObjects.Graphics;
  private handle!: Phaser.GameObjects.Container;
  private amountText!: Phaser.GameObjects.Text;
  private shareText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private confirmBtn!: Button;
  private closeBtn!: Button;
  private onClose: () => void = () => {};

  constructor() {
    super('Cards');
  }

  /** 'gold': bet gold on the bar (DAY 10+). 'weapons': every weapon at stake, +10 or destroyed (DAY 30+). */
  private mode: 'gold' | 'weapons' = 'gold';

  create(data: { onClose?: () => void; mode?: 'gold' | 'weapons' }) {
    this.core = this.registry.get('core') as GameCore;
    this.onClose = data?.onClose ?? (() => {});
    this.mode = data?.mode ?? 'gold';
    this.cards = [];
    this.pick = null;
    this.share = 0;
    this.dragging = false;
    this.done = false;
    this.revealed = false;
    this.closing = false;
    const big = PORTRAIT ? 1.15 : 1;

    // its own dark table (opaque: the evening choices must not show through)
    const table = this.add.graphics();
    table.fillGradientStyle(0x14081e, 0x14081e, 0x05030a, 0x05030a, 1).fillRect(0, 0, W, H);
    this.add.zone(W / 2, H / 2, W, H).setInteractive();
    // a faint felt table glow
    const glow = this.add.graphics();
    for (let i = 10; i >= 1; i--) glow.fillStyle(0x3a1a5a, 0.03).fillEllipse(W / 2, CARD_Y, 260 * big + i * 70, 180 * big + i * 50);

    const weapons = this.mode === 'weapons';
    const s0 = this.core.state;
    label(this, W / 2, PORTRAIT ? 70 : 52, weapons ? '⚔ 운명의 무기 카드' : '🃏 운명의 카드', 34 * big, weapons ? 0xff6b6b : C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    this.hint = label(
      this,
      W / 2,
      PORTRAIT ? 118 : 94,
      weapons ? `카드 한 장을 고르세요 · O면 모든 무기 +${WEAPON_CARD.levels}, X면 모든 무기가 부서진다` : '카드 한 장을 고르세요 · O면 베팅의 2배를 받고, X면 베팅을 잃는다',
      15 * big,
      C.text,
      { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: W - 60 },
    );
    const best = Math.max(0, ...s0.weapons.map((w) => w.level));
    label(this, W / 2, PORTRAIT ? 152 : 120, weapons ? `걸린 무기 ${s0.weapons.length}자루 · 최고 +${best} · 하루 한 번` : `가진 골드 ${s0.gold.toLocaleString()}G · 하루 한 번`, 13 * big, C.mute, {
      weight: 700,
      origin: [0.5, 0.5],
    });

    for (const i of [0, 1] as const) this.cards.push(this.buildCard(i));
    this.buildBet(big);
    this.closeBtn = new Button(this, W - 44, PORTRAIT ? 70 : 52, 52, 44, '×', { variant: 'ghost', size: 26, onClick: () => this.close() });

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.close());
    kb.on('keydown-LEFT', () => this.setShare(this.share - 0.05));
    kb.on('keydown-RIGHT', () => this.setShare(this.share + 0.05));
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  // ───────────────────────── cards
  private buildCard(i: 0 | 1): CardView {
    const x = W / 2 + (i === 0 ? -1 : 1) * (CARD_W / 2 + CARD_GAP / 2);
    const c = this.add.container(x, CARD_Y);
    const ring = this.add.graphics().setAlpha(0);
    ring.lineStyle(6, 0xffd34d, 1).strokeRoundedRect(-CARD_W / 2 - 8, -CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, 18);
    // back: dark violet with a gold frame, a diamond lattice and a big "?"
    const back = this.add.graphics();
    back.fillStyle(0x000000, 0.4).fillRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 8, CARD_W, CARD_H, 14);
    back.fillStyle(0x24123a, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    back.lineStyle(4, 0xc99a3c, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    // a grid of small gold diamonds inside the frame (moves with the card, no mask needed)
    back.fillStyle(0xc99a3c, 0.35);
    const step = 22;
    for (let yy = -CARD_H / 2 + 18; yy <= CARD_H / 2 - 18; yy += step)
      for (let xx = -CARD_W / 2 + 18 + ((Math.round((yy + CARD_H) / step) % 2) * step) / 2; xx <= CARD_W / 2 - 18; xx += step)
        back.fillPoints([new Phaser.Math.Vector2(xx, yy - 5), new Phaser.Math.Vector2(xx + 5, yy), new Phaser.Math.Vector2(xx, yy + 5), new Phaser.Math.Vector2(xx - 5, yy)], true);
    back.fillStyle(0x24123a, 1).fillCircle(0, 0, CARD_W * 0.28);
    back.lineStyle(3, 0xc99a3c, 1).strokeCircle(0, 0, CARD_W * 0.28);
    const q = this.add
      .text(0, 0, '?', { fontFamily: DISPLAY, fontSize: `${Math.round(CARD_W * 0.38)}px`, fontStyle: '900', color: '#ffd34d', resolution: 2 })
      .setOrigin(0.5);
    const face = this.add.container(0, 0).setVisible(false);
    c.add([ring, back, q, face]);
    c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => !this.done && this.pick !== i && this.tweens.add({ targets: c, y: CARD_Y - 8, duration: 120 }));
    c.on('pointerout', () => !this.done && this.pick !== i && this.tweens.add({ targets: c, y: CARD_Y, duration: 120 }));
    c.on('pointerup', () => this.choose(i));
    (c as Phaser.GameObjects.Container & { q?: Phaser.GameObjects.Text }).q = q;
    return { c, back, face, ring, baseY: CARD_Y };
  }

  private choose(i: 0 | 1) {
    if (this.done) return;
    this.pick = i;
    this.sfx.click();
    this.cards.forEach((v, k) => {
      const on = k === i;
      this.tweens.add({ targets: v.c, y: on ? CARD_Y - 14 : CARD_Y, alpha: on ? 1 : 0.55, scale: on ? 1.05 : 0.96, duration: 180, ease: 'Back.easeOut' });
      this.tweens.add({ targets: v.ring, alpha: on ? 1 : 0, duration: 150 });
    });
    this.hint.setText(this.mode === 'weapons' ? '정말 무기 전부를 걸겠습니까? 아래 버튼을 누르면 카드가 뒤집힌다' : '이제 아래 막대를 왼쪽에서 오른쪽으로 끌어 베팅하세요');
    if (!this.betUi.visible) {
      this.betUi.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.betUi, alpha: 1, duration: 250 });
    }
    this.renderBet();
  }

  // ───────────────────────── the bet bar
  private buildBet(big: number) {
    const x0 = W / 2 - BAR.w / 2;
    const ui = (this.betUi = this.add.container(0, 0).setVisible(false));
    if (this.mode === 'weapons') {
      // no bar: the stake is every weapon on the rack
      const n = this.core.state.weapons.length;
      ui.add(label(this, W / 2, BAR.y - 40 * big, `걸린 것: 무기 ${n}자루 전부`, 30 * big, 0xff6b6b, { weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 6));
      ui.add(label(this, W / 2, BAR.y + 4, `O면 모두 +${WEAPON_CARD.levels} · X면 모두 부서진다 · 되돌릴 수 없다`, 15 * big, C.text, { weight: 700, origin: [0.5, 0.5] }));
      this.confirmBtn = new Button(this, W / 2, BAR.y + (PORTRAIT ? 120 : 92), PORTRAIT ? 380 : 320, PORTRAIT ? 70 : 58, `무기 ${n}자루를 건다`, {
        variant: 'danger',
        size: 22 * big,
        onClick: () => this.confirm(),
      });
      ui.add(this.confirmBtn);
      return;
    }
    ui.add(label(this, x0, BAR.y - 62 * big, '베팅', 16 * big, C.mute, { weight: 900, origin: [0, 0.5] }));
    this.amountText = label(this, W / 2, BAR.y - 56 * big, '', 34 * big, C.goldHi, { weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 6);
    this.shareText = label(this, x0 + BAR.w, BAR.y - 62 * big, '', 15 * big, C.text, { weight: 700, origin: [1, 0.5] });
    this.barG = this.add.graphics();
    ui.add([this.amountText, this.shareText, this.barG]);
    for (const p of [0, 25, 50, 75, 100]) {
      ui.add(label(this, x0 + (BAR.w * p) / 100, BAR.y + 30, `${p}%`, 12 * big, C.dim, { weight: 700, origin: [0.5, 0.5] }));
    }
    // handle: a gold coin to drag
    this.handle = this.add.container(x0, BAR.y);
    const hg = this.add.graphics();
    hg.fillStyle(0x000000, 0.4).fillCircle(2, 3, 22);
    hg.fillStyle(0xe3a443, 1).fillCircle(0, 0, 22);
    hg.lineStyle(3, 0xffe2a0, 1).strokeCircle(0, 0, 22);
    hg.lineStyle(2, 0x8a5a14, 1).strokeCircle(0, 0, 14);
    this.handle.add([hg, label(this, 0, 0, 'G', 16, 0x5a3608, { weight: 900, origin: [0.5, 0.5] })]);
    ui.add(this.handle);
    // drag anywhere on the bar (a tall hit area, easy on phones)
    const zone = this.add.zone(W / 2, BAR.y, BAR.w + 60, 70).setInteractive({ useHandCursor: true });
    ui.add(zone);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setShareFromX(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.dragging && p.isDown && this.setShareFromX(p.x));
    this.input.on('pointerup', () => (this.dragging = false));
    this.confirmBtn = new Button(this, W / 2, BAR.y + (PORTRAIT ? 120 : 92), PORTRAIT ? 360 : 300, PORTRAIT ? 70 : 58, '베팅 완료', {
      variant: 'gold',
      size: 24 * big,
      onClick: () => this.confirm(),
    });
    ui.add(this.confirmBtn);
    this.renderBet();
  }

  private setShareFromX(x: number) {
    this.setShare((x - (W / 2 - BAR.w / 2)) / BAR.w);
  }

  private setShare(t: number) {
    if (this.done || this.pick === null) return;
    const before = this.bet();
    this.share = Phaser.Math.Clamp(t, 0, 1);
    if (this.bet() !== before && Math.floor(this.share * 20) !== Math.floor((before / Math.max(1, this.core.state.gold)) * 20)) this.sfx.click();
    this.renderBet();
  }

  private bet(): number {
    return betFromShare(this.core.state.gold, this.share);
  }

  private renderBet() {
    if (this.mode === 'weapons') {
      this.confirmBtn.setEnabled(this.pick !== null && !this.done);
      return;
    }
    const x0 = W / 2 - BAR.w / 2;
    const g = this.barG;
    const t = this.share;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(x0 - 3, BAR.y - BAR.h / 2 - 3, BAR.w + 6, BAR.h + 6, (BAR.h + 6) / 2);
    g.fillStyle(0x3a2c48, 1).fillRoundedRect(x0, BAR.y - BAR.h / 2, BAR.w, BAR.h, BAR.h / 2);
    g.lineStyle(2, 0xc99a3c, 0.7).strokeRoundedRect(x0 - 3, BAR.y - BAR.h / 2 - 3, BAR.w + 6, BAR.h + 6, (BAR.h + 6) / 2);
    // quarter marks
    g.lineStyle(2, 0xc99a3c, 0.5);
    for (const p of [0.25, 0.5, 0.75]) g.lineBetween(x0 + BAR.w * p, BAR.y - BAR.h / 2 - 6, x0 + BAR.w * p, BAR.y + BAR.h / 2 + 6);
    // the fill warms from gold to red as more of the purse is on the line
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0xffd34d), Phaser.Display.Color.ValueToColor(0xd11f2a), 100, t * 100);
    if (t > 0) g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).fillRoundedRect(x0, BAR.y - BAR.h / 2, Math.max(BAR.h, BAR.w * t), BAR.h, BAR.h / 2);
    this.handle.x = x0 + BAR.w * t;
    const bet = this.bet();
    const gold = this.core.state.gold;
    this.amountText.setText(`${bet.toLocaleString()}G`);
    this.shareText.setText(`가진 돈의 ${gold > 0 ? Math.round((bet / gold) * 100) : 0}%`);
    this.confirmBtn.setEnabled(this.pick !== null && bet >= 1 && !this.done);
    this.confirmBtn.setLabel(bet >= 1 ? `베팅 완료 · ${bet.toLocaleString()}G` : '막대를 끌어 베팅하세요');
  }

  // ───────────────────────── the reveal
  private confirm() {
    if (this.done || this.pick === null) return;
    const pick = this.pick;
    // the result is decided and saved before anything turns
    let faces: ['O' | 'X', 'O' | 'X'];
    let show: () => void;
    if (this.mode === 'weapons') {
      const r = this.core.dispatch({ type: 'WEAPON_CARD', pick });
      if (r.type !== 'weaponCardPlayed') {
        this.sfx.denied();
        return;
      }
      faces = r.faces;
      show = () => this.showWeaponResult(r.win, r.count);
    } else {
      const r = this.core.dispatch({ type: 'CARD_BET', pick, bet: this.bet() });
      if (r.type !== 'cardPlayed') {
        this.sfx.denied();
        return;
      }
      faces = r.faces;
      show = () => this.showResult(r.win, r.bet, r.payout, r.goldBefore, r.goldAfter);
    }
    this.done = true;
    this.confirmBtn.setEnabled(false);
    this.closeBtn.setVisible(false);
    this.tweens.add({ targets: this.betUi, alpha: 0.35, duration: 200 });
    this.hint.setText('카드가 떨린다…');
    // the chosen card teases before it turns; the result lands with it, then the other card follows
    this.teaseFlip(pick, faces[pick], () => {
      show();
      this.time.delayedCall(500, () => this.flip((1 - pick) as 0 | 1, faces[1 - pick], false));
    });
  }

  /**
   * The chosen card (user request 2026-11-26: "간질거리게 회전하면서 느리게"): it lifts and trembles, rocks
   * side to side, half-turns twice and falls back as if changing its mind, then turns over slowly.
   */
  private teaseFlip(i: 0 | 1, face: 'O' | 'X', onDone: () => void) {
    const v = this.cards[i];
    const c = v.c;
    const sx = c.scaleX;
    const sy = c.scaleY;
    const chain: (() => void)[] = [];
    const next = () => chain.shift()?.();
    // 1. lift and tremble, with a heartbeat
    chain.push(() => {
      this.sfx.heartbeat();
      this.tweens.add({ targets: c, y: CARD_Y - 30, duration: 300, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: c, angle: { from: -3, to: 3 }, duration: 70, yoyo: true, repeat: 6, ease: 'Sine.easeInOut', onComplete: next });
      this.time.delayedCall(450, () => this.sfx.heartbeat());
    });
    // 2. rock slowly side to side
    chain.push(() => {
      this.hint.setText('뒤집힐 듯 말 듯…');
      this.tweens.add({ targets: c, angle: { from: -8, to: 8 }, duration: 260, yoyo: true, repeat: 1, ease: 'Sine.easeInOut', onComplete: next });
    });
    // 3. two teasing half-turns that fall back
    for (const depth of [0.4, 0.15]) {
      chain.push(() => {
        this.sfx.raise();
        this.tweens.add({ targets: c, scaleX: sx * depth, angle: 0, duration: 380, ease: 'Sine.easeInOut', yoyo: true, hold: 120, onComplete: next });
      });
    }
    // 4. the slow turn, tipping as it goes
    chain.push(() => {
      this.sfx.heartbeat();
      this.tweens.add({
        targets: c,
        scaleX: 0,
        angle: 10,
        scaleY: sy * 1.08,
        duration: 650,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.showFace(v, face);
          this.tweens.add({ targets: c, scaleX: sx * 1.1, angle: 0, scaleY: sy * 1.1, duration: 650, ease: 'Back.easeOut', onComplete: next });
          this.landSound(face);
        },
      });
    });
    chain.push(() => {
      this.tweens.add({ targets: c, scaleX: sx, scaleY: sy, y: CARD_Y - 14, duration: 200 });
      onDone();
    });
    next();
  }

  private showFace(v: CardView, face: 'O' | 'X') {
    v.back.setVisible(false);
    (v.c as Phaser.GameObjects.Container & { q?: Phaser.GameObjects.Text }).q?.setVisible(false);
    this.drawFace(v, face);
    v.face.setVisible(true);
  }

  private landSound(face: 'O' | 'X') {
    if (face === 'O') {
      this.sfx.great();
      this.cameras.main.flash(220, 255, 220, 120);
    } else {
      this.sfx.shatter();
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.flash(200, 160, 0, 0);
    }
  }

  /** The card you did not pick: a quick plain turn. */
  private flip(i: 0 | 1, face: 'O' | 'X', mine: boolean) {
    const v = this.cards[i];
    const sx = v.c.scaleX;
    this.tweens.add({
      targets: v.c,
      scaleX: 0,
      duration: 150,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.showFace(v, face);
        this.tweens.add({ targets: v.c, scaleX: sx, duration: 170, ease: 'Back.easeOut' });
        if (mine) {
          if (face === 'O') {
            this.sfx.great();
            this.cameras.main.flash(220, 255, 220, 120);
          } else {
            this.sfx.shatter();
            this.cameras.main.shake(260, 0.012);
            this.cameras.main.flash(200, 160, 0, 0);
          }
        }
      },
    });
  }

  private drawFace(v: CardView, face: 'O' | 'X') {
    const win = face === 'O';
    const g = this.add.graphics();
    g.fillStyle(0xf3ead8, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    g.lineStyle(5, win ? 0x3aa84a : 0xc0262e, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    const t = this.add
      .text(0, -6, face, { fontFamily: FONT, fontSize: `${Math.round(CARD_W * 0.7)}px`, fontStyle: '900', color: win ? '#2f9a40' : '#c0262e', resolution: 2 })
      .setOrigin(0.5);
    v.face.add([g, t]);
  }

  private showResult(win: boolean, bet: number, payout: number, before: number, after: number) {
    const big = PORTRAIT ? 1.15 : 1;
    const y = PORTRAIT ? H * 0.58 : H * 0.63;
    const head = this.add
      // the big number is what the purse actually gained or lost
      .text(W / 2, y, win ? `O!  +${(after - before).toLocaleString()}G` : `X…  −${bet.toLocaleString()}G`, {
        fontFamily: FONT,
        fontSize: `${Math.round(44 * big)}px`,
        fontStyle: '900',
        color: win ? css(0x7dff8a) : css(C.dangerHi),
        stroke: '#000000',
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScale(1.8)
      .setAlpha(0)
      .setDepth(10);
    this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    const sub = label(this, W / 2, y + 48 * big, `${win ? `베팅 ${bet.toLocaleString()}G의 ${CARD_GAME.payoutMul}배인 ${payout.toLocaleString()}G를 받았다` : '베팅한 골드를 잃었다'} · 골드 ${before.toLocaleString()} → ${after.toLocaleString()}G`, 16 * big, C.text, {
      weight: 700,
      origin: [0.5, 0.5],
    })
      .setStroke('#000000', 5)
      .setAlpha(0)
      .setDepth(10);
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 200 });
    if (win) this.time.delayedCall(250, () => this.sfx.coin());
    this.hint.setText(win ? '운명이 웃었다' : '운명이 등을 돌렸다');
    this.betUi.setVisible(false);
    this.time.delayedCall(600, () => (this.revealed = true));
    new Button(this, W / 2, BAR.y + (PORTRAIT ? 120 : 92), PORTRAIT ? 300 : 260, PORTRAIT ? 64 : 54, '돌아가기', { variant: 'dark', size: 20 * big, onClick: () => this.close() });
  }

  private showWeaponResult(win: boolean, count: number) {
    const big = PORTRAIT ? 1.15 : 1;
    const y = PORTRAIT ? H * 0.58 : H * 0.63;
    const head = this.add
      .text(W / 2, y, win ? `O!  모든 무기 +${WEAPON_CARD.levels}` : `X…  무기 ${count}자루가 부서졌다`, {
        fontFamily: FONT,
        fontSize: `${Math.round(42 * big)}px`,
        fontStyle: '900',
        color: win ? css(0x7dff8a) : css(C.dangerHi),
        stroke: '#000000',
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setScale(1.8)
      .setAlpha(0)
      .setDepth(10);
    this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    const after = this.core.state.weapons;
    const sub = win ? `무기 ${count}자루가 한꺼번에 +${WEAPON_CARD.levels} · 이제 최고 +${Math.max(0, ...after.map((w) => w.level))}` : '무기걸이가 텅 비었다 · 내일 아침 새 무기가 도착한다';
    this.tweens.add({ targets: label(this, W / 2, y + 48 * big, sub, 16 * big, C.text, { weight: 700, origin: [0.5, 0.5] }).setStroke('#000000', 5).setAlpha(0).setDepth(10), alpha: 1, duration: 300, delay: 200 });
    if (win) this.time.delayedCall(250, () => this.sfx.awaken(3));
    this.hint.setText(win ? '운명이 웃었다' : '운명이 등을 돌렸다');
    this.betUi.setVisible(false);
    this.time.delayedCall(600, () => (this.revealed = true));
    new Button(this, W / 2, BAR.y + (PORTRAIT ? 120 : 92), PORTRAIT ? 300 : 260, PORTRAIT ? 64 : 54, '돌아가기', { variant: 'dark', size: 20 * big, onClick: () => this.close() });
  }

  /** Leave: before betting (no cost) or after the result; never while the cards are turning. */
  private close() {
    if (this.done && !this.revealed) return;
    if (this.closing) return;
    this.closing = true;
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const cb = this.onClose;
      this.scene.stop();
      cb();
    });
  }
}
