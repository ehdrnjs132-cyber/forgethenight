// Cutscene player (reboot spec PART 8). Plays Higgsfield video files in order with Korean subtitles;
// a missing or broken file becomes a slow-zoom still with the same subtitles. Skip one clip (Space /
// Enter / button) or the whole sequence (Esc / button). Starts with a click so the browser allows
// sound, blocks every game input while it runs, then hands over to the next scene.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { CLIPS, type Clip } from '../../config/cinematics';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';

export interface CinematicData {
  clips: string[];
  /** Scene to start afterwards. */
  next: string;
  /** Show the FORGE THE NIGHT title card at the end (intro). */
  titleCard?: boolean;
  /** Record id for "already watched" (the intro plays automatically only once). */
  seenId?: string;
}

/** How long to wait for a video to become playable before using the stand-in. */
const LOAD_TIMEOUT_MS = 2500;

export class CinematicScene extends Phaser.Scene {
  private data_!: CinematicData;
  private index = 0;
  private video: HTMLVideoElement | null = null;
  private still: Phaser.GameObjects.Image | null = null;
  private subtitle!: Phaser.GameObjects.Text;
  private speaker!: Phaser.GameObjects.Text;
  private timers: Phaser.Time.TimerEvent[] = [];
  private finished = false;
  private clipToken = 0;

  constructor() {
    super('Cinematic');
  }

  create(data: CinematicData) {
    this.data_ = data;
    this.index = 0;
    this.finished = false;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 1).setInteractive(); // swallow all clicks
    this.speaker = label(this, W / 2, H - 112, '', 15, C.goldHi, { weight: 900, origin: [0.5, 0.5] }).setDepth(20);
    this.subtitle = label(this, W / 2, H - 80, '', 24, C.text, { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: W - 200 }).setDepth(20);
    this.subtitle.setStroke('#000000', 6);
    this.speaker.setStroke('#000000', 5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeVideo());

    // Browsers block sound (and often video) until the page is clicked: ask for that click first.
    const t = label(this, W / 2, H / 2 - 20, '클릭하여 시작', 30, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    const s = label(this, W / 2, H / 2 + 24, '소리를 켜고 감상하세요 · Esc 전체 건너뛰기', 14, C.mute, { origin: [0.5, 0.5] });
    this.tweens.add({ targets: t, alpha: 0.4, duration: 800, yoyo: true, repeat: -1 });
    const begin = () => {
      t.destroy();
      s.destroy();
      this.buildControls();
      this.playClip();
    };
    this.input.once('pointerdown', begin);
    this.input.keyboard!.once('keydown-ESC', () => this.finish());
    this.input.keyboard!.once('keydown-ENTER', () => {
      this.input.off('pointerdown', begin);
      begin();
    });
  }

