// Day-time forge (§3 DAY, §6, §7): inventory, the anvil, enhancement odds and the enhance button.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import type { Weapon } from '../../core/state/types';
import { collectEnhanceMods, effectiveRow } from '../../core/systems/enhancement';
import { equippedWeapon, findWeapon, weaponPrice } from '../../core/systems/weapons';
import { OUTCOMES, OUTCOME_INFO, ENHANCE_TABLE_STATUS, type Outcome } from '../../config/enhancement';
import { APPEARANCE_STAGES, MILESTONES, WEAPON_SIZE, appearanceStage, weaponSizeScale } from '../../config/appearance';
import { ELEMENT_INFO, INVENTORY_CAP, MAX_LEVEL } from '../../config/weapons';
import { START_LIVES } from '../../config/rules';
import { C, DISPLAY, EXTRA, H, W, css, label, panel } from '../theme';
import { Button } from '../ui/button';
import { WeaponView } from '../ui/weaponView';
import { drawWeapon, glowStrength, weaponLookTexture } from '../weaponArt';
import { Sfx } from '../audio/sfx';
import { EnhancementPresentation, HAMMER_IDLE, type Swing } from '../fx/EnhancementPresentation';
import type { ModalData, ModalRequest } from './ModalScene';
import type { NightData } from './NightScene';
import type { CinematicData } from './CinematicScene';
import { INTRO } from '../../config/cinematics';
import { weaponDisplayName } from '../../config/swordNames';
import { openRanking } from '../../online/ui';
import { inPrologue } from '../../core/systems/prologue';
import { NARRATOR_LINES, SMITH_LINES, pick } from '../../config/dialogue';
import { Bubble, SMITH_STYLE } from '../ui/speech';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { canUndo, enhanceCost, itemCount, isArmed, merchantHere, sellPrice } from '../../core/systems/economy';
import { isTutorialDone } from '../../core/systems/tutorial';
import { ENHANCE_ITEMS, ITEMS, MERCHANT, SALE_CONFIRM_LEVEL, type EnhanceItem } from '../../config/economy';
import { StoneChip } from '../ui/stoneChip';
import { formatDamage, weaponDamage } from '../../combat/rules';

// Portrait (720×1280, phones) stacks everything: top bar → rack strip → smith and anvil → weapon card →
// odds row → big enhance button → equip / sell / night. Landscape keeps the original 1280×720 layout.
const RIGHT = { x: 940, y: 84, w: 316, h: 612 };
/** Weapon rack: 2 × 4 planks on the left wall (landscape) or a 4 × 2 strip under the top bar (portrait). */
const RACK = PORTRAIT ? { x: 14, y: 150, cols: 4, slotW: 165, slotH: 78, gapX: 9, gapY: 10 } : { x: 24, y: 96, cols: 2, slotW: 236, slotH: 74, gapX: 12, gapY: 8 };
/** Selected-weapon card (name, level badge, next milestone, damage). */
const CARD = PORTRAIT ? { x: 40, y: 806 + EXTRA, w: 640, h: 170 } : { x: 24, y: 490, w: 500, h: 226 };
/**
 * The blacksmith behind the anvil (one Higgsfield image or sprite sheet). `fx/fy` locate the anvil face
 * inside each texture (fractions of its width/height), so the weapon lies exactly where the hammer lands.
 */
// on a taller phone the smith grows into part of the extra room and the lower block moves down
// Side view (2026-11-19): smith on the left, anvil on the right, so the stage is wider than tall.
// portrait: the camera sits further back (user feedback 2026-11-19: the smith felt too big for the room)
const STAGE = PORTRAIT ? { x: 340, bottom: 790 + EXTRA, height: 380 + EXTRA * 0.25 } : { x: 600, bottom: 702, height: 420 };
/** Portrait bottom area: odds row, stones, enhance button, action row. */
const PB = { oddsY: 994 + EXTRA, stonesY: 1084 + EXTRA, enhanceY: 1150 + EXTRA, rowY: 1238 + EXTRA };

/**
 * Shelf centres and sizes measured on the painted rack in forge_rack_bg (1280×720 screen space),
 * in slot order: left column top to bottom = 0,2,4,6 … laid out row by row (0 1 / 2 3 / 4 5 / 6 7).
 */
const PAINTED_SLOTS: { x: number; y: number; w: number; h: number }[] = [172, 257, 340, 422].flatMap((y) => [
  { x: 200, y, w: 206, h: 72 },
  { x: 417, y, w: 180, h: 72 },
]);

function rackSlot(i: number): { x: number; y: number; w: number; h: number } {
  const p = PORTRAIT ? undefined : PAINTED_SLOTS[i];
  if (p) return p;
  const col = i % RACK.cols;
  const row = Math.floor(i / RACK.cols);
  return {
    x: RACK.x + col * (RACK.slotW + RACK.gapX) + RACK.slotW / 2,
    y: RACK.y + row * (RACK.slotH + RACK.gapY) + RACK.slotH / 2,
    w: RACK.slotW,
    h: RACK.slotH,
  };
}
const ANVIL_FACE: Record<string, { fx: number; fy: number }> = {
  'anim-forge_strike_side': { fx: 0.72, fy: 0.58 },
  'art-smith_anvil': { fx: 0.62, fy: 0.585 },
  'anim-forge_strike': { fx: 0.5, fy: 0.625 },
};
/** Anvil centre and the blacksmith standing to its right (hammer comes down from his right). */
const ANVIL_X = 600;
/**
 * He stands a little further back in the room (feet at y 548) so that his strike pose brings the hammer
 * head down onto the anvil face. `strikeOriginX` keeps his body in place when the wider strike pose swaps in.
 */
