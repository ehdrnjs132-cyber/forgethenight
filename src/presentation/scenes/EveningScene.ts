// Evening (user request 2026-11-19): "다음 날" ends the day here. The sun goes down, then three choices:
//   · 밤 내기 — the optional gamble, explained, with tonight's two rivals and the stakes
//   · 운명의 카드 — from DAY 10: pick one of two cards and bet gold (replaced 월세 미리 내기 on 2026-11-26)
//   · 잠자기 — the night passes and the next morning begins
// Opens over the paused forge.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { equippedWeapon } from '../../core/systems/weapons';
import { tonightsRivals } from '../../core/systems/doppelganger';
import { rentDueDay, rentFor } from '../../core/systems/rent';
import { cardPlayedToday, cardUnlocked, weaponCardPlayedToday, weaponCardUnlocked } from '../../core/systems/cards';
import { nightUnlocked } from '../../core/systems/daynight';
import { CARD_GAME, NIGHT_STAKE, WEAPON_CARD } from '../../config/economy';
import { weaponDisplayName } from '../../config/swordNames';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { PORTRAIT } from '../layout';
import type { NightData } from './NightScene';

type Kind = 'night' | 'rent' | 'weapons' | 'sleep';
/** Card sizes; landscape width shrinks when four choices share the row. */
const CARD = PORTRAIT
  ? { w: W - 48, gap: 16, h: { night: 380, rent: 210, weapons: 210, sleep: 150 } as Record<Kind, number> }
  : { w: 360, gap: 22, h: { night: 470, rent: 470, weapons: 470, sleep: 470 } as Record<Kind, number> };

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

    // what tonight offers (2026-11-26): the dwarf battle only from DAY 20, the weapon cards only from DAY 30
    const order: Kind[] = [...(nightUnlocked(s) ? ['night' as const] : []), 'rent', ...(weaponCardUnlocked(s) ? ['weapons' as const] : []), 'sleep'];
    if (!PORTRAIT) CARD.w = Math.min(360, Math.floor((W - 48 - CARD.gap * (order.length - 1)) / order.length));
    let y = PORTRAIT ? 170 : 124;
    order.forEach((kind, i) => {
      const h = CARD.h[kind];
      const x = PORTRAIT ? W / 2 : W / 2 + (i - (order.length - 1) / 2) * (CARD.w + CARD.gap);
      const cy = PORTRAIT ? y + h / 2 : y + h / 2;
      const card = this.add.container(x, cy);
      const g = this.add.graphics();
      const edge = kind === 'night' ? 0xb35cff : kind === 'rent' ? 0xe9b65c : kind === 'weapons' ? 0xd11f2a : 0x6a7a9a;
      g.fillStyle(0x120d18, 0.96).fillRoundedRect(-CARD.w / 2, -h / 2, CARD.w, h, 18);
      g.lineStyle(3, edge, 1).strokeRoundedRect(-CARD.w / 2, -h / 2, CARD.w, h, 18);
      card.add(g);
      if (kind === 'night') this.fillNight(card, h);
      if (kind === 'rent') this.fillCards(card, h);
      if (kind === 'weapons') this.fillWeaponCards(card, h);
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
      label(this, -CARD.w / 2 + pad, top + 64 * big, '다른 세계의 대장장이 2명이 내기를 걸어온다. 상대 무기의 단계는 싸워 봐야 안다.\n이기면 골드 ×1.5 · 지면 골드 절반.', 14 * big, C.text, { wrap, lineSpacing: 6 }),
    );
    const rivals = tonightsRivals(s).lineup;
    let y = top + (PORTRAIT ? 160 : 170);
    card.add(label(this, -CARD.w / 2 + pad, y, '오늘 밤 상대', 13 * big, C.mute, { weight: 900 }));
    y += 26 * big;
    // their levels stay hidden until the fight (user 2026-11-26): "+???" and no sword name (it would give the level away)
    for (const d of rivals) {
      const bx = -CARD.w / 2 + pad + 30;
      const pill = this.add.graphics();
      pill.fillStyle(0x3a2a4a, 1).fillRoundedRect(bx - 30, y - 2, 60, 24, 12);
      pill.lineStyle(2, 0xb35cff, 1).strokeRoundedRect(bx - 30, y - 2, 60, 24, 12);
      card.add([pill, label(this, bx, y + 10, '+???', 15, 0xffffff, { weight: 900, origin: [0.5, 0.5] })]);
      card.add(label(this, -CARD.w / 2 + pad + 70, y, d.name, 15 * big, C.text, { weight: 700 }));
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

  /** 운명의 카드 (2026-11-26, in place of paying the rent early): from DAY 10, once a day. */
  private fillCards(card: Phaser.GameObjects.Container, h: number) {
    const s = this.core.state;
    const pad = 24;
    const wrap = CARD.w - pad * 2;
    const top = -h / 2;
    const big = PORTRAIT ? 1.1 : 1;
    const open = cardUnlocked(s);
    const played = cardPlayedToday(s);
    card.add(label(this, -CARD.w / 2 + pad, top + 22, '🃏 운명의 카드', 24 * big, C.goldHi, { weight: 900 }));
    const due = rentDueDay(s);
    const text = !open
      ? `DAY ${CARD_GAME.unlockDay}부터 열린다 (${CARD_GAME.unlockDay - s.day}일 남음).\n두 장 중 한 장을 고르고 가진 골드를 건다.\nO면 베팅의 ${CARD_GAME.payoutMul}배, X면 베팅을 잃는다.`
      : played
        ? '오늘은 이미 카드를 뒤집었다.\n내일 밤 다시 운을 시험할 수 있다.'
        : `두 장 중 한 장을 고르고, 막대를 끌어 가진 골드 중 얼마를 걸지 정한다.\nO면 베팅의 ${CARD_GAME.payoutMul}배, X면 베팅을 잃는다. 하루 한 번.`;
    card.add(label(this, -CARD.w / 2 + pad, top + 64 * big, text, 14 * big, C.text, { wrap, lineSpacing: 6 }));
    card.add(label(this, -CARD.w / 2 + pad, h / 2 - 104, `다음 월세: DAY ${due} · ${rentFor(s, due).toLocaleString()}G`, 13 * big, C.mute, { weight: 700, wrap }));
    const can = open && !played && s.gold >= 1;
    const btn = new Button(this, 0, h / 2 - 44, CARD.w - 40, 60, !open ? `DAY ${CARD_GAME.unlockDay}부터` : played ? '오늘은 끝' : '카드를 고른다', {
      variant: can ? 'gold' : 'dark',
      size: 19 * big,
      sub: open && !played && s.gold < 1 ? '걸 골드가 없다' : undefined,
      onClick: () => this.openCards(),
    });
    btn.setEnabled(can);
    card.add(btn);
  }

  /** 운명의 무기 카드 (DAY 30+): the weapons the player picks are at stake — +10 to them, or they are destroyed. */
  private fillWeaponCards(card: Phaser.GameObjects.Container, h: number) {
    const s = this.core.state;
    const pad = 24;
    const wrap = CARD.w - pad * 2;
    const top = -h / 2;
    const big = PORTRAIT ? 1.1 : 1;
    const played = weaponCardPlayedToday(s);
    const n = s.weapons.length;
    card.add(label(this, -CARD.w / 2 + pad, top + 22, '⚔ 운명의 무기 카드', 22 * big, 0xff6b6b, { weight: 900 }));
    const text = played
      ? '오늘은 이미 무기를 걸었다.\n내일 밤 다시 걸 수 있다.'
      : `두 장 중 한 장. 걸리는 건 골드가 아니라 무기걸이에서 직접 고른 무기.\nO면 고른 무기 모두 +${WEAPON_CARD.levels} · X면 고른 무기 모두 파괴. 하루 한 번.`;
    card.add(label(this, -CARD.w / 2 + pad, top + 60 * big, text, 14 * big, C.text, { wrap, lineSpacing: 6 }));
    const can = !played && n > 0;
    const btn = new Button(this, 0, h / 2 - 44, CARD.w - 40, 60, played ? '오늘은 끝' : n === 0 ? '걸 무기가 없다' : '걸 무기를 고른다', {
      variant: can ? 'danger' : 'dark',
      size: 19 * big,
      onClick: () => this.openCards('weapons'),
    });
    btn.setEnabled(can);
    card.add(btn);
  }

  private openCards(mode: 'gold' | 'weapons' = 'gold') {
    if (this.busy) return;
    this.scene.launch('Cards', {
      mode,
      onClose: () => {
        this.scene.resume();
        this.buildChoices();
      },
    });
    this.scene.pause();
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
      // the run ended (unpaid rent): no sunrise and no "DAY 1 · 아침" — straight from the dark to the king
      if (r.gameOver) {
        this.tweens.add({ targets: [moon, txt], alpha: 0, duration: 300 });
        this.time.delayedCall(350, () => {
          this.scene.stop('Forge');
          if (r.rent?.lifeLost) this.scene.start('KingWrath', { summary: r.gameOver!, rent: r.rent });
          else this.scene.start('GameOver', { summary: r.gameOver!, reason: 'died' });
        });
        return;
      }
      // sunrise
      const dawn = this.add.graphics().setAlpha(0);
      dawn.fillGradientStyle(0x2a3a6a, 0x2a3a6a, 0xffb36a, 0xffb36a, 1, 1, 1, 1).fillRect(0, 0, W, H);
      const t2 = label(this, W / 2, H * 0.45, `DAY ${this.core.state.day} · 아침`, PORTRAIT ? 46 : 42, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
      t2.setStroke('#140a05', 8);
      this.tweens.add({ targets: [moon, txt], alpha: 0, duration: 300 });
      this.tweens.add({ targets: dawn, alpha: 1, duration: 700 });
      this.tweens.add({ targets: t2, alpha: 1, duration: 500, delay: 300 });
      this.time.delayedCall(1700, () => {
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
