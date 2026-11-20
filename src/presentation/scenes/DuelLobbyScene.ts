// Online duel lobby (user request 2026-11-20): everyone in here is listed; pick one, choose the bet
// (a share of the smaller purse) and send a challenge. A challenge from someone else pops up with
// accept / decline. When both agree the server starts a real-time duel (DuelScene).
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { equippedWeapon } from '../../core/systems/weapons';
import type { NightWeapon } from '../../core/systems/daynight';
import { weaponDisplayName } from '../../config/swordNames';
import { ELEMENT_INFO, type Element } from '../../config/weapons';
import { C, H, W, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { Sfx } from '../audio/sfx';
import { DUEL_RULES, duel, type DuelMsg, type LobbyPlayer, type MyDuelInfo } from '../../online/duel';

/** The weapon taken into a duel: the equipped one, else the highest (else the starter hammer). */
export function myNightWeapon(core: GameCore): NightWeapon {
  const s = core.state;
  const w = equippedWeapon(s) ?? [...s.weapons].sort((a, b) => b.level - a.level)[0];
  return w ? { kind: 'weapon', weapon: w } : { kind: 'hammer' };
}

/** The weapon taken into a duel: the equipped one, else the highest. */
export function myDuelInfo(core: GameCore): MyDuelInfo {
  const s = core.state;
  const w = equippedWeapon(s) ?? [...s.weapons].sort((a, b) => b.level - a.level)[0];
  return { weapon: w ? { level: w.level, element: w.element, name: weaponDisplayName(w) } : { level: 0, element: 'fire', name: '대장장이 망치' }, gold: s.gold };
}

export class DuelLobbyScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private list!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private meText!: Phaser.GameObjects.Text;
  private pct: number = DUEL_RULES.betPcts[0];
  private pctBtns: Button[] = [];
  private pending: { id: string; name: string } | null = null;
  private cancelBtn!: Button;
  private popup: Phaser.GameObjects.Container | null = null;
  private off: (() => void) | null = null;
  private leaving = false;

  constructor() {
    super('DuelLobby');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.pending = null;
    this.popup = null;
    this.leaving = false;
    this.pctBtns = [];
    this.cameras.main.fadeIn(250, 0, 0, 0);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0608, 0x0a0608, 0x1c0b08, 0x1c0b08, 1).fillRect(0, 0, W, H);
    const big = PORTRAIT ? 1.15 : 1;
    const top = PORTRAIT ? 40 : 34;
    new Button(this, 86, top, 150, 56, '◀ 로비', { variant: 'dark', size: 20 * big, onClick: () => this.back() });
    label(this, W / 2, top, '⚔ 온라인 결투', 34 * big, C.gold, { display: true, weight: 900, origin: [0.5, 0.5] });

    // my weapon and purse
    const info = myDuelInfo(this.core);
    const cardY = PORTRAIT ? 130 : 108;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(20, cardY - 40, W - 40, 80, 14);
    g.lineStyle(2, ELEMENT_INFO[info.weapon.element as Element].color, 0.8).strokeRoundedRect(20, cardY - 40, W - 40, 80, 14);
    new LevelBadge(this, 70, cardY, info.weapon.level, 24);
    this.meText = label(this, 116, cardY, `${info.weapon.name}  ·  ${info.gold.toLocaleString()}G`, 20 * big, C.text, { weight: 900, origin: [0, 0.5] });

    // bet
    const betY = cardY + (PORTRAIT ? 82 : 70);
    label(this, 30, betY, '판돈', 18 * big, C.goldHi, { weight: 900, origin: [0, 0.5] });
    DUEL_RULES.betPcts.forEach((p, i) => {
      const b = new Button(this, 150 + i * 130, betY, 116, 50, `${p}%`, { variant: 'dark', size: 20 * big, onClick: () => this.setPct(p) });
      this.pctBtns.push(b);
    });
    label(this, W - 30, betY, PORTRAIT ? '' : '두 사람 중 적은 골드 기준', 13, C.mute, { weight: 700, origin: [1, 0.5] });
    this.setPct(this.pct);

    label(this, 30, betY + 52, PORTRAIT ? '결투장에 있는 사람 · 이긴 쪽이 판돈을 가져간다' : '결투장에 있는 사람 · 이긴 쪽이 판돈을 가져간다 (판돈은 두 사람 중 적은 골드 기준)', 15 * big, C.mute, { weight: 700, origin: [0, 0.5], wrap: W - 60 });
    this.list = this.add.container(0, betY + 86);

    this.status = label(this, W / 2, H - (PORTRAIT ? 130 : 86), '결투장에 연결하는 중… (서버가 자고 있으면 30초쯤)', 17 * big, C.goldHi, { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: W - 40 });
    this.cancelBtn = new Button(this, W / 2, H - (PORTRAIT ? 70 : 40), 260, 54, '신청 취소', { variant: 'dark', size: 19 * big, onClick: () => this.cancelChallenge() });
    this.cancelBtn.setVisible(false);

    this.off = duel.on((m) => this.onMsg(m));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.off?.());
    duel
      .connect(info)
      .then(() => {
        this.status.setText('');
        this.renderList();
      })
      .catch((e: Error) => {
        this.status.setText(e.message === 'login' || e.message === 'auth' ? '구글 로그인이 필요합니다' : '결투장 서버에 연결하지 못했습니다. 잠시 후 다시 들어와 주세요.');
      });
    this.input.keyboard?.on('keydown-ESC', () => this.back());
  }

  private setPct(p: number) {
    this.pct = p;
    DUEL_RULES.betPcts.forEach((v, i) => this.pctBtns[i]?.setAlpha(v === p ? 1 : 0.45));
  }

  private onMsg(m: DuelMsg) {
    if (!this.scene.isActive()) return;
    switch (m.t) {
      case 'lobby':
        this.renderList();
        break;
      case 'challengeSent':
        this.pending = { id: m.id, name: m.to.name };
        this.status.setText(`${m.to.name}에게 결투를 신청했다 · 판돈 ${m.bet.toLocaleString()}G\n대답을 기다리는 중…`);
        this.cancelBtn.setVisible(true);
        this.renderList();
        break;
      case 'challengeFailed':
        this.status.setText(m.reason === 'gold' ? '판돈이 0G입니다 · 둘 중 한 명의 골드가 너무 적다' : '상대가 지금 결투할 수 없다');
        break;
      case 'declined':
        if (this.pending?.id !== m.id) return;
        this.status.setText(`${this.pending.name}: ${m.reason === 'no' ? '결투를 거절했다' : m.reason === 'timeout' ? '대답이 없다' : '자리를 떴다'}`);
        this.pending = null;
        this.cancelBtn.setVisible(false);
        this.renderList();
        break;
      case 'challenged':
        this.showChallenge(m.id, m.from, m.bet, m.seconds);
        break;
      case 'challengeGone':
        this.popup?.destroy(true);
        this.popup = null;
        break;
      case 'start':
        this.sfx.levelUp();
        this.leaving = true;
        // the duel is the night-gamble fight against the other player (NightScene online mode)
        this.scene.start('Night', { weapon: myNightWeapon(this.core), day: this.core.state.day, lineup: [], online: m.match });
        break;
      case 'gold':
        this.meText.setText(`${myDuelInfo(this.core).weapon.name}  ·  ${this.core.state.gold.toLocaleString()}G`);
        break;
      case 'error':
        if (m.error === 'elsewhere') this.status.setText('다른 기기에서 결투장에 들어와 연결을 넘겼습니다');
        break;
      case 'closed':
        if (!this.leaving) this.status.setText('결투장 연결이 끊겼습니다. 다시 들어와 주세요.');
        break;
    }
  }

  private renderList() {
    const c = this.list;
    c.removeAll(true);
    const others = duel.lobby.filter((p) => p.uid !== duel.me?.uid);
    const big = PORTRAIT ? 1.1 : 1;
    if (!duel.connected) return;
    if (!others.length) {
      c.add(label(this, W / 2, 60, '아직 아무도 없다.\n친구에게 결투장에 들어오라고 해 보자.', 18 * big, C.mute, { weight: 700, origin: [0.5, 0.5], align: 'center' }));
      return;
    }
    const rowH = PORTRAIT ? 92 : 70;
    const maxRows = Math.floor((H - (PORTRAIT ? 160 : 100) - c.y) / rowH);
    others.slice(0, maxRows).forEach((p, i) => {
      const y = i * rowH + rowH / 2;
      const g = this.add.graphics();
      const col = ELEMENT_INFO[p.element as Element]?.color ?? C.edge;
      g.fillStyle(0x000000, 0.4).fillRoundedRect(20, y - rowH / 2 + 4, W - 40, rowH - 8, 12);
      g.lineStyle(2, col, 0.6).strokeRoundedRect(20, y - rowH / 2 + 4, W - 40, rowH - 8, 12);
      const badge = new LevelBadge(this, 62, y, p.level, 20);
      const name = label(this, 100, y - 14, p.name, 20 * big, C.text, { weight: 900, origin: [0, 0.5] });
      const sub = label(this, 100, y + 14, `${p.weaponName} · ${p.gold.toLocaleString()}G`, 14 * big, col, { weight: 700, origin: [0, 0.5] });
      const can = !p.busy && !this.pending;
      const btn = new Button(this, W - 110, y, 170, rowH - 26, p.busy ? '결투 중' : '결투 신청', { variant: can ? 'gold' : 'dark', size: 18 * big, onClick: () => this.challenge(p) });
      btn.setEnabled(can);
      c.add([g, badge, name, sub, btn]);
    });
  }

  private challenge(p: LobbyPlayer) {
    if (this.pending) return;
    this.sfx.click();
    duel.update(myDuelInfo(this.core));
    duel.send({ t: 'challenge', to: p.uid, pct: this.pct });
  }

  private cancelChallenge() {
    if (!this.pending) return;
    duel.send({ t: 'cancel', id: this.pending.id });
    this.pending = null;
    this.cancelBtn.setVisible(false);
    this.status.setText('신청을 취소했다');
    this.renderList();
  }

  private showChallenge(id: string, from: LobbyPlayer, bet: number, seconds: number) {
    this.popup?.destroy(true);
    this.sfx.raise();
    const layer = this.add.container(0, 0).setDepth(50);
    this.popup = layer;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setInteractive();
    const pw = Math.min(W - 40, 620);
    const ph = PORTRAIT ? 420 : 340;
    const g = this.add.graphics();
    g.fillStyle(0x1a110b, 1).fillRoundedRect(W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 18);
    g.lineStyle(3, C.danger, 1).strokeRoundedRect(W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 18);
    const big = PORTRAIT ? 1.15 : 1;
    const title = label(this, W / 2, H / 2 - ph / 2 + 50, '⚔ 결투 신청', 32 * big, C.dangerHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    const who = label(this, W / 2, H / 2 - ph / 2 + 110, `${from.name}  ·  +${from.level} ${from.weaponName}`, 20 * big, C.text, { weight: 900, origin: [0.5, 0.5], align: 'center', wrap: pw - 40 });
    const stake = label(this, W / 2, H / 2 - ph / 2 + 160, `판돈 ${bet.toLocaleString()}G · 이기면 얻고 지면 잃는다`, 18 * big, C.goldHi, { weight: 700, origin: [0.5, 0.5] });
    let left = seconds;
    const timer = label(this, W / 2, H / 2 - ph / 2 + 200, `${left}초 안에 대답`, 15 * big, C.mute, { weight: 700, origin: [0.5, 0.5] });
    const tick = this.time.addEvent({ delay: 1000, repeat: seconds - 1, callback: () => timer.setText(`${--left}초 안에 대답`) });
    const answer = (accept: boolean) => {
      tick.remove();
      duel.update(myDuelInfo(this.core));
      duel.send({ t: 'answer', id, accept });
      layer.destroy(true);
      if (this.popup === layer) this.popup = null;
    };
    const yes = new Button(this, W / 2 + pw / 4 - 10, H / 2 + ph / 2 - 60, pw / 2 - 40, 64, '수락', { variant: 'danger', size: 24 * big, onClick: () => answer(true) });
    const no = new Button(this, W / 2 - pw / 4 + 10, H / 2 + ph / 2 - 60, pw / 2 - 40, 64, '거절', { variant: 'dark', size: 22 * big, onClick: () => answer(false) });
    layer.add([dim, g, title, who, stake, timer, yes, no]);
  }

  private back() {
    if (this.leaving) return;
    this.leaving = true;
    if (this.pending) duel.send({ t: 'cancel', id: this.pending.id });
    duel.disconnect();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Lobby'));
  }
}
