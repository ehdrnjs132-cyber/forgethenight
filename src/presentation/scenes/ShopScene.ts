// Merchant Morr (§15): visits every third day. Opens over the forge, which stays paused behind it.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import type { BuyBlock } from '../../core/systems/economy';
import { itemCount, shopPrice } from '../../core/systems/economy';
import { isTutorialDone } from '../../core/systems/tutorial';
import { ITEMS, MERCHANT, type ItemId } from '../../config/economy';
import { C, H, W, label, panel } from '../theme';
import { Button } from '../ui/button';
import { Sfx } from '../audio/sfx';
import { PORTRAIT } from '../layout';

// Landscape: Morr on the left, the shelf on the right. Portrait: Morr on top, the shelf below.
const PW = PORTRAIT ? W - 40 : 960;
const PH = PORTRAIT ? Math.min(H - 100, 1200) : 640;
const ROW_H = PORTRAIT ? 70 : 60;
/** Shelf origin inside the panel. */
const LX = PORTRAIT ? 20 : 300;
const LY = PORTRAIT ? 520 : 92;
/** Morr's column centre and the y of his feet inside the panel. */
const MX = PORTRAIT ? PW / 2 : 150;
const MY = PORTRAIT ? 300 : 350;

const BLOCK_TEXT: Record<BuyBlock, string> = {
  closed: '오늘은 가게를 닫았다네.',
  'sold-out': '그건 다 팔렸어.',
  gold: '골드가 모자라는군. 무기를 팔아 오게.',
  'max-lives': '자네 목숨은 이미 가득하네.',
};

