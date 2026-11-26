import Phaser from 'phaser';
import { C, label } from '../theme';

export type Variant = 'gold' | 'dark' | 'danger' | 'ghost';

export interface ButtonOpts {
  variant?: Variant;
  sub?: string;
  size?: number;
  /** Font size of the sub line (default 12). */
  subSize?: number;
  onClick: () => void;
}

const LOOK: Record<Variant, { fill: number; hover: number; edge: number; text: number; sub: number }> = {
  gold: { fill: 0xc98a2e, hover: 0xe3a443, edge: 0xffe2a0, text: 0x1a0f05, sub: 0x3a2208 },
  dark: { fill: 0x1f1a16, hover: 0x2b241e, edge: 0x5a4632, text: C.text, sub: C.mute },
  danger: { fill: 0x9e1c22, hover: 0xc02830, edge: 0xff8a8a, text: 0xfff1f1, sub: 0xffcaca },
  ghost: { fill: 0x000000, hover: 0x1a1612, edge: 0x4a3c2c, text: C.mute, sub: C.dim },
};

// ───────────────────────── keyboard and screen-reader access (QA 2026-11-20)
// The buttons are drawn on the canvas, which Tab and screen readers cannot see. Each Button therefore
// gets a real, visually hidden <button> in the page: Tab moves through them, the canvas draws the focus
// ring, Enter/Space press the button, and the accessibility tree lists them with their labels.
const live = new Set<Button>();
let layer: HTMLDivElement | null = null;
let orderDirty = false;
const syncedGames = new WeakSet<Phaser.Game>();

function a11yLayer(): HTMLDivElement {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'a11y-buttons';
  // visually hidden but focusable and readable (not display:none)
  layer.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  document.body.appendChild(layer);
  return layer;
}