const SMITH = { x: 838, y: 548, scale: 0.78, strikeOriginX: 0.61 };
const IMPACT = { x: 672, y: 462 };
/** Tail tip of the smith's speech bubble: beside his head, clear of the hammer and the right panel. */
// above the anvil, beside the side-view smith's face
const SMITH_BUBBLE = PORTRAIT ? { x: 450, y: 560 + EXTRA * 0.8 } : { x: 720, y: 360 };
/** Toast line position. */
const TOAST = PORTRAIT ? { x: 360, y: 770 + EXTRA } : { x: 640, y: 676 };

const weaponName = (w: Weapon) => weaponDisplayName(w);

export class ForgeScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private fx!: EnhancementPresentation;
  private selectedId: string | null = null;
  private animating = false;
  /** Weapon the player already confirmed risking as their last one (asked once, §7.5 / §21.4). */
  private lastConfirmedId: string | null = null;

  private dayText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private livesG!: Phaser.GameObjects.Graphics;
  private rackTitle!: Phaser.GameObjects.Text;
  /** The rack is part of the background painting (forge_rack_bg). */
  private painted = false;
  private rack!: Phaser.GameObjects.Container;
  /** Where the weapon lies on the anvil (and where the hammer lands). */
  private face = { x: 640, y: 450 };
  private weaponView!: WeaponView;
  private hammer!: Phaser.GameObjects.Container;
  private swing!: Swing;
  private damageText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private levelText!: LevelBadge;
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
  private buyBtn!: Button;
  /** DAY 1 lines over the blacksmith's head. */
  private bubble!: Bubble;
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
    this.buildRack();
    this.buildAnvil();
    this.buildOdds();
    this.buildToast();

    const staged = this.stageKey() !== null;
    this.fx = new EnhancementPresentation(this, {
      weapon: this.weaponView,
      swing: this.swing,
      impact: staged ? { x: this.face.x, y: this.face.y - 6 } : this.textures.exists('art-anvil') ? IMPACT : { x: 686, y: 432 },
      bannerAt: staged ? { x: STAGE.x, y: PORTRAIT ? 390 : 140 } : { x: 640, y: 292 },
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

    this.leaving = false;
    this.refresh();
    const notice = this.core.notice;
    if (this.core.recoveredFromCorruption) this.toast('저장 데이터가 손상되어 직전 백업에서 복구했습니다.', C.dangerHi);
    else if (notice?.kind === 'abandoned') this.toast(`전투 도중 종료되어 패배로 처리했습니다 · 남은 목숨 ${notice.livesLeft}`, C.dangerHi);
    else {
      const ov = this.core.lastOverflow;
      const got = this.core.lastGrant.length;
      const parts: string[] = [];
      if (got) parts.push(`오늘의 무기 ${got}자루 도착`);
      if (ov.count) parts.push(`보관함이 가득 차 ${ov.count}자루는 ${ov.gold}G에 팔았습니다`);
      if ((got || ov.count) && merchantHere(this.core.state)) parts.push(`상인 ${MERCHANT.name} 방문 중`);
      if (parts.length) this.toast(`DAY ${this.core.state.day} · ${parts.join(' · ')}`, ov.count ? C.text : C.goldHi);
    }
    // §8.5 첫 스킬 포인트: a short hint once, after the day's own message.
    if (this.core.state.player.skillPoints > 0 && !isTutorialDone(this.core.state, 'firstSkillPoint'))
      this.time.delayedCall(3200, () => this.toast('첫 스킬 포인트를 얻었습니다 · 상단의 스킬트리(K)에서 별자리를 이어 보세요', 0x7fe9ff));
    this.core.notice = null;
    this.core.recoveredFromCorruption = false;
    this.core.lastGrant = [];
    this.core.lastOverflow = { count: 0, gold: 0 };

    // DAY 1 talk: the prologue morning, or the morning after the scripted defeat.
    this.bubble = new Bubble(this, SMITH_STYLE, 70);
    const s = this.core.state;
    if (this.registry.get('afterPrologue')) {
      this.registry.set('afterPrologue', false);
      void this.sayAll(SMITH_LINES.afterPrologue, 600);
    } else if (inPrologue(s) && s.stats.enhanceAttempts === 0) void this.sayAll(SMITH_LINES.prologueArrive, 900);
  }

  // ───────────────────────── DAY 1 lines
  private afterEnhanceLine(outcome: Outcome) {
    const s = this.core.state;
    if (inPrologue(s) && outcome === 'destroy') {
      const left = s.weapons.length;
      this.say(SMITH_LINES.prologueDestroy[Math.min(left, SMITH_LINES.prologueDestroy.length - 1)], true);
      if (left === 0) {
        // nothing left but the hammer: point at the night button
        this.time.delayedCall(2600, () => this.toast(NARRATOR_LINES.allShattered, C.goldHi));
        this.tweens.add({ targets: this.nightBtn, scale: 1.07, duration: 520, yoyo: true, repeat: 7, ease: 'Sine.easeInOut' });
      }
      return;
    }
    this.say(SMITH_LINES[outcome]);
  }

  /** One line over the smith's head (DAY 1 only unless `always`). */
  private say(lines: readonly string[] | string, always = false) {
    if (!always && this.core.state.day !== 1) return;
    void this.bubble.say(typeof lines === 'string' ? lines : pick(lines), SMITH_BUBBLE.x, SMITH_BUBBLE.y);
  }

  /** Several lines in a row. */
  private async sayAll(lines: readonly string[], delayMs = 0) {
    if (delayMs) await new Promise((r) => this.time.delayedCall(delayMs, r));
    for (const l of lines) {
      if (!this.scene.isActive()) return;
      await this.bubble.say(l, SMITH_BUBBLE.x, SMITH_BUBBLE.y);
    }
  }

  // ───────────────────────── layout
  private buildBackground() {
    // portrait: the plain forge painting (the rack painting's shelves only fit the landscape layout)
    const bgKey = PORTRAIT
      ? this.textures.exists('art-forge_bg_portrait') ? 'art-forge_bg_portrait' : 'art-forge_bg'
      : this.textures.exists('art-forge_rack_bg') ? 'art-forge_rack_bg' : 'art-forge_bg';
    if (this.textures.exists(bgKey)) {
      // Higgsfield forge interior (with the weapon rack painted on the wall); the furnace glow breathes on top.
      const bg = this.add.image(W / 2, H / 2, bgKey);
      if (PORTRAIT) bg.setScale(Math.max(W / bg.width, H / bg.height)).setY(H * 0.42);
      else bg.setDisplaySize(W, H);
      const fire = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      for (let i = 5; i >= 1; i--) {
        fire.fillStyle(0xff7a2a, 0.02 * i);
        if (PORTRAIT) fire.fillEllipse(W / 2, 470 + EXTRA * 0.5, 160 + i * 70, 120 + i * 40);
        else if (bgKey === 'art-forge_rack_bg') fire.fillEllipse(740, 330, 120 + i * 60, 90 + i * 36);
        else fire.fillEllipse(W / 2, 250, 160 + i * 70, 120 + i * 40);
      }
      this.tweens.add({ targets: fire, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const shade = this.add.graphics();
      shade.fillStyle(0x000000, 0.28);
      shade.fillRect(0, 0, W, H);
    } else {
      const g = this.add.graphics();
      g.fillGradientStyle(C.bgTop, C.bgTop, C.bgBottom, C.bgBottom, 1);
      g.fillRect(0, 0, W, H);
    }
    if (PORTRAIT) {
      // darker bands behind the rack strip and the controls so text stays readable on the painting
      const band = this.add.graphics();
      band.fillStyle(0x000000, 0.42).fillRect(0, 112, W, 220);
      band.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.82, 0.82).fillRect(0, 760 + EXTRA, W, 80);
      band.fillStyle(0x000000, 0.82).fillRect(0, 840 + EXTRA, W, H - 840 - EXTRA);
    }
    this.add.particles(0, 0, 'ember', {
      x: PORTRAIT ? { min: 80, max: 640 } : { min: 260, max: 1020 },
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
    if (PORTRAIT) return this.buildTopBarPortrait();
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, W, 64);
    g.lineStyle(1, C.edge, 1);
    g.lineBetween(0, 64.5, W, 64.5);
    label(this, 24, 32, 'FORGE THE NIGHT', 20, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.dayText = label(this, 664, 32, '', 26, C.text, { display: true, weight: 900, origin: [0.5, 0.5] });
    label(this, 900, 32, '목숨', 14, C.mute, { weight: 700, origin: [0, 0.5] });
    this.livesG = this.add.graphics();
    this.goldText = label(this, W - 24, 32, '', 20, C.goldHi, { weight: 900, origin: [1, 0.5] });
    new Button(this, 573, 32, 84, 36, '🏆 랭킹', { variant: 'gold', size: 13, onClick: () => void openRanking() });
    new Button(this, 479, 32, 96, 36, '인트로 보기', {
      variant: 'ghost',
      size: 13,
      onClick: () => {
        if (this.animating || this.leaving) return;
        const data: CinematicData = { clips: INTRO, next: 'Forge', titleCard: true };
        this.scene.start('Cinematic', data);
      },
    });
    this.skillBtn = new Button(this, 340, 32, 170, 42,'스킬트리', { variant: 'dark', size: 15, sub: 'K', onClick: () => this.openSkills() });
    this.shopBtn = new Button(this, 790, 32, 170, 42,`상인 ${MERCHANT.name}`, { variant: 'gold', size: 15, sub: '오늘 방문 중 · M', onClick: () => this.openShop() });
  }

  /** Portrait top bar, two rows: title · DAY · gold, then the menu buttons and the hearts. */
  private buildTopBarPortrait() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, W, 112);
    g.lineStyle(1, C.edge, 1).lineBetween(0, 112.5, W, 112.5);
    label(this, 16, 30, 'FORGE THE NIGHT', 17, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.dayText = label(this, W / 2 + 40, 30, '', 26, C.text, { display: true, weight: 900, origin: [0.5, 0.5] });
    this.goldText = label(this, W - 16, 30, '', 22, C.goldHi, { weight: 900, origin: [1, 0.5] });
    this.livesG = this.add.graphics();
    this.skillBtn = new Button(this, 88, 80, 160, 40, '스킬트리', { variant: 'dark', size: 14, sub: 'K', onClick: () => this.openSkills() });
    new Button(this, 214, 80, 80, 36, '🏆 랭킹', { variant: 'gold', size: 13, onClick: () => void openRanking() });
    new Button(this, 304, 80, 88, 36, '인트로', {
      variant: 'ghost',
      size: 13,
      onClick: () => {
        if (this.animating || this.leaving) return;
        const data: CinematicData = { clips: INTRO, next: 'Forge', titleCard: true };
        this.scene.start('Cinematic', data);
      },
    });
    this.shopBtn = new Button(this, 422, 80, 136, 40, `상인 ${MERCHANT.name}`, { variant: 'gold', size: 14, sub: 'M', onClick: () => this.openShop() });
  }

  private drawLives(lives: number) {
    const g = this.livesG;
    g.clear();
    for (let i = 0; i < START_LIVES; i++) {
      const x = PORTRAIT ? 556 + i * 16 : 948 + i * 16;
      const y = PORTRAIT ? 78 : 32;
      const alive = i < lives;
      g.fillStyle(alive ? C.danger : 0x2a1d1d, 1);
      g.fillCircle(x - 3, y - 2, 4);
      g.fillCircle(x + 3, y - 2, 4);
      g.fillTriangle(x - 7, y, x + 7, y, x, y + 8);
    }
  }

  /** The weapon rack hangs on the forge wall: no list window, the weapons themselves are the buttons. */
  private buildRack() {
    this.painted = !PORTRAIT && this.textures.exists('art-forge_rack_bg');
    if (!this.painted) {
      // no painted rack yet: a plain timber board stands in for it
      const g = this.add.graphics();
      const w = RACK.cols * RACK.slotW + (RACK.cols - 1) * RACK.gapX + 20;
      const h = (INVENTORY_CAP / RACK.cols) * (RACK.slotH + RACK.gapY) - RACK.gapY + 44;
      g.fillStyle(0x1a110b, 0.82);
      g.fillRoundedRect(RACK.x - 10, RACK.y - 34, w, h, 10);
    }
    // the rack belongs to the painting: only a small carved-sign style caption, no window
    const t = rackSlot(0);
    this.rackTitle = label(this, t.x - t.w / 2, t.y - t.h / 2 - 22, '', 15, C.goldHi, { weight: 900, origin: [0, 0.5] });
    this.rackTitle.setStroke('#140a05', 6);
    // buy a fresh weapon to enhance (price doubles with every purchase), at the end of the title row
    const end = rackSlot(PORTRAIT ? RACK.cols - 1 : 1);
    this.buyBtn = new Button(this, end.x + end.w / 2 - 95, t.y - t.h / 2 - 22, 190, 34, '＋ 무기 구매', { variant: 'gold', size: 13, onClick: () => this.buyWeapon() });
    this.rack = this.add.container(0, 0);
    // soft shadow behind the selected-weapon readout instead of a panel
    const shade = this.add.graphics();
    for (let i = 0; i < 8; i++) {
      shade.fillStyle(0x000000, 0.07);
      shade.fillRoundedRect(CARD.x - 10 + i * 6, CARD.y + 8 + i * 4, CARD.w + 20 - i * 12, CARD.h - 16 - i * 8, 30);
    }
  }

  private stageKey(): string | null {
    if (this.textures.exists('anim-forge_strike_side')) return 'anim-forge_strike_side';
    if (this.textures.exists('anim-forge_strike')) return 'anim-forge_strike';
    if (this.textures.exists('art-smith_anvil')) return 'art-smith_anvil';
    return null;
  }

  private buildAnvil() {
    const key = this.stageKey();
    if (key) {
      this.buildStage(key);
      this.buildAnvilTexts();
      return;
    }
    const g = this.add.graphics();
    const cx = ANVIL_X;
    // shadow under anvil and smith
    if (this.textures.exists('art-anvil')) {
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(SMITH.x + 10, SMITH.y - 4, 200, 26);
      g.fillEllipse(cx, 706, 330, 34);
      this.add.image(cx, 714, 'art-anvil').setOrigin(0.5, 1).setScale(0.7);
      this.weaponView = new WeaponView(this, cx - 8, 454, 360);
      this.buildSmith();
      this.buildAnvilTexts();
      return;
    }
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
    this.swing = {
      raise: () => new Promise((r) => this.tweens.add({ targets: this.hammer, angle: 58, duration: 210, ease: 'Cubic.easeOut', onComplete: () => r() })),
      strike: () => new Promise((r) => this.tweens.add({ targets: this.hammer, angle: 0, duration: 95, ease: 'Cubic.easeIn', onComplete: () => r() })),
      recover: () => this.tweens.add({ targets: this.hammer, angle: HAMMER_IDLE, duration: 340, ease: 'Back.easeOut' }),
    };
    this.buildAnvilTexts();
  }

  /**
   * Front view: the blacksmith stands behind the anvil, so the weapon lies in front of him.
   * With the Higgsfield strike sheet the hammer is a real animation (lift = the strike played backwards);
   * with only the still image the pose squashes and stretches.
   */
  private buildStage(key: string) {
    const isAnim = key.startsWith('anim-');
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.45);
    shadow.fillEllipse(STAGE.x, STAGE.bottom - 6, 300, 36);
    const s = isAnim ? this.add.sprite(STAGE.x, STAGE.bottom, key) : this.add.image(STAGE.x, STAGE.bottom, key);
    s.setOrigin(0.5, 1);
    // Real frame count from the sheet manifest: the grid has empty trailing cells (14 frames in 4×4),
    // and playing those made the blacksmith vanish at the end of the strike.
    const manifest = (this.cache.json.get('anim-manifest') as { key: string; frames: number }[] | undefined) ?? [];
    const frames = isAnim ? (manifest.find((m) => `anim-${m.key}` === key)?.frames ?? this.textures.get(key).frameTotal - 1) : 1;
    // idle: hammer raised and ready (frame 0), so the weapon on the anvil is fully visible
    if (isAnim) (s as Phaser.GameObjects.Sprite).setFrame(0);
    const k = STAGE.height / s.height;
    s.setScale(k);
    const f = ANVIL_FACE[key] ?? { fx: 0.6, fy: 0.58 };
    this.face = { x: STAGE.x + (f.fx - 0.5) * s.width * k, y: STAGE.bottom - (1 - f.fy) * s.height * k };
    // the weapon lies on the anvil, in front of the smith
    // sized so a +50 blade (1.7×) still fits: across the 720-wide portrait screen, and short of the
    // landscape odds panel
    this.weaponView = new WeaponView(this, this.face.x - 6, this.face.y - 4, PORTRAIT ? 215 : 260);
    const breathe = this.tweens.add({ targets: s, scaleY: k * 1.008, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    if (isAnim) {
      const sp = s as Phaser.GameObjects.Sprite;
      // The Higgsfield clip: frames 0–8 swing the hammer back over his head, 9+ bring it down.
      const SLAM = Math.min(9, frames - 2);
      const mk = (name: string, from: number, to: number) => {
        if (!this.anims.exists(name)) this.anims.create({ key: name, frames: this.anims.generateFrameNumbers(key, { start: from, end: to }), frameRate: 24 });
      };
      mk('forge-windup', 0, SLAM - 1);
      mk('forge-slam', SLAM, frames - 1);
      const play = (name: string, ms: number) =>
        new Promise<void>((resolve) => {
          sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => resolve());
          const n = this.anims.get(name).frames.length;
          sp.play({ key: name, frameRate: Math.max(8, (n * 1000) / ms) });
        });
      let back: Phaser.Time.TimerEvent | null = null;
      this.swing = {
        raise: () => {
          breathe.pause();
          back?.remove();
          sp.setScale(k).setFrame(0);
          return play('forge-windup', 300);
        },
        strike: () => play('forge-slam', 110),
        recover: () => {
          // hold the blow on the anvil for a beat, then lift back to the ready pose
          back = this.time.delayedCall(650, () => {
            sp.setFrame(0);
            sp.setScale(k * 1.02, k * 0.97);
            this.tweens.add({ targets: sp, scaleX: k, scaleY: k, duration: 220, ease: 'Back.easeOut', onComplete: () => breathe.resume() });
          });
        },
      };
      return;
    }
    this.swing = {
      raise: () => {
        breathe.pause();
        return new Promise((r) => this.tweens.add({ targets: s, y: STAGE.bottom - 12, scaleY: k * 1.03, scaleX: k * 0.98, duration: 220, ease: 'Cubic.easeOut', onComplete: () => r() }));
      },
      strike: () => new Promise((r) => this.tweens.add({ targets: s, y: STAGE.bottom + 4, scaleY: k * 0.95, scaleX: k * 1.03, duration: 80, ease: 'Cubic.easeIn', onComplete: () => r() })),
      recover: () => this.tweens.add({ targets: s, y: STAGE.bottom, scaleX: k, scaleY: k, duration: 360, ease: 'Back.easeOut', onComplete: () => breathe.resume() }),
    };
  }

  /** The blacksmith himself swings the hammer: two Higgsfield poses swapped on the beat. */
  private buildSmith() {
    const hasStrike = this.textures.exists('art-smith_strike');
    const strikeKey = hasStrike ? 'art-smith_strike' : 'art-smith_raise';
    const strikeOx = hasStrike ? SMITH.strikeOriginX : 0.5;
    const s = this.add.image(SMITH.x, SMITH.y, strikeKey).setOrigin(strikeOx, 1).setScale(SMITH.scale);
    const breathe = this.tweens.add({ targets: s, scaleY: SMITH.scale * 1.012, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.swing = {
      raise: () => {
        breathe.pause();
        s.setTexture('art-smith_raise').setOrigin(0.5, 1).setScale(SMITH.scale);
        return new Promise((r) =>
          this.tweens.add({ targets: s, y: SMITH.y - 10, scaleX: SMITH.scale * 0.97, scaleY: SMITH.scale * 1.03, duration: 210, ease: 'Cubic.easeOut', onComplete: () => r() }),
        );
      },
      strike: () => {
        s.setTexture(strikeKey).setOrigin(strikeOx, 1);
        return new Promise((r) =>
          this.tweens.add({ targets: s, y: SMITH.y + 4, x: SMITH.x - 14, scaleX: SMITH.scale * 1.04, scaleY: SMITH.scale * 0.96, duration: 80, ease: 'Cubic.easeIn', onComplete: () => r() }),
        );
      },
      recover: () =>
        this.tweens.add({
          targets: s,
          x: SMITH.x,
          y: SMITH.y,
          scaleX: SMITH.scale,
          scaleY: SMITH.scale,
          duration: 380,
          ease: 'Back.easeOut',
          onComplete: () => breathe.resume(),
        }),
    };
  }

  private buildAnvilTexts() {
    // With the staged smith the readout lives in the card under the rack; otherwise above the anvil.
    const staged = this.stageKey() !== null;
    const cx = staged ? CARD.x + CARD.w / 2 : 640;
    const y0 = staged ? CARD.y + 26 : 104;
    const gap = PORTRAIT
      ? { lv: 52, next: 100, dmg: 134, undo: 52 }
      : staged
        ? { lv: 50, next: 98, dmg: 130, undo: 176 }
        : { lv: 64, next: 118, dmg: 152, undo: 196 };
    this.nameText = label(this, cx, y0, '', 22, C.text, { weight: 900, origin: [0.5, 0.5] });
    this.nameText.setStroke('#140a05', 6);
    this.levelText = new LevelBadge(this, cx, y0 + gap.lv, 0, staged ? 46 : 54);
    this.nextText = label(this, cx, y0 + gap.next, '', 14, C.text, { weight: 700, origin: [0.5, 0.5] });
    this.nextText.setStroke('#140a05', 5);
    // How hard this weapon hits: the direct, readable payoff of every enhancement.
    this.damageText = this.add
      .text(cx, y0 + gap.dmg, '', { fontFamily: DISPLAY, fontSize: '26px', fontStyle: '900', color: '#ffe9a8', stroke: '#140a05', strokeThickness: 7, resolution: 2 })
      .setOrigin(0.5);
    this.starterHammer = this.add.image(staged ? this.face.x : ANVIL_X, staged ? this.face.y - 10 : 410, 'weapon-hammer').setScale(PORTRAIT ? 0.46 : staged ? 0.62 : 0.9).setVisible(false);
    this.emptyText = label(this, cx, y0 + gap.dmg, '', 14, C.text, { weight: 700, align: 'center', origin: [0.5, 0.5], wrap: CARD.w - 30, lineSpacing: 6 });
    // portrait: beside the level badge, since the rows below belong to the odds and buttons
    this.undoBtn = PORTRAIT
      ? new Button(this, W - 130, y0 + gap.undo, 220, 36, '시간 역행석 사용', { variant: 'ghost', size: 13, sub: '', onClick: () => this.undo() })
      : new Button(this, cx, y0 + gap.undo, 250, 36, '시간 역행석 사용', { variant: 'ghost', size: 15, sub: '', onClick: () => this.undo() });
  }

  /** Portrait: odds as one row of five columns, then stones, the big enhance button and the action row. */
  private buildOddsPortrait() {
    const colW = (W - 40) / OUTCOMES.length;
    label(this, 20, PB.oddsY - 4, '강화 확률', 14, C.gold, { weight: 900, origin: [0, 0.5] });
    this.stageText = label(this, W / 2, PB.oddsY - 4, '', 12, C.mute, { weight: 700, origin: [0.5, 0.5] });
    new Button(this, W - 36, PB.oddsY - 4, 36, 26, '?', { variant: 'ghost', onClick: () => this.openModal({ kind: 'tutorial', replay: true }) });
    this.oddsBars = this.add.graphics();
    OUTCOMES.forEach((o, i) => {
      const cx = 20 + colW * i + colW / 2;
      const dot = this.add.graphics();
      dot.fillStyle(OUTCOME_INFO[o].color, 1).fillCircle(cx - 26, PB.oddsY + 24, 5);
      label(this, cx - 18, PB.oddsY + 24, OUTCOME_INFO[o].name, 14, o === 'destroy' ? C.dangerHi : C.text, { weight: 700, origin: [0, 0.5] });
      this.oddsTexts[o] = label(this, cx, PB.oddsY + 50, '', 18, o === 'destroy' ? C.dangerHi : C.text, { weight: 900, origin: [0.5, 0.5] });
    });
    this.statsText = label(this, W / 2, PB.oddsY + 80, '', 11, C.dim, { origin: [0.5, 0.5] });
    this.stoneTitle = label(this, 20, PB.stonesY, '사용', 12, C.mute, { weight: 700, origin: [0, 0.5] });
    ENHANCE_ITEMS.forEach((item, i) => {
      const chip = new StoneChip(this, 60 + i * 96, PB.stonesY - 15, 90, 30, item, () => this.toggleStone(item));
      this.stoneChips.push(chip);
    });
    this.enhanceBtn = new Button(this, W / 2, PB.enhanceY, W - 40, 84, '강화', { variant: 'gold', size: 30, sub: '', onClick: () => this.tryEnhance() });
    const bw = (W - 40 - 20) / 3;
    this.equipBtn = new Button(this, 20 + bw / 2, PB.rowY, bw, 62, '장착', { variant: 'dark', sub: '', onClick: () => this.equipSelected() });
    this.sellBtn = new Button(this, W / 2, PB.rowY, bw, 62, '판매', { variant: 'dark', sub: '', onClick: () => this.trySell() });
    this.nightBtn = new Button(this, W - 20 - bw / 2, PB.rowY, bw, 62, '밤 전투', { variant: 'dark', sub: '', onClick: () => this.startNight() });
  }

  private buildOdds() {
    if (PORTRAIT) return this.buildOddsPortrait();
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
    this.toastBox = this.add.container(TOAST.x, TOAST.y).setDepth(40).setAlpha(0);
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
    this.renderRack();
    this.renderCenter();
    this.renderOdds();
  }

  /** 8 planks: weapons hang on the open ones in order, the rest are padlocked until a key is bought. */
  private renderRack() {
    const s = this.core.state;
    // landscape: short, so the buy button fits on the same row
    this.rackTitle.setText(PORTRAIT ? `무기걸이 ${s.weapons.length} / ${s.inventoryCap}  ·  눌러서 선택` : `무기걸이 ${s.weapons.length} / ${s.inventoryCap}`);
    const price = weaponPrice(s);
    this.buyBtn.setLabel(`＋ 무기 구매 · ${price.toLocaleString()}G`);
    this.buyBtn.setEnabled(!this.animating && !inPrologue(s) && s.weapons.length < s.inventoryCap && s.gold >= price);
    this.rack.removeAll(true);
    const plank = !this.painted && this.textures.exists('art-rack_slot');
    for (let i = 0; i < INVENTORY_CAP; i++) {
      const r = rackSlot(i);
      const SW = r.w;
      const SH = r.h;
      const slot = this.add.container(r.x, r.y);
      const locked = i >= s.inventoryCap;
      const w = locked ? undefined : s.weapons[i];
      const sel = !!w && w.id === this.selectedId;
      const eq = !!w && w.id === s.equippedId;
      const parts: Phaser.GameObjects.GameObject[] = [];

      if (sel) {
        // firelight on the chosen weapon instead of a selection box
        const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
        for (let k = 4; k >= 1; k--) {
          glow.fillStyle(C.goldHi, 0.06 * k);
          glow.fillEllipse(0, -8, SW * (0.7 + k * 0.12), SH * (0.5 + k * 0.18));
        }
        parts.push(glow);
        this.tweens.add({ targets: glow, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      if (plank) {
        const p = this.add.image(0, 10, 'art-rack_slot');
        p.setScale(SW / p.width).setTint(locked ? 0x5a5048 : 0xffffff);
        parts.push(p);
      } else if (!this.painted) {
        const p = this.add.graphics();
        p.fillStyle(locked ? 0x2a2018 : 0x4a3220, 1);
        p.fillRoundedRect(-SW / 2, -6, SW, 30, 6);
        parts.push(p);
      }

      if (locked) {
        // the painted shelf sinks into shadow, and a padlock hangs from its hooks
        const dark = this.add.graphics();
        dark.fillStyle(0x000000, 0.45);
        dark.fillRoundedRect(-SW / 2, -SH / 2 + 6, SW, SH - 4, 8);
        const chain = this.add.graphics();
        chain.lineStyle(3, 0x1e1a17, 1);
        chain.lineBetween(-SW / 2 + 14, -6, -16, 2);
        chain.lineBetween(SW / 2 - 14, -6, 16, 2);
        parts.push(dark, chain);
        if (this.textures.exists('art-padlock')) parts.push(this.add.image(0, 0, 'art-padlock').setScale(0.42));
        if (i === s.inventoryCap) {
          const t = label(this, 0, SH / 2 - 2, '상인의 열쇠로 열기', 11, C.text, { weight: 700, origin: [0.5, 0.5] });
          t.setStroke('#140a05', 4);
          parts.push(t);
        }
      } else if (w) {
        const tex = weaponLookTexture(this, w);
        if (this.textures.exists(tex)) {
          // hangs on the painted hooks, resting just above the shelf
          const img = this.add.image(0, -10, tex);
          // bigger with level: 60% of the shelf at +0, spilling past it at +50
          const grow = 0.6 + (0.55 * (weaponSizeScale(w.level) - WEAPON_SIZE.min)) / (WEAPON_SIZE.max - WEAPON_SIZE.min);
          img.setScale(Math.min((SW - 8) / img.width, 50 / img.height) * grow * (sel ? 1.06 : 1));
          const strength = glowStrength(w.level);
          if (strength > 0) img.preFX?.addGlow(ELEMENT_INFO[w.element].glow, Math.min(5, strength * 0.6), 0, false, 0.1, 10);
          parts.push(img);
        } else {
          const g = this.add.graphics({ x: -6, y: -4 });
          drawWeapon(g, w, 170);
          parts.push(g);
        }
        parts.push(new LevelBadge(this, SW / 2 - 26, -SH / 2 + 14, w.level, 17));
        if (eq) {
          const t = label(this, -SW / 2 + 4, -SH / 2 + 4, '장착', 13, C.goldHi, { weight: 900, origin: [0, 0] });
          t.setStroke('#140a05', 5);
          parts.push(t);
        }
      } else if (!this.painted) {
        parts.push(label(this, 0, -4, '빈 걸이', 12, C.dim, { weight: 700, origin: [0.5, 0.5] }));
      }

      const hit = this.add.zone(0, 0, SW, SH).setInteractive({ useHandCursor: !!w || locked });
      hit.on('pointerup', () => {
        if (w) this.select(w.id);
        else if (locked) {
          this.sfx.denied();
          this.toast(`잠긴 걸이입니다 · 상인 ${MERCHANT.name}에게서 무기보관함 열쇠를 사면 한 칸씩 열립니다`, C.mute);
        }
      });
      hit.on('pointerover', () => w && slot.setScale(1.03));
      hit.on('pointerout', () => slot.setScale(1));
      parts.push(hit);
      slot.add(parts);
      this.rack.add(slot);
    }
  }

  /** Name, level and next-milestone line above the anvil. */
  private renderHeader(w: Weapon | null | undefined) {
    this.nameText.setText(w ? weaponName(w) : '').setColor(w ? css(ELEMENT_INFO[w.element].glow) : css(C.text));
    this.levelText.setVisible(!!w);
    if (w) this.levelText.setLevel(w.level);
    if (w) {
      const next = MILESTONES.find((m) => m.level > w.level);
      this.nextText.setText(w.level >= MAX_LEVEL ? '궁극의 무기 · 더 이상 강화할 수 없습니다' : next ? `다음 각성  +${next.level} ${next.name}  ·  ${next.level - w.level}단계 남음` : '');
    } else this.nextText.setText('');
    this.damageText.setText(w ? `한 방 피해  ${formatDamage(weaponDamage(w.level, w.cls))}` : '');
  }

  /** On a level change, pop the damage readout and float the old → new numbers. */
  private damagePop(before: Weapon, after: Weapon) {
    const d0 = weaponDamage(before.level, before.cls);
    const d1 = weaponDamage(after.level, after.cls);
    if (d0 === d1) return;
    const up = d1 > d0;
    const col = up ? '#ffd34d' : '#ff6b6b';
    this.damageText.setColor(col).setScale(up ? 1.5 : 1.25);
    this.tweens.add({ targets: this.damageText, scale: 1, duration: 420, ease: 'Back.easeOut', onComplete: () => this.damageText.setColor('#ffe9a8') });
    const pct = Math.round((d1 / d0 - 1) * 100);
    const t = this.add
      .text(this.face.x, this.face.y - 110, `${up ? '▲' : '▼'} ${formatDamage(d0)} → ${formatDamage(d1)}  (${up ? '+' : ''}${pct}%)`, {
        fontFamily: DISPLAY,
        fontSize: up ? '30px' : '24px',
        fontStyle: '900',
        color: col,
        stroke: '#140a05',
        strokeThickness: 8,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, delay: 1100, duration: 500, onComplete: () => t.destroy() });
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
      // landscape: one long bar per row; portrait: a short bar under each column
      const colW = (W - 40) / OUTCOMES.length;
      const bx = PORTRAIT ? 20 + colW * i + 10 : RIGHT.x + 20;
      const by = PORTRAIT ? PB.oddsY + 66 : y;
      const bw = PORTRAIT ? colW - 20 : RIGHT.w - 40;
      g.fillStyle(0x0a0807, 1);
      g.fillRoundedRect(bx, by, bw, 6, 3);
      if (pct > 0) {
        g.fillStyle(OUTCOME_INFO[o].color, 1);
        g.fillRoundedRect(bx, by, Math.max(6, (bw * pct) / 100), 6, 3);
      }
    });
    const st = this.core.state.stats;
    this.stageText.setText(w ? `외형 단계 ${appearanceStage(w.level) + 1} / ${APPEARANCE_STAGES.length}` : '');
    this.statsText.setText(`누적 강화 ${st.enhanceAttempts}회 · 파괴 ${st.destroyed}자루 · 최고 +${st.bestLevel}`);
    const canEnhance = !!w && w.level < MAX_LEVEL && !this.animating;
    this.enhanceBtn.setEnabled(canEnhance);
    const cost = w ? enhanceCost(w.level) : 0;
    // keyboard hints only where there is a keyboard
    const key = (k: string) => (PORTRAIT ? '' : ` · ${k}`);
    this.enhanceBtn.setLabel(
      w && w.level >= MAX_LEVEL ? '최대 단계' : '강화',
      w && w.level >= MAX_LEVEL ? '+50 도달' : !w ? (PORTRAIT ? '' : 'Space') : cost === 0 ? `무료${key('Space')}` : `${cost.toLocaleString()}G${this.core.state.gold < cost ? ' · 골드 부족' : ''}${key('Space')}`,
    );
    const eq = !!w && this.core.state.equippedId === w.id;
    this.equipBtn.setEnabled(!!w && !eq && !this.animating);
    this.equipBtn.setLabel(eq ? '장착 중' : '장착', eq ? (PORTRAIT ? '밤에 사용' : '이 무기로 밤에 싸웁니다') : PORTRAIT ? '' : 'E');
    this.sellBtn.setEnabled(!!w && !this.animating);
    this.sellBtn.setLabel('판매', w ? `${sellPrice(this.core.state, w.level).toLocaleString()}G${key('S')}` : PORTRAIT ? '' : 'S');
    this.renderItems();
    const armed = equippedWeapon(this.core.state);
    const hammer = this.core.state.weapons.length === 0;
    this.nightBtn.setEnabled((!!armed || hammer) && !this.animating);
    if (PORTRAIT) this.nightBtn.setLabel('밤 전투', armed ? `+${armed.level} 장착` : hammer ? '망치로 싸움' : '장착 필요');
    else
      this.nightBtn.setLabel(
        '밤 전투 시작',
        armed ? `${weaponName(armed)} +${armed.level} (N)` : hammer ? '기본 망치로 싸웁니다 (N)' : '먼저 무기를 장착하세요',
      );
  }

  private startNight() {
    if (this.animating || this.leaving) return;
    const r = this.core.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') {
      if (r.type === 'nightBlocked') {
        this.toast('밤에 들고 갈 무기를 먼저 장착하세요', C.dangerHi);
        this.say(SMITH_LINES.needEquip);
      }
      return;
    }
    this.leaving = true;
    const data: NightData = { weapon: r.weapon, day: this.core.state.day, lineup: r.lineup };
    // DAY 1: a last word before the fade
    const talk = this.core.state.day === 1;
    if (talk) this.say(r.weapon.kind === 'hammer' ? SMITH_LINES.nightStartHammer : SMITH_LINES.nightStart);
    this.time.delayedCall(talk ? 1300 : 0, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Night', data));
    });
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
    if (inPrologue(this.core.state)) {
      this.sfx.denied();
      this.say(SMITH_LINES.sellPrologue, true);
      return;
    }
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
    this.say(SMITH_LINES.sell);
    this.refresh();
  }

  /** Coins fly from the anvil to the gold counter. */
  private coinBurst(price: number) {
    const n = Phaser.Math.Clamp(Math.round(Math.log10(price) * 3), 3, 16);
    for (let i = 0; i < n; i++) {
      const from = this.face ?? { x: 640, y: 330 };
      const c = this.add.image(from.x + Phaser.Math.Between(-60, 60), from.y - 30 + Phaser.Math.Between(-20, 20), 'spark').setTint(0xffd36b).setScale(0.9).setDepth(50).setBlendMode('ADD');
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

  private buyWeapon() {
    if (this.animating || this.leaving) return;
    const r = this.core.dispatch({ type: 'BUY_WEAPON' });
    if (r.type === 'weaponBought') {
      this.sfx.coin();
      this.selectedId = r.weapon.id;
      this.toast(`${weaponName(r.weapon)} 구매 · −${r.price.toLocaleString()}G · 다음 구매 ${weaponPrice(this.core.state).toLocaleString()}G`, C.goldHi);
      this.say(SMITH_LINES.buy);
      this.refresh();
      return;
    }
    if (r.type !== 'weaponBuyBlocked') return;
    this.sfx.denied();
    const why = { full: '무기걸이가 가득 찼습니다 · 무기를 팔거나 상인에게서 열쇠를 사세요', gold: `골드가 부족합니다 (${weaponPrice(this.core.state).toLocaleString()}G)`, night: '밤에는 살 수 없습니다', prologue: '오늘은 받은 무기로 벼려야 합니다' }[r.reason];
    this.toast(why, C.dangerHi);
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
    this.say(SMITH_LINES.select);
  }

  private step(dir: number) {
    const ws = this.core.state.weapons;
    if (!ws.length || this.animating) return;
    const i = Math.max(0, ws.findIndex((w) => w.id === this.selectedId));
    const ni = Phaser.Math.Clamp(i + dir, 0, ws.length - 1);
    this.select(ws[ni].id);
  }


  private equipSelected() {
    const w = this.selected();
    if (!w || this.animating) return;
    this.core.dispatch({ type: 'EQUIP', weaponId: w.id });
    this.toast(`${weaponName(w)} +${w.level}을(를) 장착했습니다`);
    this.say(SMITH_LINES.equip);
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
      else if (res.reason === 'gold') {
        this.sfx.denied();
        this.toast(`골드가 부족합니다 (강화 ${enhanceCost(w.level).toLocaleString()}G) · 무기를 팔아 골드를 마련하세요`, C.dangerHi);
        this.say(SMITH_LINES.noGold);
      }
      return;
    }
    if (res.type !== 'enhanced') return;
    const r = res.result;
    this.say(SMITH_LINES.enhanceStart);
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
            this.damagePop(r.weaponBefore, r.weaponAfter);
          }
        },
      })
      .then(() => {
        this.animating = false;
        this.refresh();
        this.afterEnhanceLine(r.outcome);
        if (r.protectedFrom)
          this.toast(`강화 보호석 발동 · ${r.protectedFrom === 'destroy' ? '파괴' : '하락'}을 막았습니다`, ITEMS.protect.color);
        else if (r.used.length) this.toast(`${r.used.map((i) => ITEMS[i].name).join(', ')} 사용`, C.mute);
      });
  }
}
