// 도감 (user 2026-11-27: "로비창에는 도감 창 만들어주고 하사품, 무기도감 탭으로"). Two tabs:
//   👑 하사품 — all 65 rent perks with what they do (Lv 1 and at the top level), rarest first
//   ⚔ 무기   — every sword form per element; forms the player has held show their picture and name,
//              the others stay "???" until found (records.forged, kept across runs)
// Opens over the paused lobby.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { PERKS, TIER_NAME, type PerkTier } from '../../config/rentPerks';
import { SWORD_FORMS, SWORD_NAME_LEVELS } from '../../config/swordNames';
import { ELEMENTS, ELEMENT_INFO, type Element } from '../../config/weapons';
import { C, H, W, label } from '../theme';
import { PORTRAIT } from '../layout';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { TIER_COLOR, drawPerkIcon } from '../ui/perkIcons';
import { weaponLookTexture } from '../weaponArt';

export interface CodexData {
  returnTo: string;
}

type Tab = 'perks' | 'weapons';

const PAD = PORTRAIT ? 16 : 40;
const TOP = PORTRAIT ? 92 : 78;
const TABS_H = PORTRAIT ? 64 : 54;
const LIST_W = Math.min(W - PAD * 2, 980);
const LIST_X = (W - LIST_W) / 2;
const TIER_ORDER: PerkTier[] = ['rainbow', 'gold', 'silver', 'bronze'];
const TIER_ICON: Record<PerkTier, string> = { rainbow: '🌈', gold: '🟨', silver: '⬜', bronze: '🟫' };

export class CodexScene extends Phaser.Scene {
  private core!: GameCore;
  private opts: CodexData = { returnTo: 'Lobby' };
  private tab: Tab = 'perks';
  private element: Element = 'fire';
  private body: Phaser.GameObjects.Container | null = null;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private scrollMin = 0;
  private scrollTop = 0;
  private sfx = new Sfx();

  constructor() {
    super('Codex');
  }

  init(data: CodexData) {
    this.opts = data ?? { returnTo: 'Lobby' };
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.add.rectangle(W / 2, H / 2, W, H, 0x07050a, 0.97).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x1a120b, 1).fillRect(0, 0, W, TOP);
    g.lineStyle(2, C.gold, 0.6).lineBetween(0, TOP, W, TOP);
    label(this, PAD, TOP / 2, '📚 도감', PORTRAIT ? 32 : 30, C.goldHi, { weight: 900, display: true, origin: [0, 0.5] });
    new Button(this, W - PAD - (PORTRAIT ? 70 : 80), TOP / 2, PORTRAIT ? 140 : 150, PORTRAIT ? 54 : 46, '닫기', { variant: 'dark', size: PORTRAIT ? 20 : 17, sub: PORTRAIT ? undefined : 'Esc', onClick: () => this.close() });

