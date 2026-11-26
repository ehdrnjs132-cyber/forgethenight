// Skill tree screen — the star disc (user request 2026-11-26, after a constellation-style reference):
// a round stone disc split into five sectors (확률 · 속도 · 체력 · 골드 · 보험), each a constellation of
// small stars (+5% / +0.5%p) and big stars (special skills). The whole disc is visible at once; learned
// stars and the lines between them glow. Drag to look around, wheel or ＋/− to zoom, tap a star for its
// effect and price. Our own drawing: stone, lines and dots, no copied art.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { DIRECTION_INFO, RING_PX, SECTOR_DEG, TREE, TREE_BY_ID, type Direction, type TreeNode } from '../../config/skillTree';
import { checkBuyNode, nodeVisible, ownedCount, ownsNode, type NodeBuyBlock } from '../../core/systems/skillTree';
import { C, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

const PANEL_W = PORTRAIT ? W : 400;
const PANEL_H = PORTRAIT ? 360 : H;
const PANEL_X = PORTRAIT ? 0 : W - PANEL_W;
const PANEL_Y = PORTRAIT ? H - PANEL_H : 0;
const MAP_W = PORTRAIT ? W : W - PANEL_W;
const TOP_H = PORTRAIT ? 96 : 70;
const MAP_TOP = TOP_H;
const MAP_BOTTOM = PORTRAIT ? PANEL_Y : H;
const MAP_CX = MAP_W / 2;
const MAP_CY = (MAP_TOP + MAP_BOTTOM) / 2;

/** Disc geometry in world px (the map container is scaled by the zoom). */
const MAX_RING = Math.max(...TREE.map((n) => n.ring));
const STAR_R = RING_PX.first + (MAX_RING - 1) * RING_PX.step;
const DISC_R = STAR_R + 70;
const INNER_R = RING_PX.first - 40;
/** Star sizes in world px. */
const SMALL = 13;
const BIG = 24;
const ROOT = 40;
const SECTOR_HALF = 36;

const FIT = Math.min(MAP_W, MAP_BOTTOM - MAP_TOP) / (DISC_R * 2 + 40);
const ZOOM = { min: FIT, max: 1.4 };

const BLOCK_TEXT: Record<NodeBuyBlock, string> = {
  unknown: '',
  owned: '이미 배웠습니다',
  locked: '이어진 별을 먼저 배워야 합니다',
  gold: '골드가 부족합니다 · 무기를 팔아 마련하세요',
  night: '밤에는 배울 수 없습니다',
};

/** Unlearned stars keep a dim dot of their sector colour, like gems not yet lit. */
const mixDot = (col: number) => Phaser.Display.Color.ValueToColor(col).darken(35).color;
const colorOf = (n: TreeNode) => (n.dir === 'root' ? C.gold : DIRECTION_INFO[n.dir].color);
const radiusOf = (n: TreeNode) => (n.id === 'root' ? ROOT : n.major ? BIG : SMALL);

interface NodeView {
  node: TreeNode;
  g: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text | null;
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
  private buyable = new Set<string>();
  private closing = false;
  private zoom = FIT;
  private drag: { x: number; y: number; mx: number; my: number; moved: boolean } | null = null;
  private pulse = 0;

  constructor() {
    super('Skills');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.closing = false;
    this.views = [];
    this.buyable = new Set();
    this.zoom = FIT;
    // start on the cheapest star that can be bought next, else the anvil
    const open = TREE.filter((n) => n.id !== 'root' && nodeVisible(this.core.state, n) && !ownsNode(this.core.state, n.id)).sort((a, b) => a.cost - b.cost);
    this.selected = open[0]?.id ?? 'root';

    // night sky behind the disc
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05060c, 0x05060c, 0x120a10, 0x120a10, 1).fillRect(0, 0, W, H);
    const rnd = new Phaser.Math.RandomDataGenerator(['forge-stars']);
    for (let i = 0; i < 160; i++) {
      bg.fillStyle(0xffffff, rnd.realInRange(0.06, 0.35));
      bg.fillCircle(rnd.between(0, W), rnd.between(0, H), rnd.realInRange(0.5, 1.4));
    }

    this.map = this.add.container(MAP_CX, MAP_CY).setScale(this.zoom);
    this.drawDisc();
    this.links = this.add.graphics();
    this.map.add(this.links);
    for (const node of TREE) {
      const g = this.add.graphics({ x: node.x, y: node.y });
      const r = radiusOf(node);
      // big stars carry their name; small ones say what they do only when zoomed in
      const name = label(this, node.x, node.y + r + (node.major ? 20 : 14), node.name, node.major ? 22 : 15, C.text, { weight: 900, origin: [0.5, 0.5] }).setStroke('#05060c', 6);
      this.map.add([g, name]);
      this.views.push({ node, g, name });
    }

    // input: drag to pan, tap to select, wheel to zoom
    const area = this.add.zone(MAP_CX, MAP_CY, MAP_W, MAP_BOTTOM - MAP_TOP).setInteractive();
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
      const hit = this.starAt(p.x, p.y);
      if (hit) this.select(hit.id);
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (p.x < MAP_W && p.y > MAP_TOP) this.zoomTo(this.zoom * (dy > 0 ? 0.88 : 1.14), p.x, p.y);
    });

    // top bar (drawn over the map)
    const top = this.add.graphics();
    top.fillStyle(0x000000, 0.7).fillRect(0, 0, MAP_W, TOP_H);
    label(this, 20, PORTRAIT ? 30 : 26, '스킬트리', PORTRAIT ? 28 : 24, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.countText = label(this, 20, TOP_H - (PORTRAIT ? 22 : 14), '', PORTRAIT ? 14 : 12, C.mute, { weight: 700, origin: [0, 0.5] });
    this.goldText = label(this, MAP_W - 20, PORTRAIT ? 30 : 26, '', PORTRAIT ? 24 : 20, C.goldHi, { weight: 900, origin: [1, 0.5] });
    label(this, MAP_W - 20, TOP_H - (PORTRAIT ? 22 : 14), '드래그로 둘러보기 · 휠로 확대', PORTRAIT ? 13 : 11, C.dim, { weight: 700, origin: [1, 0.5] });
    // zoom buttons (phones have no wheel)
    const zx = MAP_W - 34;
    const zy = MAP_BOTTOM - (PORTRAIT ? 150 : 130);
    new Button(this, zx, zy, 44, 40, '＋', { variant: 'dark', size: 22, onClick: () => this.zoomTo(this.zoom * 1.3) });
    new Button(this, zx, zy + 48, 44, 40, '−', { variant: 'dark', size: 22, onClick: () => this.zoomTo(this.zoom / 1.3) });
    new Button(this, zx, zy + 96, 44, 40, '◎', { variant: 'dark', size: 18, onClick: () => this.zoomTo(FIT, undefined, undefined, true) });

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
      new Button(this, 120, TOP_H + 26, 200, 34, '테스트: 골드 +100만', {
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

  update(_t: number, dt: number) {
    // buyable stars breathe so the next step is easy to find
    this.pulse += dt / 1000;
    const a = 0.55 + 0.45 * Math.sin(this.pulse * 3.2);
    for (const v of this.views) if (this.buyable.has(v.node.id)) v.g.setAlpha(0.75 + 0.25 * a);
  }

  /** The stone disc: rings, five sector walls, faint sector colour and the sector names. */
  private drawDisc() {
    const g = this.add.graphics();
    this.map.add(g);
    // stone face with a darker rim
    g.fillStyle(0x0d0b10, 1).fillCircle(0, 0, DISC_R + 26);
    g.fillStyle(0x1a1620, 1).fillCircle(0, 0, DISC_R);
    g.fillStyle(0x15121a, 1).fillCircle(0, 0, DISC_R * 0.72);
    g.lineStyle(10, 0x2a2430, 1).strokeCircle(0, 0, DISC_R + 13);
    g.lineStyle(2, 0x4a3f52, 1).strokeCircle(0, 0, DISC_R);
    g.lineStyle(2, 0x3a3242, 1).strokeCircle(0, 0, DISC_R * 0.72);
    // faint colour per sector
    for (const dir of Object.keys(SECTOR_DEG) as Direction[]) {
      const c = SECTOR_DEG[dir];
      g.fillStyle(DIRECTION_INFO[dir].color, 0.05);
      g.slice(0, 0, DISC_R - 4, Phaser.Math.DegToRad(c - SECTOR_HALF + 1), Phaser.Math.DegToRad(c + SECTOR_HALF - 1), false);
      g.fillPath();
    }
    // sector walls with a small ornament at each end
    for (const dir of Object.keys(SECTOR_DEG) as Direction[]) {
      const a = Phaser.Math.DegToRad(SECTOR_DEG[dir] + SECTOR_HALF);
      const [c, s] = [Math.cos(a), Math.sin(a)];
      g.lineStyle(6, 0x0d0b10, 1).lineBetween(c * INNER_R, s * INNER_R, c * DISC_R, s * DISC_R);
      g.lineStyle(2, 0x4a3f52, 1).lineBetween(c * INNER_R, s * INNER_R, c * DISC_R, s * DISC_R);
      for (const r of [DISC_R, DISC_R * 0.72]) {
        const [x, y] = [c * r, s * r];
        g.fillStyle(0x6a5a44, 1).fillPoints([new Phaser.Math.Vector2(x + c * 12, y + s * 12), new Phaser.Math.Vector2(x - s * 7, y + c * 7), new Phaser.Math.Vector2(x - c * 12, y - s * 12), new Phaser.Math.Vector2(x + s * 7, y - c * 7)], true);
      }
      const d = DIRECTION_INFO[dir];
      const ca = Phaser.Math.DegToRad(SECTOR_DEG[dir]);
      this.map.add(label(this, Math.cos(ca) * (DISC_R + 2), Math.sin(ca) * (DISC_R + 2), `${d.arrow} ${d.name}`, 30, d.color, { weight: 900, origin: [0.5, 0.5] }).setStroke('#0d0b10', 8).setAlpha(0.85));
    }
    // the anvil's ring
    g.fillStyle(0x0d0b10, 1).fillCircle(0, 0, INNER_R);
    g.lineStyle(3, 0x6a5a44, 1).strokeCircle(0, 0, INNER_R);
    // dust of tiny stars on the stone
    const rnd = new Phaser.Math.RandomDataGenerator(['disc-dust']);
    for (let i = 0; i < 260; i++) {
      const r = rnd.realInRange(INNER_R + 10, DISC_R - 10);
      const a = rnd.realInRange(0, Math.PI * 2);
      g.fillStyle(0xd8cfff, rnd.realInRange(0.05, 0.22)).fillCircle(Math.cos(a) * r, Math.sin(a) * r, rnd.realInRange(0.8, 2));
    }
  }

  private starAt(px: number, py: number): TreeNode | null {
    let best: TreeNode | null = null;
    let bestD = Infinity;
    for (const v of this.views) {
      const n = v.node;
      const d = Math.hypot(px - (this.map.x + n.x * this.zoom), py - (this.map.y + n.y * this.zoom));
      if (d < Math.max(18, radiusOf(n) * this.zoom + 10) && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  /** Zoom around a screen point (default: the map centre); `home` also brings the disc back to the middle. */
  private zoomTo(z: number, px = MAP_CX, py = MAP_CY, home = false) {
    const nz = Phaser.Math.Clamp(z, ZOOM.min, ZOOM.max);
    const wx = (px - this.map.x) / this.zoom;
    const wy = (py - this.map.y) / this.zoom;
    this.zoom = nz;
    const tx = home ? MAP_CX : px - wx * nz;
    const ty = home ? MAP_CY : py - wy * nz;
    this.tweens.killTweensOf(this.map);
    this.tweens.add({ targets: this.map, x: tx, y: ty, scale: nz, duration: 180, ease: 'Cubic.easeOut', onComplete: () => this.refresh() });
  }

  private refresh() {
    const s = this.core.state;
    this.goldText.setText(`${s.gold.toLocaleString()} G`);
    this.countText.setText(`배운 별 ${ownedCount(s)} / ${TREE.length - 1} · 이어진 별만 배울 수 있습니다`);
    this.buyable = new Set();
    // lines first: learned ones glow warm white, the rest are faint threads
    const l = this.links;
    l.clear();
    for (const n of TREE) {
      if (!n.from) continue;
      const f = TREE_BY_ID[n.from];
      if (ownsNode(s, n.id)) {
        l.lineStyle(12, colorOf(n), 0.16).lineBetween(f.x, f.y, n.x, n.y);
        l.lineStyle(3.5, 0xfff1c8, 0.95).lineBetween(f.x, f.y, n.x, n.y);
      } else if (ownsNode(s, n.from)) {
        l.lineStyle(2.5, colorOf(n), 0.55).lineBetween(f.x, f.y, n.x, n.y);
      } else {
        l.lineStyle(2.5, 0xd8d0e8, 0.42).lineBetween(f.x, f.y, n.x, n.y);
      }
    }
    const zoomedIn = this.zoom >= 0.85;
    for (const v of this.views) {
      const n = v.node;
      const owned = ownsNode(s, n.id);
      const open = !owned && n.from !== null && ownsNode(s, n.from);
      if (open) this.buyable.add(n.id);
      const col = colorOf(n);
      const r = radiusOf(n);
      const g = v.g;
      g.clear().setAlpha(1);
      if (owned) {
        for (let k = 3; k >= 1; k--) g.fillStyle(col, 0.1 * k).fillCircle(0, 0, r + k * (n.major ? 7 : 4));
        g.fillStyle(col, 1).fillCircle(0, 0, r);
        g.fillStyle(0xffffff, 0.9).fillCircle(0, 0, r * 0.42);
      } else if (open) {
        g.fillStyle(0x100d16, 1).fillCircle(0, 0, r);
        g.lineStyle(n.major ? 4 : 3, col, 1).strokeCircle(0, 0, r);
        g.fillStyle(col, 0.3).fillCircle(0, 0, r * 0.55);
      } else {
        g.fillStyle(0x100d16, 1).fillCircle(0, 0, r);
        g.lineStyle(2.5, 0xd8d0e8, 0.8).strokeCircle(0, 0, r);
        g.fillStyle(mixDot(col), 0.9).fillCircle(0, 0, r * 0.35);
        if (n.major) g.lineStyle(1.5, 0xd8d0e8, 0.45).strokeCircle(0, 0, r - 6);
      }
      if (n.major && n.id !== 'root') g.lineStyle(1.5, owned ? 0xffffff : col, owned ? 0.7 : 0.35).strokeCircle(0, 0, r + 6);
      if (n.id === this.selected) g.lineStyle(3, 0xffffff, 1).strokeCircle(0, 0, r + (n.major ? 14 : 9));
      if (v.name) {
        v.name.setVisible(n.major || zoomedIn || n.id === this.selected);
        v.name.setColor(css(owned ? 0xffffff : open ? col : C.mute));
      }
    }
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
    const dirName = n.dir === 'root' ? '시작점' : `${DIRECTION_INFO[n.dir].arrow} ${DIRECTION_INFO[n.dir].name} · ${n.major ? '큰 별' : '작은 별'}`;
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
    this.selected = id;
    this.sfx.click();
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
    const x = this.map.x + n.x * this.zoom;
    const y = this.map.y + n.y * this.zoom;
    const col = colorOf(n);
    const ring = this.add.image(x, y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.2);
    this.tweens.add({ targets: ring, scale: n.major ? 1.4 : 0.8, alpha: 0, duration: 560, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const burst = this.add.particles(x, y, 'spark', { speed: { min: 50, max: n.major ? 240 : 140 }, lifespan: 480, scale: { start: 0.5, end: 0 }, tint: col, blendMode: 'ADD', emitting: false });
    burst.explode(n.major ? 26 : 12);
    this.time.delayedCall(600, () => burst.destroy());
    // move on to the cheapest star that just opened up, if any
    const next = TREE.filter((m) => m.from === r.id).sort((a, b) => a.cost - b.cost)[0];
    if (next) this.selected = next.id;
    this.refresh();
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
