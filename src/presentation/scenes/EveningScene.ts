// Evening (user request 2026-11-19): "다음 날" ends the day here. The sun goes down, then three choices:
//   · 밤 내기 — the optional gamble, explained, with tonight's two rivals and the stakes
//   · 월세 미리 내기 — pay the king's next visit now, at today's cheaper rate
//   · 잠자기 — the night passes and the next morning begins
// Opens over the paused forge.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { equippedWeapon } from '../../core/systems/weapons';
import { tonightsRivals } from '../../core/systems/doppelganger';
import { prepayPrice, rentDueDay, rentFor } from '../../core/systems/rent';
import { PREPAY_BONUS } from '../../config/skillTree';
import { NIGHT_STAKE } from '../../config/economy';
import { weaponDisplayName } from '../../config/swordNames';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import type { NightData } from './NightScene';

const CARD = PORTRAIT
  ? { w: W - 48, gap: 18, h: { night: 420, rent: 230, sleep: 170 } }
  : { w: 360, gap: 22, h: { night: 470, rent: 470, sleep: 470 } };

export class EveningScene extends Phaser.Scene {
  private core!: GameCore;
  private root!: Phaser.GameObjects.Container;
  private busy = false;

  constructor() {
    super('Evening');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.busy = false;
    const day = this.core.state.day;

    // sunset: warm orange melting into night purple, then the choices
    const sky = this.add.graphics();
    sky.fillGradientStyle(0xff8a3a, 0xff8a3a, 0x2a0f3a, 0x2a0f3a, 0.92, 0.92, 0.98, 0.98);
    sky.fillRect(0, 0, W, H);
    sky.setAlpha(0);
    this.add.rectangle(W / 2, H / 2, W, H, 0, 0).setInteractive(); // swallow taps on the forge below
    const sun = this.add.circle(W / 2, H * 0.32, PORTRAIT ? 120 : 90, 0xffc46b, 0.9).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const t1 = label(this, W / 2, H * 0.32, `DAY ${day} · 해가 진다`, PORTRAIT ? 44 : 40, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    t1.setStroke('#140a05', 8);
    this.tweens.add({ targets: sky, alpha: 1, duration: 700 });
    this.tweens.add({ targets: sun, alpha: 1, y: H * 0.42, duration: 1400, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: t1, alpha: 1, duration: 500, delay: 300 });
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: [t1, sun], alpha: 0, duration: 400 });
      sky.clear();
      sky.fillGradientStyle(0x2a0f3a, 0x2a0f3a, 0x07060a, 0x07060a, 0.96, 0.96, 0.99, 0.99).fillRect(0, 0, W, H);
      this.buildChoices();
    });
  }

  private buildChoices() {
    this.root?.destroy(true);
    const root = (this.root = this.add.container(0, 0).setAlpha(0));
    const s = this.core.state;
    const title = label(this, W / 2, PORTRAIT ? 90 : 56, '오늘 밤은 어떻게 할까?', PORTRAIT ? 34 : 28, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    root.add(title);
    root.add(label(this, W / 2, PORTRAIT ? 132 : 92, `골드 ${s.gold.toLocaleString()}G`, PORTRAIT ? 18 : 15, C.text, { weight: 700, origin: [0.5, 0.5] }));

    const order: ('night' | 'rent' | 'sleep')[] = ['night', 'rent', 'sleep'];
    let y = PORTRAIT ? 170 : 124;
    order.forEach((kind, i) => {
      const h = CARD.h[kind];
      const x = PORTRAIT ? W / 2 : W / 2 + (i - 1) * (CARD.w + CARD.gap);
      const cy = PORTRAIT ? y + h / 2 : y + h / 2;
      const card = this.add.container(x, cy);
      const g = this.add.graphics();
      const edge = kind === 'night' ? 0xb35cff : kind === 'rent' ? 0xe9b65c : 0x6a7a9a;
      g.fillStyle(0x120d18, 0.96).fillRoundedRect(-CARD.w / 2, -h / 2, CARD.w, h, 18);
      g.lineStyle(3, edge, 1).strokeRoundedRect(-CARD.w / 2, -h / 2, CARD.w, h, 18);
      card.add(g);
      if (kind === 'night') this.fillNight(card, h);
      if (kind === 'rent') this.fillRent(card, h);
      if (kind === 'sleep') this.fillSleep(card, h);
      root.add(card);
      if (PORTRAIT) y += h + CARD.gap;
    });
    const back = new Button(this, W / 2, H - (PORTRAIT ? 60 : 40), PORTRAIT ? 240 : 200, PORTRAIT ? 56 : 44, '대장간으로 돌아가기', { variant: 'ghost', size: PORTRAIT ? 18 : 15, onClick: () => this.back() });
    root.add(back);
    this.tweens.add({ targets: root, alpha: 1, duration: 300 });
  }

  /** 밤 내기: what it is, who comes tonight, and what is at stake. */
  private fillNight(card: Phaser.GameObjects.Container, h: number) {
    const s = this.core.state;
    const pad = 24;
    const wrap = CARD.w - pad * 2;
    const top = -h / 2;
    const big = PORTRAIT ? 1.1 : 1;
    card.add(label(this, -CARD.w / 2 + pad, top + 22, '🌙 밤 내기', 26 * big, 0xd9b8ff, { weight: 900 }));
    card.add(
      label(this, -CARD.w / 2 + pad, top + 64 * big, '다른 세계의 대장장이 2명이 내기를 걸어온다. 상대 무기는 +1~+50 중 무작위.\n이기면 골드 ×1.5 · 지면 골드 절반.', 14 * big, C.text, { wrap, lineSpacing: 6 }),
    );
    const rivals = tonightsRivals(s).lineup;
    let y = top + (PORTRAIT ? 160 : 170);
    card.add(label(this, -CARD.w / 2 + pad, y, '오늘 밤 상대', 13 * big, C.mute, { weight: 900 }));
    y += 26 * big;
    for (const d of rivals) {
      card.add(new LevelBadge(this, -CARD.w / 2 + pad + 30, y + 10, d.weapon.level, 17));
      card.add(label(this, -CARD.w / 2 + pad + 70, y, `${d.name}${d.weapon.cls === 'sword' ? ' · ' + weaponDisplayName(d.weapon) : ''}`, 15 * big, C.text, { weight: 700 }));
      y += 32 * big;
    }
    const mine = this.nightWeapon();
    card.add(label(this, -CARD.w / 2 + pad, y + 6, `내 무기: ${mine ? `${weaponDisplayName(mine)} +${mine.level}` : '기본 대장장이 망치'}`, 14 * big, C.goldHi, { weight: 700, wrap }));
    y += 34 * big;
    const win = Math.floor(s.gold * NIGHT_STAKE.winMul);
    const lose = Math.floor(s.gold * NIGHT_STAKE.loseMul);
    card.add(label(this, -CARD.w / 2 + pad, y + 4, `이기면 ${win.toLocaleString()}G · 지면 ${lose.toLocaleString()}G`, 14 * big, C.mute, { weight: 700, wrap }));
    const btn = new Button(this, 0, h / 2 - 44, CARD.w - 40, 60, '내기에 응한다', { variant: 'danger', size: 20 * big, onClick: () => this.gamble() });
    card.add(btn);
  }

  /** 월세 미리 내기: the next visit, what it will cost then, and today's (cheaper) price. */
  private fillRent(card: Phaser.GameObjects.Container, h: number) {
    const s = this.core.state;
    const pad = 24;
    const wrap = CARD.w - pad * 2;
    const top = -h / 2;
    const big = PORTRAIT ? 1.1 : 1;
    const due = rentDueDay(s);
    const later = rentFor(s, due);
    const now = prepayPrice(s);
    card.add(label(this, -CARD.w / 2 + pad, top + 22, '💰 월세 미리 내기', 24 * big, C.goldHi, { weight: 900 }));
    const bonus = `미리 내면 왕이 올 때까지 망치질 +${Math.round(PREPAY_BONUS.speed * 100)}% · 성공 +${PREPAY_BONUS.success}%p`;
    const text = s.rentPrepaid
      ? `다음 방문(DAY ${due}) 월세는 이미 냈다.\n${bonus.replace('미리 내면 ', '')} 적용 중`
      : `다음 방문 DAY ${due} · 그날 내면 ${later.toLocaleString()}G\n오늘 내면 ${now.toLocaleString()}G · 못 내면 대장간을 잃는다\n${bonus}`;
    card.add(label(this, -CARD.w / 2 + pad, top + 64 * big, text, 14 * big, C.text, { wrap, lineSpacing: 6 }));
    const can = !s.rentPrepaid && s.gold >= now;
    const btn = new Button(this, 0, h / 2 - 44, CARD.w - 40, 60, s.rentPrepaid ? '이미 냈다' : `미리 낸다 · ${now.toLocaleString()}G`, {
      variant: can ? 'gold' : 'dark',
      size: 19 * big,
      sub: can || s.rentPrepaid ? undefined : '골드가 모자라다',
      onClick: () => this.prepay(),
    });
    btn.setEnabled(can);
    card.add(btn);
  }

  private fillSleep(card: Phaser.GameObjects.Container, h: number) {
    const pad = 24;
    const top = -h / 2;
    const big = PORTRAIT ? 1.1 : 1;
    card.add(label(this, -CARD.w / 2 + pad, top + 22, '😴 잠자기', 24 * big, 0xb8c6e6, { weight: 900 }));
    card.add(label(this, -CARD.w / 2 + pad, top + 62 * big, '내기 없이 잔다. 아침이 오면 새 무기가 도착한다.', 14 * big, C.text, { wrap: CARD.w - pad * 2, lineSpacing: 6 }));
    card.add(new Button(this, 0, h / 2 - 44, CARD.w - 40, 60, '잠자기 ▶', { variant: 'gold', size: 20 * big, onClick: () => this.sleep() }));
  }

  /** The weapon taken into the night: the equipped one, else the highest-level one, else the hammer. */
  private nightWeapon() {
    const s = this.core.state;
    return equippedWeapon(s) ?? [...s.weapons].sort((a, b) => b.level - a.level)[0];
  }

  private gamble() {
    if (this.busy) return;
    const w = this.nightWeapon();
    if (w && this.core.state.equippedId !== w.id) this.core.dispatch({ type: 'EQUIP', weaponId: w.id });
    const r = this.core.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') return;
    this.busy = true;
    const data: NightData = { weapon: r.weapon, day: this.core.state.day, lineup: r.lineup };
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Forge');
      this.scene.start('Night', data);
    });
  }

  private prepay() {
    const r = this.core.dispatch({ type: 'PREPAY_RENT' });
    if (r.type !== 'rentPrepaid') return;
    this.cameras.main.flash(200, 255, 220, 140);
    this.buildChoices();
  }

  /** The night passes: moon, darkness, then the next morning. */
  private sleep() {
    if (this.busy) return;
    this.busy = true;
    const r = this.core.dispatch({ type: 'SLEEP' }); // saved before the animation
    if (r.type !== 'slept') {
      this.busy = false;
      return;
    }
    this.tweens.add({ targets: this.root, alpha: 0, duration: 300 });
    const night = this.add.rectangle(W / 2, H / 2, W, H, 0x020106, 1).setAlpha(0);
    const moon = this.add.circle(W / 2, H * 0.3, PORTRAIT ? 70 : 54, 0xe8ecff, 0.95).setAlpha(0);
    const txt = label(this, W / 2, H * 0.5, '…밤이 지나간다', PORTRAIT ? 32 : 28, 0xc9d2f0, { weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    this.tweens.add({ targets: night, alpha: 1, duration: 500 });
    this.tweens.add({ targets: [moon, txt], alpha: 1, duration: 600, delay: 300 });
    this.tweens.add({ targets: moon, x: W * 0.8, y: H * 0.18, duration: 1500, delay: 300, ease: 'Sine.easeInOut' });
    this.time.delayedCall(1900, () => {
      // sunrise
      const dawn = this.add.graphics().setAlpha(0);
      dawn.fillGradientStyle(0x2a3a6a, 0x2a3a6a, 0xffb36a, 0xffb36a, 1, 1, 1, 1).fillRect(0, 0, W, H);
      const t2 = label(this, W / 2, H * 0.45, `DAY ${this.core.state.day} · 아침`, PORTRAIT ? 46 : 42, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
      t2.setStroke('#140a05', 8);
      this.tweens.add({ targets: [moon, txt], alpha: 0, duration: 300 });
      this.tweens.add({ targets: dawn, alpha: 1, duration: 700 });
      this.tweens.add({ targets: t2, alpha: 1, duration: 500, delay: 300 });
      this.time.delayedCall(1700, () => {
        if (r.gameOver) {
          this.scene.stop('Forge');
          this.scene.start('GameOver', { summary: r.gameOver, reason: 'died' });
          return;
        }
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.stop('Forge');
          this.scene.start('Forge');
        });
      });
    });
  }

  private back() {
    if (this.busy) return;
    this.scene.resume('Forge');
    this.scene.stop();
  }
}

void DISPLAY;
void css;
