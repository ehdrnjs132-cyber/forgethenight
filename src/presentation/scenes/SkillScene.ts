// Enhancement skill tree (user spec 2026-11-19): five skills, five levels each, bought with gold.
// A chain of stars: only learned skills and the next one are shown; learning a skill makes the next one
// pop in. Tap a star for its effect now / next level, cost and today's uses, then upgrade.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { FORGE_SKILLS, FORGE_SKILL_BY_ID, MAX_SKILL_LEVEL, skillEffectText, type ForgeSkillId } from '../../config/forgeSkills';
import { checkBuySkill, fateSplitLeft, nextSkillCost, phoenixLeft, skillLevel, skillUnlocked, type SkillBuyBlock } from '../../core/systems/forgeSkills';
import { C, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

// Landscape: star chain on the left, detail panel on the right. Portrait: chain on top, panel below.
const PANEL_W = PORTRAIT ? W : 420;
const PANEL_H = PORTRAIT ? 500 : H;
const PANEL_X = PORTRAIT ? 0 : W - PANEL_W;
const PANEL_Y = PORTRAIT ? H - PANEL_H : 0;
const MAP_W = PORTRAIT ? W : W - PANEL_W;
const MAP_H = PORTRAIT ? H - PANEL_H : H;
const TOP_H = PORTRAIT ? 110 : 70;

const BLOCK_TEXT: Record<SkillBuyBlock, string> = {
  unknown: '',
  max: '최고 레벨입니다',
  locked: '앞의 스킬을 먼저 배워야 합니다',
  gold: '골드가 부족합니다 · 무기를 팔아 마련하세요',
  night: '밤에는 배울 수 없습니다',
};

interface StarView {
  id: ForgeSkillId;
  x: number;
  y: number;
  g: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  lv: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

export class SkillScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private stars: StarView[] = [];
  private links!: Phaser.GameObjects.Graphics;
  private detail!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private selected: ForgeSkillId = 'miracle';
  private shown = new Set<ForgeSkillId>();
  private closing = false;

  constructor() {
    super('Skills');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.closing = false;
    this.stars = [];
    this.shown = new Set();
    this.selected = FORGE_SKILLS.find((f) => skillUnlocked(this.core.state, f.id) && skillLevel(this.core.state, f.id) < MAX_SKILL_LEVEL)?.id ?? 'miracle';

    // night sky
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05060c, 0x05060c, 0x140a10, 0x140a10, 1);
    bg.fillRect(0, 0, W, H);
    const rnd = new Phaser.Math.RandomDataGenerator(['forge-stars']);
    for (let i = 0; i < 140; i++) {
      bg.fillStyle(0xffffff, rnd.realInRange(0.08, 0.45));
      bg.fillCircle(rnd.between(0, W), rnd.between(0, H), rnd.realInRange(0.5, 1.6));
    }

    // top bar
    const top = this.add.graphics();
    top.fillStyle(0x000000, 0.55).fillRect(0, 0, MAP_W, TOP_H);
    label(this, 24, 34, '강화 스킬', PORTRAIT ? 28 : 24, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.goldText = label(this, MAP_W - 24, 34, '', PORTRAIT ? 22 : 18, C.goldHi, { weight: 900, origin: [1, 0.5] });
    label(this, 24, TOP_H - (PORTRAIT ? 26 : 14), '골드로 배우는 무기 강화 기술 · 하나를 배우면 다음 별이 열립니다', PORTRAIT ? 14 : 12, C.mute, { weight: 700, origin: [0, 0.5] });

    // the chain of stars, evenly spaced down the map
    this.links = this.add.graphics();
    const x = MAP_W / 2;
    const y0 = TOP_H + (PORTRAIT ? 80 : 70);
    const step = Math.min(PORTRAIT ? 150 : 125, (MAP_H - y0 - 60) / (FORGE_SKILLS.length - 1));
    FORGE_SKILLS.forEach((f, i) => {
      // a gentle zig-zag so it reads as a constellation
      const sx = x + (i % 2 === 0 ? -1 : 1) * (PORTRAIT ? 90 : 70);
      const sy = y0 + i * step;
      const g = this.add.graphics({ x: sx, y: sy });
      const name = label(this, sx, sy + (PORTRAIT ? 76 : 66), f.name, PORTRAIT ? 20 : 17, C.text, { weight: 900, origin: [0.5, 0.5] });
      const lv = label(this, sx, sy + (PORTRAIT ? 100 : 86), '', PORTRAIT ? 15 : 13, C.mute, { weight: 700, origin: [0.5, 0.5] });
      const zone = this.add.zone(sx, sy + 20, 200, 130).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.select(f.id));
      this.stars.push({ id: f.id, x: sx, y: sy, g, name, lv, zone });
    });

    // detail panel
    const pg = this.add.graphics();
    pg.fillStyle(0x0f0c0a, 0.96).fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    pg.lineStyle(1, C.edge, 1);
    if (PORTRAIT) pg.lineBetween(0, PANEL_Y + 0.5, W, PANEL_Y + 0.5);
    else pg.lineBetween(PANEL_X + 0.5, 0, PANEL_X + 0.5, H);
    this.detail = this.add.container(PANEL_X, PANEL_Y);
    new Button(this, PANEL_X + PANEL_W / 2, H - 44, PANEL_W - 48, PORTRAIT ? 64 : 52, '대장간으로', { variant: 'dark', size: PORTRAIT ? 22 : 18, sub: PORTRAIT ? '' : 'K · Esc', onClick: () => this.close() });
    // test slot only: gold to try every skill quickly (spec: "테스트용 스킬 포인트")
    if (new URLSearchParams(location.search).get('slot') === 'test') {
      new Button(this, MAP_W - 110, TOP_H + 26, 200, 34, '테스트: 골드 +100만', {
        variant: 'ghost',
        size: 13,
        onClick: () => {
          this.core.state = { ...this.core.state, gold: this.core.state.gold + 1_000_000 };
          this.refresh();
        },
      });
    }

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.close());
    kb.on('keydown-K', () => this.close());
    kb.on('keydown-ENTER', () => this.upgrade());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.refresh();
  }

  /** Shown: learned skills and the next one that can be learned; nothing beyond. */
  private visible(id: ForgeSkillId): boolean {
    return skillUnlocked(this.core.state, id);
  }

  private refresh() {
    const s = this.core.state;
    this.goldText.setText(`${s.gold.toLocaleString()} G`);
    const firstLook = this.shown.size === 0;
    const fresh: StarView[] = [];
    this.links.clear();
    this.stars.forEach((v, i) => {
      const f = FORGE_SKILL_BY_ID[v.id];
      const open = this.visible(v.id);
      for (const o of [v.g, v.name, v.lv, v.zone]) o.setVisible(open);
      if (!open) return;
      if (!this.shown.has(v.id)) {
        if (!firstLook) fresh.push(v);
        this.shown.add(v.id);
      }
      const lv = skillLevel(s, v.id);
      const next = this.stars[i + 1];
      if (next && this.visible(next.id)) {
        this.links.lineStyle(lv > 0 ? 4 : 2, f.color, lv > 0 ? 0.8 : 0.35);
        this.links.lineBetween(v.x, v.y, next.x, next.y);
      }
      const g = v.g;
      g.clear();
      const r = PORTRAIT ? 40 : 34;
      if (lv > 0) {
        for (let k = 3; k >= 1; k--) g.fillStyle(f.color, 0.08 * k).fillCircle(0, 0, r + k * 7);
        g.fillStyle(f.color, 1).fillCircle(0, 0, r);
        g.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.3, -r * 0.3, r * 0.35);
      } else {
        g.fillStyle(0x14111c, 1).fillCircle(0, 0, r);
        g.lineStyle(3, f.color, 1).strokeCircle(0, 0, r);
      }
      // five level pips around the bottom of the star
      for (let p = 0; p < MAX_SKILL_LEVEL; p++) {
        const a = Math.PI * (0.25 + (p / (MAX_SKILL_LEVEL - 1)) * 0.5);
        g.fillStyle(p < lv ? 0xffffff : 0x3a3346, 1).fillCircle(Math.cos(a) * (r + 12), Math.sin(a) * (r + 12) - 2, 4);
      }
      if (v.id === this.selected) g.lineStyle(3, 0xffffff, 1).strokeCircle(0, 0, r + 22);
      v.name.setColor(css(lv > 0 ? C.text : C.mute));
      v.lv.setText(`Lv ${lv} / ${MAX_SKILL_LEVEL}`);
    });
    fresh.forEach((v, i) => this.popIn(v, i));
    this.renderDetail();
  }

  private renderDetail() {
    const d = this.detail;
    d.removeAll(true);
    const s = this.core.state;
    const f = FORGE_SKILL_BY_ID[this.selected];
    const lv = skillLevel(s, f.id);
    const pad = 28;
    const wrap = PANEL_W - pad * 2;
    const big = PORTRAIT ? 1.15 : 1;
    let y = PORTRAIT ? 26 : 36;
    d.add(label(this, pad, y, f.name, 28 * big, f.color, { weight: 900 }));
    d.add(label(this, PANEL_W - pad, y + 6, `Lv ${lv} / ${MAX_SKILL_LEVEL}`, 18 * big, C.text, { weight: 900, origin: [1, 0] }));
    y += 46 * big;
    const summary = label(this, pad, y, f.summary, 15 * big, C.mute, { wrap, lineSpacing: 6 });
    d.add(summary);
    y += summary.height + 18;
    d.add(label(this, pad, y, '현재', 14 * big, C.dim, { weight: 900 }));
    d.add(label(this, pad + 70, y, skillEffectText(f.id, lv), 16 * big, C.text, { weight: 700, wrap: wrap - 70 }));
    y += 32 * big;
    if (lv < MAX_SKILL_LEVEL) {
      d.add(label(this, pad, y, '다음', 14 * big, C.dim, { weight: 900 }));
      d.add(label(this, pad + 70, y, skillEffectText(f.id, lv + 1), 16 * big, C.goldHi, { weight: 900, wrap: wrap - 70 }));
      y += 32 * big;
    }
    if (f.id === 'phoenix' && lv > 0) {
      d.add(label(this, pad, y, `오늘 남은 복구 ${phoenixLeft(s)}회 (날이 바뀌면 다시 채워집니다)`, 14 * big, f.color, { weight: 700 }));
      y += 28 * big;
    }
    if (f.id === 'fateSplit' && lv > 0) {
      d.add(label(this, pad, y, `오늘 남은 사용 ${fateSplitLeft(s)}회 · 대장간에서 켜고 강화하세요`, 14 * big, f.color, { weight: 700, wrap }));
      y += 28 * big;
    }
    if (f.requires) {
      d.add(label(this, pad, y, `해금: ${FORGE_SKILL_BY_ID[f.requires].name} Lv 1`, 13 * big, C.dim, { weight: 700 }));
      y += 26 * big;
    }
    const cost = nextSkillCost(s, f.id);
    const block = checkBuySkill(s, f.id);
    const btn = new Button(this, PANEL_W / 2, y + 44 * big, PANEL_W - pad * 2, 66 * big, cost === null ? '최고 레벨' : `업그레이드 · ${cost.toLocaleString()}G`, {
      variant: block ? 'dark' : 'gold',
      size: 22 * big,
      sub: block ? BLOCK_TEXT[block] : PORTRAIT ? ' ' : 'Enter',
      subSize: 13 * big,
      onClick: () => this.upgrade(),
    });
    btn.setEnabled(!block);
    d.add(btn);
  }

  private select(id: ForgeSkillId) {
    if (!this.visible(id)) return;
    this.selected = id;
    this.sfx.click();
    this.refresh();
  }

  private upgrade() {
    const r = this.core.dispatch({ type: 'BUY_SKILL', id: this.selected });
    if (r.type !== 'skillBought') {
      this.sfx.denied();
      return;
    }
    this.sfx.levelUp();
    const v = this.stars.find((w) => w.id === r.id)!;
    const ring = this.add.image(v.x, v.y, 'ring').setTint(FORGE_SKILL_BY_ID[r.id].color).setBlendMode('ADD').setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 560, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const burst = this.add.particles(v.x, v.y, 'spark', { speed: { min: 60, max: 220 }, lifespan: 520, scale: { start: 0.6, end: 0 }, tint: FORGE_SKILL_BY_ID[r.id].color, blendMode: 'ADD', emitting: false });
    burst.explode(20);
    this.time.delayedCall(600, () => burst.destroy());
    this.refresh();
  }

  /** "짠": a newly opened star grows out of nothing with a ring of light and a NEW tag. */
  private popIn(v: StarView, i: number) {
    const col = FORGE_SKILL_BY_ID[v.id].color;
    const delay = 250 + i * 160;
    for (const o of [v.g, v.name, v.lv]) {
      o.setScale(0).setAlpha(0);
      this.tweens.add({ targets: o, scale: 1, alpha: 1, delay, duration: 420, ease: 'Back.easeOut' });
    }
    const ring = this.add.image(v.x, v.y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.1).setAlpha(0);
    this.tweens.add({ targets: ring, alpha: 1, delay, duration: 1 });
    this.tweens.add({ targets: ring, scale: 1.3, alpha: 0, delay, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const tag = label(this, v.x, v.y - 60, 'NEW', 16, 0xffffff, { weight: 900, origin: [0.5, 0.5] }).setStroke(css(col), 5).setAlpha(0);
    this.tweens.add({ targets: tag, alpha: 1, y: tag.y - 8, delay: delay + 200, duration: 300 });
    this.tweens.add({ targets: tag, alpha: 0, delay: delay + 2200, duration: 500, onComplete: () => tag.destroy() });
  }

  private close() {
    if (this.closing) return;
    this.closing = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.resume('Forge');
      this.scene.stop();
    });
  }
}