  private buildControls() {
    new Button(this, W - 230, 40, 140, 40, '건너뛰기 ▶', { variant: 'ghost', size: 14, onClick: () => this.nextClip() }).setDepth(30);
    new Button(this, W - 84, 40, 130, 40, '전체 건너뛰기', { variant: 'ghost', size: 13, onClick: () => this.finish() }).setDepth(30);
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.nextClip());
    kb.on('keydown-ENTER', () => this.nextClip());
    kb.on('keydown-ESC', () => this.finish());
  }

  private playClip() {
    if (this.finished) return;
    const id = this.data_.clips[this.index];
    const clip = id ? CLIPS[id] : undefined;
    if (!clip) {
      this.finish();
      return;
    }
    const token = ++this.clipToken;
    this.clearClip();
    const v = document.createElement('video');
    v.src = clip.file;
    v.playsInline = true;
    v.preload = 'auto';
    Object.assign(v.style, { position: 'fixed', zIndex: '5', background: '#000', objectFit: 'cover', pointerEvents: 'none' });
    let started = false;
    const fallback = this.time.delayedCall(LOAD_TIMEOUT_MS, () => token === this.clipToken && !started && this.playStill(clip, token));
    v.addEventListener('error', () => {
      if (token !== this.clipToken || started) return;
      fallback.remove();
      this.removeVideo();
      this.playStill(clip, token);
    });
    v.addEventListener('canplay', () => {
      if (token !== this.clipToken || started) return;
      started = true;
      fallback.remove();
      this.placeVideo();
      v.play().catch(() => this.playStill(clip, token));
      this.scheduleSubtitles(clip, token);
      // safety cap in case 'ended' never fires
      this.timers.push(this.time.delayedCall((clip.seconds + 4) * 1000, () => token === this.clipToken && this.nextClip()));
    });
    v.addEventListener('ended', () => token === this.clipToken && this.nextClip());
    document.body.appendChild(v);
    this.video = v;
    window.addEventListener('resize', this.placeVideo);
  }

  /** Stand-in when the video file is missing: the clip's still, slowly pushing in, with the subtitles. */
  private playStill(clip: Clip, token: number) {
    if (token !== this.clipToken) return;
    this.removeVideo();
    const key = this.textures.exists(clip.fallback) ? clip.fallback : 'art-forge_bg';
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, H / 2, key).setDepth(1);
      const k = Math.max(W / img.width, H / img.height);
      img.setScale(k * 1.02).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 0.75, duration: 700 });
      this.tweens.add({ targets: img, scale: k * 1.12, duration: clip.seconds * 1000, ease: 'Sine.easeInOut' });
      this.still = img;
    }
    const tag = label(this, 24, H - 24, `임시 화면 · ${clip.file} 없음`, 11, C.dim, { origin: [0, 0.5] }).setDepth(20);
    this.timers.push(this.time.delayedCall(clip.seconds * 1000, () => tag.destroy()));
    this.scheduleSubtitles(clip, token);
    this.timers.push(this.time.delayedCall(clip.seconds * 1000, () => token === this.clipToken && this.nextClip()));
  }

  private scheduleSubtitles(clip: Clip, token: number) {
    clip.subtitles.forEach((s, i) => {
      const next = clip.subtitles[i + 1];
      this.timers.push(
        this.time.delayedCall(s.at * 1000, () => {
          if (token !== this.clipToken) return;
          this.speaker.setText(s.speaker ?? '');
          this.subtitle.setText(s.text).setAlpha(0);
          this.tweens.add({ targets: this.subtitle, alpha: 1, duration: 250 });
        }),
      );
      const end = next ? next.at : clip.seconds - 0.3;
      this.timers.push(this.time.delayedCall(end * 1000, () => token === this.clipToken && this.tweens.add({ targets: this.subtitle, alpha: 0, duration: 200 })));
    });
  }

  private nextClip() {
    if (this.finished) return;
    this.index++;
    if (this.index >= this.data_.clips.length) this.finish();
    else this.playClip();
  }

  private clearClip() {
    this.timers.forEach((t) => t.remove());
    this.timers = [];
    this.subtitle.setText('');
    this.speaker.setText('');
    this.still?.destroy();
    this.still = null;
    this.removeVideo();
  }

  private placeVideo = () => {
    if (!this.video) return;
    const r = this.game.canvas.getBoundingClientRect();
    Object.assign(this.video.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };

  private removeVideo() {
    window.removeEventListener('resize', this.placeVideo);
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.remove();
    }
    this.video = null;
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.clipToken++;
    this.clearClip();
    const core = this.registry.get('core') as GameCore;
    if (this.data_.seenId) core.markSeen(this.data_.seenId);
    if (!this.data_.titleCard) {
      this.scene.start(this.data_.next);
      return;
    }
    // Title card: logo and slogans drawn by the game, never baked into the AI video (spec PART 7).
    const title = label(this, W / 2, H / 2 - 40, 'FORGE THE NIGHT', 64, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setDepth(40);
    const tag = label(this, W / 2, H / 2 + 20, 'Forge Your Power. Survive the Night.', 20, C.text, { display: true, weight: 700, origin: [0.5, 0.5] }).setDepth(40);
    const tag2 = label(this, W / 2, H / 2 + 54, 'You Never Know What They Forged.', 16, 0xc9b2ff, { display: true, weight: 700, origin: [0.5, 0.5] }).setDepth(40);
    for (const o of [title, tag, tag2]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 900 });
    }
    this.time.delayedCall(2800, () => {
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.data_.next));
    });
  }
}
