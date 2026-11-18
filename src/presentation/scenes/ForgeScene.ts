// Day-time forge (§3 DAY, §6, §7): inventory, the anvil, enhancement odds and the enhance button.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import type { Weapon } from '../../core/state/types';
import { collectEnhanceMods, effectiveRow } from '../../core/systems/enhancement';
import { equippedWeapon, findWeapon } from '../../core/systems/weapons';
import { OUTCOMES, OUTCOME_INFO, ENHANCE_TABLE_STATUS } from '../../config/enhancement';
import { APPEARANCE_STAGES, MILESTONES, appearanceStage } from '../../config/appearance';
import { CLASS_INFO, ELEMENT_INFO, INVENTORY_CAP, MAX_LEVEL } from '../../config/weapons';
import { START_LIVES } from '../../config/rules';
import { C, DISPLAY, H, W, css, label, panel } from '../theme';
import { Button } from '../ui/button';
import { WeaponView } from '../ui/weaponView';
import { drawWeapon, glowStrength, weaponTexture } from '../weaponArt';
import { Sfx } from '../audio/sfx';
import { EnhancementPresentation, HAMMER_IDLE } from '../fx/EnhancementPresentation';
import type { ModalData, ModalRequest } from './ModalScene';
import type { NightData } from './NightScene';
import { canUndo, itemCount, isArmed, merchantHere, sellPrice } from '../../core/systems/economy';
import { isTutorialDone } from '../../core/systems/tutorial';
import { ENHANCE_ITEMS, ITEMS, MERCHANT, SALE_CONFIRM_LEVEL, type EnhanceItem } from '../../config/economy';
import { StoneChip } from '../ui/stoneChip';

const LIST = { x: 24, y: 84, w: 316, h: 612, cardH: 66, gap: 8, top: 136 };
const RIGHT = { x: 940, y: 84, w: 316, h: 612 };
const VISIBLE_CARDS = 7;

const weaponName = (w: Weapon) => `${ELEMENT_INFO[w.element].name} ${CLASS_INFO[w.cls].name}`;

