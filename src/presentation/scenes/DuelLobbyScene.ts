// Online duel room (user requests 2026-11-20, redesigned 2026-11-27). Everyone online is listed:
// players in this room can be challenged (a share of the smaller purse is the stake), players who are
// busy in their game or in the main lobby can be invited here. A challenge from someone else pops up
// with accept / decline; when both agree the server starts a real-time duel (NightScene online mode).
//
// Layout: landscape = my weapon, stake and status on the left, the player list on the right;
// portrait = the same blocks stacked, the list scrolling underneath.
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import { equippedWeapon } from '../../core/systems/weapons';
import type { NightWeapon } from '../../core/systems/daynight';
import { weaponDisplayName } from '../../config/swordNames';
import { ELEMENT_INFO, type Element } from '../../config/weapons';
import { C, H, W, css, label } from '../theme';
import { Button } from '../ui/button';
import { LevelBadge } from '../ui/levelBadge';
import { PORTRAIT } from '../layout';
import { Sfx } from '../audio/sfx';
import { glowStrength, weaponLookTexture } from '../weaponArt';
import { DUEL_RULES, duel, type DuelMsg, type LobbyPlayer, type MyDuelInfo } from '../../online/duel';
import { ChatBox } from '../ui/chat';

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

// ── layout
const HEAD_H = PORTRAIT ? 104 : 78;
const PAD = PORTRAIT ? 20 : 24;
const LEFT = PORTRAIT ? { x: PAD, y: HEAD_H + 12, w: W - PAD * 2 } : { x: PAD, y: HEAD_H + 14, w: 400 };
/** The player list: right column (landscape) or under the stacked blocks (portrait). */
const LIST = PORTRAIT
  ? { x: PAD, y: HEAD_H + 12 + 500, w: W - PAD * 2, bottom: H - 84 }
  : { x: PAD + 400 + 24, y: HEAD_H + 14, w: W - (PAD + 400 + 24) - PAD, bottom: H - PAD };
const ROW_H = PORTRAIT ? 104 : 80;
const ROW_GAP = 10;
const BIG = PORTRAIT ? 1.2 : 1;

type Status = { text: string; color: number };
const STATUS: Record<'duel' | 'game' | 'lobby' | 'busy', Status> = {
  duel: { text: '결투장', color: 0x5fd86a },
  game: { text: '게임 중', color: 0xffb547 },
  lobby: { text: '로비', color: 0x7fb8ff },
  busy: { text: '결투 중', color: 0xff6b6b },
};

const statusOf = (p: LobbyPlayer): keyof typeof STATUS => (p.busy ? 'busy' : (p.where ?? 'duel'));

