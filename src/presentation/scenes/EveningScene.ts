// Evening (user requests 2026-11-19 … 2026-11-27). "다음 날" ends the day here:
//   sunset over the dwarf kingdom → the night picture, blurred, behind an end-of-day summary
//   ("하루 끝!": today's strikes by result, the best level reached, the gold made) → a row of simple
//   choices at the bottom: 스킬트리 · 월세 (the king's next visit) · 잠자기 · 카드 내기 (+ 무기 카드 from DAY 30;
//   the 투기장 from DAY 20 was removed 2026-11-27 and shows only if NIGHT_ARENA is switched back on) → (sleep) the moon crosses, dawn warms the kingdom.
// Layout after the user's reference (2026-11-27): a big title, two stat panels side by side, buttons below.
// Opens over the paused forge.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { bestWeapon } from '../../core/systems/weapons';
import { tonightsRivals } from '../../core/systems/doppelganger';
import { rentDueDay, rentFor } from '../../core/systems/rent';
import { cardPlayedToday, cardUnlocked, weaponCardPlayedToday, weaponCardUnlocked } from '../../core/systems/cards';
import { nightUnlocked } from '../../core/systems/daynight';
import { checkBuyNode, nodeVisible, ownedCount } from '../../core/systems/skillTree';
import { dayLog } from '../../core/systems/dayLog';
import { TREE } from '../../config/skillTree';
import { CARD_GAME, NIGHT_STAKE, WEAPON_CARD } from '../../config/economy';
import { OUTCOME_INFO, OUTCOMES } from '../../config/enhancement';
import { weaponDisplayName } from '../../config/swordNames';
import { ELEMENT_INFO } from '../../config/weapons';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { Sfx } from '../audio/sfx';
import { glowStrength, weaponLookTexture } from '../weaponArt';
import type { NightData } from './NightScene';
import type { StoryData } from './StoryScene';
import { GAMBLER_FIRST, GAMBLER_SEEN_ID } from '../../config/story';

const BIG = PORTRAIT ? 1.2 : 1;

/** Stars that can be learned right now (from the evening). */
export function learnableStars(core: GameCore): number {
  const s = core.state;
  return TREE.filter((n) => n.id !== 'root' && nodeVisible(s, n) && checkBuyNode(s, n.id, true) === null).length;
}

/** Layout boxes (game coordinates). */
const L = PORTRAIT
  ? {
      titleY: 150,
      left: { x: 28, y: 214, w: W - 56, h: 420 },
      rate: { x: 28, y: 650, w: (W - 72) / 2, h: 250 },
      best: { x: 28 + (W - 72) / 2 + 16, y: 650, w: (W - 72) / 2, h: 250 },
      buttonsY: 930,
    }
  : {
      titleY: 104,
      left: { x: 150, y: 150, w: 480, h: 350 },
      rate: { x: 650, y: 150, w: 480, h: 150 },
      best: { x: 650, y: 314, w: 480, h: 186 },
      buttonsY: 540,
    };

export class EveningScene extends Phaser.Scene {
  private core!: GameCore;
  private root!: Phaser.GameObjects.Container;
  private busy = false;
  private sfx = new Sfx();
  private bg!: { dusk: Phaser.GameObjects.Image | null; night: Phaser.GameObjects.Image | null; shade: Phaser.GameObjects.Rectangle; warm: Phaser.GameObjects.Rectangle };

  constructor() {
    super('Evening');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.busy = false;
    const day = this.core.state.day;
    // back from the cards or the skill tree: gold and stars may have changed
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.buildSummary());
    this.add.rectangle(W / 2, H / 2, W, H, 0, 0).setInteractive(); // swallow taps on the forge below

