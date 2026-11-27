// 왕의 하사품 pick screen (user 2026-11-27): after a paid rent the forge blurs behind three cards; keep one.
// Layout follows the user's reference: a title, three framed cards (name, a drawn icon, what it does, Lv x/y),
// and a paid 다시 뽑기 under them.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { PERK_BY_ID, TIER_NAME, type Perk } from '../../config/rentPerks';
import { perkLevel, rerollCost } from '../../core/systems/rentPerks';
import { C, DISPLAY, H, W, label, mix } from '../theme';
import { PORTRAIT } from '../layout';
import { Button } from '../ui/button';
import { RAINBOW, TIER_COLOR, drawPerkIcon } from '../ui/perkIcons';
import { Sfx } from '../audio/sfx';

export interface PerkData {
  /** Scene paused under this one (blurred while the cards are up). */
  returnTo: string;
  onDone?: () => void;
}

const CW = PORTRAIT ? 218 : 300;
const CH = PORTRAIT ? 470 : 430;
const GAP = PORTRAIT ? 9 : 30;
const CY = PORTRAIT ? H / 2 - 10 : H / 2 + 14;

export class PerkScene extends Phaser.Scene {
  private core!: GameCore;
  private opts!: PerkData;
  private cards: Phaser.GameObjects.Container[] = [];
  private reroll!: Button;
  private goldText!: Phaser.GameObjects.Text;
  private busy = false;
  /** Picks are ignored until the cards have landed (a tap that closed the king's talk must not pick one). */
  private readyAt = 0;
  private focus = 1;
  private sfx = new Sfx();
  private blur: Phaser.FX.Blur | null = null;

  constructor() {
    super('Perk');
  }

  init(data: PerkData) {
    this.opts = data;
    this.cards = [];
    this.busy = false;
    this.focus = 1;
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    // the forge stays visible behind, blurred and darkened
    const under = this.scene.get(this.opts.returnTo);
    this.blur = under?.cameras.main.postFX?.addBlur(1, 2, 2, 0) ?? null;
    if (this.blur) this.tweens.add({ targets: this.blur, strength: 1.6, duration: 380 });
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x05030a, 0).setInteractive();
    this.tweens.add({ targets: shade, fillAlpha: 0.62, duration: 380 });

    const o = this.core.state.perkOffer;
    const titleY = CY - CH / 2 - (PORTRAIT ? 120 : 92);
    const title = label(this, W / 2, titleY, '선택하기', PORTRAIT ? 46 : 40, C.goldHi, { weight: 900, display: true, origin: [0.5, 0.5] });
    title.setShadow(0, 3, '#000', 10, true, true);
    label(this, W / 2, titleY + (PORTRAIT ? 48 : 42), `왕의 하사품 · ${o ? `${o.rentNo}번째 월세를 낸 보답` : ''}으로 하나를 고르세요`, PORTRAIT ? 19 : 17, C.text, { origin: [0.5, 0.5] }).setAlpha(0.85);
    // ornament lines beside the title
    const orn = this.add.graphics();
    const tw = title.width / 2 + 24;
    orn.lineStyle(2, C.gold, 0.7).lineBetween(W / 2 - tw - 120, titleY, W / 2 - tw, titleY).lineBetween(W / 2 + tw, titleY, W / 2 + tw + 120, titleY);
    orn.fillStyle(C.gold, 0.9).fillCircle(W / 2 - tw, titleY, 4).fillCircle(W / 2 + tw, titleY, 4);

    const by = CY + CH / 2 + (PORTRAIT ? 70 : 52);
    this.reroll = new Button(this, W / 2, by, PORTRAIT ? 300 : 280, PORTRAIT ? 64 : 54, '다시 뽑기', { variant: 'dark', size: PORTRAIT ? 20 : 18, onClick: () => this.doReroll() });
    this.goldText = label(this, W / 2, by + (PORTRAIT ? 52 : 44), '', PORTRAIT ? 17 : 15, C.mute, { origin: [0.5, 0.5] });