/** Called once per rendered frame: hide buttons of paused or hidden scenes, keep Tab order top-to-bottom. */
function syncA11y(game: Phaser.Game) {
  const keys = game.scene.getScenes(false).map((s) => s.sys.settings.key);
  for (const b of live) if (b.scene?.game === game) b.syncDom();
  if (!orderDirty || !layer || layer.contains(document.activeElement)) return;
  orderDirty = false;
  const list = [...live].filter((b) => b.scene?.game === game);
  list.sort((a, b) => b.sceneOrder(keys) - a.sceneOrder(keys) || a.worldY() - b.worldY() || a.worldX() - b.worldX());
  for (const b of list) layer.appendChild(b.dom);
}

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly main: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text | null;
  private enabled = true;
  private hover = false;
  private pressed = false;
  private focused = false;
  /** The hidden page button that stands in for this one for Tab and screen readers. */
  readonly dom: HTMLButtonElement;
  private domShown = false;
  private keyAt = -1e9;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bw: number,
    private readonly bh: number,
    text: string,
    private readonly opts: ButtonOpts,
  ) {
    super(scene, x, y);
    const look = LOOK[opts.variant ?? 'dark'];
    const size = opts.size ?? 18;
    this.bg = scene.add.graphics();
    const subSize = opts.subSize ?? 12;
    this.main = label(scene, 0, opts.sub ? -Math.round(subSize * 0.75) : 0, text, size, look.text, { weight: 700, origin: [0.5, 0.5] });
    this.subText = opts.sub ? label(scene, 0, size * 0.55 + subSize / 3, opts.sub, subSize, look.sub, { weight: subSize > 12 ? 700 : 400, origin: [0.5, 0.5] }) : null;
    this.add([this.bg, this.main, ...(this.subText ? [this.subText] : [])]);
    this.setSize(bw, bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { this.hover = true; this.redraw(); });
    this.on('pointerout', () => { this.hover = false; this.pressed = false; this.redraw(); });
    this.on('pointerdown', () => { this.pressed = true; this.redraw(); });
    this.on('pointerup', () => {
      const fire = this.pressed && this.enabled;
      this.pressed = false;
      this.redraw();
      if (fire) this.opts.onClick();
    });
    scene.add.existing(this);

    this.dom = document.createElement('button');
    this.dom.type = 'button';
    this.dom.hidden = true;
    this.updateDomLabel();
    this.dom.addEventListener('focus', () => { this.focused = true; this.redraw(); });
    this.dom.addEventListener('blur', () => { this.focused = false; this.redraw(); });
    this.dom.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // the scene's own Space/Enter shortcuts must not fire a second time
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) {
        this.keyAt = performance.now();
        this.activate();
      }
    });
    this.dom.addEventListener('keyup', (e) => {
      if (e.key === ' ') e.preventDefault();
    });
    // screen readers press buttons with a click, not a key; a click right after our own key press is its echo
    this.dom.addEventListener('click', () => {
      if (performance.now() - this.keyAt > 400) this.activate();
    });
    a11yLayer().appendChild(this.dom);
    live.add(this);
    orderDirty = true;
    if (!syncedGames.has(scene.game)) {
      syncedGames.add(scene.game);
      const game = scene.game;
      game.events.on(Phaser.Core.Events.POST_RENDER, () => syncA11y(game));
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      live.delete(this);
      this.dom.remove();
    });
    this.redraw();
  }

  private activate() {
    if (!this.enabled || !this.domShown) return;
    // a short pressed look, like a click
    this.pressed = true;
    this.redraw();
    this.scene?.time.delayedCall(90, () => { this.pressed = false; this.redraw(); });
    this.opts.onClick();
  }

  private updateDomLabel() {
    const sub = this.subText?.text.trim();
    const text = sub ? `${this.main.text} · ${sub}` : this.main.text;
    if (this.dom.textContent !== text) this.dom.textContent = text;
  }

  /** Index of the scene in the draw order (higher = on top, comes first for Tab). */
  sceneOrder(keys: string[]) {
    return keys.indexOf(this.scene?.sys.settings.key ?? '');
  }

  worldY() {
    return this.getWorldTransformMatrix().ty;
  }

  worldX() {
    return this.getWorldTransformMatrix().tx;
  }

  /** Mirror visibility, enabled state and label into the hidden page button. */
  syncDom() {
    let shown = this.active && this.scene?.sys.settings.status === Phaser.Scenes.RUNNING && this.scene.sys.settings.visible;
    for (let o: Phaser.GameObjects.Container | null = this; shown && o; o = o.parentContainer) if (!o.visible || o.alpha < 0.05) shown = false;
    shown = !!shown;
    if (shown !== this.domShown) {
      this.domShown = shown;
      this.dom.hidden = !shown;
      if (!shown && document.activeElement === this.dom) this.dom.blur();
      orderDirty = true;
    }
    const dis = String(!this.enabled);
    if (this.dom.getAttribute('aria-disabled') !== dis) this.dom.setAttribute('aria-disabled', dis);
    this.updateDomLabel();
  }

  private redraw() {
    const look = LOOK[this.opts.variant ?? 'dark'];
    const fill = this.enabled && this.hover ? look.hover : look.fill;
    const g = this.bg;
    g.clear();
    const dy = this.pressed && this.enabled ? 2 : 0;
    if (this.opts.variant === 'gold' && this.enabled) {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-this.bw / 2, -this.bh / 2 + 4, this.bw, this.bh, 9);
    }
    g.fillStyle(fill, this.opts.variant === 'ghost' ? 0.6 : 1);
    g.fillRoundedRect(-this.bw / 2, -this.bh / 2 + dy, this.bw, this.bh, 9);
    g.lineStyle(this.hover && this.enabled ? 2 : 1, look.edge, this.enabled ? 1 : 0.4);
    g.strokeRoundedRect(-this.bw / 2 + 0.5, -this.bh / 2 + 0.5 + dy, this.bw - 1, this.bh - 1, 9);
    if (this.focused) {
      // keyboard focus ring, outside the button so it reads on every variant
      g.lineStyle(3, 0x7fd4ff, 1);
      g.strokeRoundedRect(-this.bw / 2 - 4, -this.bh / 2 - 4 + dy, this.bw + 8, this.bh + 8, 12);
    }
    this.main.y = (this.subText ? -9 : 0) + dy;
    if (this.subText) this.subText.y = (this.opts.size ?? 18) * 0.55 + 4 + dy;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.42);
    if (this.input) this.input.cursor = on ? 'pointer' : 'default';
    this.redraw();
    return this;
  }

  isEnabled() {
    return this.enabled;
  }

  setLabel(text: string, sub?: string): this {
    this.main.setText(text);
    if (this.subText && sub !== undefined) this.subText.setText(sub);
    return this;
  }
}
