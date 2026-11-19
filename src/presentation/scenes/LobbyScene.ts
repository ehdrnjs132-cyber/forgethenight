// Lobby (user request 2026-11-19): the screen after loading, before the forge.
// Title, account, the current run at a glance, the best weapon held, and the menu:
// continue / ranking / replay intro / sound / install app.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { weaponDisplayName } from '../../config/swordNames';
import { ELEMENT_INFO } from '../../config/weapons';
import { INTRO } from '../../config/cinematics';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { glowStrength, weaponLookTexture } from '../weaponArt';
import { Sfx } from '../audio/sfx';
import { account } from '../../online/account';
import { openLogin, openRanking } from '../../online/ui';
import { canOfferInstall, installApp } from '../../install';
import type { CinematicData } from './CinematicScene';

export class LobbyScene extends Phaser.Scene {
  private core!: GameCore;
  private accountText!: Phaser.GameObjects.Text;
  private accountBtn!: Button;
  private soundBtn!: Button;
  private readonly onAccount = () => this.refreshAccount();

  constructor() {
    super('Lobby');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.cameras.main.fadeIn(350, 0, 0, 0);
    this.drawBackground();

    const s = this.core.state;
    // a run nobody has touched yet: "게임 시작", and nothing to restart
    const fresh = s.day === 1 && s.weapons.every((w) => w.level === 0) && (s.stats.enhanceAttempts ?? 0) === 0;

    // layout: one centred column in portrait, title+weapon left / menu right in landscape
    const colX = PORTRAIT ? W / 2 : 380;
    const menuX = PORTRAIT ? W / 2 : 960;
    const titleY = PORTRAIT ? H * 0.13 : 120;

    const title = label(this, colX, titleY, 'FORGE THE NIGHT', PORTRAIT ? 54 : 58, C.gold, { display: true, weight: 900, origin: [0.5, 0.5] });
    title.setStroke('#140a05', 8).setShadow(0, 4, '#000', 12, true, true);
    label(this, colX, titleY + (PORTRAIT ? 52 : 56), '밤을 벼리는 대장장이', PORTRAIT ? 20 : 20, C.text, { weight: 700, origin: [0.5, 0.5] }).setAlpha(0.85);

    // account (top right)
    this.accountBtn = new Button(this, W - 86, 40, 148, 48, '로그인', { variant: 'dark', size: 18, onClick: () => this.accountAction() });
    this.accountText = label(this, W - 176, 40, '', PORTRAIT ? 17 : 15, C.text, { weight: 700, origin: [1, 0.5] });
    account.onChange(this.onAccount);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => account.offChange(this.onAccount));
    this.refreshAccount();