export class ShopScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private rows!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private speech!: Phaser.GameObjects.Text;
  private closing = false;

  constructor() {
    super('Shop');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.closing = false;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78).setInteractive();
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });

    const x0 = (W - PW) / 2;
    const y0 = (H - PH) / 2;
    const root = this.add.container(0, 0).setAlpha(0);
    const g = this.add.graphics();
    panel(g, x0, y0, PW, PH, 0x120e0b, 0x6a5236, 14);
    root.add(g);

    // Morr: a hooded travelling trader by lantern light (placeholder art).
    if (this.textures.exists('art-morr')) {
      const glow = this.add.graphics();
      for (let i = 5; i >= 1; i--) {
        glow.fillStyle(0xffb347, 0.025 * i);
        glow.fillCircle(x0 + MX, y0 + MY - 150, 60 + i * 24);
      }
      root.add(glow);
      root.add(this.add.image(x0 + MX, y0 + MY, 'art-morr').setOrigin(0.5, 1).setScale(PORTRAIT ? 0.66 : 0.82));
    } else {
      const portrait = this.add.graphics();
      this.drawMorr(portrait, x0 + MX, y0 + MY - 130);
      root.add(portrait);
    }
    root.add(label(this, x0 + MX, y0 + MY + 22, MERCHANT.name, 30, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }));
    root.add(label(this, x0 + MX, y0 + MY + 52, '떠돌이 상인 · 3일마다 방문', 12, C.mute, { weight: 700, origin: [0.5, 0.5] }));
    const first = !isTutorialDone(this.core.state, 'firstMerchant');
    this.speech = label(
      this,
      x0 + MX,
      y0 + MY + (PORTRAIT ? 104 : 110),
      first
        ? '처음 보는 얼굴이군. 사흘마다 들르지.\n골드는 무기를 팔아서 만들고,\n물건은 오늘 하루만 판다네.'
        : '또 왔군. 오늘 물건은 오늘뿐이야.',
      13,
      C.text,
      { origin: [0.5, 0.5], align: 'center', wrap: PORTRAIT ? PW - 80 : 250, lineSpacing: 6 },
    );
    root.add(this.speech);
    if (first) this.core.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstMerchant' });

    const lx = x0 + LX;
    root.add(label(this, lx, y0 + (PORTRAIT ? LY - 40 : 30), `DAY ${this.core.state.day}의 진열대`, 20, C.gold, { weight: 900 }));
    this.goldText = label(this, x0 + PW - 30, y0 + 30, '', 20, C.goldHi, { weight: 900, origin: [1, 0] });
    this.livesText = label(this, x0 + PW - 30, y0 + 58, '', 13, C.mute, { weight: 700, origin: [1, 0] });
    root.add([this.goldText, this.livesText]);
    this.rows = this.add.container(0, 0);
    root.add(this.rows);
    const close = PORTRAIT
      ? new Button(this, x0 + PW / 2, y0 + PH - 50, PW - 40, 60, '대장간으로', { variant: 'dark', sub: '', onClick: () => this.close() })
      : new Button(this, x0 + 150, y0 + PH - 50, 220, 50, '대장간으로', { variant: 'dark', sub: 'Esc', onClick: () => this.close() });
    root.add(close);
    this.tweens.add({ targets: root, alpha: 1, duration: 220 });

    this.input.keyboard!.on('keydown-ESC', () => this.close());
    this.input.keyboard!.on('keydown-M', () => this.close());
    this.render();
  }

  private render() {
    const s = this.core.state;
    this.goldText.setText(`${s.gold.toLocaleString()} G`);
    this.livesText.setText('');
    this.rows.removeAll(true);
    const x0 = (W - PW) / 2 + LX;
    const y0 = (H - PH) / 2 + LY;
    const stock = s.merchant?.day === s.day ? s.merchant.stock : [];
    if (!stock.length) {
      this.rows.add(label(this, x0, y0 + 20, '오늘은 팔 물건이 없다네.', 16, C.mute, { weight: 700 }));
      return;
    }
    stock.forEach((e, i) => {
      const def = ITEMS[e.item];
      const y = y0 + i * (ROW_H + 6);
      const rw = PW - LX - (PORTRAIT ? 20 : 30);
      const g = this.add.graphics();
      g.fillStyle(0x1b1511, 1);
      g.fillRoundedRect(x0, y, rw, ROW_H, 10);
      g.lineStyle(1, e.left > 0 ? 0x4a3a28 : 0x2a2018, 1);
      g.strokeRoundedRect(x0 + 0.5, y + 0.5, rw - 1, ROW_H - 1, 10);
      this.drawIcon(g, e.item, x0 + 38, y + ROW_H / 2);
      const name = label(this, x0 + 74, y + 9, def.name, 17, e.left > 0 ? C.text : C.dim, { weight: 900 });
      const owned = e.item === 'heart' ? '' : `  ·  보유 ${itemCount(s, e.item)}`;
      const left = label(this, x0 + 74 + name.width + 10, y + 12, `남은 ${e.left}${owned}`, 12, C.mute, { weight: 700 });
      const desc = label(this, x0 + 74, y + 34, def.desc, 12, C.mute);
      const cost = shopPrice(s, e);
      const afford = s.gold >= cost;
      const price = label(this, x0 + rw - 160, y + ROW_H / 2, `${cost.toLocaleString()}G${cost < e.price ? ` (−${Math.round((1 - cost / e.price) * 100)}%)` : ''}`, 18, afford ? C.goldHi : C.dim, { weight: 900, origin: [1, 0.5] });
      const blocked = e.left <= 0 || !afford || (e.item === 'heart' && s.lives >= MERCHANT.maxLives);
      const btn = new Button(this, x0 + rw - 76, y + ROW_H / 2, 128, 46, e.left > 0 ? '구매' : '품절', {
        variant: blocked ? 'dark' : 'gold',
        size: 16,
        onClick: () => this.buy(e.item),
      });
      if (e.left <= 0) btn.setEnabled(false);
      this.rows.add([g, name, left, desc, price, btn]);
    });
  }

  private buy(item: ItemId) {
    const r = this.core.dispatch({ type: 'BUY', item });
    if (r.type === 'buyBlocked') {
      this.sfx.denied();
      this.say(BLOCK_TEXT[r.reason]);
      return;
    }
    this.sfx.coin();
    this.say(item === 'heart' ? '심장이 다시 뛰는군. 목숨 하나, 잘 쓰게.' : `${ITEMS[item].name}, 좋은 선택이야.`);
    this.cameras.main.flash(160, 255, 220, 140);
    this.render();
  }

  private say(text: string) {
    this.speech.setText(text);
    this.tweens.killTweensOf(this.speech);
    this.speech.setAlpha(0.2);
    this.tweens.add({ targets: this.speech, alpha: 1, duration: 200 });
  }

  private close() {
    if (this.closing) return;
    this.closing = true;
    this.input.keyboard?.removeAllListeners();
    this.tweens.add({
      targets: this.children.list,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        this.scene.resume('Forge');
        this.scene.stop();
      },
    });
  }

  private drawIcon(g: Phaser.GameObjects.Graphics, item: ItemId, x: number, y: number) {
    const col = ITEMS[item].color;
    g.fillStyle(col, 0.18);
    g.fillCircle(x, y, 26);
    g.lineStyle(3, 0x0b0907, 1);
    if (item === 'heart') {
      g.fillStyle(col, 1);
      g.fillCircle(x - 7, y - 4, 9);
      g.fillCircle(x + 7, y - 4, 9);
      g.fillTriangle(x - 15, y, x + 15, y, x, y + 16);
    } else if (item === 'revive') {
      g.fillStyle(col, 1);
      g.fillCircle(x, y, 13);
      g.fillStyle(0xfff6d8, 1);
      g.fillRect(x - 2, y - 9, 4, 18);
      g.fillRect(x - 8, y - 3, 16, 4);
    } else if (item === 'timeStone') {
      g.fillStyle(col, 1);
      g.fillTriangle(x - 11, y - 15, x + 11, y - 15, x, y);
      g.fillTriangle(x - 11, y + 15, x + 11, y + 15, x, y);
      g.strokeTriangle(x - 11, y - 15, x + 11, y - 15, x, y);
      g.strokeTriangle(x - 11, y + 15, x + 11, y + 15, x, y);
    } else {
      // cut gem for the enhancement stones
      const pts = [
        [x, y - 16],
        [x + 14, y - 4],
        [x + 8, y + 14],
        [x - 8, y + 14],
        [x - 14, y - 4],
      ].map(([px, py]) => new Phaser.Math.Vector2(px, py));
      g.fillStyle(col, 1);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      g.fillStyle(0xffffff, 0.55);
      g.fillTriangle(x, y - 16, x + 6, y - 4, x - 6, y - 4);
    }
  }

  private drawMorr(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // lantern glow
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(0xffb347, 0.012 * i);
      g.fillCircle(x + 56, y + 40, 24 + i * 14);
    }
    // cloak
    g.fillStyle(0x2a2230, 1);
    g.fillTriangle(x - 90, y + 120, x + 90, y + 120, x, y - 70);
    g.fillStyle(0x352b3d, 1);
    g.fillCircle(x, y - 40, 52);
    // face in shadow
    g.fillStyle(0x0d0a0e, 1);
    g.fillEllipse(x, y - 28, 64, 70);
    g.fillStyle(0xffc36b, 1);
    g.fillCircle(x - 13, y - 34, 4);
    g.fillCircle(x + 13, y - 34, 4);
    // beard
    g.fillStyle(0x8f877d, 1);
    g.fillTriangle(x - 20, y - 12, x + 20, y - 12, x, y + 34);
    // pack strap and lantern
    g.lineStyle(6, 0x5a3f26, 1);
    g.lineBetween(x - 50, y - 10, x + 40, y + 90);
    g.lineStyle(2, 0x1a1410, 1);
    g.lineBetween(x + 56, y + 8, x + 56, y + 22);
    g.fillStyle(0x3a2c1c, 1);
    g.fillRoundedRect(x + 44, y + 22, 24, 34, 4);
    g.fillStyle(0xffd27a, 1);
    g.fillRoundedRect(x + 48, y + 27, 16, 24, 3);
    g.lineStyle(3, 0x0b0907, 1);
    g.strokeTriangle(x - 90, y + 120, x + 90, y + 120, x, y - 70);
  }
}
