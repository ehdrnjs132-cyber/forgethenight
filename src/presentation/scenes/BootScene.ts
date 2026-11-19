import Phaser from 'phaser';
import { ELEMENTS, WEAPON_CLASSES, type Element } from '../../config/weapons';
import { swordFormTexture, weaponImagePath, weaponTexture } from '../weaponArt';
import type { GameCore } from '../../core/game';
import { PORTRAIT } from '../layout';
import { H, W } from '../theme';
import { INTRO } from '../../config/cinematics';
import type { CinematicData } from './CinematicScene';

/** Processed world art in public/assets/world (see tools/art/process-assets.ts). */
export const WORLD_ART = [
  'forge_bg', 'night_ground', 'anvil', 'smith_raise', 'smith_strike', 'skeleton', 'slime', 'player_top', 'morr',
  'prop_0', 'prop_1', 'prop_2', 'prop_3', 'prop_4', 'prop_5',
  'forge_rack_bg', 'smith_anvil', 'rack_slot', 'padlock', 'lock_key', 'hero_sword', 'hero_spear', 'hero_axe', 'hero_hammer',
] as const;
export const PROP_COUNT = 6;

interface AnimSheet {
  key: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
  loop: boolean;
}

/** Loads weapon art, generates the small effect textures, then opens the forge. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // centred on whatever canvas size this device uses (portrait phones are 720 wide and taller)
    const bw = Math.min(400, W * 0.6);
    const bx = (W - bw) / 2;
    const by = H / 2;
    this.add.text(W / 2, by - 28, 'LOADING', { fontFamily: '"Noto Sans KR", sans-serif', fontSize: '18px', fontStyle: '700', color: '#8a7a5c', letterSpacing: 4 }).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x3b2d1e, 1);
      bar.fillRect(bx, by, bw, 8);
      bar.fillStyle(0xe9b65c, 1);
      bar.fillRect(bx, by, bw * p, 8);
    });
    // A missing image is fine: WeaponView falls back to the placeholder drawing.
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.warn(`art missing: ${file.src}`));
    for (const cls of WEAPON_CLASSES) {
      for (const el of ELEMENTS) this.load.image(weaponTexture(cls, el), weaponImagePath(cls, el));
    }
    // Sword form images (30 per element). The manifest lists the ones that exist.
    this.load.json('sword-manifest', 'assets/swords/manifest.json');
    this.load.once('filecomplete-json-sword-manifest', (_k: string, _t: string, keys: string[]) => {
      if (!Array.isArray(keys)) return;
      for (const k of keys) {
        const [el, nn] = k.split('_');
        this.load.image(swordFormTexture(el as Element, Number(nn)), `assets/swords/${k}.webp`);
      }
    });
    // Higgsfield world art (tools/art/assets.ts). Missing files fall back to the drawn placeholders.
    for (const key of WORLD_ART) this.load.image(`art-${key}`, `assets/world/${key}.png`);
    this.load.image('weapon-hammer', 'assets/world/hammer.png');
    if (PORTRAIT) this.load.image('art-forge_bg_portrait', 'assets/world/forge_bg_portrait.jpg');
    // Higgsfield video → sprite sheets (tools/art/process-anims.ts). The manifest lists what exists.
    this.load.json('anim-manifest', 'assets/anim/manifest.json');
    this.load.once('filecomplete-json-anim-manifest', (_k: string, _t: string, data: AnimSheet[]) => {
      if (!Array.isArray(data)) return;
      for (const a of data) this.load.spritesheet(`anim-${a.key}`, `assets/anim/${a.key}.png`, { frameWidth: a.frameW, frameHeight: a.frameH });
    });
  }

  /** Phaser animations named after the sheet: anim-<key>. */
  private makeAnims() {
    const data = this.cache.json.get('anim-manifest') as AnimSheet[] | undefined;
    if (!Array.isArray(data)) return;
    for (const a of data) {
      const key = `anim-${a.key}`;
      if (!this.textures.exists(key) || this.anims.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: a.frames - 1 }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
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
    g.clear();

    this.makeAnims();
    this.makeNightTextures(g);
    if (!this.textures.exists('weapon-hammer') || this.textures.get('weapon-hammer').key === '__MISSING') this.makeHammerTexture(g);
    g.destroy();

    const core = this.registry.get('core') as GameCore | undefined;
    if (core?.notice?.kind === 'gameOver') {
      const summary = core.notice.summary;
      core.notice = null;
      this.scene.start('GameOver', { summary, reason: 'closed' });
    } else if (core && !core.hasSeen('intro') && !new URLSearchParams(location.search).has('nointro')) {
      // first launch: the story intro, then the title card, then DAY 1 (spec PART 8)
      const data: CinematicData = { clips: INTRO, next: 'Lobby', titleCard: true, seenId: 'intro' };
      this.scene.start('Cinematic', data);
    } else this.scene.start('Lobby');
  }

  /** Starter hammer, drawn horizontally like the weapon images (head on the right). */
  private makeHammerTexture(g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(0x0b0907, 1);
    g.fillRoundedRect(8, 52, 240, 20, 8);
    g.fillStyle(0x6e4a2c, 1);
    g.fillRoundedRect(12, 55, 234, 14, 6);
    g.fillStyle(0x8a5d38, 1);
    g.fillRect(16, 57, 226, 4);
    g.fillStyle(0x3a2616, 1);
    for (let x = 20; x < 80; x += 9) g.fillRect(x, 55, 4, 14);
    g.fillStyle(0x0b0907, 1);
    g.fillRoundedRect(226, 14, 74, 96, 10);
    g.fillStyle(0x50505c, 1);
    g.fillRoundedRect(231, 19, 64, 86, 8);
    g.fillStyle(0x8a8a98, 1);
    g.fillRect(235, 23, 56, 10);
    g.fillStyle(0x3a3a44, 1);
    g.fillRect(235, 88, 56, 12);
    g.generateTexture('weapon-hammer', 308, 124);
  }

  /** Placeholder night art (principle 8): ground, the smith, enemies, XP gems, vignette. */
  private makeNightTextures(g: Phaser.GameObjects.Graphics) {
    // ground: dark flagstones
    const rnd = new Phaser.Math.RandomDataGenerator(['forge-ground']);
    g.fillStyle(0x121018, 1);
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) {
      for (let x = (y / 32) % 2 ? -16 : 0; x < 128; x += 32) {
        g.fillStyle(rnd.pick([0x18151f, 0x1a1722, 0x16131c, 0x1c1824]), 1);
        g.fillRect(x + 1, y + 1, 30, 30);
      }
    }
    g.lineStyle(1, 0x0b0a0e, 1);
    for (let i = 0; i < 5; i++) {
      const x = rnd.between(0, 120);
      const y = rnd.between(0, 120);
      g.lineBetween(x, y, x + rnd.between(-10, 10), y + rnd.between(4, 12));
    }
    g.generateTexture('ground', 128, 128);
    g.clear();

    // the smith: dark cloak, leather apron, grey beard
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(28, 50, 34, 10);
    g.fillStyle(0x2b2433, 1);
    g.fillRoundedRect(12, 20, 32, 30, 10);
    g.fillStyle(0x6b4a2c, 1);
    g.fillRoundedRect(18, 26, 20, 22, 4);
    g.fillStyle(0xd9a77a, 1);
    g.fillCircle(28, 15, 10);
    g.fillStyle(0xbdb6ad, 1);
    g.fillTriangle(20, 16, 36, 16, 28, 30);
    g.fillStyle(0x1a1410, 1);
    g.fillCircle(24, 13, 1.6);
    g.fillCircle(32, 13, 1.6);
    g.lineStyle(2, 0x0a0808, 1);
    g.strokeRoundedRect(12, 20, 32, 30, 10);
    g.strokeCircle(28, 15, 10);
    g.generateTexture('player', 56, 56);
    g.clear();

    // skeleton
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(20, 37, 26, 8);
    g.lineStyle(3, 0xd8d0bb, 1);
    g.lineBetween(14, 26, 12, 36);
    g.lineBetween(26, 26, 28, 36);
    g.fillStyle(0xd8d0bb, 1);
    g.fillRoundedRect(12, 16, 16, 12, 3);
    g.fillStyle(0x2a2420, 1);
    for (let i = 0; i < 3; i++) g.fillRect(14, 18 + i * 3, 12, 1);
    g.fillStyle(0xece6d4, 1);
    g.fillCircle(20, 10, 9);
    g.fillStyle(0x140d0d, 1);
    g.fillCircle(16.5, 10, 2.6);
    g.fillCircle(23.5, 10, 2.6);
    g.fillStyle(0xff3b3b, 1);
    g.fillCircle(16.5, 10, 1);
    g.fillCircle(23.5, 10, 1);
    g.lineStyle(2, 0x0a0808, 1);
    g.strokeCircle(20, 10, 9);
    g.generateTexture('enemy-skeleton', 40, 40);
    g.clear();

    // exploding slime: green body with a hot orange core
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(18, 29, 30, 8);
    g.fillStyle(0x4f9a2c, 1);
    g.fillEllipse(18, 18, 32, 24);
    g.fillStyle(0x7ccf4a, 1);
    g.fillEllipse(17, 15, 26, 16);
    g.fillStyle(0xff8a2a, 1);
    g.fillCircle(18, 20, 5);
    g.fillStyle(0xffe08a, 1);
    g.fillCircle(18, 20, 2.5);
    g.fillStyle(0xe8ffd8, 0.8);
    g.fillEllipse(11, 11, 7, 4);
    g.fillStyle(0x10200a, 1);
    g.fillCircle(13, 15, 1.8);
    g.fillCircle(23, 15, 1.8);
    g.lineStyle(2, 0x0a1406, 1);
    g.strokeEllipse(18, 18, 32, 24);
    g.generateTexture('enemy-slime', 36, 34);
    g.clear();

    // XP gem
    g.fillStyle(0x5fe3ff, 1);
    g.fillTriangle(6, 0, 12, 7, 6, 14);
    g.fillTriangle(6, 0, 0, 7, 6, 14);
    g.fillStyle(0xd8fbff, 1);
    g.fillTriangle(6, 2, 9, 7, 6, 7);
    g.generateTexture('xp', 12, 14);
    g.clear();

    // screen vignette
    const v = this.textures.createCanvas('vignette', 640, 360);
    if (v) {
      const ctx = v.getContext();
      const grad = ctx.createRadialGradient(320, 180, 90, 320, 180, 380);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,8,0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 360);
      v.refresh();
    }
  }
}
