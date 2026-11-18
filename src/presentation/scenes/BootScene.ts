import Phaser from 'phaser';
import { ELEMENTS, WEAPON_CLASSES } from '../../config/weapons';
import { weaponImagePath, weaponTexture } from '../weaponArt';

/** Loads weapon art, generates the small effect textures, then opens the forge. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x3b2d1e, 1);
      bar.fillRect(440, 356, 400, 8);
      bar.fillStyle(0xe9b65c, 1);
      bar.fillRect(440, 356, 400 * p, 8);
    });
    // A missing image is fine: WeaponView falls back to the placeholder drawing.
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn(`art missing: ${file.src}`));
    for (const cls of WEAPON_CLASSES) {
      for (const el of ELEMENTS) this.load.image(weaponTexture(cls, el), weaponImagePath(cls, el));
    }
  }

  create() {
    const g = this.add.graphics();

    // soft round spark
    for (let r = 8; r >= 1; r--) {
      g.fillStyle(0xffffff, 0.12 + (8 - r) * 0.11);
      g.fillCircle(8, 8, r);
    }
    g.generateTexture('spark', 16, 16);
    g.clear();

    // tiny ember
    g.fillStyle(0xffffff, 1);
    g.fillCircle(2, 2, 2);
    g.generateTexture('ember', 4, 4);
    g.clear();

    // metal shard
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(14, 3);
    g.lineTo(5, 10);
    g.closePath();
    g.fillPath();
    g.generateTexture('shard', 14, 10);
    g.clear();

    // shock ring
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(64, 64, 60);
    g.generateTexture('ring', 128, 128);
    g.destroy();

    this.scene.start('Forge');
  }
}
