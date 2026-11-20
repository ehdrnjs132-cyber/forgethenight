// Real-time online duel (user request 2026-11-20). Both players move and swing live; positions are
// streamed through the server. The attacker's screen decides whether a swing connects (so it feels
// right on a laggy phone), the server checks reach and swing speed, owns the HP and calls the winner.
//   Phone: left half = drag to move, right buttons = 공격 / 회피.   PC: WASD move, J/Space 공격, K/Shift 회피.
import Phaser from 'phaser';
import { ELEMENT_INFO, type Element } from '../../config/weapons';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { Sfx } from '../audio/sfx';
import { DUEL_RULES, duel, type DuelMsg, type MatchInfo } from '../../online/duel';

const SEND_MS = 50;

interface Fighter {
  body: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  swing: Phaser.GameObjects.Graphics;
  tag: Phaser.GameObjects.Container;
  x: number;
  y: number;
  fx: number;
  fy: number;
  act: string;
  /** Opponent only: where the network says it is (drawn position eases toward it). */
  tx: number;
  ty: number;
}

export class DuelScene extends Phaser.Scene {
  private sfx = new Sfx();
  private m!: MatchInfo;
  private you: 0 | 1 = 0;
  private arena = { x: 0, y: 0, s: 1 };
  private me!: Fighter;
  private opp!: Fighter;
  private hp: [number, number] = [DUEL_RULES.hp, DUEL_RULES.hp];
  private hpBars: Phaser.GameObjects.Graphics[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private center!: Phaser.GameObjects.Text;
  private fightAt = 0;
  private endsAt = 0;
  private over = false;
  private lastSwing = -9999;
  private dashUntil = 0;
  private lastDash = -9999;
  private lastSend = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  private stickG!: Phaser.GameObjects.Graphics;
  private off: (() => void) | null = null;

  constructor() {
    super('Duel');
  }

  create(m: MatchInfo) {
    this.m = m;
    this.you = m.you;
    this.over = false;
    this.hp = [DUEL_RULES.hp, DUEL_RULES.hp];
    this.hpBars = [];
    this.lastSwing = -9999;
    this.lastDash = -9999;
    this.dashUntil = 0;
    this.stick = { id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
    // wall clock, like the server (the scene clock can drift on a phone that paused the page)
    const now = Date.now();
    this.fightAt = now + m.countdownMs;
    this.endsAt = this.fightAt + m.fightMs;

    // arena: a square fitted to the screen (top part on phones, left part on PC)
    const size = PORTRAIT ? W - 40 : H - 120;
    this.arena = { x: PORTRAIT ? 20 : 40, y: PORTRAIT ? 170 : 90, s: size / DUEL_RULES.arena.w };
    this.add.graphics().fillStyle(0x07060a, 1).fillRect(0, 0, W, H);
    const floor = this.add.graphics();
    if (this.textures.exists('ground')) this.add.tileSprite(this.arena.x + size / 2, this.arena.y + size / 2, size, size, 'ground').setAlpha(0.9);
    floor.lineStyle(4, 0x8a5a2a, 1).strokeRect(this.arena.x, this.arena.y, size, size);
    floor.lineStyle(2, 0x3b2d1e, 0.6).strokeCircle(this.arena.x + size / 2, this.arena.y + size / 2, size * 0.3);

    const sides = m.sides;
    this.me = this.makeFighter(sides[this.you].x, sides[this.you].y, sides[this.you].element, sides[this.you].name, sides[this.you].level, true);
    this.opp = this.makeFighter(sides[1 - this.you].x, sides[1 - this.you].y, sides[1 - this.you].element, sides[1 - this.you].name, sides[1 - this.you].level, false);
    this.me.fx = this.you === 0 ? 1 : -1;
    this.opp.fx = -this.me.fx;

    // HUD: HP bars (me left), timer, bet
    const big = PORTRAIT ? 1.1 : 1;
    const hudY = PORTRAIT ? 40 : 30;
    const barW = PORTRAIT ? 280 : 420;
    for (const [i, side] of [this.you, 1 - this.you].entries()) {
      const x = i === 0 ? 20 : W - 20 - barW;
      label(this, i === 0 ? x : x + barW, hudY - 20, `${sides[side].name}${i === 0 ? ' (나)' : ''} · +${sides[side].level}`, 16 * big, i === 0 ? C.goldHi : C.dangerHi, { weight: 900, origin: [i === 0 ? 0 : 1, 0.5] });
      const g = this.add.graphics({ x, y: hudY });
      g.setData('w', barW);
      this.hpBars[side] = g;
    }
    this.drawHp();
    this.timerText = label(this, W / 2, hudY + (PORTRAIT ? 50 : 6), '', 28 * big, C.text, { display: true, weight: 900, origin: [0.5, 0.5] });
    label(this, W / 2, hudY + (PORTRAIT ? 86 : 40), `판돈 ${m.bet.toLocaleString()}G`, 16 * big, C.goldHi, { weight: 700, origin: [0.5, 0.5] });
    this.center = label(this, this.arena.x + size / 2, this.arena.y + size / 2, '', 90, C.text, { display: true, weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 10).setDepth(30);

    // controls
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-J', () => this.swing());
    this.input.keyboard!.on('keydown-SPACE', () => this.swing());
    this.input.keyboard!.on('keydown-K', () => this.dash());
    this.input.keyboard!.on('keydown-SHIFT', () => this.dash());
    this.stickG = this.add.graphics().setDepth(40);
    const ctrlY = PORTRAIT ? this.arena.y + size + (H - this.arena.y - size) / 2 : H - 120;
    if (PORTRAIT) {
      new Button(this, W - 130, ctrlY - 40, 200, 120, '공격', { variant: 'danger', size: 34, onClick: () => undefined }).on('pointerdown', () => this.swing());
      new Button(this, W - 290, ctrlY + 60, 120, 80, '회피', { variant: 'dark', size: 24, onClick: () => undefined }).on('pointerdown', () => this.dash());
      label(this, 40, ctrlY, '여기를 끌어\n움직이기', 18, C.dim, { weight: 700, origin: [0, 0.5] });
    } else {
      label(this, this.arena.x + size + 40, 200, 'WASD 이동\nJ / Space 공격\nK / Shift 회피', 22, C.mute, { weight: 700, lineSpacing: 10 });
      new Button(this, W - 200, H - 230, 240, 90, '공격 (J)', { variant: 'danger', size: 28, onClick: () => undefined }).on('pointerdown', () => this.swing());
      new Button(this, W - 200, H - 120, 240, 70, '회피 (K)', { variant: 'dark', size: 22, onClick: () => undefined }).on('pointerdown', () => this.dash());
    }
    new Button(this, PORTRAIT ? 90 : W - 200, PORTRAIT ? H - 50 : H - 40, 150, 48, '기권', { variant: 'ghost', size: 18, onClick: () => this.forfeit() });
    // virtual stick: touch the left part of the screen below / beside the arena, or the arena itself
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stick.id !== -1 || p.x > W * 0.55) return;
      this.stick = { id: p.id, ox: p.x, oy: p.y, dx: 0, dy: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stick.id) return;
      const dx = p.x - this.stick.ox;
      const dy = p.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      const k = len > 70 ? 70 / len : 1;
      this.stick.dx = (dx * k) / 70;
      this.stick.dy = (dy * k) / 70;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.stick.id) this.stick = { id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.off = duel.on((msg) => this.onMsg(msg));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.off?.());
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private makeFighter(x: number, y: number, element: string, name: string, level: number, mine: boolean): Fighter {
    const col = ELEMENT_INFO[element as Element]?.color ?? 0xffffff;
    const ring = this.add.graphics();
    const swing = this.add.graphics().setDepth(5);
    const body = this.add.image(0, 0, 'player').setScale(1.7).setDepth(4);
    if (!mine) body.setTint(0xff9a9a);
    const tag = this.add.container(0, 0).setDepth(6);
    tag.add(label(this, 0, -62, name, 16, mine ? C.goldHi : C.dangerHi, { weight: 900, origin: [0.5, 0.5] }).setStroke('#05060c', 5));
    tag.add(new LevelBadge(this, 0, -88, level, 16));
    ring.lineStyle(3, col, 0.9).strokeEllipse(0, 22, 70, 22);
    const f: Fighter = { body, ring, swing, tag, x, y, fx: 1, fy: 0, act: 'idle', tx: x, ty: y };
    this.place(f);
    return f;
  }

  private sx(x: number) {
    return this.arena.x + x * this.arena.s;
  }
  private sy(y: number) {
    return this.arena.y + y * this.arena.s;
  }

  private place(f: Fighter) {
    const x = this.sx(f.x);
    const y = this.sy(f.y);
    f.body.setPosition(x, y).setFlipX(f.fx < 0);
    f.ring.setPosition(x, y);
    f.swing.setPosition(x, y);
    f.tag.setPosition(x, y);
    f.body.setAlpha(f.act === 'dash' ? 0.5 : 1);
  }

  private onMsg(m: DuelMsg) {
    if (!this.scene.isActive()) return;
    switch (m.t) {
      case 'opp':
        this.opp.tx = m.x;
        this.opp.ty = m.y;
        if (m.fx || m.fy) {
          this.opp.fx = m.fx;
          this.opp.fy = m.fy;
        }
        if (m.act === 'swing' && this.opp.act !== 'swing') this.drawSwing(this.opp, this.m.sides[1 - this.you].element);
        this.opp.act = m.act;
        break;
      case 'hp': {
        const target = (1 - m.by) as 0 | 1;
        this.hp = m.hp;
        this.drawHp();
        const f = target === this.you ? this.me : this.opp;
        this.damageText(f, m.dmg, target === this.you);
        if (target === this.you) {
          this.cameras.main.shake(140, 0.01);
          this.sfx.hurt();
        } else this.sfx.kill();
        break;
      }
      case 'end':
        this.finish(m.winner, m.reason, m.bet, m.hp);
        break;
      case 'closed':
        if (!this.over) this.finish(null, 'leave', this.m.bet, this.hp, true);
        break;
    }
  }

  update(_t: number, delta: number) {
    const time = Date.now();
    // countdown and clock
    if (!this.over) {
      if (time < this.fightAt) this.center.setText(String(Math.ceil((this.fightAt - time) / 1000)));
      else if (time < this.fightAt + 700) this.center.setText('FIGHT!');
      else this.center.setText('');
      const left = Math.max(0, Math.ceil((this.endsAt - Math.max(time, this.fightAt)) / 1000));
      this.timerText.setText(`${left}`);
    }
    // opponent eases toward the network position
    const o = this.opp;
    const k = Math.min(1, delta / 90);
    o.x += (o.tx - o.x) * k;
    o.y += (o.ty - o.y) * k;
    this.place(o);

    if (this.over || time < this.fightAt) {
      this.place(this.me);
      return;
    }
    // my movement
    const kb = this.keys;
    let mx = (kb.D.isDown || kb.RIGHT.isDown ? 1 : 0) - (kb.A.isDown || kb.LEFT.isDown ? 1 : 0) + this.stick.dx;
    let my = (kb.S.isDown || kb.DOWN.isDown ? 1 : 0) - (kb.W.isDown || kb.UP.isDown ? 1 : 0) + this.stick.dy;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const me = this.me;
    const dashing = time < this.dashUntil;
    if (len > 0.15) {
      me.fx = mx / Math.max(len, 1e-6);
      me.fy = my / Math.max(len, 1e-6);
    }
    const sp = (dashing ? DUEL_RULES.dash.speed : DUEL_RULES.speed) * (delta / 1000);
    const dirX = dashing ? me.fx : mx;
    const dirY = dashing ? me.fy : my;
    me.x = Phaser.Math.Clamp(me.x + dirX * sp, 30, DUEL_RULES.arena.w - 30);
    me.y = Phaser.Math.Clamp(me.y + dirY * sp, 30, DUEL_RULES.arena.h - 30);
    me.act = dashing ? 'dash' : time - this.lastSwing < 200 ? 'swing' : 'idle';
    this.place(me);

    if (time - this.lastSend > SEND_MS) {
      this.lastSend = time;
      duel.send({ t: 'state', x: Math.round(me.x), y: Math.round(me.y), fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), act: me.act });
    }
    // stick
    const g = this.stickG;
    g.clear();
    if (this.stick.id !== -1) {
      g.lineStyle(3, 0xffffff, 0.35).strokeCircle(this.stick.ox, this.stick.oy, 70);
      g.fillStyle(0xffffff, 0.4).fillCircle(this.stick.ox + this.stick.dx * 70, this.stick.oy + this.stick.dy * 70, 28);
    }
  }

  private swing() {
    const now = Date.now();
    if (this.over || now < this.fightAt || now - this.lastSwing < DUEL_RULES.swingMs) return;
    this.lastSwing = now;
    this.drawSwing(this.me, this.m.sides[this.you].element);
    this.sfx.raise();
    // does it reach the opponent as I see them? (a dodging opponent cannot be hit)
    const dx = this.opp.x - this.me.x;
    const dy = this.opp.y - this.me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > DUEL_RULES.range || this.opp.act === 'dash') return;
    const angle = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - Math.atan2(this.me.fy, this.me.fx)));
    if (dist > 40 && angle > DUEL_RULES.arc) return;
    duel.send({ t: 'hit' });
  }

  private dash() {
    const now = Date.now();
    if (this.over || now < this.fightAt || now - this.lastDash < DUEL_RULES.dash.cooldownMs) return;
    this.lastDash = now;
    this.dashUntil = now + DUEL_RULES.dash.ms;
  }

  private drawSwing(f: Fighter, element: string) {
    const col = ELEMENT_INFO[element as Element]?.glow ?? 0xffffff;
    const g = f.swing;
    g.clear();
    const a = Math.atan2(f.fy, f.fx);
    const r = DUEL_RULES.range * this.arena.s;
    g.fillStyle(col, 0.45);
    g.slice(0, 0, r, a - DUEL_RULES.arc, a + DUEL_RULES.arc, false);
    g.fillPath();
    g.lineStyle(4, 0xffffff, 0.8);
    g.beginPath();
    g.arc(0, 0, r, a - DUEL_RULES.arc, a + DUEL_RULES.arc, false);
    g.strokePath();
    g.setAlpha(1);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.clear() });
  }

  private drawHp() {
    for (const side of [0, 1] as const) {
      const g = this.hpBars[side];
      if (!g) continue;
      const w = g.getData('w') as number;
      const pct = Math.max(0, this.hp[side]) / DUEL_RULES.hp;
      g.clear();
      g.fillStyle(0x2a1d1d, 1).fillRoundedRect(0, 0, w, 20, 8);
      g.fillStyle(side === this.you ? 0x6fd36f : C.danger, 1).fillRoundedRect(0, 0, Math.max(8, w * pct), 20, 8);
      g.lineStyle(2, 0x000000, 0.6).strokeRoundedRect(0, 0, w, 20, 8);
    }
  }

  private damageText(f: Fighter, dmg: number, mine: boolean) {
    const t = label(this, this.sx(f.x), this.sy(f.y) - 40, `-${dmg}`, 34, mine ? C.dangerHi : 0xffe08a, { weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 7).setDepth(20);
    this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    f.body.setTintFill(0xffffff);
    this.time.delayedCall(90, () => (f === this.opp ? f.body.setTint(0xff9a9a) : f.body.clearTint()));
  }

  private forfeit() {
    if (this.over) return this.backToLobby();
    duel.send({ t: 'leave' });
  }

  private finish(winner: 0 | 1 | null, reason: string, bet: number, hp: [number, number], lost = false) {
    if (this.over) return;
    this.over = true;
    this.hp = hp;
    this.drawHp();
    this.center.setText('');
    const won = winner === this.you;
    const draw = winner === null;
    const big = PORTRAIT ? 1.15 : 1;
    const layer = this.add.container(0, 0).setDepth(60);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive());
    const title = lost ? '연결이 끊겼다' : draw ? '무승부' : won ? '승리!' : '패배';
    const col = lost || draw ? C.text : won ? C.goldHi : C.dangerHi;
    layer.add(label(this, W / 2, H / 2 - 110, title, 72 * big, col, { display: true, weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 10));
    const why = reason === 'ko' ? '쓰러뜨렸다' : reason === 'time' ? '시간 종료 · 남은 체력으로 판정' : '상대가 자리를 떴다';
    const gold = lost ? '결과는 서버가 정리한다' : draw ? '판돈은 그대로' : won ? `+${bet.toLocaleString()}G` : `−${bet.toLocaleString()}G`;
    layer.add(label(this, W / 2, H / 2 - 30, lost ? '' : reason === 'leave' && !won ? '기권했다' : why, 20 * big, C.mute, { weight: 700, origin: [0.5, 0.5] }));
    layer.add(label(this, W / 2, H / 2 + 20, gold, 36 * big, won ? C.goldHi : C.text, { weight: 900, origin: [0.5, 0.5] }));
    layer.add(new Button(this, W / 2, H / 2 + 120, 300, 66, '결투장으로', { variant: 'gold', size: 24 * big, onClick: () => this.backToLobby() }));
    if (won) this.sfx.levelUp();
  }

  private backToLobby() {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('DuelLobby'));
  }
}