    // best weapon held right now
    const best = [...s.weapons].sort((a, b) => b.level - a.level)[0];
    const heroY = PORTRAIT ? H * 0.33 : 330;
    const heroW = PORTRAIT ? 560 : 560;
    const glowG = this.add.graphics();
    glowG.fillStyle(best ? ELEMENT_INFO[best.element].glow : C.ember, 0.12).fillEllipse(colX, heroY, heroW * 1.1, 200);
    if (best) {
      const key = weaponLookTexture(this, best);
      if (this.textures.exists(key)) {
        const img = this.add.image(colX, heroY, key);
        img.setScale(heroW / img.width);
        const st = glowStrength(best.level);
        if (st > 0) img.preFX?.addGlow(ELEMENT_INFO[best.element].glow, Math.min(6, st), 0, false, 0.1, 14);
        this.tweens.add({ targets: img, y: heroY - 8, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      new LevelBadge(this, colX + heroW / 2 - 40, heroY - 70, best.level, 30);
      label(this, colX, heroY + (PORTRAIT ? 110 : 100), `${weaponDisplayName(best)} +${best.level}`, PORTRAIT ? 24 : 22, C.goldHi, { weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 6);
    } else if (this.textures.exists('art-hero_sword')) {
      const img = this.add.image(colX, heroY, 'art-hero_sword');
      img.setScale(Math.min(heroW / img.width, 240 / img.height));
    }

    // the run card
    const cardY = PORTRAIT ? H * 0.52 : 540;
    const cw = PORTRAIT ? 600 : 560;
    const ch = 132;
    const g = this.add.graphics();
    g.fillStyle(0x0b0806, 0.78).fillRoundedRect(colX - cw / 2, cardY - ch / 2, cw, ch, 16);
    g.lineStyle(2, 0x8a6430, 1).strokeRoundedRect(colX - cw / 2, cardY - ch / 2, cw, ch, 16);
    const r = this.core.records;
    label(this, colX, cardY - 34, fresh ? '새로운 대장간' : `DAY ${s.day}  ·  ♥ ${s.lives}  ·  ${s.gold.toLocaleString()}G`, PORTRAIT ? 28 : 26, C.text, { weight: 900, origin: [0.5, 0.5] });
    label(this, colX, cardY + 12, `최고 강화 +${r.bestLevel}  ·  최장 생존 DAY ${Math.max(r.bestDay, s.day)}`, PORTRAIT ? 18 : 17, C.goldHi, { weight: 700, origin: [0.5, 0.5] });
    label(this, colX, cardY + 42, `도전 ${Math.max(1, r.runs)}회차  ·  밤 내기 패배 ${r.deaths}회`, PORTRAIT ? 15 : 14, C.mute, { weight: 700, origin: [0.5, 0.5] });

    // menu
    const bw = PORTRAIT ? 520 : 420;
    let y = PORTRAIT ? H * 0.68 : 290;
    const start = new Button(this, menuX, y, bw, PORTRAIT ? 104 : 92, fresh ? '게임 시작 ▶' : '이어하기 ▶', {
      variant: 'gold',
      size: PORTRAIT ? 36 : 32,
      sub: fresh ? '대장간 문을 연다' : `DAY ${s.day}부터 계속`,
      subSize: 16,
      onClick: () => this.enterForge(),
    });
    this.tweens.add({ targets: start, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    y += PORTRAIT ? 118 : 96;
    const gap = 16;
    const half = (bw - gap) / 2;
    const bh = PORTRAIT ? 84 : 64;
    new Button(this, menuX - half / 2 - gap / 2, y, half, bh, '🏆 랭킹', { variant: 'dark', size: 22, onClick: () => void openRanking() });
    new Button(this, menuX + half / 2 + gap / 2, y, half, bh, '🎬 인트로', { variant: 'dark', size: 22, onClick: () => this.replayIntro() });
    y += bh + gap;
    this.soundBtn = new Button(this, menuX - half / 2 - gap / 2, y, half, bh, '', { variant: 'dark', size: 22, onClick: () => this.toggleSound() });
    this.refreshSound();
    if (canOfferInstall()) new Button(this, menuX + half / 2 + gap / 2, y, half, bh, '📲 앱 설치', { variant: 'dark', size: 22, onClick: () => void installApp() });
    else new Button(this, menuX + half / 2 + gap / 2, y, half, bh, '📖 강화 규칙', { variant: 'dark', size: 22, onClick: () => this.openRules() });
    if (!fresh) {
      y += bh + gap;
      new Button(this, menuX, y, bw, bh, '↺ 처음부터 하기', { variant: 'ghost', size: 22, onClick: () => this.confirmRestart() });
    }

    this.input.keyboard?.once('keydown-ENTER', () => this.enterForge());
  }

  private drawBackground() {
    const key = PORTRAIT && this.textures.exists('art-forge_bg_portrait') ? 'art-forge_bg_portrait' : 'art-forge_bg';
    if (this.textures.exists(key)) {
      const bg = this.add.image(W / 2, H / 2, key);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    } else this.add.rectangle(W / 2, H / 2, W, H, C.bg);
    const shade = this.add.graphics();
    shade.fillStyle(0x000000, 0.55).fillRect(0, 0, W, H);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0.6, 0, 0).fillRect(0, 0, W, H * 0.25);
    // drifting embers
    this.add.particles(0, 0, 'ember', {
      x: { min: 0, max: W },
      y: H + 10,
      speedY: { min: -90, max: -40 },
      speedX: { min: -15, max: 15 },
      lifespan: 6000,
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff7a2a, 0xffb347, 0xffe08a],
      frequency: 160,
      blendMode: 'ADD',
    });
  }

  private refreshAccount() {
    if (!this.accountText?.active) return;
    const u = account.user;
    this.accountText.setText(u ? `👤 ${u.name}${u.google ? ' · 구글' : ' · 게스트'}` : '로그인하지 않음 · 랭킹 미등록');
    this.accountText.setColor(u ? '#f1e6d2' : '#9a8d7a');
    this.accountBtn.setLabel?.(u ? '내 계정' : '로그인');
  }

  private accountAction() {
    if (account.user) void openRanking();
    else void openLogin();
  }

  private toggleSound() {
    Sfx.setGlobalMuted(!Sfx.globalMuted);
    this.refreshSound();
  }

  private refreshSound() {
    this.soundBtn.setLabel?.(Sfx.globalMuted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐');
  }

  private replayIntro() {
    const data: CinematicData = { clips: INTRO, next: 'Lobby', titleCard: true, seenId: 'intro' };
    this.scene.start('Cinematic', data);
  }

  private openRules() {
    this.scene.pause();
    this.scene.launch('Modal', { kind: 'tutorial', replay: true, returnTo: 'Lobby' });
  }

  /** Abandon the current run and start again from DAY 1 (records and the ranking best stay). */
  private confirmRestart() {
    const s = this.core.state;
    this.scene.pause();
    this.scene.launch('Modal', {
      kind: 'confirm',
      danger: true,
      title: '처음부터 다시 할까요?',
      body: `지금 진행 중인 DAY ${s.day}의 무기 ${s.weapons.length}자루, ${s.gold.toLocaleString()}G, 배운 강화 스킬이 모두 사라지고 DAY 1부터 다시 시작합니다.\n최고 기록과 랭킹 기록은 그대로 남습니다.\n\n되돌릴 수 없습니다.`,
      confirmLabel: '처음부터 시작',
      cancelLabel: '취소',
      returnTo: 'Lobby',
      onConfirm: () => {
        this.core.dispatch({ type: 'NEW_RUN' });
        this.scene.restart();
      },
    });
  }

  private enterForge() {
    this.input.enabled = false;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Forge'));
  }
}