    this.buildCards(true);

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.choose(0));
    kb.on('keydown-TWO', () => this.choose(1));
    kb.on('keydown-THREE', () => this.choose(2));
    kb.on('keydown-LEFT', () => this.setFocus(this.focus - 1));
    kb.on('keydown-RIGHT', () => this.setFocus(this.focus + 1));
    kb.on('keydown-ENTER', () => this.choose(this.focus));
    kb.on('keydown-SPACE', () => this.choose(this.focus));
    kb.on('keydown-R', () => this.doReroll());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearBlur());
  }

  private clearBlur() {
    const under = this.scene.get(this.opts.returnTo);
    if (this.blur && under) under.cameras.main.postFX?.remove(this.blur);
    this.blur = null;
  }

  private refreshReroll() {
    const s = this.core.state;
    const cost = rerollCost(s);
    this.reroll.setLabel(`다시 뽑기 · ${cost.toLocaleString()}G`, undefined);
    this.reroll.setEnabled(!this.busy && s.gold >= cost);
    this.goldText.setText(`보유 골드 ${s.gold.toLocaleString()}G${s.gold < cost ? ' · 다시 뽑을 골드가 부족합니다' : ''}`);
  }

  private buildCards(first: boolean) {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    const ids = this.core.state.perkOffer?.choices ?? [];
    this.readyAt = this.time.now + (first ? 260 : 0) + ids.length * 110 + 450;
    const total = ids.length * CW + (ids.length - 1) * GAP;
    ids.forEach((id, i) => {
      const perk = PERK_BY_ID[id];
      if (!perk) return;
      const x = W / 2 - total / 2 + CW / 2 + i * (CW + GAP);
      const card = this.card(perk, i);
      card.setPosition(x, CY + 60).setAlpha(0).setScale(0.86);
      this.tweens.add({ targets: card, y: CY, alpha: 1, scale: 1, duration: 420, delay: (first ? 260 : 0) + i * 110, ease: 'Back.easeOut' });
      this.cards.push(card);
    });
    this.time.delayedCall((first ? 260 : 0) + ids.length * 110 + 200, () => {
      ids.forEach((id) => {
        if (PERK_BY_ID[id]?.tier === 'gold' || PERK_BY_ID[id]?.tier === 'rainbow') this.sfx.gem();
      });
    });
    this.sfx.click();
    this.refreshReroll();
  }

  private card(perk: Perk, index: number): Phaser.GameObjects.Container {
    const lv = perkLevel(this.core.state, perk.id);
    const next = Math.min(perk.max, lv + 1);
    const t = TIER_COLOR[perk.tier];
    const c = this.add.container(0, 0);
    const hw = CW / 2;
    const hh = CH / 2;
    const headH = PORTRAIT ? 58 : 54;

    // glow behind the card (stronger for rarer tiers)
    const halo = this.add.graphics();
    const haloA = perk.tier === 'rainbow' ? 0.32 : perk.tier === 'gold' ? 0.22 : 0.1;
    for (let r = 3; r >= 1; r--) halo.fillStyle(perk.tier === 'rainbow' ? RAINBOW[r] : t.main, haloA / r).fillRoundedRect(-hw - r * 6, -hh - r * 6, CW + r * 12, CH + r * 12, 16 + r * 4);
    c.add(halo);
    if (perk.tier === 'rainbow' || perk.tier === 'gold') this.tweens.add({ targets: halo, alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const g = this.add.graphics();
    g.fillStyle(0x140e0a, 0.97).fillRoundedRect(-hw, -hh, CW, CH, 12);
    // subtle inner gradient
    for (let i = 0; i < 8; i++) g.fillStyle(t.main, 0.018).fillRoundedRect(-hw + 6, -hh + headH + i * 18, CW - 12, CH - headH - i * 36, 10);
    g.fillStyle(mix(0x140e0a, t.main, 0.2), 1).fillRoundedRect(-hw + 4, -hh + 4, CW - 8, headH - 4, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.lineStyle(1.5, t.edge, 0.8).lineBetween(-hw + 10, -hh + headH, hw - 10, -hh + headH);
    c.add(g);

    // frame: a tier-coloured double border (a moving rainbow on the rainbow cards)
    const frame = this.add.graphics();
    const drawFrame = (phase: number) => {
      frame.clear();
      if (perk.tier === 'rainbow') {
        // a smooth hue wheel running round the card
        const segs = 72;
        for (let s = 0; s < segs; s++) {
          const col = (Phaser.Display.Color.HSVToRGB((s / segs + phase) % 1, 0.75, 1) as Phaser.Types.Display.ColorObject).color;
          frame.lineStyle(4, col, 1);
          const per = (2 * (CW + CH)) / segs;
          const a = pointOn(s * per, CW, CH);
          const b = pointOn((s + 1) * per, CW, CH);
          frame.lineBetween(a[0], a[1], b[0], b[1]);
        }
      } else {
        frame.lineStyle(3, t.main, 1).strokeRoundedRect(-hw, -hh, CW, CH, 12);
      }
      frame.lineStyle(1, t.hi, 0.35).strokeRoundedRect(-hw + 6, -hh + 6, CW - 12, CH - 12, 9);
      // corner studs
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) frame.fillStyle(t.hi, 0.9).fillCircle(sx * (hw - 9), sy * (hh - 9), 2.5);
    };
    drawFrame(0);
    if (perk.tier === 'rainbow') {
      let ph = 0;
      this.time.addEvent({ delay: 50, loop: true, callback: () => frame.active && drawFrame((ph = (ph + 0.015) % 1)) });
    }
    c.add(frame);

    const name = label(this, 0, -hh + headH / 2 + 2, perk.name, PORTRAIT ? 21 : 22, t.hi, { weight: 900, origin: [0.5, 0.5] });
    if (name.width > CW - 24) name.setScale((CW - 24) / name.width);
    c.add(name);
    const tierTxt = `${TIER_NAME[perk.tier]} 등급${perk.tradeoff ? ' · ⚖ 거래' : ''}`;
    c.add(label(this, 0, -hh + headH + 16, tierTxt, PORTRAIT ? 14 : 13, perk.tradeoff ? 0xff9a7a : t.main, { weight: 700, origin: [0.5, 0.5] }));

    // the drawn icon on a small plinth of light
    const iconY = -hh + headH + (PORTRAIT ? 104 : 98);
    const plinth = this.add.graphics();
    plinth.fillStyle(t.main, 0.12).fillEllipse(0, iconY + 52, 130, 22);
    c.add(plinth);
    const icon = this.add.graphics({ x: 0, y: iconY });
    drawPerkIcon(icon, perk.icon, perk.tier, PORTRAIT ? 104 : 112);
    c.add(icon);
    this.tweens.add({ targets: icon, y: iconY - 5, duration: 1400 + index * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // what the next level gives, then where it stands now
    const textY = iconY + (PORTRAIT ? 84 : 88);
    const desc = label(this, 0, textY, perk.text(next), PORTRAIT ? 18 : 18, C.text, { weight: 700, align: 'center', wrap: CW - 30, origin: [0.5, 0], lineSpacing: 4 });
    c.add(desc);
    const nowY = textY + desc.height + 14;
    const now = lv > 0 ? `지금: ${perk.text(lv)}` : '처음 얻는 하사품';
    c.add(label(this, 0, nowY, now, PORTRAIT ? 14 : 14, lv > 0 ? 0x8fd88f : C.mute, { align: 'center', wrap: CW - 30, origin: [0.5, 0] }));

    // Lv x / y with pips
    const lvY = hh - 30;
    const pips = this.add.graphics();
    const pw = 16;
    const startX = -((perk.max - 1) * (pw + 6)) / 2;
    for (let i = 0; i < perk.max; i++) {
      const filled = i < lv;
      const isNext = i === lv;
      pips.fillStyle(filled ? t.main : isNext ? mix(t.main, 0x000000, 0.45) : 0x2a221b, 1).fillRoundedRect(startX + i * (pw + 6) - pw / 2, lvY - 26, pw, 8, 3);
      if (isNext) this.tweens.add({ targets: pips, alpha: { from: 1, to: 0.7 }, duration: 600, yoyo: true, repeat: -1 });
    }
    c.add(pips);
    c.add(label(this, 0, lvY, `Lv ${lv}/${perk.max}`, PORTRAIT ? 16 : 15, C.mute, { weight: 700, origin: [0.5, 0.5] }));
    c.add(label(this, hw - 14, -hh + 12, `${index + 1}`, 12, C.dim, { origin: [1, 0] }));

    c.setSize(CW, CH);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => this.setFocus(index));
    c.on('pointerup', () => this.choose(index));
    return c;
  }

  private setFocus(i: number) {
    if (this.busy || !this.cards.length) return;
    this.focus = Phaser.Math.Clamp(i, 0, this.cards.length - 1);
    this.cards.forEach((c, k) => {
      this.tweens.killTweensOf(c);
      this.tweens.add({ targets: c, scale: k === this.focus ? 1.05 : 0.97, y: k === this.focus ? CY - 8 : CY, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
    });
  }

  private doReroll() {
    if (this.busy) return;
    const r = this.core.dispatch({ type: 'REROLL_PERKS' });
    if (r.type !== 'perksRerolled') {
      this.sfx.denied();
      return;
    }
    this.sfx.coin();
    this.busy = true;
    this.cards.forEach((c, i) => this.tweens.add({ targets: c, y: CY + 40, alpha: 0, scaleX: 0, duration: 200, delay: i * 50 }));
    this.time.delayedCall(360, () => {
      this.busy = false;
      this.buildCards(false);
    });
  }

  private choose(index: number) {
    if (this.busy || !this.cards[index] || this.time.now < this.readyAt) return;
    const r = this.core.dispatch({ type: 'PICK_PERK', index });
    if (r.type !== 'perkPicked') return;
    this.busy = true;
    this.reroll.setEnabled(false);
    const perk = PERK_BY_ID[r.id];
    const t = TIER_COLOR[perk.tier];
    perk.tier === 'rainbow' || perk.tier === 'gold' ? this.sfx.great() : this.sfx.success();
    this.cards.forEach((c, k) => {
      this.tweens.killTweensOf(c);
      if (k === index) this.tweens.add({ targets: c, x: W / 2, y: CY, scale: 1.14, duration: 380, ease: 'Back.easeOut' });
      else this.tweens.add({ targets: c, alpha: 0, y: CY + 80, scale: 0.8, duration: 300 });
    });
    // a burst of light from the kept card
    const burst = this.add.graphics({ x: W / 2, y: CY });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      burst.lineStyle(4, perk.tier === 'rainbow' ? RAINBOW[i % RAINBOW.length] : t.hi, 0.9).lineBetween(Math.cos(a) * 30, Math.sin(a) * 30, Math.cos(a) * 90, Math.sin(a) * 90);
    }
    burst.setScale(0.4).setAlpha(0).setDepth(-1);
    this.children.sendToBack(burst);
    this.tweens.add({ targets: burst, scale: 3.2, alpha: { from: 0.9, to: 0 }, duration: 800, delay: 200, ease: 'Cubic.easeOut' });
    const msg = label(this, W / 2, CY + CH / 2 + (PORTRAIT ? 70 : 52), `${perk.name} Lv ${r.level} 획득!`, PORTRAIT ? 26 : 24, t.hi, { weight: 900, origin: [0.5, 0.5] });
    msg.setFontFamily(DISPLAY + ', sans-serif').setAlpha(0);
    this.reroll.setVisible(false);
    this.goldText.setVisible(false);
    this.tweens.add({ targets: msg, alpha: 1, y: msg.y - 8, duration: 300, delay: 260 });
    this.time.delayedCall(1300, () => this.close());
  }

  private close() {
    const under = this.opts.returnTo;
    const done = this.opts.onDone;
    this.clearBlur();
    this.scene.stop();
    this.scene.resume(under);
    done?.();
  }
}

/** Point at distance `d` along the card's outline, clockwise from the top-left corner. */
function pointOn(d: number, w: number, h: number): [number, number] {
  const p = 2 * (w + h);
  let x = ((d % p) + p) % p;
  if (x < w) return [-w / 2 + x, -h / 2];
  x -= w;
  if (x < h) return [w / 2, -h / 2 + x];
  x -= h;
  if (x < w) return [w / 2 - x, h / 2];
  x -= w;
  return [-w / 2, h / 2 - x];
}

