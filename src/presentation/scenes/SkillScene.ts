// Skill tree screen (user request 2026-11-20, after Bills Must Be Paid): four directions out of the
// anvil — ⬆ 확률 ➡ 속도 ⬇ 골드 ⬅ 보험. Each node is bought once with gold. Only owned nodes and the ones
// growing out of them are shown; buying one makes its neighbours pop in. Drag to look around, tap a
// node for its effect and price.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { DIRECTION_INFO, TREE, TREE_BY_ID, type TreeNode } from '../../config/skillTree';
import { checkBuyNode, nodeVisible, ownedCount, ownsNode, type NodeBuyBlock } from '../../core/systems/skillTree';
import { C, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

const PANEL_W = PORTRAIT ? W : 420;
const PANEL_H = PORTRAIT ? 360 : H;
const PANEL_X = PORTRAIT ? 0 : W - PANEL_W;
const PANEL_Y = PORTRAIT ? H - PANEL_H : 0;
const MAP_W = PORTRAIT ? W : W - PANEL_W;
const TOP_H = PORTRAIT ? 96 : 70;
const MAP_TOP = TOP_H;
const MAP_BOTTOM = PORTRAIT ? PANEL_Y : H;
/** Grid step between nodes and node radius. */
const CELL = PORTRAIT ? 118 : 104;
const R = PORTRAIT ? 34 : 30;

const BLOCK_TEXT: Record<NodeBuyBlock, string> = {
  unknown: '',
  owned: '이미 배웠습니다',
  locked: '이어진 기술을 먼저 배워야 합니다',
  gold: '골드가 부족합니다 · 무기를 팔아 마련하세요',
  night: '밤에는 배울 수 없습니다',
};

const colorOf = (n: TreeNode) => (n.dir === 'root' ? C.gold : DIRECTION_INFO[n.dir].color);

interface NodeView {
  node: TreeNode;
  g: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
}

export class SkillScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private map!: Phaser.GameObjects.Container;
  private links!: Phaser.GameObjects.Graphics;
  private views: NodeView[] = [];
  private detail!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private selected = 'root';
  private shown = new Set<string>();
  private closing = false;
  private drag: { x: number; y: number; mx: number; my: number; moved: boolean } | null = null;

  constructor() {
    super('Skills');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.closing = false;
    this.views = [];
    this.shown = new Set();
    // start on the cheapest thing that can be bought next, else the anvil
    const open = TREE.filter((n) => n.id !== 'root' && nodeVisible(this.core.state, n) && !ownsNode(this.core.state, n.id)).sort((a, b) => a.cost - b.cost);
    this.selected = open[0]?.id ?? 'root';

    // night sky
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05060c, 0x05060c, 0x140a10, 0x140a10, 1).fillRect(0, 0, W, H);
    const rnd = new Phaser.Math.RandomDataGenerator(['forge-stars']);
    for (let i = 0; i < 160; i++) {
      bg.fillStyle(0xffffff, rnd.realInRange(0.08, 0.45));
      bg.fillCircle(rnd.between(0, W), rnd.between(0, H), rnd.realInRange(0.5, 1.6));
    }

    // the map: anvil at the centre of the visible area, draggable
    const cx = MAP_W / 2;
    const cy = (MAP_TOP + MAP_BOTTOM) / 2;
    this.map = this.add.container(cx, cy);
    // faint direction labels far out on each axis
    for (const [dir, x, y] of [['odds', 0, -1], ['speed', 1, 0], ['gold', 0, 1], ['insure', -1, 0]] as const) {
      const d = DIRECTION_INFO[dir];
      const t = label(this, x * CELL * 7.1, y * CELL * 7.1, `${d.arrow} ${d.name}`, PORTRAIT ? 24 : 20, d.color, { weight: 900, origin: [0.5, 0.5] }).setAlpha(0.55);
      this.map.add(t);
    }
    this.links = this.add.graphics();
    this.map.add(this.links);
    for (const node of TREE) {
      const x = node.x * CELL;
      const y = node.y * CELL;
      const g = this.add.graphics({ x, y });
      const name = label(this, x, y + R + 16, node.name, PORTRAIT ? 16 : 14, C.text, { weight: 900, origin: [0.5, 0.5] }).setStroke('#05060c', 5);
      const cost = label(this, x, y + R + 36, '', PORTRAIT ? 14 : 12, C.goldHi, { weight: 700, origin: [0.5, 0.5] }).setStroke('#05060c', 4);
      this.map.add([g, name, cost]);
      this.views.push({ node, g, name, cost });
    }
    this.focus(this.selected, false);

    // input: drag to pan, tap to select
    const area = this.add.zone(MAP_W / 2, (MAP_TOP + MAP_BOTTOM) / 2, MAP_W, MAP_BOTTOM - MAP_TOP).setInteractive();
    area.on('pointerdown', (p: Phaser.Input.Pointer) => (this.drag = { x: p.x, y: p.y, mx: this.map.x, my: this.map.y, moved: false }));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > 10) d.moved = true;
      if (d.moved) this.map.setPosition(d.mx + p.x - d.x, d.my + p.y - d.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      const hit = this.views.find((v) => v.g.visible && Math.hypot(p.x - (this.map.x + v.node.x * CELL), p.y - (this.map.y + v.node.y * CELL)) < R + 22);
      if (hit) this.select(hit.node.id);
    });

    // top bar (drawn over the map)
    const top = this.add.graphics();
    top.fillStyle(0x000000, 0.7).fillRect(0, 0, MAP_W, TOP_H);
    label(this, 20, PORTRAIT ? 30 : 26, '스킬트리', PORTRAIT ? 28 : 24, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.countText = label(this, 20, TOP_H - (PORTRAIT ? 22 : 14), '', PORTRAIT ? 14 : 12, C.mute, { weight: 700, origin: [0, 0.5] });
    this.goldText = label(this, MAP_W - 20, PORTRAIT ? 30 : 26, '', PORTRAIT ? 24 : 20, C.goldHi, { weight: 900, origin: [1, 0.5] });
    label(this, MAP_W - 20, TOP_H - (PORTRAIT ? 22 : 14), '드래그로 둘러보기', PORTRAIT ? 13 : 11, C.dim, { weight: 700, origin: [1, 0.5] });

    // detail panel
    const pg = this.add.graphics();
    pg.fillStyle(0x0f0c0a, 0.97).fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    pg.lineStyle(1, C.edge, 1);
    if (PORTRAIT) pg.lineBetween(0, PANEL_Y + 0.5, W, PANEL_Y + 0.5);
    else pg.lineBetween(PANEL_X + 0.5, 0, PANEL_X + 0.5, H);
    this.detail = this.add.container(PANEL_X, PANEL_Y);
    new Button(this, PANEL_X + PANEL_W / 2, H - (PORTRAIT ? 44 : 40), PANEL_W - 48, PORTRAIT ? 64 : 52, '대장간으로', { variant: 'dark', size: PORTRAIT ? 22 : 18, sub: PORTRAIT ? undefined : 'K · Esc', onClick: () => this.close() });
    // test slot only: gold to try the tree quickly
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
    kb.on('keydown-ENTER', () => this.buy());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.refresh();
  }

  /** Slide the map so `id` sits in the middle of the visible area. */
  private focus(id: string, animate = true) {
    const n = TREE_BY_ID[id];
    const tx = MAP_W / 2 - n.x * CELL;
    const ty = (MAP_TOP + MAP_BOTTOM) / 2 - n.y * CELL;
    if (animate) this.tweens.add({ targets: this.map, x: tx, y: ty, duration: 300, ease: 'Cubic.easeOut' });
    else this.map.setPosition(tx, ty);
  }

  private refresh() {
    const s = this.core.state;
    this.goldText.setText(`${s.gold.toLocaleString()} G`);
    this.countText.setText(`배운 기술 ${ownedCount(s)} / ${TREE.length - 1} · 하나씩 사면 옆이 열립니다`);
    const firstLook = this.shown.size === 0;
    const fresh: NodeView[] = [];
    this.links.clear();
    for (const v of this.views) {
      const n = v.node;
      const open = nodeVisible(s, n);
      for (const o of [v.g, v.name, v.cost]) o.setVisible(open);
      if (!open) continue;
      if (!this.shown.has(n.id)) {
        if (!firstLook) fresh.push(v);
        this.shown.add(n.id);
      }
      const owned = ownsNode(s, n.id);
      const col = colorOf(n);
      if (n.from) {
        const f = TREE_BY_ID[n.from];
        this.links.lineStyle(owned ? 6 : 3, col, owned ? 0.85 : 0.3);
        this.links.lineBetween(f.x * CELL, f.y * CELL, n.x * CELL, n.y * CELL);
      }
      const g = v.g;
      g.clear();
      const r = n.id === 'root' ? R + 8 : R;
      const can = checkBuyNode(s, n.id) === null;
      if (owned) {
        for (let k = 3; k >= 1; k--) g.fillStyle(col, 0.08 * k).fillCircle(0, 0, r + k * 7);
        g.fillStyle(col, 1).fillCircle(0, 0, r);
        g.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.3, -r * 0.3, r * 0.35);
      } else {
        g.fillStyle(0x14111c, 1).fillCircle(0, 0, r);
        g.lineStyle(can ? 4 : 3, col, can ? 1 : 0.6).strokeCircle(0, 0, r);
        if (can) g.fillStyle(col, 0.25).fillCircle(0, 0, r - 6);
      }
      if (n.id === this.selected) g.lineStyle(3, 0xffffff, 1).strokeCircle(0, 0, r + 14);
      v.name.setColor(css(owned ? C.text : C.mute));
      v.cost.setText(owned || n.id === 'root' ? '' : `${n.cost.toLocaleString()}G`).setColor(css(can ? C.goldHi : C.dim));
    }
    fresh.forEach((v, i) => this.popIn(v, i));
    this.renderDetail();
  }

  private renderDetail() {
    const d = this.detail;
    d.removeAll(true);
    const s = this.core.state;
    const n = TREE_BY_ID[this.selected];
    const col = colorOf(n);
    const pad = 26;
    const wrap = PANEL_W - pad * 2;
    const big = PORTRAIT ? 1.1 : 1;
    let y = PORTRAIT ? 20 : 36;
    const dirName = n.dir === 'root' ? '시작점' : `${DIRECTION_INFO[n.dir].arrow} ${DIRECTION_INFO[n.dir].name}`;
    d.add(label(this, pad, y, dirName, 14 * big, col, { weight: 900 }));
    y += 24 * big;
    d.add(label(this, pad, y, n.name, 28 * big, C.text, { weight: 900 }));
    y += 44 * big;
    const desc = label(this, pad, y, n.desc, 17 * big, C.goldHi, { weight: 700, wrap, lineSpacing: 6 });
    d.add(desc);
    y += desc.height + 14;
    if (n.id === 'root') return;
    const owned = ownsNode(s, n.id);
    const block = checkBuyNode(s, n.id);
    if (n.from && !ownsNode(s, n.from)) {
      d.add(label(this, pad, y, `먼저: ${TREE_BY_ID[n.from].name}`, 13 * big, C.dim, { weight: 700 }));
      y += 24 * big;
    }
    const btnY = PORTRAIT ? Math.min(y + 40, PANEL_H - 120) : y + 44;
    const btn = new Button(this, PANEL_W / 2, btnY, PANEL_W - pad * 2, 62 * big, owned ? '배웠습니다' : `배우기 · ${n.cost.toLocaleString()}G`, {
      variant: block ? 'dark' : 'gold',
      size: 22 * big,
      sub: owned ? undefined : block ? BLOCK_TEXT[block] : PORTRAIT ? undefined : 'Enter',
      subSize: 13 * big,
      onClick: () => this.buy(),
    });
    btn.setEnabled(!block);
    d.add(btn);
  }

  private select(id: string) {
    if (!nodeVisible(this.core.state, TREE_BY_ID[id])) return;
    this.selected = id;
    this.sfx.click();
    this.focus(id);
    this.refresh();
  }

  private buy() {
    const r = this.core.dispatch({ type: 'BUY_NODE', id: this.selected });
    if (r.type !== 'nodeBought') {
      this.sfx.denied();
      return;
    }
    this.sfx.levelUp();
    const n = TREE_BY_ID[r.id];
    const x = this.map.x + n.x * CELL;
    const y = this.map.y + n.y * CELL;
    const col = colorOf(n);
    const ring = this.add.image(x, y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 560, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const burst = this.add.particles(x, y, 'spark', { speed: { min: 60, max: 220 }, lifespan: 520, scale: { start: 0.6, end: 0 }, tint: col, blendMode: 'ADD', emitting: false });
    burst.explode(22);
    this.time.delayedCall(600, () => burst.destroy());
    // move on to the cheapest node that just opened up, if any
    const next = TREE.filter((m) => m.from === r.id).sort((a, b) => a.cost - b.cost)[0];
    this.refresh();
    if (next) this.time.delayedCall(450, () => this.select(next.id));
  }

  /** "짠": a newly opened node grows out of nothing with a ring of light and a NEW tag. */
  private popIn(v: NodeView, i: number) {
    const col = colorOf(v.node);
    const delay = 250 + i * 160;
    for (const o of [v.g, v.name, v.cost]) {
      o.setScale(0).setAlpha(0);
      this.tweens.add({ targets: o, scale: 1, alpha: 1, delay, duration: 420, ease: 'Back.easeOut' });
    }
    const x = v.node.x * CELL;
    const y = v.node.y * CELL;
    const ring = this.add.image(x, y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.1).setAlpha(0);
    this.map.add(ring);
    this.tweens.add({ targets: ring, alpha: 1, delay, duration: 1 });
    this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, delay, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const tag = label(this, x, y - R - 18, 'NEW', 15, 0xffffff, { weight: 900, origin: [0.5, 0.5] }).setStroke(css(col), 5).setAlpha(0);
    this.map.add(tag);
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
