import Phaser from 'phaser';
import { GameCore } from './core/game';
import { browserStorage } from './core/save/save';
import { BootScene } from './presentation/scenes/BootScene';
import { ForgeScene } from './presentation/scenes/ForgeScene';
import { ModalScene } from './presentation/scenes/ModalScene';
import { NightScene } from './presentation/scenes/NightScene';
import { GameOverScene } from './presentation/scenes/GameOverScene';
import { ShopScene } from './presentation/scenes/ShopScene';
import { SkillScene } from './presentation/scenes/SkillScene';
import { EveningScene } from './presentation/scenes/EveningScene';
import { KingWrathScene } from './presentation/scenes/KingWrathScene';
import { CardScene } from './presentation/scenes/CardScene';
import { StoryScene } from './presentation/scenes/StoryScene';
import { LobbyScene } from './presentation/scenes/LobbyScene';
import { DuelLobbyScene } from './presentation/scenes/DuelLobbyScene';
import { duel } from './online/duel';
import { H, W } from './presentation/theme';
import { setupInstall } from './install';
import { PORTRAIT } from './presentation/layout';
import { account, noteSeasonBest, seasonBest, submitBest } from './online/account';
import { showLoginIfNeeded } from './online/ui';
import { weaponDisplayName } from './config/swordNames';

async function fontsReady() {
  const wanted = ['400 18px "Noto Sans KR"', '700 18px "Noto Sans KR"', '900 18px "Noto Sans KR"', '800 18px Cinzel'];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  try {
    await Promise.race([Promise.all(wanted.map((f) => document.fonts.load(f, '가A'))), timeout]);
  } catch {
    /* fall back to system fonts */
  }
}

/**
 * Phones: the first touch switches to full screen and locks landscape, so there is no browser bar and
 * no scrolling (user request 2026-11-18). Browsers that refuse (iPhone Safari) keep the normal page,
 * which still fills the screen without scrolling. Re-armed after leaving full screen.
 */
function goFullscreenOnTouch() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const enter = async () => {
    try {
      if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.(PORTRAIT ? 'portrait' : 'landscape');
    } catch {
      /* not allowed here; the page still fits the screen */
    }
  };
  document.addEventListener('pointerup', enter);
}

/** Login screen on first launch, and every new personal best goes to the ranking (real save slot only). */
function setupOnline(core: GameCore) {
  if (new URLSearchParams(location.search).has('slot')) return;
  void showLoginIfNeeded();
  const report = (level: number, weapon: string) => void submitBest(level, weapon, core.state.day);
  core.on('enhanced', (r) => {
    if (!r.weaponAfter) return;
    const name = weaponDisplayName(r.weaponAfter);
    noteSeasonBest(r.weaponAfter.level, name);
    report(r.weaponAfter.level, name);
  });
  // a best made offline (or before signing in) is sent once an account exists. Only this season's best:
  // the lifetime best in records may predate the ranking reset.
  const catchUp = () => {
    const best = seasonBest();
    if (best.level > 0) report(best.level, best.weapon);
  };
  account.onChange(catchUp);
  catchUp();
}

async function boot() {
  // portrait layout: no "turn your phone sideways" cover
  if (PORTRAIT) document.body.classList.add('portrait-mode');
  await fontsReady();
  const core = new GameCore(browserStorage(new URLSearchParams(location.search).get('slot')));
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
    // Lobby sits under Modal in the draw order so its confirm/rules pop-ups appear on top
    scene: [BootScene, LobbyScene, DuelLobbyScene, ForgeScene, NightScene, ModalScene, GameOverScene, ShopScene, SkillScene, EveningScene, KingWrathScene, CardScene, StoryScene],
    callbacks: { preBoot: (g) => g.registry.set('core', core) },
  });
  goFullscreenOnTouch();
  setupInstall();
  setupOnline(core);
  // online duels: the bet won or lost goes into the run (also for a duel that ended while away)
  duel.onGold = (delta) => void core.dispatch({ type: 'DUEL_GOLD', delta });
  // Debug handle for manual testing in the browser console.
  (window as unknown as { __ftn: unknown }).__ftn = { core, game, duel };
  document.getElementById('boot')?.remove();
}

void boot();