    this.buildBackdrop();
    // sunset: a small sun sinks into the valley with the day's title, then the night picture comes in
    const sun = this.add.graphics({ x: W / 2, y: H * 0.5 }).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    for (let i = 8; i >= 1; i--) sun.fillStyle(0xff9a3a, 0.012 * i).fillCircle(0, 0, 18 + i * 14);
    sun.fillStyle(0xffd890, 0.75).fillCircle(0, 0, 16);
    const t1 = label(this, W / 2, H * 0.3, `DAY ${day}`, 28 * BIG, 0xffe2b0, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    const t2 = label(this, W / 2, H * 0.3 + 48 * BIG, '해가 진다', 48 * BIG, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
    for (const t of [t1, t2]) t.setStroke('#140a05', 8).setShadow(0, 4, '#000', 14, true, true);
    this.tweens.add({ targets: sun, alpha: 1, duration: 500 });
    this.tweens.add({ targets: sun, y: H * 0.64, duration: 1800, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 500, delay: 250 });
    this.time.delayedCall(1300, () => {
      this.tweens.add({ targets: [t1, t2, sun], alpha: 0, duration: 450 });
      this.toNight();
      this.time.delayedCall(500, () => this.buildSummary());
      this.time.delayedCall(1100, () => this.gamblerTalk());
    });
  }

  /** 도박꾼의 카드 내기 (user 2026-11-27): the first evening the cards open (DAY 10), the gambler explains them. */
  private gamblerTalk() {
    if (!cardUnlocked(this.core.state) || this.core.hasSeen(GAMBLER_SEEN_ID)) return;
    const data: StoryData = { next: 'Evening', lines: GAMBLER_FIRST, overlay: true, seenId: GAMBLER_SEEN_ID };
    this.scene.launch('Story', data);
    this.scene.bringToTop('Story');
    this.scene.pause();
  }

  // ───────────────────────── backdrop: dusk picture, then the night picture blurred
  private cover(key: string): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(key)) return null;
    const img = this.add.image(W / 2, H / 2, key);
    img.setScale(Math.max(W / img.width, H / img.height) * 1.06);
    return img;
  }

  private buildBackdrop() {
    const dusk = this.cover('art-kingdom_dusk');
    if (!dusk) this.add.rectangle(W / 2, H / 2, W, H, 0x2a1846);
    const night = this.cover('art-kingdom_night');
    night?.setAlpha(0);
    const warm = this.add.rectangle(W / 2, H / 2, W, H, 0xff8a3a, 0.14).setBlendMode(Phaser.BlendModes.ADD);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x05030c, 0);
    this.bg = { dusk, night, shade, warm };
  }

  /** Night falls: the night picture fades in and blurs; the scene darkens behind the summary. */
  private toNight() {
    const { night, dusk, shade, warm } = this.bg;
    const blurTarget = night ?? dusk;
    const blur = blurTarget?.postFX?.addBlur(1, 2, 2, 0);
    if (blur) this.tweens.add({ targets: blur, strength: 1.4, duration: 900 });
    if (night) this.tweens.add({ targets: night, alpha: 1, duration: 900 });
    this.tweens.add({ targets: shade, fillAlpha: night ? 0.5 : 0.62, duration: 900 });
    this.tweens.add({ targets: warm, fillAlpha: 0, duration: 900 });
  }

  // ───────────────────────── the summary
  /** A dark panel. */
  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x + 3, y + 6, w, h, 12);
    g.fillStyle(0x0b0908, 0.92).fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(1, 0x3a2e24, 1).strokeRoundedRect(x, y, w, h, 12);
  }

  /** One label/value band inside a panel. */
  private band(c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, name: string, value: string, valueColor: number = C.text) {
    const g = this.add.graphics();
    g.fillStyle(0x1d1814, 0.95).fillRoundedRect(x, y, w, h, 6);
    c.add(g);
    c.add(label(this, x + 14, y + h / 2, name, 21 * BIG, 0xd9cdbd, { weight: 900, origin: [0, 0.5] }));
    c.add(label(this, x + w - 14, y + h / 2, value, 24 * BIG, valueColor, { weight: 900, origin: [1, 0.5] }));
  }

  private buildSummary() {
    this.root?.destroy(true);
    const root = (this.root = this.add.container(0, 0).setAlpha(0));
    const s = this.core.state;
    const log = dayLog(this.core.state);

    // title, purse, the way back
    root.add(label(this, W / 2, L.titleY - 44 * BIG, `DAY ${s.day} · 밤`, 15 * BIG, 0xc9b8ff, { weight: 900, origin: [0.5, 0.5] }));
    const title = label(this, W / 2, L.titleY, log.attempts ? '하루 끝!' : '조용한 하루', 46 * BIG, 0xf1e6d2, { display: true, weight: 900, origin: [0.5, 0.5] });
    title.setStroke('#05030a', 8).setShadow(0, 4, '#000', 16, true, true);
    root.add(title);
    const purseG = this.add.graphics();
    const pw = PORTRAIT ? 250 : 210;
    purseG.fillStyle(0x0b0908, 0.85).fillRoundedRect(W - pw - 16, 14, pw, 46 * BIG, 23 * BIG);
    purseG.lineStyle(1, 0x5a4632, 1).strokeRoundedRect(W - pw - 16, 14, pw, 46 * BIG, 23 * BIG);
    root.add(purseG);
    root.add(label(this, W - 16 - pw / 2, 14 + 23 * BIG, `💰 ${s.gold.toLocaleString()}G`, 20 * BIG, C.goldHi, { weight: 900, origin: [0.5, 0.5] }));
    root.add(new Button(this, 16 + (PORTRAIT ? 90 : 80), 14 + 23 * BIG, PORTRAIT ? 180 : 160, 46 * BIG, '◀ 대장간', { variant: 'dark', size: 16 * BIG, onClick: () => this.back() }));

    this.buildRecord(root, log);
    this.buildRate(root, log);
    this.buildBest(root, log);
    this.buildButtons(root);
    root.y = 14;
    this.tweens.add({ targets: root, alpha: 1, y: 0, duration: 380, ease: 'Cubic.easeOut' });
  }

  /** Left panel: strikes, results, best level, gold. */
  private buildRecord(root: Phaser.GameObjects.Container, log: ReturnType<typeof dayLog>) {
    const { x, y, w, h } = L.left;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    this.panel(g, x, y, w, h);
    c.add(g);
    const pad = 16;
    const bw = w - pad * 2;
    const bh = 44 * BIG;
    let yy = y + pad;
    this.band(c, x + pad, yy, bw, bh, '강화', `${log.attempts}번`);
    yy += bh + 8;
    // results: a chip per outcome with its count
    const chips = this.add.graphics();
    chips.fillStyle(0x1d1814, 0.95).fillRoundedRect(x + pad, yy, bw, bh, 6);
    c.add(chips);
    const cw = bw / OUTCOMES.length;
    OUTCOMES.forEach((o, i) => {
      const cx = x + pad + cw * i + cw / 2;
      const info = OUTCOME_INFO[o];
      const dot = this.add.graphics();
      dot.fillStyle(info.color, 1).fillCircle(cx - 26 * BIG, yy + bh / 2, 7 * BIG);
      c.add(dot);
      c.add(label(this, cx - 15 * BIG, yy + bh / 2 - 9 * BIG, info.name, 11 * BIG, C.mute, { weight: 900, origin: [0, 0.5] }));
      c.add(label(this, cx - 15 * BIG, yy + bh / 2 + 9 * BIG, String(log[o]), 17 * BIG, o === 'destroy' && log[o] ? C.dangerHi : C.text, { weight: 900, origin: [0, 0.5] }));
    });
    yy += bh + 8;
    this.band(c, x + pad, yy, bw, bh, '오늘 최고', log.best ? `+${log.best.level}` : '—', C.goldHi);
    yy += bh + 8;
    this.band(c, x + pad, yy, bw, bh, '판매', `${log.earned ? '+' : ''}${log.earned.toLocaleString()}G${log.sold ? ` · ${log.sold}자루` : ''}`, 0x8affb0);
    yy += bh + 8;
    this.band(c, x + pad, yy, bw, bh, '강화 비용', `${log.spent ? '−' : ''}${log.spent.toLocaleString()}G`, 0xff9a8a);
    yy += bh + 8;
    const net = log.earned - log.spent;
    this.band(c, x + pad, yy, bw, Math.min(bh + 6, y + h - pad - yy), '합계', `${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net).toLocaleString()}G`, net >= 0 ? C.goldHi : C.dangerHi);
    root.add(c);
  }

  /** Right top: the success rate and the day's mix of results as one bar. */
  private buildRate(root: Phaser.GameObjects.Container, log: ReturnType<typeof dayLog>) {
    const { x, y, w, h } = L.rate;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    this.panel(g, x, y, w, h);
    c.add(g);
    const pad = 16;
    const up = log.great + log.success;
    const rate = log.attempts ? Math.round((up / log.attempts) * 100) : 0;
    c.add(label(this, x + pad + 6, y + 30 * BIG, '성공률', 21 * BIG, 0xd9cdbd, { weight: 900, origin: [0, 0.5] }));
    c.add(label(this, x + w - pad - 6, y + 30 * BIG, log.attempts ? `${rate}%` : '—', 28 * BIG, C.text, { weight: 900, origin: [1, 0.5] }));
    // stacked bar of outcomes
    const bx = x + pad + 6;
    const bw = w - (pad + 6) * 2;
    const by = y + 66 * BIG;
    const bh = 16 * BIG;
    const bar = this.add.graphics();
    bar.fillStyle(0x1d1814, 1).fillRoundedRect(bx, by, bw, bh, bh / 2);
    let cx = bx;
    if (log.attempts) {
      for (const o of OUTCOMES) {
        const part = (bw * log[o]) / log.attempts;
        if (part > 0) bar.fillStyle(OUTCOME_INFO[o].color, 1).fillRect(cx, by, part, bh);
        cx += part;
      }
    }
    c.add(bar);
    const sub = log.attempts ? `올린 ${up}번 · 유지 ${log.keep} · 내려간 ${log.down} · 부서진 ${log.destroy}` : '오늘은 망치를 들지 않았다';
    c.add(label(this, bx, by + bh + 22 * BIG, sub, 13 * BIG, C.mute, { weight: 700, origin: [0, 0.5], wrap: bw }));
    root.add(c);
  }

  /** Right bottom: today's best piece on display. */
  private buildBest(root: Phaser.GameObjects.Container, log: ReturnType<typeof dayLog>) {
    const { x, y, w, h } = L.best;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    this.panel(g, x, y, w, h);
    c.add(g);
    c.add(label(this, x + 22, y + 22 * BIG, '오늘의 최고 작품', 13 * BIG, C.mute, { weight: 900, origin: [0, 0.5] }));
    const b = log.best;
    if (!b) {
      c.add(label(this, x + w / 2, y + h / 2 + 8, '아직 없다', 16 * BIG, C.dim, { weight: 700, origin: [0.5, 0.5] }));
      root.add(c);
      return;
    }
    const cx = x + w / 2;
    const cy = y + h / 2 + 4;
    const tile = this.add.graphics();
    const tw = Math.min(w - 60, 300 * BIG);
    const th = Math.min(h - 80, 92 * BIG);
    tile.fillStyle(0x1d1814, 1).fillRoundedRect(cx - tw / 2, cy - th / 2 - 6, tw, th, 10);
    for (let i = 5; i >= 1; i--) tile.fillStyle(ELEMENT_INFO[b.element].glow, 0.035).fillEllipse(cx, cy - 6, tw * 0.5 + i * 24, th * 0.5 + i * 8);
    c.add(tile);
    const key = weaponLookTexture(this, b);
    if (this.textures.exists(key)) {
      const img = this.add.image(cx, cy - 6, key);
      img.setScale(Math.min((tw - 24) / img.width, (th - 14) / img.height));
      const st = glowStrength(b.level);
      if (st > 0) img.preFX?.addGlow(ELEMENT_INFO[b.element].glow, Math.min(4, st), 0, false, 0.1, 10);
      c.add(img);
    }
    c.add(new LevelBadge(this, cx + tw / 2 - 26, cy - th / 2 + 8, b.level, 15 * BIG));
    const name = weaponDisplayName({ cls: b.cls, element: b.element, level: b.level } as never);
    c.add(label(this, cx, cy + th / 2 + 12 * BIG, name, 13 * BIG, C.text, { weight: 700, origin: [0.5, 0.5] }));
    root.add(c);
  }

  /** The row of simple choices (the user's reference: a few plain boxes under the panels). */
  private buildButtons(root: Phaser.GameObjects.Container) {
    const s = this.core.state;
    type Item = { kind: 'skill' | 'rent' | 'sleep' | 'card' | 'arena' | 'weapons' };
    const items: Item[] = [{ kind: 'skill' }, { kind: 'rent' }, { kind: 'sleep' }, { kind: 'card' }];
    if (nightUnlocked(s)) items.push({ kind: 'arena' });
    if (weaponCardUnlocked(s)) items.push({ kind: 'weapons' });
    const cols = PORTRAIT ? 2 : items.length;
    const gap = PORTRAIT ? 14 : 16;
    const left = PORTRAIT ? 28 : 150;
    const totalW = W - left * 2;
    const bw = (totalW - gap * (cols - 1)) / cols;
    const bh = PORTRAIT ? 100 : 76;
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = left + col * (bw + gap) + bw / 2;
      const cy = L.buttonsY + row * (bh + gap) + bh / 2;
      root.add(this.choice(it.kind, cx, cy, bw, bh));
    });
  }

  private choice(kind: 'skill' | 'rent' | 'sleep' | 'card' | 'arena' | 'weapons', cx: number, cy: number, w: number, h: number): Phaser.GameObjects.GameObject {
    const s = this.core.state;
    const size = 22 * BIG;
    const sub = 12.5 * BIG;
    switch (kind) {
      case 'skill': {
        const can = learnableStars(this.core);
        const b = new Button(this, cx, cy, w, h, '✦ 스킬트리', {
          variant: can ? 'gold' : 'dark',
          size,
          sub: can ? `배울 수 있는 별 ${can}개` : `배운 별 ${ownedCount(s)} / ${TREE.length - 1}`,
          subSize: sub,
          onClick: () => this.openSkills(),
        });
        if (can) this.tweens.add({ targets: b, scale: 1.04, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        return b;
      }
      case 'rent':
        return this.rentBox(cx, cy, w, h);
      case 'sleep':
        return new Button(this, cx, cy, w, h, '🌙 잠자기', { variant: 'dark', size, sub: '내일 아침으로', subSize: sub, onClick: () => this.sleep() });
      case 'card': {
        const open = cardUnlocked(s);
        const played = cardPlayedToday(s);
        const can = open && !played && s.gold >= 1;
        const b = new Button(this, cx, cy, w, h, '🃏 카드 내기', {
          variant: 'dark',
          size,
          sub: !open ? `DAY ${CARD_GAME.unlockDay}부터` : played ? '오늘은 끝' : s.gold < 1 ? '걸 골드가 없다' : `O면 ×${CARD_GAME.payoutMul} · 절반까지`,
          subSize: sub,
          onClick: () => this.openCards(),
        });
        b.setEnabled(can);
        return b;
      }
      case 'arena': {
        const n = tonightsRivals(s).lineup.length;
        return new Button(this, cx, cy, w, h, '🏟 투기장', { variant: 'danger', size, sub: `상대 ${n}명 · 이기면 ×${NIGHT_STAKE.winMul}`, subSize: sub, onClick: () => this.gamble() });
      }
      case 'weapons': {
        const played = weaponCardPlayedToday(s);
        const b = new Button(this, cx, cy, w, h, '⚔ 무기 카드', {
          variant: 'dark',
          size,
          sub: played ? '오늘은 끝' : `O면 +${WEAPON_CARD.levels} · X면 파괴`,
          subSize: sub,
          onClick: () => this.openCards('weapons'),
        });
        b.setEnabled(!played && s.weapons.length > 0);
        return b;
      }
    }
  }

  /** The king's next visit: amount and days left; red with warnings when the purse is short or it is tomorrow. */
  private rentBox(cx: number, cy: number, w: number, h: number): Phaser.GameObjects.Container {
    const s = this.core.state;
    const due = rentDueDay(s);
    const left = Math.max(0, due - s.day);
    const need = rentFor(s, due);
    const short = s.gold < need;
    const alarm = short || left <= 1;
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    g.fillStyle(alarm ? 0x5a1416 : 0x2a1d10, 0.97).fillRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.lineStyle(1.5, alarm ? 0xd1484c : 0x8a6430, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 9);
    c.add(g);
    c.add(label(this, 0, -10 * BIG, `${need.toLocaleString()}G`, 22 * BIG, alarm ? 0xffd0c8 : C.goldHi, { weight: 900, origin: [0.5, 0.5] }));
    c.add(label(this, 0, 16 * BIG, left <= 0 ? '오늘 아침 수금' : left === 1 ? '내일 아침 수금!' : `${left}일 남음`, 13 * BIG, alarm ? 0xffb0a0 : C.mute, { weight: 900, origin: [0.5, 0.5] }));
    if (alarm) {
      // small warnings in the top corners, clear of the amount
      for (const sx of [-1, 1]) c.add(label(this, sx * (w / 2 - 14 * BIG), -h / 2 + 14 * BIG, '⚠', 13 * BIG, 0xffb347, { origin: [0.5, 0.5] }));
      this.tweens.add({ targets: g, alpha: 0.75, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return c;
  }

  // ───────────────────────── actions
  private openCards(mode: 'gold' | 'weapons' = 'gold') {
    if (this.busy) return;
    this.sfx.click();
    this.scene.launch('Cards', {
      mode,
      onClose: () => this.scene.resume(), // the resume handler rebuilds the summary
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

  /** The weapon taken into the arena: the highest on the rack, else the hammer (no 장착 button since 2026-11-27). */
  private nightWeapon() {
    const s = this.core.state;
    return bestWeapon(s);
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
    const { night, dusk, shade, warm } = this.bg;
    this.tweens.add({ targets: this.root, alpha: 0, y: 10, duration: 300 });
    this.tweens.add({ targets: shade, fillAlpha: 0.72, duration: 700 });
    // the night picture has its own moon; without it, a drawn one crosses the sky
    const moon = this.add.graphics({ x: W * 0.2, y: H * 0.36 }).setAlpha(0);
    if (!night) {
      for (let i = 18; i >= 1; i--) moon.fillStyle(0xbcd0ff, 0.012).fillCircle(0, 0, 30 + i * 6);
      moon.fillStyle(0xf2f4ff, 1).fillCircle(0, 0, PORTRAIT ? 40 : 32);
      moon.fillStyle(0xd8dcf0, 1).fillCircle(-8, -6, 6).fillCircle(9, 8, 4);
    }
    const txt = label(this, W / 2, H * 0.5, '…밤이 지나간다', 28 * BIG, 0xd6deff, { weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
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
      // dawn: the night picture gives way to the kingdom lit gold from the east, sharp again
      this.tweens.add({ targets: [moon, txt], alpha: 0, duration: 400 });
      if (night) this.tweens.add({ targets: night, alpha: 0, duration: 1100 });
      dusk?.postFX?.clear();
      this.tweens.add({ targets: shade, fillAlpha: 0.06, duration: 1100, ease: 'Sine.easeOut' });
      warm.setFillStyle(0xffc070, 0.04);
      this.tweens.add({ targets: warm, fillAlpha: 0.22, duration: 1100 });
      const rays = this.add.graphics({ x: W / 2, y: H * 0.66 }).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      for (let i = 20; i >= 1; i--) rays.fillStyle(0xffc070, 0.01).fillCircle(0, 0, 20 + i * 14);
      rays.fillStyle(0xfff0c0, 0.8).fillCircle(0, 0, 16);
      this.tweens.add({ targets: rays, alpha: 1, y: H * 0.5, duration: 1300, ease: 'Sine.easeOut' });
      const d1 = label(this, W / 2, H * 0.36, `DAY ${this.core.state.day}`, 28 * BIG, 0xfff0d0, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
      const d2 = label(this, W / 2, H * 0.36 + 50 * BIG, '아침', 52 * BIG, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setAlpha(0);
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

void DISPLAY;
void css;
