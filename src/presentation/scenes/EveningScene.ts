// Evening (user request 2026-11-19; redesigned 2026-11-27: "밤으로 갔을 때 창 UI 최고로 세련되게, 스킬트리도
// 더 잘 보이게, 드워프 왕국 느낌의 배경, 밤과 아침이 넘어가는 느낌"). "다음 날" ends the day here:
//   sunset over the dwarf kingdom → night falls → tonight's choices → (sleep) moon → dawn over the kingdom.
// Choices: 왕의 투기장 (DAY 20+), 운명의 카드 (DAY 10+), 운명의 무기 카드 (DAY 30+), 잠자기; the star-disc
// skill tree has its own banner (stars are learned only after sunset). Opens over the paused forge.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { equippedWeapon } from '../../core/systems/weapons';
import { tonightsRivals } from '../../core/systems/doppelganger';
import { rentDueDay, rentFor } from '../../core/systems/rent';
import { cardPlayedToday, cardUnlocked, weaponCardPlayedToday, weaponCardUnlocked } from '../../core/systems/cards';
import { nightUnlocked } from '../../core/systems/daynight';
import { checkBuyNode, nodeVisible, ownedCount } from '../../core/systems/skillTree';
import { TREE } from '../../config/skillTree';
import { CARD_GAME, NIGHT_STAKE, NIGHT_UNLOCK_DAY, WEAPON_CARD } from '../../config/economy';
import { weaponDisplayName } from '../../config/swordNames';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { PORTRAIT } from '../layout';
import { Sfx } from '../audio/sfx';
import type { NightData } from './NightScene';

type Kind = 'night' | 'rent' | 'weapons' | 'sleep';

/** Each choice's colour and icon. */
const KIND: Record<Kind, { color: number; icon: string; title: string }> = {
  night: { color: 0xc06bff, icon: '🏟', title: '왕의 투기장' },
  rent: { color: 0xe9b65c, icon: '🃏', title: '운명의 카드' },
  weapons: { color: 0xff5a5a, icon: '⚔', title: '운명의 무기 카드' },
  sleep: { color: 0x8fb4ff, icon: '🌙', title: '잠자기' },
};

const BIG = PORTRAIT ? 1.15 : 1;
const TOP_H = PORTRAIT ? 150 : 96;
/** The skill-tree banner under the top bar. */
const SKILL = PORTRAIT ? { y: TOP_H + 16, h: 96 } : { y: TOP_H + 12, h: 74 };
const CARDS_Y = SKILL.y + SKILL.h + (PORTRAIT ? 18 : 16);

/** Stars that can be learned right now (from the evening). */
export function learnableStars(core: GameCore): number {
  const s = core.state;
  return TREE.filter((n) => n.id !== 'root' && nodeVisible(s, n) && checkBuyNode(s, n.id, true) === null).length;
}

export class EveningScene extends Phaser.Scene {
  private core!: GameCore;
  private root!: Phaser.GameObjects.Container;
  private busy = false;
  private sfx = new Sfx();
  /** The kingdom picture and its colour grades. */
  private sky!: { night: Phaser.GameObjects.Rectangle; warm: Phaser.GameObjects.Rectangle; stars: Phaser.GameObjects.Graphics };

  constructor() {
    super('Evening');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.busy = false;
    const day = this.core.state.day;
    // back from the cards or the skill tree: gold and stars may have changed
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.buildChoices());
    this.add.rectangle(W / 2, H / 2, W, H, 0, 0).setInteractive(); // swallow taps on the forge below