export class DuelLobbyScene extends Phaser.Scene {
  private core!: GameCore;
  private sfx = new Sfx();
  private list!: Phaser.GameObjects.Container;
  private listTitle!: Phaser.GameObjects.Text;
  private onlineChip!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private stakeText!: Phaser.GameObjects.Text;
  private pct: number = DUEL_RULES.betPcts[0];
  private pctY = 0;
  private pctBtns: { pct: number; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; x: number; w: number }[] = [];
  private pending: { id: string; name: string } | null = null;
  /** uid → invitation id I sent and that is still waiting. */
  private invited = new Map<string, string>();
  /** uids that accepted my invitation and are now here (highlighted). */
  private arrived = new Set<string>();
  private cancelBtn!: Button;
  private popup: Phaser.GameObjects.Container | null = null;
  private off: (() => void) | null = null;
  private leaving = false;
  private scroll = 0;
  private rows: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('DuelLobby');
  }

  create() {
    this.core = this.registry.get('core') as GameCore;
    this.pending = null;
    this.popup = null;
    this.leaving = false;
    this.pctBtns = [];
    this.invited = new Map();
    this.arrived = new Set();
    this.scroll = 0;
    this.rows = [];
    this.cameras.main.fadeIn(250, 0, 0, 0);

    this.drawBackground();
    this.buildHeader();
    const info = myDuelInfo(this.core);
    const afterCard = this.buildMyCard(info);
    const afterStake = this.buildStake(afterCard);
    this.buildStatus(afterStake);
    this.buildList();

    // the lobby chat (bottom-left on PC, bottom on phones)
    new ChatBox(this, PORTRAIT ? { mode: 'lobby', x: PAD, y: H - 14, w: W - PAD * 2, grow: 'up', scale: 1.25 } : { mode: 'lobby', x: PAD, y: H - 14, w: 400, grow: 'up' });

    this.off = duel.on((m) => this.onMsg(m));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.off?.());
    this.status.setText('결투장에 연결하는 중… (서버가 자고 있으면 30초쯤)');
    duel
      .connect(info, 'duel')
      .then(() => {
        this.status.setText('판돈을 고르고 상대에게 결투를 신청하세요');
        this.renderList();
      })
      .catch((e: Error) => {
        this.status.setText(e.message === 'login' || e.message === 'auth' ? '구글 로그인이 필요합니다' : '결투장 서버에 연결하지 못했습니다.\n잠시 후 다시 들어와 주세요.');
      });
    this.input.keyboard?.on('keydown-ESC', () => this.back());
  }

  // ───────────────────────── look
  private drawBackground() {
    const key = PORTRAIT && this.textures.exists('art-forge_bg_portrait') ? 'art-forge_bg_portrait' : 'art-forge_bg';
    if (this.textures.exists(key)) {
      const bg = this.add.image(W / 2, H / 2, key);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    }
    const g = this.add.graphics();
    g.fillStyle(0x07040a, 0.82).fillRect(0, 0, W, H);
    // a red glow from below, like an arena under torches
    for (let i = 12; i >= 1; i--) g.fillStyle(0x7a1010, 0.025).fillEllipse(W / 2, H + 40, W * 0.6 + i * 70, 260 + i * 40);
  }

  /** A rounded glass panel. */
  private panel(x: number, y: number, w: number, h: number, edge = 0x5a3a26) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 3, y + 5, w, h, 16);
    g.fillGradientStyle(0x1c1210, 0x1c1210, 0x0e0908, 0x0e0908, 0.94).fillRoundedRect(x, y, w, h, 16);
    g.lineStyle(1.5, edge, 1).strokeRoundedRect(x, y, w, h, 16);
    g.lineStyle(1, 0xffffff, 0.05).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, 12);
    return g;
  }

  private buildHeader() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1a0c0c, 0x1a0c0c, 0x0a0606, 0x0a0606, 0.96).fillRect(0, 0, W, HEAD_H);
    g.lineStyle(2, 0xd1484c, 0.6).lineBetween(0, HEAD_H, W, HEAD_H);
    const cy = HEAD_H / 2;
    new Button(this, PAD + (PORTRAIT ? 64 : 62), cy, PORTRAIT ? 128 : 124, PORTRAIT ? 56 : 46, '◀ 로비', { variant: 'dark', size: 18 * BIG, onClick: () => this.back() });
    label(this, W / 2, cy - (PORTRAIT ? 14 : 11), '⚔ 온라인 결투', 30 * BIG, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setStroke('#140a05', 6);
    label(this, W / 2, cy + (PORTRAIT ? 24 : 19), '실시간 1:1 · 이긴 쪽이 판돈을 가져간다', 13 * BIG, C.mute, { weight: 700, origin: [0.5, 0.5] });
    this.onlineChip = label(this, W - PAD, cy, '', 14 * BIG, 0x8affb0, { weight: 900, origin: [1, 0.5] });
  }

  /** My weapon: its picture, level, name and purse. Returns the y under it. */
  private buildMyCard(info: MyDuelInfo): number {
    const h = PORTRAIT ? 210 : 236;
    const { x, y, w } = LEFT;
    const el = ELEMENT_INFO[info.weapon.element as Element];
    this.panel(x, y, w, h, el?.color ?? C.edge);
    label(this, x + 18, y + 22, '내 결투 무기', 13 * BIG, C.mute, { weight: 900, origin: [0, 0.5] });
    const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const ix = PORTRAIT ? x + 170 : x + w / 2;
    const iy = PORTRAIT ? y + 118 : y + 108;
    for (let i = 5; i >= 1; i--) glow.fillStyle(el?.glow ?? 0xffb347, 0.05).fillEllipse(ix, iy, 120 + i * 50, 40 + i * 18);
    const s = this.core.state;
    const w0 = equippedWeapon(s) ?? [...s.weapons].sort((a, b) => b.level - a.level)[0];
    const key = w0 ? weaponLookTexture(this, w0) : 'weapon-hammer';
    if (this.textures.exists(key)) {
      const img = this.add.image(ix, iy, key);
      img.setScale(Math.min((PORTRAIT ? 280 : 330) / img.width, 96 / img.height));
      const st = w0 ? glowStrength(w0.level) : 0;
      if (st > 0) img.preFX?.addGlow(el?.glow ?? 0xffffff, Math.min(5, st), 0, false, 0.1, 10);
      this.tweens.add({ targets: img, y: iy - 5, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (PORTRAIT) {
      new LevelBadge(this, x + w - 90, y + 64, info.weapon.level, 28);
      label(this, x + w - 24, y + 116, info.weapon.name, 20, C.text, { weight: 900, origin: [1, 0.5] });
      this.goldText = label(this, x + w - 24, y + 156, '', 22, C.goldHi, { weight: 900, origin: [1, 0.5] });
    } else {
      new LevelBadge(this, x + w - 56, y + 30, info.weapon.level, 22);
      label(this, x + w / 2, y + 178, info.weapon.name, 18, C.text, { weight: 900, origin: [0.5, 0.5] });
      this.goldText = label(this, x + w / 2, y + 208, '', 18, C.goldHi, { weight: 900, origin: [0.5, 0.5] });
    }
    this.refreshGold();
    return y + h + 14;
  }

  private refreshGold() {
    this.goldText?.setText(`💰 ${this.core.state.gold.toLocaleString()}G`);
  }

  /** The stake: a segmented control. Returns the y under it. */
  private buildStake(y: number): number {
    const { x, w } = LEFT;
    const h = PORTRAIT ? 128 : 118;
    this.panel(x, y, w, h);
    label(this, x + 18, y + 22, '판돈', 13 * BIG, C.mute, { weight: 900, origin: [0, 0.5] });
    const segW = w - 36;
    const n = DUEL_RULES.betPcts.length;
    const sw = segW / n;
    const sy = (this.pctY = y + (PORTRAIT ? 64 : 58));
    const sh = PORTRAIT ? 46 : 38;
    const track = this.add.graphics();
    track.fillStyle(0x000000, 0.45).fillRoundedRect(x + 18, sy - sh / 2, segW, sh, sh / 2);
    DUEL_RULES.betPcts.forEach((p, i) => {
      const cx = x + 18 + sw * i + sw / 2;
      const g = this.add.graphics();
      const t = label(this, cx, sy, `${p}%`, 18 * BIG, C.text, { weight: 900, origin: [0.5, 0.5] });
      const zone = this.add.zone(cx, sy, sw, sh).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.setPct(p));
      this.pctBtns.push({ pct: p, g, t, x: cx, w: sw - 6 });
    });
    // keyboard: ← → pick the stake
    this.input.keyboard?.on('keydown-LEFT', () => this.stepPct(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.stepPct(1));
    this.stakeText = label(this, x + w / 2, y + h - (PORTRAIT ? 22 : 20), '', 12.5 * BIG, C.mute, { weight: 700, origin: [0.5, 0.5], wrap: w - 30, align: 'center' });
    this.setPct(this.pct, true);
    return y + h + 14;
  }

  private stepPct(d: number) {
    const list = DUEL_RULES.betPcts as readonly number[];
    const i = Math.max(0, Math.min(list.length - 1, list.indexOf(this.pct) + d));
    this.setPct(list[i]);
  }

  private setPct(p: number, quiet = false) {
    this.pct = p;
    if (!quiet) this.sfx.click();
    const sh = PORTRAIT ? 46 : 38;
    for (const b of this.pctBtns) {
      const on = b.pct === p;
      b.g.clear();
      if (on) {
        b.g.fillGradientStyle(0xe3a443, 0xe3a443, 0xb9781c, 0xb9781c, 1).fillRoundedRect(b.x - b.w / 2, this.pctY - sh / 2 + 3, b.w, sh - 6, (sh - 6) / 2);
        b.g.lineStyle(1.5, 0xffe2a0, 1).strokeRoundedRect(b.x - b.w / 2, this.pctY - sh / 2 + 3, b.w, sh - 6, (sh - 6) / 2);
      }
      b.t.setColor(css(on ? 0x1a0f05 : C.mute));
    }
    const mine = Math.floor((this.core.state.gold * p) / 100);
    this.stakeText?.setText(`두 사람 중 적은 골드의 ${p}% · 내 쪽 최대 ${mine.toLocaleString()}G${PORTRAIT ? '' : ' · ← →'}`);
  }

  /** What is happening now (connection, my challenge, answers) and the cancel button. */
  private buildStatus(y: number) {
    const { x, w } = LEFT;
    const h = PORTRAIT ? 116 : 132;
    this.panel(x, y, w, h);
    this.status = label(this, x + w / 2, y + (PORTRAIT ? 36 : 44), '', 15 * BIG, C.goldHi, { weight: 700, origin: [0.5, 0.5], align: 'center', wrap: w - 30, lineSpacing: 4 });
    this.cancelBtn = new Button(this, x + w / 2, y + (PORTRAIT ? 84 : 98), 220, PORTRAIT ? 44 : 40, '신청 취소', { variant: 'dark', size: 16 * BIG, onClick: () => this.cancelChallenge() });
    this.cancelBtn.setVisible(false);
  }

  private buildList() {
    const { x, y, w, bottom } = LIST;
    this.panel(x, y, w, bottom - y);
    this.listTitle = label(this, x + 20, y + 24, '', 15 * BIG, C.text, { weight: 900, origin: [0, 0.5] });
    label(this, x + w - 20, y + 24, PORTRAIT ? '' : '게임 중인 친구는 「초대」로 부를 수 있다', 12, C.dim, { weight: 700, origin: [1, 0.5] });
    const top = y + 48;
    this.list = this.add.container(0, top);
    // only the inside of the panel shows rows
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRect(x, top, w, bottom - top - 8);
    this.list.setMask(maskG.createGeometryMask());
    // scroll: wheel on PC, drag on phones. Scene-level input limited to the list area, so nothing covers
    // the rows' buttons (a zone on top would swallow their clicks)
    const inside = (p: Phaser.Input.Pointer) => p.x >= x && p.x <= x + w && p.y >= top && p.y <= bottom;
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => inside(p) && this.scrollBy(dy * 0.6));
    let drag: number | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (drag = inside(p) ? p.y : null));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (drag === null || !p.isDown) return;
      this.scrollBy(drag - p.y);
      drag = p.y;
    });
    this.input.on('pointerup', () => (drag = null));
  }

  private scrollBy(d: number) {
    const viewH = LIST.bottom - LIST.y - 56;
    const contentH = this.rows.length * (ROW_H + ROW_GAP);
    this.scroll = Phaser.Math.Clamp(this.scroll + d, 0, Math.max(0, contentH - viewH));
    this.placeRows();
  }

  private placeRows() {
    const top = LIST.y + 48;
    const viewBottom = LIST.bottom - 8;
    this.list.y = top - this.scroll;
    // rows outside the panel are switched off so their buttons cannot be clicked through the mask
    for (const r of this.rows) {
      const sy = this.list.y + r.y;
      r.setVisible(sy + ROW_H / 2 > top && sy - ROW_H / 2 < viewBottom);
    }
  }

  // ───────────────────────── messages
  private onMsg(m: DuelMsg) {
    if (!this.scene.isActive()) return;
    switch (m.t) {
      case 'lobby':
        this.renderList();
        break;
      case 'challengeSent':
        this.pending = { id: m.id, name: m.to.name };
        this.status.setText(`${m.to.name}에게 결투를 신청했다\n판돈 ${m.bet.toLocaleString()}G · 대답을 기다리는 중…`);
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
      case 'inviteSent':
        this.invited.set(m.to.uid, m.id);
        this.status.setText(`${m.to.name}에게 초대를 보냈다 · 대답을 기다리는 중…`);
        this.renderList();
        break;
      case 'inviteAccepted':
        this.invited.delete(m.by.uid);
        this.arrived.add(m.by.uid);
        this.sfx.levelUp();
        this.status.setText(`${m.by.name}님이 결투장에 왔다!\n판돈을 고르고 「결투 신청」을 누르세요`);
        this.renderList();
        break;
      case 'inviteDeclined': {
        const who = duel.lobby.find((p) => p.uid === m.to)?.name ?? '상대';
        this.invited.delete(m.to);
        this.status.setText(`${who}: ${m.reason === 'no' ? '초대를 거절했다' : m.reason === 'busy' ? '지금은 올 수 없다 (전투 중)' : m.reason === 'timeout' ? '대답이 없다' : '자리를 떴다'}`);
        this.renderList();
        break;
      }
      case 'start':
        this.sfx.levelUp();
        this.leaving = true;
        // the duel is the night fight against the other player (NightScene online mode)
        this.scene.start('Night', { weapon: myNightWeapon(this.core), day: this.core.state.day, lineup: [], online: m.match });
        break;
      case 'gold':
        this.refreshGold();
        this.setPct(this.pct, true);
        break;
      case 'error':
        if (m.error === 'elsewhere') this.status.setText('다른 기기에서 결투장에 들어와 연결을 넘겼습니다');
        break;
      case 'closed':
        if (!this.leaving) this.status.setText('결투장 연결이 끊겼습니다. 다시 들어와 주세요.');
        this.renderList();
        break;
    }
  }

  // ───────────────────────── the list
  private renderList() {
    const c = this.list;
    c.removeAll(true);
    this.rows = [];
    const everyone = duel.connected ? duel.lobby : [];
    const others = everyone.filter((p) => p.uid !== duel.me?.uid);
    this.onlineChip.setText(duel.connected ? `● 접속 ${everyone.length}명` : '○ 연결 안 됨');
    this.onlineChip.setColor(css(duel.connected ? 0x8affb0 : C.mute));
    const ready = others.filter((p) => statusOf(p) === 'duel').length;
    const invitable = others.filter((p) => !p.busy && p.where !== 'duel' && p.where !== undefined).length;
    this.listTitle.setText(duel.connected ? `결투 상대  ·  바로 결투 ${ready}명 · 초대 가능 ${invitable}명` : '결투 상대');
    if (!duel.connected) return;
    if (!others.length) {
      c.add(label(this, LIST.x + LIST.w / 2, 90, '지금은 아무도 없다.\n친구에게 게임에 들어오라고 해 보자.', 16 * BIG, C.mute, { weight: 700, origin: [0.5, 0.5], align: 'center', lineSpacing: 6 }));
      this.placeRows();
      return;
    }
    // ready to fight first, then those who can be invited, then those mid-duel
    const order = { duel: 0, game: 1, lobby: 2, busy: 3 } as const;
    const sorted = [...others].sort((a, b) => Number(this.arrived.has(b.uid)) - Number(this.arrived.has(a.uid)) || order[statusOf(a)] - order[statusOf(b)] || b.level - a.level);
    sorted.forEach((p, i) => {
      const row = this.buildRow(p);
      row.y = i * (ROW_H + ROW_GAP) + ROW_H / 2;
      c.add(row);
      this.rows.push(row);
    });
    this.scrollBy(0);
  }

  private buildRow(p: LobbyPlayer): Phaser.GameObjects.Container {
    const { x, w } = LIST;
    const rw = w - 32;
    const left = x + 16;
    const row = this.add.container(0, 0);
    const st = statusOf(p);
    const s = STATUS[st];
    const el = ELEMENT_INFO[p.element as Element];
    const highlight = this.arrived.has(p.uid);
    const g = this.add.graphics();
    g.fillStyle(highlight ? 0x2a1d0a : 0x15100d, 0.95).fillRoundedRect(left, -ROW_H / 2, rw, ROW_H, 12);
    g.lineStyle(highlight ? 2 : 1, highlight ? C.goldHi : 0x3a2a1e, 1).strokeRoundedRect(left, -ROW_H / 2, rw, ROW_H, 12);
    // element stripe
    g.fillStyle(el?.color ?? C.edge, 1).fillRoundedRect(left, -ROW_H / 2, 5, ROW_H, { tl: 12, bl: 12, tr: 0, br: 0 });
    row.add(g);
    // weapon picture
    const tx = left + (PORTRAIT ? 70 : 62);
    const key = weaponLookTexture(this, { cls: 'sword', element: (p.element as Element) ?? 'fire', level: p.level });
    if (this.textures.exists(key)) {
      const img = this.add.image(tx, 4, key);
      img.setScale(Math.min((PORTRAIT ? 110 : 96) / img.width, (ROW_H - 30) / img.height));
      row.add(img);
    }
    row.add(new LevelBadge(this, tx + (PORTRAIT ? 30 : 26), -ROW_H / 2 + 16, p.level, PORTRAIT ? 16 : 14));
    // name, status chip, weapon
    const nx = left + (PORTRAIT ? 140 : 124);
    const ny = -14 * BIG;
    const name = label(this, nx, ny, p.name, 18 * BIG, C.text, { weight: 900, origin: [0, 0.5] });
    row.add(name);
    const chipX = nx + name.width + 12;
    const chip = this.add.graphics();
    const chipT = label(this, 0, ny, s.text, 12 * BIG, s.color, { weight: 900, origin: [0.5, 0.5] });
    const cw = chipT.width + 18;
    const ch = 22 * BIG;
    chip.fillStyle(s.color, 0.14).fillRoundedRect(chipX, ny - ch / 2, cw, ch, ch / 2);
    chip.lineStyle(1, s.color, 0.8).strokeRoundedRect(chipX, ny - ch / 2, cw, ch, ch / 2);
    chipT.setX(chipX + cw / 2);
    row.add([chip, chipT]);
    const sub = st === 'duel' ? `${p.weaponName} · ${p.gold.toLocaleString()}G` : p.weaponName;
    row.add(label(this, nx, 16 * BIG, sub, 13 * BIG, el?.color ?? C.mute, { weight: 700, origin: [0, 0.5] }));
    // action
    const bw = PORTRAIT ? 150 : 140;
    const bx = left + rw - bw / 2 - 12;
    const bh = ROW_H - (PORTRAIT ? 40 : 30);
    if (st === 'duel') {
      const can = !this.pending;
      const b = new Button(this, bx, 0, bw, bh, '결투 신청', { variant: can ? 'gold' : 'dark', size: 17 * BIG, onClick: () => this.challenge(p) });
      b.setEnabled(can);
      row.add(b);
    } else if (st === 'busy') {
      const b = new Button(this, bx, 0, bw, bh, '결투 중', { variant: 'dark', size: 16 * BIG, onClick: () => undefined });
      b.setEnabled(false);
      row.add(b);
    } else {
      const sent = this.invited.has(p.uid);
      const b = new Button(this, bx, 0, bw, bh, sent ? '초대 보냄' : '초대', { variant: sent ? 'dark' : 'danger', size: 17 * BIG, onClick: () => this.invite(p) });
      b.setEnabled(!sent);
      row.add(b);
    }
    return row;
  }

  private challenge(p: LobbyPlayer) {
    if (this.pending) return;
    this.sfx.click();
    duel.update(myDuelInfo(this.core));
    duel.send({ t: 'challenge', to: p.uid, pct: this.pct });
  }

  /** Call someone busy in their game (or in the main lobby) to the duel room. */
  private invite(p: LobbyPlayer) {
    if (this.invited.has(p.uid)) return;
    this.sfx.click();
    duel.send({ t: 'invite', to: p.uid });
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
    const pw = Math.min(W - 40, 600);
    const ph = PORTRAIT ? 440 : 360;
    const top = H / 2 - ph / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(W / 2 - pw / 2 + 4, top + 8, pw, ph, 20);
    g.fillGradientStyle(0x2a0e10, 0x2a0e10, 0x0e0908, 0x0e0908, 1).fillRoundedRect(W / 2 - pw / 2, top, pw, ph, 20);
    g.lineStyle(2, C.danger, 1).strokeRoundedRect(W / 2 - pw / 2, top, pw, ph, 20);
    const title = label(this, W / 2, top + 48, '⚔ 결투 신청', 30 * BIG, C.dangerHi, { display: true, weight: 900, origin: [0.5, 0.5] });
    const key = weaponLookTexture(this, { cls: 'sword', element: (from.element as Element) ?? 'fire', level: from.level });
    const parts: Phaser.GameObjects.GameObject[] = [dim, g, title];
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, top + 118, key);
      img.setScale(Math.min(260 / img.width, 70 / img.height));
      parts.push(img);
    }
    const who = label(this, W / 2, top + 176, `${from.name}  ·  +${from.level} ${from.weaponName}`, 19 * BIG, C.text, { weight: 900, origin: [0.5, 0.5], align: 'center', wrap: pw - 40 });
    const stake = label(this, W / 2, top + 214, `판돈 ${bet.toLocaleString()}G · 이기면 얻고 지면 잃는다`, 17 * BIG, C.goldHi, { weight: 700, origin: [0.5, 0.5] });
    let left = seconds;
    const timer = label(this, W / 2, top + 246, `${left}초 안에 대답`, 14 * BIG, C.mute, { weight: 700, origin: [0.5, 0.5] });
    const tick = this.time.addEvent({ delay: 1000, repeat: seconds - 1, callback: () => timer.setText(`${--left}초 안에 대답`) });
    const answer = (accept: boolean) => {
      tick.remove();
      duel.update(myDuelInfo(this.core));
      duel.send({ t: 'answer', id, accept });
      layer.destroy(true);
      if (this.popup === layer) this.popup = null;
    };
    const yes = new Button(this, W / 2 + pw / 4 - 10, top + ph - 56, pw / 2 - 40, 62, '수락', { variant: 'danger', size: 24 * BIG, onClick: () => answer(true) });
    const no = new Button(this, W / 2 - pw / 4 + 10, top + ph - 56, pw / 2 - 40, 62, '거절', { variant: 'dark', size: 22 * BIG, onClick: () => answer(false) });
    layer.add([...parts, who, stake, timer, yes, no]);
  }

  private back() {
    if (this.leaving) return;
    this.leaving = true;
    if (this.pending) duel.send({ t: 'cancel', id: this.pending.id });
    // the connection stays: the main lobby shows who is online and keeps the chat
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Lobby'));
  }
}
