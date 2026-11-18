import Phaser from 'phaser';
import { GameCore } from './core/game';
import { browserStorage } from './core/save/save';
import { BootScene } from './presentation/scenes/BootScene';
import { ForgeScene } from './presentation/scenes/ForgeScene';
import { ModalScene } from './presentation/scenes/ModalScene';
import { NightScene } from './presentation/scenes/NightScene';
import { GameOverScene } from './presentation/scenes/GameOverScene';
import { ShopScene } from './presentation/scenes/ShopScene';
import { H, W } from './presentation/theme';

async function fontsReady() {
  const wanted = ['400 18px "Noto Sans KR"', '700 18px "Noto Sans KR"', '900 18px "Noto Sans KR"', '800 18px Cinzel'];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  try {
    await Promise.race([Promise.all(wanted.map((f) => document.fonts.load(f, '가A'))), timeout]);
  } catch {
    /* fall back to system fonts */
  }
}

async function boot() {
  await fontsReady();
  const core = new GameCore(browserStorage());
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#07060a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    // `?timer` drives the loop with setTimeout instead of requestAnimationFrame,
    // so automated checks keep running when the page is not being painted.
    fps: new URLSearchParams(location.search).has('timer') ? { forceSetTimeOut: true, target: 60 } : undefined,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, ForgeScene, NightScene, ModalScene, GameOverScene, ShopScene],
    callbacks: { preBoot: (g) => g.registry.set('core', core) },
  });
  // Debug handle for manual testing in the browser console.
  (window as unknown as { __ftn: unknown }).__ftn = { core, game };
  document.getElementById('boot')?.remove();
}

void boot();