    this.buildKingdom();
    // sunset: the sun sinks behind the mountains, the title, then night falls and the choices come in
    // a small low sun over the valley, sinking into the far mountains
    const sunY0 = H * (PORTRAIT ? 0.5 : 0.5);
    const sun = this.add.graphics({ x: W / 2, y: sunY0 }).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    for (let i = 8; i >= 1; i--) sun.fillStyle(0xff9a3a, 0.012 * i).fillCircle(0, 0, 18 + i * 14);
    sun.fillStyle(0xffd890, 0.75).fillCircle(0, 0, 16);
    const t1 = label(this, W / 2, H * 0.3, `DAY ${day}`, PORTRAIT ? 30 : 26, 0xffe2b0, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    const t2 = label(this, W / 2, H * 0.3 + (PORTRAIT ? 52 : 46), '해가 진다', PORTRAIT ? 52 : 48, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    for (const t of [t1, t2]) t.setStroke('#140a05', 8).setShadow(0, 4, '#000', 14, true, true);
    this.tweens.add({ targets: sun, alpha: 1, duration: 500 });
    this.tweens.add({ targets: sun, y: H * 0.64, duration: 1800, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 500, delay: 250 });
    this.time.delayedCall(1300, () => {
      this.tweens.add({ targets: [t1, t2, sun], alpha: 0, duration: 450 });
      this.toNight(900);
      this.time.delayedCall(450, () => this.buildChoices());
    });
  }

  // ───────────────────────── the kingdom backdrop and its light
  private buildKingdom() {
    const key = 'art-kingdom_dusk';
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, H / 2, key);
      img.setScale(Math.max(W / img.width, H / img.height) * 1.04);
      // a slow drift so the scene breathes
      this.tweens.add({ targets: img, scale: img.scale * 1.03, x: W / 2 - 10, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.drawFallbackKingdom();
    }
    const warm = this.add.rectangle(W / 2, H / 2, W, H, 0xff8a3a, 0.16).setBlendMode(Phaser.BlendModes.ADD);
    const night = this.add.rectangle(W / 2, H / 2, W, H, 0x070414, 0);
    const stars = this.add.graphics().setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    const rnd = new Phaser.Math.RandomDataGenerator(['kingdom-stars']);
    for (let i = 0; i < 90; i++) stars.fillStyle(0xffffff, rnd.realInRange(0.25, 0.8)).fillCircle(rnd.between(0, W), rnd.between(0, H * 0.42), rnd.realInRange(0.6, 1.6));
    this.sky = { night, warm, stars };
    // vignette: the edges stay dark, the centre carries the UI
    const vig = this.add.graphics();
    for (let i = 0; i < 12; i++) vig.lineStyle(50, 0x000000, 0.06).strokeRect(-i * 22 + 20, -i * 22 + 20, W + i * 44 - 40, H + i * 44 - 40);
  }

  /** No painted kingdom yet: mountains and lit halls drawn in layers. */
  private drawFallbackKingdom() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a1846, 0x2a1846, 0xff9a4a, 0xff9a4a, 1).fillRect(0, 0, W, H * 0.7);
    g.fillStyle(0x140c18, 1).fillRect(0, H * 0.7, W, H * 0.3);
    const ridge = (base: number, amp: number, col: number, seed: number) => {
      const r = new Phaser.Math.RandomDataGenerator([String(seed)]);
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, H)];
      for (let x = 0; x <= W; x += W / 14) pts.push(new Phaser.Math.Vector2(x, base - r.realInRange(0.2, 1) * amp));
      pts.push(new Phaser.Math.Vector2(W, H));
      g.fillStyle(col, 1).fillPoints(pts, true);
    };
    ridge(H * 0.55, H * 0.22, 0x3a2438, 3);
    ridge(H * 0.68, H * 0.18, 0x24162a, 7);
    // lit windows of halls carved into the near ridge
    const r = new Phaser.Math.RandomDataGenerator(['halls']);
    for (let i = 0; i < 60; i++) g.fillStyle(0xffb347, r.realInRange(0.4, 0.9)).fillRect(r.between(0, W), r.between(H * 0.68, H * 0.95), 4, 6);
    ridge(H * 0.86, H * 0.1, 0x120a14, 11);
  }

  /** Night falls: darker, cooler, the stars come out. */
  private toNight(ms: number) {
    this.tweens.add({ targets: this.sky.night, fillAlpha: 0.5, duration: ms });
    this.tweens.add({ targets: this.sky.warm, fillAlpha: 0.04, duration: ms });
    this.tweens.add({ targets: this.sky.stars, alpha: 1, duration: ms });
  }

  // ───────────────────────── tonight's screen
  private buildChoices() {
    this.root?.destroy(true);
    const root = (this.root = this.add.container(0, 0).setAlpha(0));
    this.buildTopBar(root);
    this.buildSkillBanner(root);
    this.buildCards(root);
    const back = new Button(this, W / 2, H - (PORTRAIT ? 54 : 34), PORTRAIT ? 260 : 220, PORTRAIT ? 54 : 40, '◀ 대장간으로 돌아가기', { variant: 'ghost', size: PORTRAIT ? 18 : 15, onClick: () => this.back() });
    root.add(back);
    root.y = 14;
    this.tweens.add({ targets: root, alpha: 1, y: 0, duration: 380, ease: 'Cubic.easeOut' });
  }

  /** A glass panel drawn into `g`. */
  private glass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, edge: number, r = 18, alpha = 0.86) {
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 3, y + 6, w, h, r);
    g.fillGradientStyle(0x1d1424, 0x1d1424, 0x0b0810, 0x0b0810, alpha).fillRoundedRect(x, y, w, h, r);
    g.lineStyle(1.5, edge, 0.9).strokeRoundedRect(x, y, w, h, r);
    g.lineStyle(1, 0xffffff, 0.06).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, r - 4);
  }

  /** Day and title in the middle, the king's next visit on the left, the purse on the right. */
  private buildTopBar(root: Phaser.GameObjects.Container) {
    const s = this.core.state;
    const g = this.add.graphics();
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0.7, 0, 0).fillRect(0, 0, W, TOP_H + 30);
    root.add(g);
    const cx = W / 2;
    const ty = PORTRAIT ? 104 : 32;
    root.add(label(this, cx, ty, `DAY ${s.day} · 밤`, 15 * BIG, 0xc9b8ff, { weight: 900, origin: [0.5, 0.5] }));
    root.add(label(this, cx, ty + 30 * BIG, '오늘 밤은 어떻게 할까?', 30 * BIG, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 6));

    // purse (right; portrait: top right)
    const gold = label(this, W - 24, PORTRAIT ? 34 : 32, `💰 ${s.gold.toLocaleString()}G`, 20 * BIG, C.goldHi, { weight: 900, origin: [1, 0.5] });
    gold.setStroke('#140a05', 5);
    root.add(gold);

    // the king's visit (left; portrait: top left), big and impossible to miss
    const due = rentDueDay(s);
    const left = Math.max(0, due - s.day);
    const need = rentFor(s, due);
    const enough = s.gold >= need;
    const urgent = left <= 1;
    const bw = PORTRAIT ? 300 : 300;
    const bh = PORTRAIT ? 66 : 62;
    const bx = 18;
    const by = PORTRAIT ? 10 : 16;
    const box = this.add.graphics();
    this.glass(box, bx, by, bw, bh, urgent ? 0xff3a2a : 0xe9b65c, 14, 0.92);
    root.add(box);
    const dday = this.add
      .text(bx + 64, by + bh / 2, left <= 0 ? 'D-DAY' : `D-${left}`, { fontFamily: DISPLAY, fontSize: `${Math.round(34 * BIG)}px`, fontStyle: '900', color: css(urgent ? 0xff4a3a : C.goldHi), stroke: '#000000', strokeThickness: 6, resolution: 2 })
      .setOrigin(0.5);
    root.add(dday);
    root.add(label(this, bx + 124, by + 18, `👑 왕의 수금 · DAY ${due} 아침`, 12.5 * BIG, urgent ? 0xffb0a0 : C.mute, { weight: 900, origin: [0, 0.5] }));
    root.add(label(this, bx + 124, by + 40, `${need.toLocaleString()}G`, 15 * BIG, C.text, { weight: 900, origin: [0, 0.5] }));
    const ok = label(this, bx + bw - 14, by + 40, enough ? '✔ 준비됨' : `✖ ${(need - s.gold).toLocaleString()}G 부족`, 12 * BIG, enough ? 0x7dff8a : 0xff6b6b, { weight: 900, origin: [1, 0.5] });
    root.add(ok);
    if (urgent) this.tweens.add({ targets: dday, scale: 1.12, duration: 460, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The skill tree, as its own wide banner: owned stars and how many can be learned right now. */
  private buildSkillBanner(root: Phaser.GameObjects.Container) {
    const s = this.core.state;
    const can = learnableStars(this.core);
    const x = PORTRAIT ? 20 : 120;
    const w = W - x * 2;
    const { y, h } = SKILL;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    const edge = can > 0 ? 0xffd34d : 0x6a5a8a;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 3, y + 6, w, h, h / 2);
    g.fillGradientStyle(0x2a1d4a, 0x14102a, 0x2a1d4a, 0x14102a, 0.94).fillRoundedRect(x, y, w, h, h / 2);
    g.lineStyle(2, edge, 1).strokeRoundedRect(x, y, w, h, h / 2);
    // a little constellation on the left
    const sx = x + h * 0.9;
    const sy = y + h / 2;
    const pts: [number, number][] = [[-26, 10], [-10, -12], [8, 4], [24, -14], [30, 12]];
    g.lineStyle(1.5, 0xffe2a0, 0.5);
    for (let i = 1; i < pts.length; i++) g.lineBetween(sx + pts[i - 1][0], sy + pts[i - 1][1], sx + pts[i][0], sy + pts[i][1]);
    for (const [px, py] of pts) {
      g.fillStyle(0xffd34d, 0.25).fillCircle(sx + px, sy + py, 7);
      g.fillStyle(0xfff1c0, 1).fillCircle(sx + px, sy + py, 3);
    }
    c.add(g);
    const tx = x + h * 1.75;
    c.add(label(this, tx, y + h / 2 - 13 * BIG, '✦ 별자리 스킬트리', 20 * BIG, 0xffe9b0, { weight: 900, origin: [0, 0.5] }));
    c.add(
      label(this, tx, y + h / 2 + 14 * BIG, can > 0 ? `지금 배울 수 있는 별 ${can}개 · 배운 별 ${ownedCount(s)} / ${TREE.length - 1}` : `배운 별 ${ownedCount(s)} / ${TREE.length - 1} · 골드가 모이면 다음 별이 열린다`, 13 * BIG, can > 0 ? 0x8affb0 : C.mute, {
        weight: 700,
        origin: [0, 0.5],
      }),
    );
    const btn = new Button(this, x + w - (PORTRAIT ? 92 : 104), y + h / 2, PORTRAIT ? 156 : 180, h - 22, can > 0 ? '별 새기기 ▶' : '살펴보기', {
      variant: can > 0 ? 'gold' : 'dark',
      size: 17 * BIG,
      onClick: () => this.openSkills(),
    });
    c.add(btn);
    root.add(c);
    if (can > 0) {
      // a slow shimmer along the rim while something can be learned
      const shine = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      shine.lineStyle(4, 0xffd34d, 0.35).strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
      root.add(shine);
      this.tweens.add({ targets: shine, alpha: { from: 0.2, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private buildCards(root: Phaser.GameObjects.Container) {
    const s = this.core.state;
    // what tonight offers: the arena from DAY 20, the weapon cards from DAY 30; the cards show their day when locked
    const order: Kind[] = [...(nightUnlocked(s) ? ['night' as const] : []), 'rent', ...(weaponCardUnlocked(s) ? ['weapons' as const] : []), 'sleep'];
    if (PORTRAIT) {
      // phones: one wide row per choice
      // phones: one wide row per choice; the arena row is taller (tonight's rivals and my weapon)
      const bottom = H - 96;
      const gap = 14;
      const room = bottom - CARDS_Y - gap * (order.length - 1);
      const arena = order.includes('night') ? Math.min(300, room * 0.34) : 0;
      const rest = order.filter((k) => k !== 'night').length;
      const rowH = Math.min(220, Math.floor((room - arena) / rest));
      let y = CARDS_Y;
      for (const k of order) {
        const h = k === 'night' ? arena : rowH;
        root.add(this.buildRow(k, y, h));
        y += h + gap;
      }
      return;
    }
    const gap = 20;
    const n = order.length;
    const w = Math.min(300, Math.floor((W - 96 - gap * (n - 1)) / n));
    const h = H - CARDS_Y - 76;
    const x0 = W / 2 - (n * w + (n - 1) * gap) / 2;
    order.forEach((k, i) => root.add(this.buildCard(k, x0 + i * (w + gap), CARDS_Y, w, h, i)));
  }

  /** Landscape: a tall card — icon, title, what it is, tonight's details, the button. */
  private buildCard(kind: Kind, x: number, y: number, w: number, h: number, i: number): Phaser.GameObjects.Container {
    const k = KIND[kind];
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    this.glass(g, x, y, w, h, k.color);
    // accent: a coloured cap and a soft glow behind the icon
    g.fillStyle(k.color, 0.9).fillRoundedRect(x, y, w, 5, { tl: 18, tr: 18, bl: 0, br: 0 });
    for (let r = 5; r >= 1; r--) g.fillStyle(k.color, 0.035 * r).fillCircle(x + w / 2, y + 58, 22 + r * 9);
    c.add(g);
    c.add(label(this, x + w / 2, y + 58, k.icon, 40, 0xffffff, { origin: [0.5, 0.5] }));
    c.add(label(this, x + w / 2, y + 112, k.title, 22, k.color, { weight: 900, origin: [0.5, 0.5] }));
    const info = this.cardInfo(kind);
    c.add(label(this, x + 22, y + 140, info.text, 13.5, C.text, { weight: 400, wrap: w - 44, lineSpacing: 6 }));
    // the details sit just above the button (≈ 100 px tall)
    if (info.extra) info.extra(c, x + 22, y + h - 178, w - 44);
    const btn = new Button(this, x + w / 2, y + h - 38, w - 36, 54, info.button, { variant: info.variant, size: 18, sub: info.sub, onClick: info.onClick });
    btn.setEnabled(info.enabled);
    c.add(btn);
    // cards rise in one after another
    c.setAlpha(0);
    c.y = 18;
    this.tweens.add({ targets: c, alpha: 1, y: 0, duration: 360, delay: 80 + i * 70, ease: 'Cubic.easeOut' });
    return c;
  }

  /** Portrait: a wide row — icon and title on the left, the button on the right. */
  private buildRow(kind: Kind, y: number, h: number): Phaser.GameObjects.Container {
    const k = KIND[kind];
    const x = 20;
    const w = W - 40;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    this.glass(g, x, y, w, h, k.color);
    g.fillStyle(k.color, 0.9).fillRoundedRect(x, y, 6, h, { tl: 18, bl: 18, tr: 0, br: 0 });
    c.add(g);
    c.add(label(this, x + 50, y + 40, k.icon, 40, 0xffffff, { origin: [0.5, 0.5] }));
    c.add(label(this, x + 92, y + 40, k.title, 26, k.color, { weight: 900, origin: [0, 0.5] }));
    const info = this.cardInfo(kind);
    c.add(label(this, x + 26, y + 78, info.text, 15, C.text, { wrap: w - 52, lineSpacing: 5 }));
    // details under the description, left of the button
    if (info.extra && h >= 260) info.extra(c, x + 26, y + 154, w - 260);
    const btn = new Button(this, x + w - 120, y + h - 44, 210, 60, info.button, { variant: info.variant, size: 20, sub: info.sub, onClick: info.onClick });
    btn.setEnabled(info.enabled);
    c.add(btn);
    return c;
  }

  /** What a choice says tonight and what its button does. */
  private cardInfo(kind: Kind): {
    text: string;
    button: string;
    sub?: string;
    variant: 'gold' | 'dark' | 'danger';
    enabled: boolean;
    onClick: () => void;
    extra?: (c: Phaser.GameObjects.Container, x: number, y: number, w: number) => void;
  } {
    const s = this.core.state;
    switch (kind) {
      case 'night': {
        const win = Math.floor(s.gold * NIGHT_STAKE.winMul);
        const lose = Math.floor(s.gold * NIGHT_STAKE.loseMul);
        const mine = this.nightWeapon();
        return {
          text: `왕국의 대장장이 2명과 내기 결투.\n상대 무기의 단계는 싸워 봐야 안다.\n이기면 ${win.toLocaleString()}G · 지면 ${lose.toLocaleString()}G`,
          button: '투기장에 나간다',
          variant: 'danger',
          enabled: true,
          onClick: () => this.gamble(),
          extra: (c, x, y, w) => {
            // tonight's rivals: their levels stay hidden until the fight ("+???")
            c.add(label(this, x, y, '오늘 밤 상대', 12 * BIG, C.mute, { weight: 900 }));
            tonightsRivals(s).lineup.forEach((d, i) => {
              const ry = y + 22 * BIG + i * 26 * BIG;
              const pill = this.add.graphics();
              pill.fillStyle(0x3a2a4a, 1).fillRoundedRect(x, ry, 52, 20 * BIG, 10 * BIG);
              pill.lineStyle(1.5, 0xc06bff, 1).strokeRoundedRect(x, ry, 52, 20 * BIG, 10 * BIG);
              c.add([pill, label(this, x + 26, ry + 10 * BIG, '+???', 12 * BIG, 0xffffff, { weight: 900, origin: [0.5, 0.5] })]);
              c.add(label(this, x + 62, ry + 10 * BIG, d.name, 14 * BIG, C.text, { weight: 700, origin: [0, 0.5] }));
            });
            c.add(label(this, x, y + 80 * BIG, `내 무기 · ${mine ? `${weaponDisplayName(mine)} +${mine.level}` : '대장장이 망치'}`, 12.5 * BIG, C.goldHi, { weight: 700, wrap: w }));
          },
        };
      }
      case 'rent': {
        const open = cardUnlocked(s);
        const played = cardPlayedToday(s);
        const can = open && !played && s.gold >= 1;
        return {
          text: !open
            ? `DAY ${CARD_GAME.unlockDay}부터 열린다 (${CARD_GAME.unlockDay - s.day}일 남음).\n두 장 중 한 장, 가진 골드의 절반까지 건다.`
            : played
              ? '오늘은 이미 카드를 뒤집었다.\n내일 밤 다시 운을 시험할 수 있다.'
              : `두 장 중 한 장을 고르고 가진 골드의 절반까지 건다.\nO면 건 돈의 ${CARD_GAME.payoutMul}배, X면 잃는다.`,
          button: !open ? `DAY ${CARD_GAME.unlockDay}부터` : played ? '오늘은 끝' : '카드를 고른다',
          sub: open && !played && s.gold < 1 ? '걸 골드가 없다' : undefined,
          variant: can ? 'gold' : 'dark',
          enabled: can,
          onClick: () => this.openCards(),
        };
      }
      case 'weapons': {
        const played = weaponCardPlayedToday(s);
        const n = s.weapons.length;
        return {
          text: played ? '오늘은 이미 무기를 걸었다.\n내일 밤 다시 걸 수 있다.' : `무기걸이에서 고른 무기 한 자루를 건다.\nO면 +${WEAPON_CARD.levels} · X면 그 무기가 부서진다.`,
          button: played ? '오늘은 끝' : n === 0 ? '걸 무기가 없다' : '걸 무기를 고른다',
          variant: !played && n > 0 ? 'danger' : 'dark',
          enabled: !played && n > 0,
          onClick: () => this.openCards('weapons'),
        };
      }
      case 'sleep':
        return {
          text: `내기 없이 잔다.\n아침이 오면 새 무기가 배달된다.${nightUnlocked(s) ? '' : `\n\n왕의 투기장은 DAY ${NIGHT_UNLOCK_DAY}부터 열린다.`}`,
          button: '잠자기 ▶',
          variant: 'gold',
          enabled: true,
          onClick: () => this.sleep(),
        };
    }
  }

  private openCards(mode: 'gold' | 'weapons' = 'gold') {
    if (this.busy) return;
    this.sfx.click();
    this.scene.launch('Cards', {
      mode,
      onClose: () => this.scene.resume(), // the resume handler rebuilds the choices
    });
    this.scene.pause();
  }

  private openSkills() {
    if (this.busy) return;
    this.sfx.click();
    this.scene.launch('Skills', { from: 'Evening' });
    this.scene.bringToTop('Skills'); // registered before Evening, so it would draw underneath
    this.scene.pause();
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

  /** The night passes over the kingdom: deep night and the moon, then dawn breaks gold over the halls. */
  private sleep() {
    if (this.busy) return;
    this.busy = true;
    const r = this.core.dispatch({ type: 'SLEEP' }); // saved before the animation
    if (r.type !== 'slept') {
      this.busy = false;
      return;
    }
    this.tweens.add({ targets: this.root, alpha: 0, y: 10, duration: 300 });
    // deep night
    this.tweens.add({ targets: this.sky.night, fillAlpha: 0.82, duration: 700 });
    const moon = this.add.graphics({ x: W * 0.2, y: H * 0.36 }).setAlpha(0);
    // a soft halo in many faint layers (no visible rings)
    for (let i = 18; i >= 1; i--) moon.fillStyle(0xbcd0ff, 0.012).fillCircle(0, 0, 30 + i * 6);
    moon.fillStyle(0xf2f4ff, 1).fillCircle(0, 0, PORTRAIT ? 40 : 32);
    moon.fillStyle(0xd8dcf0, 1).fillCircle(-8, -6, 6).fillCircle(9, 8, 4);
    const txt = label(this, W / 2, H * 0.5, '…밤이 지나간다', PORTRAIT ? 32 : 28, 0xd6deff, { weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    txt.setStroke('#05030a', 6);
    this.tweens.add({ targets: [moon, txt], alpha: 1, duration: 600, delay: 250 });
    this.tweens.add({ targets: moon, x: W * 0.8, y: H * 0.16, duration: 1700, delay: 250, ease: 'Sine.easeInOut' });
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
      // dawn: the same kingdom, lit gold from the east
      this.tweens.add({ targets: [moon, txt], alpha: 0, duration: 400 });
      this.tweens.add({ targets: this.sky.night, fillAlpha: 0.08, duration: 1100, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: this.sky.stars, alpha: 0, duration: 700 });
      this.sky.warm.setFillStyle(0xffc070, 0.04);
      this.tweens.add({ targets: this.sky.warm, fillAlpha: 0.22, duration: 1100 });
      // the sun rising out of the valley: a small bright core in a wide, faint glow
      const rays = this.add.graphics({ x: W / 2, y: H * 0.66 }).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      for (let i = 20; i >= 1; i--) rays.fillStyle(0xffc070, 0.01).fillCircle(0, 0, 20 + i * 14);
      rays.fillStyle(0xfff0c0, 0.8).fillCircle(0, 0, 16);
      this.tweens.add({ targets: rays, alpha: 1, y: H * 0.5, duration: 1300, ease: 'Sine.easeOut' });
      const d1 = label(this, W / 2, H * 0.4, `DAY ${this.core.state.day}`, PORTRAIT ? 30 : 26, 0xfff0d0, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
      const d2 = label(this, W / 2, H * 0.4 + (PORTRAIT ? 52 : 46), '아침', PORTRAIT ? 56 : 50, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
      for (const t of [d1, d2]) t.setStroke('#140a05', 8).setShadow(0, 4, '#000', 14, true, true);
      this.tweens.add({ targets: [d1, d2], alpha: 1, duration: 500, delay: 350 });
      this.time.delayedCall(1800, () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);
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
