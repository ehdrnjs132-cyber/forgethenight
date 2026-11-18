import Phaser from 'phaser';
import { ITEMS, type EnhanceItem } from '../../config/economy';
import { C, css, label } from '../theme';

const SHORT: Record<EnhanceItem, string> = { protect: '보호석', luck: '행운석', master: '장인석' };

/** A small on/off switch for an enhancement stone, showing how many are owned. (x, y) is the top-left. */
export class StoneChip extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private usable = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly cw: number,
    private readonly ch: number,
    readonly item: EnhanceItem,
    onClick: () => void,
  ) {
    super(scene, x + cw / 2, y + ch / 2);
    this.bg = scene.add.graphics();
    this.text = label(scene, 0, 0, '', 13, C.text, { weight: 700, origin: [0.5, 0.5] });
    this.add([this.bg, this.text]);
    this.setSize(cw, ch);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => {
      if (this.usable) onClick();
    });
    scene.add.existing(this);
  }

  set(owned: number, on: boolean, usable: boolean) {
    this.usable = usable;
    const color = ITEMS[this.item].color;
    const g = this.bg;
    const x = -this.cw / 2;
    const y = -this.ch / 2;
    g.clear();
    g.fillStyle(on ? color : 0x15110e, on ? 0.28 : 1);
    g.fillRoundedRect(x, y, this.cw, this.ch, 8);
    g.lineStyle(on ? 2 : 1, on ? color : C.edge, owned > 0 ? 1 : 0.4);
    g.strokeRoundedRect(x + 0.5, y + 0.5, this.cw - 1, this.ch - 1, 8);
    this.text.setText(`${on ? '✔ ' : ''}${SHORT[this.item]} ${owned}`);
    this.text.setColor(css(on ? color : owned > 0 ? C.text : C.dim));
    this.setAlpha(owned > 0 ? 1 : 0.5);
    if (this.input) this.input.cursor = usable ? 'pointer' : 'default';
  }
}