export class ForgeScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private fx!: EnhancementPresentation;
  private selectedId: string | null = null;
  private animating = false;
  private listOffset = 0;
  /** Weapon the player already confirmed risking as their last one (asked once, §7.5 / §21.4). */
  private lastConfirmedId: string | null = null;

  private dayText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private livesG!: Phaser.GameObjects.Graphics;
  private listTitle!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private weaponView!: WeaponView;
  private hammer!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private nextText!: Phaser.GameObjects.Text;
  private emptyText!: Phaser.GameObjects.Text;
  private starterHammer!: Phaser.GameObjects.Image;
  private leaving = false;
  private oddsTexts: Record<string, Phaser.GameObjects.Text> = {};
  private oddsBars!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private enhanceBtn!: Button;
  private equipBtn!: Button;
  private sellBtn!: Button;
  private nightBtn!: Button;
  private undoBtn!: Button;
  private shopBtn!: Button;
  private skillBtn!: Button;
  private skillPulse: Phaser.Tweens.Tween | null = null;
  private stoneTitle!: Phaser.GameObjects.Text;
  private stoneChips: StoneChip[] = [];
  private toastBox!: Phaser.GameObjects.Container;

  constructor() {
    super('Forge');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.animating = false;
    this.stoneChips = [];
    this.skillPulse = null;
    this.buildBackground();
    this.buildTopBar();
    this.buildInventory();
    this.buildAnvil();
    this.buildOdds();
    this.buildToast();

    this.fx = new EnhancementPresentation(this, {
      weapon: this.weaponView,
      hammer: this.hammer,
      impact: { x: 686, y: 432 },
      bannerAt: { x: 640, y: 292 },
      sfx: this.sfx,
    });

    const off = this.core.on('changed', () => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);

    const kb = this.input.keyboard!;
    kb.addCapture('SPACE,UP,DOWN');
    kb.on('keydown-SPACE', () => this.tryEnhance());
    kb.on('keydown-UP', () => this.step(-1));
    kb.on('keydown-DOWN', () => this.step(1));
    kb.on('keydown-E', () => this.equipSelected());
    kb.on('keydown-N', () => this.startNight());
    kb.on('keydown-S', () => this.trySell());
    kb.on('keydown-M', () => this.openShop());
    kb.on('keydown-K', () => this.openSkills());
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (p.x < LIST.x + LIST.w) this.scroll(Math.sign(dy));
    });

    this.leaving = false;
    this.refresh();
    const notice = this.core.notice;
    if (this.core.recoveredFromCorruption) this.toast('저장 데이터가 손상되어 직전 백업에서 복구했습니다.', C.dangerHi);
    else if (notice?.kind === 'abandoned') this.toast(`전투 도중 종료되어 패배로 처리했습니다 · 남은 목숨 ${notice.livesLeft}`, C.dangerHi);
    else if (this.core.lastGrant.length && merchantHere(this.core.state))
      this.toast(`DAY ${this.core.state.day} · 무기 ${this.core.lastGrant.length}자루 도착 · 상인 ${MERCHANT.name}가 대장간에 들렀습니다 (오늘 하루)`, C.goldHi);
    else if (this.core.lastGrant.length) this.toast(`DAY ${this.core.state.day} · 오늘의 무기 ${this.core.lastGrant.length}자루를 받았습니다`, C.goldHi);
    // §8.5 첫 스킬 포인트: a short hint once, after the day's own message.
    if (this.core.state.player.skillPoints > 0 && !isTutorialDone(this.core.state, 'firstSkillPoint'))
      this.time.delayedCall(3200, () => this.toast('첫 스킬 포인트를 얻었습니다 · 상단의 스킬트리(K)에서 별자리를 이어 보세요', 0x7fe9ff));
    this.core.notice = null;
    this.core.recoveredFromCorruption = false;
    this.core.lastGrant = [];
  }

  // ───────────────────────── layout
  private buildBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(C.bgTop, C.bgTop, C.bgBottom, C.bgBottom, 1);
    g.fillRect(0, 0, W, H);
    const glow = this.add.graphics();
    for (let i = 6; i >= 1; i--) {
      glow.fillStyle(C.ember, 0.025 * i);
      glow.fillEllipse(640, 760, 340 + i * 120, 260 + i * 70);
    }
    this.tweens.add({ targets: glow, alpha: 0.7, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.particles(0, 0, 'ember', {
      x: { min: 260, max: 1020 },
      y: H + 6,
      lifespan: { min: 3200, max: 6400 },
      speedY: { min: -70, max: -24 },
      speedX: { min: -14, max: 14 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff7a2a, 0xffb347, 0xff4a1a],
      frequency: 140,
      blendMode: 'ADD',
    });
  }

  private buildTopBar() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, W, 64);
    g.lineStyle(1, C.edge, 1);
    g.lineBetween(0, 64.5, W, 64.5);
    label(this, 24, 32, 'FORGE THE NIGHT', 20, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.dayText = label(this, 640, 32, '', 26, C.text, { display: true, weight: 900, origin: [0.5, 0.5] });
    label(this, 900, 32, '목숨', 14, C.mute, { weight: 700, origin: [0, 0.5] });
    this.livesG = this.add.graphics();
    this.goldText = label(this, W - 24, 32, '', 20, C.goldHi, { weight: 900, origin: [1, 0.5] });
    this.skillBtn = new Button(this, 340, 32, 170, 42, '스킬트리', { variant: 'dark', size: 15, sub: 'K', onClick: () => this.openSkills() });
    this.shopBtn = new Button(this, 790, 32, 170, 42,`상인 ${MERCHANT.name}`, { variant: 'gold', size: 15, sub: '오늘 방문 중 · M', onClick: () => this.openShop() });
  }

  private drawLives(lives: number) {
    const g = this.livesG;
    g.clear();
    for (let i = 0; i < START_LIVES; i++) {
      const x = 948 + i * 16;
      const y = 32;
      const alive = i < lives;
      g.fillStyle(alive ? C.danger : 0x2a1d1d, 1);
      g.fillCircle(x - 3, y - 2, 4);
      g.fillCircle(x + 3, y - 2, 4);
      g.fillTriangle(x - 7, y, x + 7, y, x, y + 8);
    }
  }

  private buildInventory() {
    const g = this.add.graphics();
    panel(g, LIST.x, LIST.y, LIST.w, LIST.h);
    this.listTitle = label(this, LIST.x + 20, LIST.y + 18, '', 16, C.gold, { weight: 900 });
    label(this, LIST.x + LIST.w - 20, LIST.y + 20, '↑↓ 선택', 12, C.dim, { origin: [1, 0] });
    this.list = this.add.container(0, 0);
  }

  private buildAnvil() {
    const g = this.add.graphics();
    const cx = 640;
    // shadow
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(cx, 640, 420, 46);
    // base, waist, body
    g.fillStyle(0x1b1b20, 1);
    g.fillRoundedRect(cx - 150, 590, 300, 44, 8);
    g.fillStyle(0x24242b, 1);
    g.fillRoundedRect(cx - 80, 520, 160, 76, 6);
    g.fillStyle(0x2c2c34, 1);
    g.beginPath();
    g.moveTo(cx - 200, 448);
    g.lineTo(cx + 170, 448);
    g.lineTo(cx + 150, 494);
    g.lineTo(cx + 92, 522);
    g.lineTo(cx - 92, 522);
    g.lineTo(cx - 150, 494);
    g.closePath();
    g.fillPath();
    // horn
    g.beginPath();
    g.moveTo(cx - 200, 448);
    g.lineTo(cx - 290, 456);
    g.lineTo(cx - 200, 478);
    g.closePath();
    g.fillPath();
    // working face highlight and hot spot
    g.fillStyle(0x4b4b57, 1);
    g.fillRect(cx - 200, 446, 370, 6);
    g.fillStyle(C.ember, 0.18);
    g.fillEllipse(cx + 40, 452, 220, 16);

    this.weaponView = new WeaponView(this, cx, 426, 440);

    // hammer pivots at the end of its handle (bottom right); angle 0 = striking the weapon
    this.hammer = this.add.container(906, 524);
    const hg = this.add.graphics();
    const hx = -214;
    const hy = -92;
    hg.lineStyle(13, 0x5a3a22, 1);
    hg.lineBetween(0, 0, hx, hy);
    hg.lineStyle(4, 0x7a5333, 1);
    hg.lineBetween(-4, -6, hx - 4, hy - 6);
    const a = Math.atan2(hy, hx);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy;
    const py = ux;
    const half = 50;
    const thick = 24;
    const corner = (s: number, t: number): [number, number] => [hx + px * s + ux * t, hy + py * s + uy * t];
    const pts = [corner(-half, -thick), corner(half, -thick), corner(half, thick), corner(-half, thick)];
    hg.fillStyle(0x3a3a44, 1);
    hg.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    hg.fillStyle(0x6a6a78, 1);
    hg.fillPoints([corner(-half, -thick), corner(half, -thick), corner(half, -thick + 7), corner(-half, -thick + 7)].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    this.hammer.add(hg);
    this.hammer.setAngle(HAMMER_IDLE);

    this.nameText = label(this, 640, 104, '', 24, C.text, { weight: 900, origin: [0.5, 0.5] });
    this.levelText = this.add
      .text(640, 168, '', { fontFamily: DISPLAY, fontSize: '76px', fontStyle: '800', color: css(C.goldHi), stroke: '#000000', strokeThickness: 8, resolution: 2 })
      .setOrigin(0.5);
    this.nextText = label(this, 640, 226, '', 15, C.mute, { weight: 700, origin: [0.5, 0.5] });
    this.starterHammer = this.add.image(640, 300, 'weapon-hammer').setScale(0.9).setVisible(false);
    this.emptyText = label(this, 640, 396, '', 16, C.mute, { weight: 700, align: 'center', origin: [0.5, 0.5], wrap: 560, lineSpacing: 8 });
    this.undoBtn = new Button(this, 640, 262, 250, 40, '시간 역행석 사용', { variant: 'ghost', size: 15, sub: '', onClick: () => this.undo() });
  }

  private buildOdds() {
    const g = this.add.graphics();
    panel(g, RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h);
    label(this, RIGHT.x + 20, RIGHT.y + 18, '강화 확률', 16, C.gold, { weight: 900 });
    new Button(this, RIGHT.x + RIGHT.w - 34, RIGHT.y + 28, 40, 30, '?', {
      variant: 'ghost',
      onClick: () => this.openModal({ kind: 'tutorial', replay: true }),
    });
    this.oddsBars = this.add.graphics();
    OUTCOMES.forEach((o, i) => {
      const y = RIGHT.y + 62 + i * 40;
      const dot = this.add.graphics();
      dot.fillStyle(OUTCOME_INFO[o].color, 1);
      dot.fillCircle(RIGHT.x + 28, y + 9, 6);
      label(this, RIGHT.x + 42, y, OUTCOME_INFO[o].name, 16, o === 'destroy' ? C.dangerHi : C.text, { weight: 700 });
      const delta = o === 'great' ? '+2' : o === 'success' ? '+1' : o === 'keep' ? '±0' : o === 'down' ? '−1' : '영구 소멸';
      label(this, RIGHT.x + 100, y + 2, delta, 13, o === 'destroy' ? C.danger : C.dim, { weight: 700 });
      this.oddsTexts[o] = label(this, RIGHT.x + RIGHT.w - 20, y, '', 18, o === 'destroy' ? C.dangerHi : C.text, { weight: 900, origin: [1, 0] });
    });
    const warnY = RIGHT.y + 262;
    label(this, RIGHT.x + 20, warnY, '파괴된 무기는 영구히 사라집니다', 13, C.danger, { weight: 700 });
    this.stageText = label(this, RIGHT.x + 20, warnY + 22, '', 12, C.mute, { weight: 700 });
    this.statsText = label(this, RIGHT.x + 20, warnY + 40, '', 12, C.dim);
    if (ENHANCE_TABLE_STATUS !== 'confirmed') label(this, RIGHT.x + RIGHT.w - 20, warnY + 22, '확률표 임시안', 12, C.dim, { origin: [1, 0] });
    // Stones switched on for the next attempt (§15). Hidden until the player owns any.
    this.stoneTitle = label(this, RIGHT.x + 20, RIGHT.y + 330, '다음 강화에 사용', 12, C.mute, { weight: 700 });
    ENHANCE_ITEMS.forEach((item, i) => {
      const chip = new StoneChip(this, RIGHT.x + 20 + i * 94, RIGHT.y + 348, 88, 34, item, () => this.toggleStone(item));
      this.stoneChips.push(chip);
    });

    this.enhanceBtn = new Button(this, RIGHT.x + RIGHT.w / 2, RIGHT.y + 432, 276, 78, '강화', {
      variant: 'gold',
      size: 28,
      sub: '무료 · Space',
      onClick: () => this.tryEnhance(),
    });
    this.equipBtn = new Button(this, RIGHT.x + 20 + 67, RIGHT.y + 518, 134, 50, '장착', { variant: 'dark', sub: 'E', onClick: () => this.equipSelected() });
    this.sellBtn = new Button(this, RIGHT.x + RIGHT.w - 20 - 67, RIGHT.y + 518, 134, 50, '판매', { variant: 'dark', sub: 'S', onClick: () => this.trySell() });
    this.nightBtn = new Button(this, RIGHT.x + RIGHT.w / 2, RIGHT.y + 578, 276, 50, '밤 전투 시작', { variant: 'dark', sub: '', onClick: () => this.startNight() });
  }

  private buildToast() {
    this.toastBox = this.add.container(640, 676).setDepth(40).setAlpha(0);
  }

  private toast(msg: string, color: number = C.text) {
    this.toastBox.removeAll(true);
    const t = label(this, 0, 0, msg, 15, color, { weight: 700, origin: [0.5, 0.5] });
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.75);
    g.fillRoundedRect(-t.width / 2 - 18, -18, t.width + 36, 36, 18);
    g.lineStyle(1, C.edge, 1);
    g.strokeRoundedRect(-t.width / 2 - 18, -18, t.width + 36, 36, 18);
    this.toastBox.add([g, t]);
    this.tweens.killTweensOf(this.toastBox);
    this.toastBox.setAlpha(0);
    this.tweens.add({ targets: this.toastBox, alpha: 1, duration: 160 });
    this.tweens.add({ targets: this.toastBox, alpha: 0, delay: 2600, duration: 400 });
  }

  // ───────────────────────── state → screen
  private selected(): Weapon | undefined {
    return this.selectedId ? findWeapon(this.core.state, this.selectedId) : undefined;
  }

  private refresh() {
    if (this.animating) return;
    const s = this.core.state;
    if (!this.selected()) this.selectedId = equippedWeapon(s)?.id ?? s.weapons[0]?.id ?? null;
    this.dayText.setText(`DAY ${s.day}`);
    this.goldText.setText(`${s.gold.toLocaleString()} G`);
    this.drawLives(s.lives);
    this.renderList();
    this.renderCenter();
    this.renderOdds();
  }

  private renderList() {
    const s = this.core.state;
    this.listTitle.setText(`무기 보관함  ${s.weapons.length} / ${INVENTORY_CAP}`);
    this.list.removeAll(true);
    const maxOffset = Math.max(0, s.weapons.length - VISIBLE_CARDS);
    this.listOffset = Phaser.Math.Clamp(this.listOffset, 0, maxOffset);
    s.weapons.slice(this.listOffset, this.listOffset + VISIBLE_CARDS).forEach((w, i) => {
      const x = LIST.x + 12;
      const y = LIST.top + i * (LIST.cardH + LIST.gap);
      const sel = w.id === this.selectedId;
      const eq = w.id === s.equippedId;
      const card = this.add.container(x, y);
      const bg = this.add.graphics();
      bg.fillStyle(sel ? 0x2a2017 : 0x17130f, 1);
      bg.fillRoundedRect(0, 0, LIST.w - 24, LIST.cardH, 8);
      bg.lineStyle(sel ? 2 : 1, sel ? C.gold : C.edge, 1);
      bg.strokeRoundedRect(0.5, 0.5, LIST.w - 25, LIST.cardH - 1, 8);
      bg.fillStyle(ELEMENT_INFO[w.element].color, 1);
      bg.fillRect(0, 10, 4, LIST.cardH - 20);
      const tex = weaponTexture(w.cls, w.element);
      let art: Phaser.GameObjects.GameObject;
      if (this.textures.exists(tex)) {
        const img = this.add.image(72, LIST.cardH / 2, tex);
        img.setScale(Math.min(118 / img.width, (LIST.cardH - 12) / img.height));
        if (glowStrength(w.level) > 0) img.preFX?.addGlow(ELEMENT_INFO[w.element].glow, Math.min(4, glowStrength(w.level) * 0.5), 0, false, 0.1, 8);
        art = img;
      } else {
        const g = this.add.graphics({ x: 72, y: LIST.cardH / 2 });
        drawWeapon(g, w, 118);
        art = g;
      }
      const nm = label(this, 140, 14, weaponName(w), 16, C.text, { weight: 700 });
      const sub = label(this, 140, 38, eq ? '장착 중' : `DAY ${w.bornDay} 지급`, 12, eq ? C.gold : C.dim, { weight: 700 });
      const lv = label(this, LIST.w - 40, LIST.cardH / 2, `+${w.level}`, 24, w.level >= 10 ? C.goldHi : C.text, { display: true, weight: 900, origin: [1, 0.5] });
      const hit = this.add.zone(0, 0, LIST.w - 24, LIST.cardH).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.select(w.id));
      card.add([bg, art, nm, sub, lv, hit]);
      this.list.add(card);
    });
    if (maxOffset > 0) {
      const more = label(this, LIST.x + LIST.w / 2, LIST.y + LIST.h - 16, `휠로 스크롤 · ${this.listOffset + 1}–${Math.min(s.weapons.length, this.listOffset + VISIBLE_CARDS)}`, 12, C.dim, { origin: [0.5, 0.5] });
      this.list.add(more);
    }
  }

  /** Name, level and next-milestone line above the anvil. */
  private renderHeader(w: Weapon | null | undefined) {
    this.nameText.setText(w ? weaponName(w) : '').setColor(w ? css(ELEMENT_INFO[w.element].glow) : css(C.text));
    this.levelText.setText(w ? `+${w.level}` : '');
    if (w) {
      const next = MILESTONES.find((m) => m.level > w.level);
      this.nextText.setText(w.level >= MAX_LEVEL ? '궁극의 무기 · 더 이상 강화할 수 없습니다' : next ? `다음 각성  +${next.level} ${next.name}  ·  ${next.level - w.level}단계 남음` : '');
    } else this.nextText.setText('');
  }

  private renderCenter() {
    const w = this.selected();
    const none = !w;
    this.weaponView.setLook(w ? { cls: w.cls, element: w.element, level: w.level } : null);
    this.renderHeader(w);
    this.levelText.setScale(1);
    if (none) {
      this.nameText.setText('기본 대장장이 망치').setColor(css(C.text));
      this.nextText.setText('보유한 무기가 없습니다');
    }
    this.emptyText.setText(none ? '강화·판매 불가 · 무기가 없을 때만 사용합니다\n이 망치로 밤을 버티면 내일 아침 새 무기 3자루가 도착합니다' : '');
    this.starterHammer.setVisible(none);
  }

  private renderOdds() {
    const w = this.selected();
    const g = this.oddsBars;
    g.clear();
    const row = w && w.level < MAX_LEVEL ? effectiveRow(w.level, collectEnhanceMods(this.core.state, w)) : null;
    OUTCOMES.forEach((o, i) => {
      const y = RIGHT.y + 62 + i * 40 + 26;
      const pct = row ? row[o] : 0;
      const shielded = row && (o === 'down' || o === 'destroy') && isArmed(this.core.state, 'protect');
      this.oddsTexts[o].setText(row ? `${shielded ? '→유지 ' : ''}${pct.toFixed(1)}%` : '—');
      this.oddsTexts[o].setColor(css(shielded ? ITEMS.protect.color : o === 'destroy' ? C.dangerHi : C.text));
      g.fillStyle(0x0a0807, 1);
      g.fillRoundedRect(RIGHT.x + 20, y, RIGHT.w - 40, 6, 3);
      if (pct > 0) {
        g.fillStyle(OUTCOME_INFO[o].color, 1);
        g.fillRoundedRect(RIGHT.x + 20, y, Math.max(6, ((RIGHT.w - 40) * pct) / 100), 6, 3);
      }
    });
    const st = this.core.state.stats;
    this.stageText.setText(w ? `외형 단계 ${appearanceStage(w.level) + 1} / ${APPEARANCE_STAGES.length}` : '');
    this.statsText.setText(`누적 강화 ${st.enhanceAttempts}회 · 파괴 ${st.destroyed}자루 · 최고 +${st.bestLevel}`);
    const canEnhance = !!w && w.level < MAX_LEVEL && !this.animating;
    this.enhanceBtn.setEnabled(canEnhance);
    this.enhanceBtn.setLabel(w && w.level >= MAX_LEVEL ? '최대 단계' : '강화', w && w.level >= MAX_LEVEL ? '+50 도달' : '무료 · Space');
    const eq = !!w && this.core.state.equippedId === w.id;
    this.equipBtn.setEnabled(!!w && !eq && !this.animating);
    this.equipBtn.setLabel(eq ? '장착 중' : '장착', eq ? '이 무기로 밤에 싸웁니다' : 'E');
    this.sellBtn.setEnabled(!!w && !this.animating);
    this.sellBtn.setLabel('판매', w ? `${sellPrice(this.core.state, w.level).toLocaleString()}G · S` : 'S');
    this.renderItems();
    const armed = equippedWeapon(this.core.state);
    const hammer = this.core.state.weapons.length === 0;
    this.nightBtn.setEnabled((!!armed || hammer) && !this.animating);
    this.nightBtn.setLabel(
      '밤 전투 시작',
      armed ? `${weaponName(armed)} +${armed.level} (N)` : hammer ? '기본 망치로 싸웁니다 (N)' : '먼저 무기를 장착하세요',
    );
  }

  private startNight() {
    if (this.animating || this.leaving) return;
    const r = this.core.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') {
      if (r.type === 'nightBlocked') this.toast('밤에 들고 갈 무기를 먼저 장착하세요', C.dangerHi);
      return;
    }
    this.leaving = true;
    const data: NightData = { weapon: r.weapon, day: this.core.state.day };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Night', data));
  }

  /** Stone chips, the time-stone button and the merchant button. */
  private renderItems() {
    const s = this.core.state;
    const anyStone = ENHANCE_ITEMS.some((i) => itemCount(s, i) > 0);
    this.stoneTitle.setVisible(anyStone);
    this.stoneChips.forEach((chip) => {
      const n = itemCount(s, chip.item);
      chip.setVisible(anyStone);
      chip.set(n, isArmed(s, chip.item), !this.animating && n > 0);
    });
    const undoable = canUndo(s) === null && !this.animating;
    this.undoBtn.setVisible(undoable);
    if (undoable) this.undoBtn.setLabel(`⟲ 시간 역행석 사용 (보유 ${itemCount(s, 'timeStone')})`);
    this.shopBtn.setVisible(merchantHere(s));
    const pts = s.player.skillPoints;
    this.skillBtn.setLabel('스킬트리', pts > 0 ? `포인트 ${pts} · K` : `Lv ${s.player.level} · K`);
    if (pts > 0 && !this.skillPulse) this.skillPulse = this.tweens.add({ targets: this.skillBtn, scale: 1.06, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    else if (pts === 0 && this.skillPulse) {
      this.skillPulse.remove();
      this.skillPulse = null;
      this.skillBtn.setScale(1);
    }
  }

  private openSkills() {
    if (this.animating || this.leaving) return;
    this.sfx.click();
    this.scene.launch('Skills');
    this.scene.pause();
  }

  private toggleStone(item: EnhanceItem) {
    if (this.animating) return;
    this.sfx.click();
    this.core.dispatch({ type: 'TOGGLE_ITEM', item });
    const on = isArmed(this.core.state, item);
    this.toast(on ? `${ITEMS[item].name}: 다음 강화에 사용합니다` : `${ITEMS[item].name}: 사용하지 않습니다`, on ? ITEMS[item].color : C.mute);
  }

  private undo() {
    if (this.animating) return;
    const r = this.core.dispatch({ type: 'UNDO_ENHANCE' });
    if (r.type !== 'undone') return;
    this.selectedId = r.weapon.id;
    this.sfx.click();
    this.cameras.main.flash(380, 120, 240, 230);
    this.toast(`시간이 거꾸로 흐릅니다 · ${weaponName(r.weapon)} +${r.weapon.level}(으)로 되돌렸습니다`, ITEMS.timeStone.color);
    this.refresh();
  }

  private trySell() {
    if (this.animating || this.leaving) return;
    const w = this.selected();
    if (!w) return;
    const price = sellPrice(this.core.state, w.level);
    const name = `${weaponName(w)} +${w.level}`;
    if (!isTutorialDone(this.core.state, 'firstSale')) {
      // §8.5 첫 무기 판매: one short explanation, then it never asks just for being a sale again.
      this.openModal({
        kind: 'confirm',
        title: '첫 무기 판매',
        body: `무기를 팔면 골드를 받고 무기는 보관함에서 영구히 사라집니다.\n골드는 3일마다 찾아오는 상인 ${MERCHANT.name}에게서 목숨과 강화 보조 아이템을 사는 데 씁니다.\n강화 단계가 높을수록 값이 크게 오릅니다.\n\n${name} → ${price.toLocaleString()}G`,
        confirmLabel: `${price.toLocaleString()}G에 판매`,
        onConfirm: () => {
          this.core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstSale' });
          this.sell(w.id, name);
        },
      });
      return;
    }
    const equipped = this.core.state.equippedId === w.id;
    const last = this.core.state.weapons.length === 1;
    if (w.level >= SALE_CONFIRM_LEVEL || equipped || last) {
      const why = [
        w.level >= SALE_CONFIRM_LEVEL ? `+${w.level}까지 키운 무기입니다.` : '',
        equipped ? '지금 장착 중인 무기입니다.' : '',
        last ? '마지막 남은 무기입니다. 팔면 기본 망치로 싸워야 합니다.' : '',
      ].filter(Boolean);
      this.openModal({
        kind: 'confirm',
        danger: last,
        title: `${price.toLocaleString()}G에 판매할까요?`,
        body: `${name}\n${why.join('\n')}\n판매한 무기는 되돌릴 수 없습니다.`,
        confirmLabel: '판매',
        onConfirm: () => this.sell(w.id, name),
      });
      return;
    }
    this.sell(w.id, name);
  }

  private sell(id: string, name: string) {
    const r = this.core.dispatch({ type: 'SELL', weaponId: id });
    if (r.type !== 'sold') return;
    this.selectedId = null;
    this.sfx.coin();
    this.coinBurst(r.price);
    this.toast(`${name} 판매 · +${r.price.toLocaleString()}G`, C.goldHi);
    this.refresh();
  }

  /** Coins fly from the anvil to the gold counter. */
  private coinBurst(price: number) {
    const n = Phaser.Math.Clamp(Math.round(Math.log10(price) * 3), 3, 16);
    for (let i = 0; i < n; i++) {
      const c = this.add.image(640 + Phaser.Math.Between(-60, 60), 330 + Phaser.Math.Between(-20, 20), 'spark').setTint(0xffd36b).setScale(0.9).setDepth(50).setBlendMode('ADD');
      this.tweens.add({
        targets: c,
        x: W - 60,
        y: 32,
        scale: 0.4,
        delay: i * 35,
        duration: 520 + Phaser.Math.Between(0, 160),
        ease: 'Cubic.easeIn',
        onComplete: () => c.destroy(),
      });
    }
    this.goldText.setScale(1.25);
    this.tweens.add({ targets: this.goldText, scale: 1, delay: 520, duration: 260, ease: 'Back.easeOut' });
  }

  private openShop() {
    if (this.animating || this.leaving || !merchantHere(this.core.state)) return;
    this.sfx.click();
    this.scene.launch('Shop');
    this.scene.pause();
  }

  // ───────────────────────── input
  private select(id: string) {
    if (this.animating || id === this.selectedId) return;
    this.selectedId = id;
    this.sfx.click();
    this.refresh();
  }

  private step(dir: number) {
    const ws = this.core.state.weapons;
    if (!ws.length || this.animating) return;
    const i = Math.max(0, ws.findIndex((w) => w.id === this.selectedId));
    const ni = Phaser.Math.Clamp(i + dir, 0, ws.length - 1);
    if (ni < this.listOffset) this.listOffset = ni;
    if (ni >= this.listOffset + VISIBLE_CARDS) this.listOffset = ni - VISIBLE_CARDS + 1;
    this.select(ws[ni].id);
  }

  private scroll(dir: number) {
    this.listOffset += dir;
    this.renderList();
  }

  private equipSelected() {
    const w = this.selected();
    if (!w || this.animating) return;
    this.core.dispatch({ type: 'EQUIP', weaponId: w.id });
    this.toast(`${weaponName(w)} +${w.level}을(를) 장착했습니다`);
  }

  private openModal(data: ModalRequest) {
    const full: ModalData = { ...data, returnTo: 'Forge' };
    this.scene.launch('Modal', full);
    this.scene.pause();
  }

  private tryEnhance(confirmLast = false) {
    if (this.animating) return;
    const w = this.selected();
    if (!w) return;
    // Lock the screen before dispatching: the core announces the new state synchronously,
    // and the inventory and odds must not reveal the result before the hammer lands.
    this.animating = true;
    const res = this.core.dispatch({ type: 'ENHANCE', weaponId: w.id, confirmLast: confirmLast || this.lastConfirmedId === w.id });
    if (res.type !== 'enhanced') this.animating = false;
    if (res.type === 'blocked') {
      if (res.reason === 'tutorial') {
        this.openModal({
          kind: 'tutorial',
          onComplete: () => {
            this.core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
            this.toast('준비되었습니다. 강화 버튼을 다시 눌러 첫 강화를 시작하세요.', C.goldHi);
          },
        });
      } else if (res.reason === 'confirm-last') {
        const row = effectiveRow(w.level, collectEnhanceMods(this.core.state, w));
        this.openModal({
          kind: 'confirm',
          danger: true,
          title: '마지막 남은 무기입니다',
          body: `${weaponName(w)} +${w.level}이(가) 파괴되면 보유한 무기가 하나도 남지 않습니다.\n이번 강화의 파괴 확률은 ${row.destroy.toFixed(1)}%입니다.`,
          confirmLabel: '그래도 강화',
          onConfirm: () => {
            this.lastConfirmedId = w.id;
            this.tryEnhance(true);
          },
        });
      } else if (res.reason === 'max-level') this.toast('+50에 도달한 무기는 더 강화할 수 없습니다');
      return;
    }
    if (res.type !== 'enhanced') return;
    const r = res.result;
    this.enhanceBtn.setEnabled(false);
    this.equipBtn.setEnabled(false);
    this.sellBtn.setEnabled(false);
    this.renderItems();
    void this.fx
      .play(r, {
        onImpact: () => {
          this.renderHeader(r.weaponAfter);
          if (r.weaponAfter) {
            this.weaponView.setLook({ cls: r.weaponAfter.cls, element: r.weaponAfter.element, level: r.weaponAfter.level });
            if (r.outcome === 'great' || r.outcome === 'success') {
              this.levelText.setScale(r.outcome === 'great' ? 1.5 : 1.22);
              this.tweens.add({ targets: this.levelText, scale: 1, duration: 360, ease: 'Back.easeOut' });
            }
          }
        },
      })
      .then(() => {
        this.animating = false;
        this.refresh();
        if (r.protectedFrom)
          this.toast(`강화 보호석 발동 · ${r.protectedFrom === 'destroy' ? '파괴' : '하락'}을 막았습니다`, ITEMS.protect.color);
        else if (r.used.length) this.toast(`${r.used.map((i) => ITEMS[i].name).join(', ')} 사용`, C.mute);
      });
  }
}