    // scroll: wheel on PC, a finger drag on phones
    let drag: { y: number; by: number; moved: boolean } | null = null;
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollBy(-dy * 0.7));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y > this.scrollTop && this.body) drag = { y: p.y, by: this.body.y, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!drag || !p.isDown || !this.body) return;
      if (Math.abs(p.y - drag.y) > 8) drag.moved = true;
      if (drag.moved) this.body.y = Phaser.Math.Clamp(drag.by + p.y - drag.y, this.scrollMin, this.scrollTop);
    });
    this.input.on('pointerup', () => (drag = null));

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.close());
    kb.on('keydown-LEFT', () => this.show('perks'));
    kb.on('keydown-RIGHT', () => this.show('weapons'));
    this.show('perks');
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private scrollBy(d: number) {
    if (this.body) this.body.y = Phaser.Math.Clamp(this.body.y + d, this.scrollMin, this.scrollTop);
  }

  private show(tab: Tab) {
    this.tab = tab;
    this.sfx.click();
    for (const o of this.chrome) o.destroy();
    this.chrome = [];
    this.body?.destroy();
    // tabs
    const forged = new Set(this.core.records.forged ?? []);
    const total = ELEMENTS.length * SWORD_FORMS.fire.length;
    const tabs: { id: Tab; text: string }[] = [
      { id: 'perks', text: `👑 하사품 ${PERKS.length}` },
      { id: 'weapons', text: `⚔ 무기 ${forged.size} / ${total}` },
    ];
    const tw = (LIST_W - 12) / 2;
    tabs.forEach((t, i) => {
      const b = new Button(this, LIST_X + tw / 2 + i * (tw + 12), TOP + 14 + TABS_H / 2, tw, TABS_H, t.text, {
        variant: t.id === tab ? 'gold' : 'dark',
        size: PORTRAIT ? 20 : 18,
        onClick: () => t.id !== this.tab && this.show(t.id),
      });
      this.chrome.push(b);
    });
    let top = TOP + 14 + TABS_H + 16;
    if (tab === 'weapons') top = this.elementTabs(top, forged);
    this.scrollTop = top;
    const body = this.add.container(0, top);
    this.body = body;
    const mask = this.make.graphics({}).fillStyle(0xffffff).fillRect(0, top, W, H - top);
    body.setMask(mask.createGeometryMask());
    this.chrome.push(mask);
    const height = tab === 'perks' ? this.perkList(body) : this.weaponGrid(body, forged);
    this.scrollMin = Math.min(top, H - 24 - height);
  }

  // ───────────────────────── 하사품
  private perkList(body: Phaser.GameObjects.Container): number {
    const rowH = PORTRAIT ? 118 : 96;
    let y = 0;
    body.add(label(this, W / 2, y + 14, '월세를 낼 때마다 세 장 중 하나를 고른다 · 같은 것을 또 고르면 레벨이 오른다 · 판이 끝나면 사라진다', PORTRAIT ? 13 : 14, C.mute, { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: LIST_W }));
    y += PORTRAIT ? 44 : 36;
    for (const tier of TIER_ORDER) {
      const list = PERKS.filter((p) => p.tier === tier);
      const t = TIER_COLOR[tier];
      body.add(label(this, LIST_X + 4, y + 18, `${TIER_ICON[tier]} ${TIER_NAME[tier]} · ${list.length}개`, PORTRAIT ? 20 : 19, t.hi, { weight: 900, origin: [0, 0.5] }));
      y += 40;
      for (const pk of list) {
        const row = this.add.graphics();
        row.fillStyle(0x16110c, 1).fillRoundedRect(LIST_X, y + 3, LIST_W, rowH - 6, 12);
        row.lineStyle(2, t.main, 0.6).strokeRoundedRect(LIST_X, y + 3, LIST_W, rowH - 6, 12);
        const icon = this.add.graphics({ x: LIST_X + 48, y: y + rowH / 2 });
        drawPerkIcon(icon, pk.icon, pk.tier, PORTRAIT ? 64 : 60);
        const tx = LIST_X + 96;
        const name = label(this, tx, y + 24, pk.name, PORTRAIT ? 20 : 19, t.hi, { weight: 900, origin: [0, 0.5] });
        const tag = label(this, tx + name.width + 10, y + 24, `${TIER_NAME[pk.tier]} · 최대 Lv ${pk.max}${pk.tradeoff ? ' · ⚖ 거래' : ''}`, PORTRAIT ? 13 : 12, pk.tradeoff ? 0xff9a7a : t.main, { weight: 700, origin: [0, 0.5] });
        const lines = pk.max > 1 ? `Lv 1: ${pk.text(1)}\nLv ${pk.max}: ${pk.text(pk.max)}` : pk.text(1);
        const desc = label(this, tx, y + (PORTRAIT ? 46 : 42), lines, PORTRAIT ? 15 : 14, C.text, { weight: 700, wrap: LIST_W - 112, lineSpacing: 4 });
        body.add([row, icon, name, tag, desc]);
        y += rowH;
      }
      y += 14;
    }
    return y;
  }

  // ───────────────────────── 무기
  private elementTabs(top: number, forged: Set<string>): number {
    const n = ELEMENTS.length;
    const gap = 8;
    const w = (LIST_W - gap * (n - 1)) / n;
    const h = PORTRAIT ? 52 : 44;
    ELEMENTS.forEach((el, i) => {
      const info = ELEMENT_INFO[el];
      const found = SWORD_FORMS[el].filter((_, k) => forged.has(`${el}:${k}`)).length;
      const b = new Button(this, LIST_X + w / 2 + i * (w + gap), top + h / 2, w, h, `${info.name} ${found}/${SWORD_FORMS[el].length}`, {
        variant: el === this.element ? 'gold' : 'dark',
        size: PORTRAIT ? 16 : 15,
        onClick: () => {
          if (el === this.element) return;
          this.element = el;
          this.show('weapons');
        },
      });
      this.chrome.push(b);
    });
    return top + h + 14;
  }

  private weaponGrid(body: Phaser.GameObjects.Container, forged: Set<string>): number {
    const el = this.element;
    const forms = SWORD_FORMS[el];
    const cols = PORTRAIT ? 3 : 6;
    const gap = PORTRAIT ? 10 : 12;
    const cw = (LIST_W - gap * (cols - 1)) / cols;
    const ch = PORTRAIT ? 200 : 170;
    const col = ELEMENT_INFO[el].color;
    forms.forEach((form, k) => {
      const x = LIST_X + (k % cols) * (cw + gap);
      const y = Math.floor(k / cols) * (ch + gap);
      const level = SWORD_NAME_LEVELS[k] ?? k * 2;
      const known = forged.has(`${el}:${k}`);
      const g = this.add.graphics();
      g.fillStyle(known ? 0x1b140e : 0x0e0b09, 1).fillRoundedRect(x, y, cw, ch, 12);
      g.lineStyle(2, known ? col : 0x3a3028, known ? 0.8 : 1).strokeRoundedRect(x, y, cw, ch, 12);
      body.add(g);
      body.add(label(this, x + 10, y + 16, `+${level}`, PORTRAIT ? 15 : 14, known ? C.goldHi : C.dim, { weight: 900, origin: [0, 0.5] }));
      body.add(label(this, x + cw - 10, y + 16, `No.${k + 1}`, 11, C.dim, { weight: 700, origin: [1, 0.5] }));
      const key = weaponLookTexture(this, { cls: 'sword', element: el, level });
      const cy = y + ch * 0.45;
      if (this.textures.exists(key)) {
        const img = this.add.image(x + cw / 2, cy, key);
        const s = Math.min((cw - 24) / img.width, (ch * 0.5) / img.height);
        img.setScale(s);
        if (!known) img.setTintFill(0x000000).setAlpha(0.85); // a silhouette until found
        body.add(img);
      }
      if (!known) body.add(label(this, x + cw / 2, cy, '?', PORTRAIT ? 44 : 40, 0x5f564b, { weight: 900, display: true, origin: [0.5, 0.5] }));
      body.add(label(this, x + cw / 2, y + ch - 30, known ? form.name : '???', PORTRAIT ? 15 : 14, known ? C.text : C.dim, { weight: 900, origin: [0.5, 0.5], align: 'center', wrap: cw - 12 }));
    });
    const rows = Math.ceil(forms.length / cols);
    const found = forms.filter((_, k) => forged.has(`${el}:${k}`)).length;
    const y = rows * (ch + gap) + 8;
    body.add(label(this, W / 2, y + 16, `${ELEMENT_INFO[el].name} 검 ${found} / ${forms.length} · 강화해서 새 모습을 만나면 도감에 남는다 (판이 끝나도 남음)`, PORTRAIT ? 13 : 14, C.mute, { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: LIST_W }));
    return y + 40;
  }

  private close() {
    this.sfx.click();
    this.scene.stop();
    this.scene.resume(this.opts.returnTo);
  }
}
