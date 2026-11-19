// Constellation skill tree (§17 스킬트리 UI): drag to pan, wheel to zoom, links, locked / available /
// learned states, search, branch filters, reset, and a detail panel for the selected node.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { checkLearn, isLearned, skillTotals, spentPoints, type LearnBlock } from '../../core/systems/skills';
import { itemCount } from '../../core/systems/economy';
import { isTutorialDone } from '../../core/systems/tutorial';
import { BRANCHES, ROOT_ID, SKILL_BY_ID, SKILL_NODES, nodePos, type Branch, type SkillEffects, type SkillNode } from '../../config/skills';
import { ELEMENT_INFO } from '../../config/weapons';
import { C, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

// Landscape: star map on the left, detail panel on the right. Portrait: map on top, panel at the bottom.
const PANEL_W = PORTRAIT ? W : 340;
const PANEL_H = PORTRAIT ? 470 : H;
const PANEL_X = PORTRAIT ? 0 : W - PANEL_W;
const PANEL_Y = PORTRAIT ? H - PANEL_H : 0;
const MAP_W = PORTRAIT ? W : W - PANEL_W;
const MAP_H = PORTRAIT ? H - PANEL_H : H;
/** Top bar height: one row in landscape, two (title, filters) in portrait. */
const TOP_H = PORTRAIT ? 116 : 60;
const VIEW_CX = MAP_W / 2;
const VIEW_CY = PORTRAIT ? (TOP_H + MAP_H) / 2 : H / 2 + 30;

/**
 * Which nodes a node unlocks (its `links`), inverted: a node is revealed once any node that links to it
 * is learned (user request 2026-11-19: learn one, and the next ones appear).
 */
const PARENTS: Record<string, string[]> = {};
for (const n of SKILL_NODES) for (const id of n.links) (PARENTS[id] ??= []).push(n.id);

const BLOCK_TEXT: Record<LearnBlock, string> = {
  unknown: '',
  learned: '이미 습득했습니다',
  locked: '연결된 노드를 먼저 습득해야 합니다',
  points: '스킬 포인트가 부족합니다',
  night: '밤에는 스킬을 바꿀 수 없습니다',
};

/** Readable lines for the "current effects" summary. */
const STAT_LABEL: [keyof SkillEffects, string, (v: number) => string][] = [
  ['damage', '피해', (v) => `+${Math.round(v * 100)}%`],
  ['mastery', '무기 숙련 피해', (v) => `+${Math.round(v * 100)}%`],
  ['attackSpeed', '공격 속도', (v) => `+${Math.round(v * 100)}%`],
  ['critChance', '치명타 확률', (v) => `+${Math.round(v * 100)}%`],
  ['critDamage', '치명타 피해', (v) => `+${Math.round(v * 100)}%`],
  ['area', '공격 범위', (v) => `+${Math.round(v * 100)}%`],
  ['maxHp', '최대 HP', (v) => `+${v}`],
  ['regen', 'HP 회복', (v) => `${v.toFixed(1)}/초`],
  ['armor', '받는 피해', (v) => `−${Math.round(v * 100)}%`],
  ['moveSpeed', '이동 속도', (v) => `+${Math.round(v * 100)}%`],
  ['dodgeCooldown', '회피 대기', (v) => `−${Math.round(v * 100)}%`],
  ['sellBonus', '판매 가격', (v) => `+${Math.round(v * 100)}%`],
  ['discount', '상인 가격', (v) => `−${Math.round(v * 100)}%`],
  ['enhanceSuccess', '강화 성공', (v) => `+${v}%p`],
  ['enhanceGreat', '강화 대성공', (v) => `+${v}%p`],
  ['enhanceSafety', '강화 파괴', (v) => `−${v}%p`],
];

interface NodeView {
  node: SkillNode;
  g: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  x: number;
  y: number;
  r: number;
}

export class SkillScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private tree!: Phaser.GameObjects.Container;
  private links!: Phaser.GameObjects.Graphics;
  private views: NodeView[] = [];
  private selected: string | null = null;
  private filter: Branch | null = null;
  private query = '';
  private search: HTMLInputElement | null = null;
  private drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
  private pointsText!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Container;
  private resetBtn!: Button;
  private filterBtns: { b: Branch | null; btn: Button }[] = [];
  private closing = false;
  /** Nodes already shown, so newly revealed ones can pop in. */
  private shown = new Set<string>();

  constructor() {
    super('Skills');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.closing = false;
    this.views = [];
    this.filterBtns = [];
    this.selected = null;
    this.filter = null;
    this.query = '';
    this.shown = new Set();

    // night sky
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05060c, 0x05060c, 0x0d0a14, 0x0d0a14, 1);
    bg.fillRect(0, 0, W, H);
    const rnd = new Phaser.Math.RandomDataGenerator(['stars']);
    for (let i = 0; i < 160; i++) {
      bg.fillStyle(0xffffff, rnd.realInRange(0.08, 0.5));
      bg.fillCircle(rnd.between(0, W), rnd.between(0, H), rnd.realInRange(0.5, 1.6));
    }
    const hit = this.add.zone(0, 0, MAP_W, MAP_H).setOrigin(0).setInteractive();

    // Start zoomed out enough to see the whole constellation (the attack arm reaches furthest).
    this.tree = this.add.container(VIEW_CX, VIEW_CY + (PORTRAIT ? 0 : 45)).setScale(PORTRAIT ? 0.95 : 0.62);
    this.links = this.add.graphics();
    this.tree.add(this.links);
    for (const node of SKILL_NODES) this.buildNode(node);

    this.buildTopBar();
    this.buildPanel();
    if (!PORTRAIT) this.buildSearch(); // no room for a search box on a phone; everything is a tap away

    // pan & zoom
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => (this.drag = { x: p.x, y: p.y, tx: this.tree.x, ty: this.tree.y, moved: false }));
    // two-finger pinch zoom on phones
    this.input.addPointer(1);
    let pinch: number | null = null;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (pinch) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        this.drag = null;
        return;
      }
      pinch = null;
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      this.tree.setPosition(this.drag.tx + dx, this.drag.ty + dy);
    });
    this.input.on('pointerup', () => (this.drag = null));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (p.x > MAP_W || p.y > MAP_H) return;
      this.zoomAt(p.x, p.y, dy > 0 ? 0.88 : 1.14);
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.typing() || this.close());
    kb.on('keydown-K', () => this.typing() || this.close());
    kb.on('keydown-ENTER', () => !this.typing() && this.learnSelected());
    kb.on('keydown-PLUS', () => this.zoomAt(VIEW_CX, VIEW_CY, 1.14));
    kb.on('keydown-MINUS', () => this.zoomAt(VIEW_CX, VIEW_CY, 0.88));

    if (!isTutorialDone(this.core.state, 'firstSkillPoint')) this.core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstSkillPoint' });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeSearch());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.refresh();
  }

  // ───────────────────────── building
  private buildNode(node: SkillNode) {
    const { x, y } = nodePos(node);
    const r = node.id === ROOT_ID ? 30 : node.keystone ? 27 : 19;
    const g = this.add.graphics({ x, y });
    const name = label(this, x, y + r + 14, node.name, node.keystone ? 18 : 15, C.mute, { weight: node.keystone ? 900 : 700, origin: [0.5, 0.5] });
    const zone = this.add.zone(x, y, r * 2 + 10, r * 2 + 10).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (this.drag?.moved) return;
      if (this.selected === node.id && checkLearn(this.core.state, node.id) === null) this.learnSelected();
      else this.select(node.id);
    });
    zone.on('pointerover', () => g.setScale(1.12));
    zone.on('pointerout', () => g.setScale(1));
    this.tree.add([g, name, zone]);
    this.views.push({ node, g, name, zone, x, y, r });
  }

  private buildTopBar() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, MAP_W, TOP_H);
    label(this, 24, 30, '별자리 스킬트리', 22, C.gold, { display: true, weight: 900, origin: [0, 0.5] });
    this.pointsText = label(this, PORTRAIT ? W - 24 : 220, 30, '', 17, 0x7fe9ff, { weight: 900, origin: [PORTRAIT ? 1 : 0, 0.5] });
    const opts: [Branch | null, string][] = [[null, '전체'], ['attack', '공격'], ['survival', '생존'], ['element', '원소'], ['smith', '대장장이']];
    opts.forEach(([b, text], i) => {
      const btn = PORTRAIT
        ? new Button(this, 24 + 66 + i * 136, 84, 128, 40, text, { variant: 'ghost', size: 15, onClick: () => this.setFilter(b) })
        : new Button(this, 420 + i * 72, 30, 66, 34, text, { variant: 'ghost', size: 13, onClick: () => this.setFilter(b) });
      this.filterBtns.push({ b, btn });
    });
    const help = PORTRAIT
      ? '드래그 이동 · 노드를 눌러 선택, 한 번 더 눌러 습득 · 찍으면 다음 별이 열립니다'
      : '드래그 이동 · 휠 확대/축소 · 노드 클릭 선택, 다시 클릭(또는 Enter) 습득 · 찍으면 다음 별이 열립니다 · K/Esc 닫기';
    label(this, 24, MAP_H - 20, help, 12, C.dim, { origin: [0, 0.5] });
  }

  private buildPanel() {
    const g = this.add.graphics();
    g.fillStyle(0x0f0c0a, 0.96);
    g.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    g.lineStyle(1, C.edge, 1);
    if (PORTRAIT) g.lineBetween(0, PANEL_Y + 0.5, W, PANEL_Y + 0.5);
    else g.lineBetween(PANEL_X + 0.5, 0, PANEL_X + 0.5, H);
    this.detail = this.add.container(PANEL_X, PANEL_Y);
    if (PORTRAIT) {
      // reset and close side by side along the bottom of the panel
      const bw = (W - 60) / 2;
      this.resetBtn = new Button(this, 24 + bw / 2, H - 50, bw, 56, '스킬 초기화', { variant: 'dark', size: 15, sub: '', onClick: () => this.reset() });
      new Button(this, W - 24 - bw / 2, H - 50, bw, 56, '대장간으로', { variant: 'gold', sub: '', onClick: () => this.close() });
    } else {
      this.resetBtn = new Button(this, PANEL_X + PANEL_W / 2, H - 112, PANEL_W - 48, 46, '스킬 초기화', { variant: 'dark', size: 15, sub: '', onClick: () => this.reset() });
      new Button(this, PANEL_X + PANEL_W / 2, H - 52, PANEL_W - 48, 52, '대장간으로', { variant: 'gold', sub: 'K · Esc', onClick: () => this.close() });
    }
  }

  /** Native text input over the canvas, so Korean IME works for node search. */
  private buildSearch() {
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '노드 검색';
    Object.assign(input.style, {
      position: 'fixed',
      zIndex: '10',
      background: '#15110e',
      color: '#efe6d6',
      border: '1px solid #5a4632',
      borderRadius: '8px',
      padding: '0 10px',
      font: '14px "Noto Sans KR", sans-serif',
      outline: 'none',
    });
    input.addEventListener('input', () => {
      this.query = input.value.trim();
      this.refresh();
    });
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') this.focusFirstMatch();
      if (ev.key === 'Escape') input.blur();
    });
    input.addEventListener('focus', () => this.input.keyboard?.disableGlobalCapture());
    input.addEventListener('blur', () => this.input.keyboard?.enableGlobalCapture());
    document.body.appendChild(input);
    this.search = input;
    this.placeSearch();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.placeSearch, this);
    window.addEventListener('resize', this.placeSearch);
  }

  private placeSearch = () => {
    if (!this.search) return;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / W;
    Object.assign(this.search.style, {
      left: `${rect.left + 790 * k}px`,
      top: `${rect.top + 13 * k}px`,
      width: `${(W - PANEL_W - 790 - 20) * k}px`,
      height: `${34 * k}px`,
      fontSize: `${14 * k}px`,
    });
  };

  private removeSearch() {
    window.removeEventListener('resize', this.placeSearch);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.placeSearch, this);
    this.search?.remove();
    this.search = null;
    this.input.keyboard?.enableGlobalCapture();
  }

  private typing(): boolean {
    return !!this.search && document.activeElement === this.search;
  }

  // ───────────────────────── state → screen
  /** Visible on the map: the root, anything learned, and anything a learned node leads to. */
  private revealed(id: string): boolean {
    const s = this.core.state;
    return id === ROOT_ID || isLearned(s, id) || (PARENTS[id] ?? []).some((p) => isLearned(s, p));
  }

  private matches(n: SkillNode): boolean {
    if (!this.revealed(n.id)) return false;
    if (this.filter && n.branch !== this.filter && n.id !== ROOT_ID) return false;
    if (this.query && !(n.name.includes(this.query) || n.desc.includes(this.query))) return false;
    return true;
  }

  private refresh() {
    const s = this.core.state;
    this.pointsText.setText(`스킬 포인트 ${s.player.skillPoints}`);
    this.filterBtns.forEach(({ b, btn }) => btn.setAlpha(this.filter === b ? 1 : 0.55));

    // links
    const lg = this.links;
    lg.clear();
    for (const v of this.views) {
      if (!this.revealed(v.node.id)) continue;
      for (const id of v.node.links) {
        if (!this.revealed(id)) continue; // the way onward stays dark until it opens
        const o = this.views.find((w) => w.node.id === id)!;
        const a = isLearned(s, v.node.id);
        const b = isLearned(s, id);
        const branch = o.node.branch;
        const dim = !this.matches(v.node) || !this.matches(o.node);
        const col = BRANCHES[branch].color;
        if (a && b) lg.lineStyle(4, col, dim ? 0.25 : 0.95);
        else if (a || b) lg.lineStyle(2, col, dim ? 0.12 : 0.45);
        else lg.lineStyle(2, 0x3a3346, dim ? 0.2 : 0.6);
        lg.lineBetween(v.x, v.y, o.x, o.y);
      }
    }

    const fresh: NodeView[] = [];
    const firstLook = this.shown.size === 0;
    for (const v of this.views) {
      const n = v.node;
      // hidden until a node leading to it is learned: nothing drawn, not even its name
      const open = this.revealed(n.id);
      v.g.setVisible(open);
      v.name.setVisible(open);
      v.zone.setVisible(open);
      if (open) v.zone.setInteractive();
      else v.zone.disableInteractive();
      if (!open) continue;
      if (!this.shown.has(n.id)) {
        // the first refresh just records what is open; later ones pop new stars in
        if (!firstLook) fresh.push(v);
        this.shown.add(n.id);
      }
      const learned = isLearned(s, n.id);
      const block = checkLearn(s, n.id);
      const available = block === null || block === 'points';
      const col = n.id === ROOT_ID ? C.goldHi : BRANCHES[n.branch].color;
      const g = v.g;
      g.clear();
      if (learned) {
        for (let i = 3; i >= 1; i--) {
          g.fillStyle(col, 0.08 * i);
          g.fillCircle(0, 0, v.r + i * 5);
        }
        g.fillStyle(col, 1);
        g.fillCircle(0, 0, v.r);
        g.fillStyle(0xffffff, 0.35);
        g.fillCircle(-v.r * 0.3, -v.r * 0.3, v.r * 0.35);
      } else {
        g.fillStyle(0x14111c, 1);
        g.fillCircle(0, 0, v.r);
        g.lineStyle(available ? 3 : 2, available ? col : 0x4a4256, available ? 1 : 0.8);
        g.strokeCircle(0, 0, v.r);
      }
      if (n.keystone) {
        g.lineStyle(2, learned ? 0xffffff : col, learned ? 0.8 : 0.5);
        g.strokeCircle(0, 0, v.r + 6);
      }
      if (n.element) {
        g.fillStyle(ELEMENT_INFO[n.element].color, 1);
        g.fillCircle(v.r * 0.72, -v.r * 0.72, 5);
        g.lineStyle(1.5, 0x000000, 1);
        g.strokeCircle(v.r * 0.72, -v.r * 0.72, 5);
      }
      if (n.id === this.selected) {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeCircle(0, 0, v.r + (n.keystone ? 11 : 7));
      }
      const show = this.matches(n);
      g.setAlpha(show ? 1 : 0.18);
      v.name.setAlpha(show ? 1 : 0.15).setColor(css(learned ? C.text : available ? C.mute : C.dim));
    }

    fresh.forEach((v, i) => this.popIn(v, i));

    const books = itemCount(s, 'resetBook');
    this.resetBtn.setLabel(`스킬 초기화 (서적 ${books})`);
    this.resetBtn.setEnabled(books > 0 && spentPoints(s) > 0);
    this.renderDetail();
  }

  private renderDetail() {
    const d = this.detail;
    d.removeAll(true);
    const s = this.core.state;
    const node = this.selected ? SKILL_BY_ID[this.selected] : null;
    const pad = 24;
    if (!node) {
      d.add(label(this, pad, 28, '현재 효과', 20, C.gold, { weight: 900 }));
      d.add(label(this, pad, 58, `습득 ${SKILL_NODES.filter((n) => n.id !== ROOT_ID && isLearned(s, n.id)).length} / ${SKILL_NODES.length - 1} · 사용 포인트 ${spentPoints(s)}`, 13, C.mute, { weight: 700 }));
      const t = skillTotals(s, null, true);
      const lines = STAT_LABEL.filter(([k]) => t[k] !== 0).map(([k, name, f]) => `${name}  ${f(t[k])}`);
      const el = SKILL_NODES.filter((n) => n.element && isLearned(s, n.id)).map((n) => `${ELEMENT_INFO[n.element!].name} · ${n.name}`);
      const body = lines.length || el.length ? [...lines, ...(el.length ? ['', '원소 (해당 속성 무기 장착 시)', ...el] : [])].join('\n') : '아직 습득한 스킬이 없습니다.\n\n밤을 버텨 레벨이 오르면 스킬 포인트를 받습니다.\n중앙의 맹세에서 이어진 노드부터 습득할 수 있습니다.';
      d.add(label(this, pad, 92, body, 14, C.text, { lineSpacing: 7, wrap: PANEL_W - pad * 2 }));
      return;
    }
    const col = node.id === ROOT_ID ? C.goldHi : BRANCHES[node.branch].color;
    d.add(label(this, pad, 26, node.id === ROOT_ID ? '시작점' : `${BRANCHES[node.branch].name} 계열${node.keystone ? ' · 주요 노드' : ''}`, 13, col, { weight: 900 }));
    d.add(label(this, pad, 50, node.name, 26, C.text, { weight: 900 }));
    let y = 96;
    if (node.element) {
      const e = ELEMENT_INFO[node.element];
      d.add(label(this, pad, y, `● ${e.name} 속성 무기를 장착했을 때 작동`, 13, e.color, { weight: 700 }));
      y += 28;
    }
    const desc = label(this, pad, y, node.desc, 16, C.text, { lineSpacing: 8, wrap: PANEL_W - pad * 2 });
    d.add(desc);
    y += desc.height + 24;
    if (node.id === ROOT_ID) return;
    const learned = isLearned(s, node.id);
    d.add(label(this, pad, y, learned ? '습득 완료' : `비용  ${node.cost} 포인트`, 15, learned ? col : C.goldHi, { weight: 900 }));
    y += 32;
    if (learned) return;
    const block = checkLearn(s, node.id);
    const btn = new Button(this, PANEL_W / 2, y + 30, PANEL_W - 48, 56, '습득', {
      variant: block ? 'dark' : 'gold',
      size: 20,
      sub: block ? BLOCK_TEXT[block] : 'Enter · 다시 클릭',
      onClick: () => this.learnSelected(),
    });
    btn.setEnabled(!block);
    d.add(btn);
  }

  // ───────────────────────── actions
  private select(id: string) {
    this.selected = this.selected === id ? null : id;
    this.sfx.click();
    this.refresh();
  }

  private learnSelected() {
    if (!this.selected) return;
    const r = this.core.dispatch({ type: 'LEARN_SKILL', id: this.selected });
    if (r.type !== 'learned') {
      this.sfx.denied();
      return;
    }
    const v = this.views.find((w) => w.node.id === r.id)!;
    this.sfx.levelUp();
    const ring = this.add.image(0, 0, 'ring').setTint(BRANCHES[v.node.branch].color).setBlendMode('ADD').setScale(0.3);
    ring.setPosition(v.x, v.y);
    this.tree.add(ring);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const burst = this.add.particles(0, 0, 'spark', { speed: { min: 60, max: 200 }, lifespan: 500, scale: { start: 0.6, end: 0 }, tint: BRANCHES[v.node.branch].color, blendMode: 'ADD', emitting: false });
    burst.setPosition(v.x, v.y);
    this.tree.add(burst);
    burst.explode(18);
    this.time.delayedCall(600, () => burst.destroy());
    this.refresh();
  }

  /** "짠": a newly opened star grows out of nothing with a ring of light and a NEW tag. */
  private popIn(v: NodeView, i: number) {
    const col = BRANCHES[v.node.branch].color;
    const delay = 250 + i * 160;
    for (const o of [v.g, v.name]) {
      o.setScale(0).setAlpha(0);
      this.tweens.add({ targets: o, scale: 1, alpha: 1, delay, duration: 420, ease: 'Back.easeOut' });
    }
    const ring = this.add.image(v.x, v.y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.1).setAlpha(0);
    this.tree.add(ring);
    this.tweens.add({ targets: ring, alpha: 1, delay, duration: 1 });
    this.tweens.add({ targets: ring, scale: 1.1, alpha: 0, delay, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const tag = label(this, v.x, v.y - v.r - 22, 'NEW', 14, 0xffffff, { weight: 900, origin: [0.5, 0.5] }).setStroke(css(col), 5).setAlpha(0);
    this.tree.add(tag);
    this.tweens.add({ targets: tag, alpha: 1, y: tag.y - 8, delay: delay + 200, duration: 300 });
    this.tweens.add({ targets: tag, alpha: 0, delay: delay + 2200, duration: 500, onComplete: () => tag.destroy() });
    this.time.delayedCall(delay, () => this.sfx.click());
  }

  private reset() {
    const s = this.core.state;
    const n = spentPoints(s);
    if (!n || itemCount(s, 'resetBook') <= 0) return;
    const r = this.core.dispatch({ type: 'RESET_SKILLS' });
    if (r.type === 'skillsReset') {
      this.sfx.coin();
      this.cameras.main.flash(300, 200, 180, 255);
      this.selected = null;
      this.shown = new Set(); // the map closes up again; stars pop in anew as they are relearned
      this.refresh();
    }
  }

  private setFilter(b: Branch | null) {
    this.filter = b;
    this.sfx.click();
    this.refresh();
  }

  private focusFirstMatch() {
    if (!this.query) return;
    const v = this.views.find((w) => w.node.id !== ROOT_ID && this.matches(w.node));
    if (!v) return;
    this.selected = v.node.id;
    const s = this.tree.scale;
    this.tweens.add({ targets: this.tree, x: VIEW_CX - v.x * s, y: VIEW_CY - v.y * s, duration: 300, ease: 'Cubic.easeOut' });
    this.refresh();
  }

  private zoomAt(px: number, py: number, k: number) {
    const t = this.tree;
    const next = Phaser.Math.Clamp(t.scale * k, 0.45, 1.8);
    const f = next / t.scale;
    t.setPosition(px - (px - t.x) * f, py - (py - t.y) * f);
    t.setScale(next);
  }

  private close() {
    if (this.closing) return;
    this.closing = true;
    this.removeSearch();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.resume('Forge');
      this.scene.stop();
    });
  }
}
