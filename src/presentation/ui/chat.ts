// Chat over the game (user request 2026-11-27): "로비에 누가 있는지 알려주고 enter 치면 채팅",
// and chat during online duels. An HTML layer above the canvas, so Korean input (IME) works.
//
//   lobby mode  — a pill shows who is online ("접속 중 3명 · 철수, 영희 …"). Enter (or a tap) opens a
//                 panel with everyone's whereabouts, the lobby chat and an input line.
//   battle mode — the last few lines float over the fight and fade; Enter opens the input line.
//
// While the input is open the game's keys are off, so typing W or Space does not move or attack.
import type Phaser from 'phaser';
import { CHAT_MAX, duel, type ChatLine, type DuelMsg, type LobbyPlayer } from '../../online/duel';
import { H, W } from '../theme';

export interface ChatOptions {
  mode: 'lobby' | 'battle';
  /** Left edge and the edge it grows from, in game coordinates (1280×720 landscape / 720×N portrait). */
  x: number;
  y: number;
  w: number;
  /** 'up': y is the bottom edge and the panel opens upwards; 'down': y is the top edge. */
  grow: 'up' | 'down';
  /** Text size factor (phones read larger). */
  scale?: number;
}

const WHERE_NAME = { lobby: '로비', duel: '결투장', game: '게임 중' } as const;
/** Battle lines stay this long before fading. */
const FEED_MS = 9000;

export class ChatBox {
  private root: HTMLDivElement;
  private pill: HTMLButtonElement | null = null;
  private feed: HTMLDivElement;
  private panel: HTMLDivElement | null = null;
  private who: HTMLDivElement | null = null;
  private log: HTMLDivElement | null = null;
  private row: HTMLDivElement;
  private input: HTMLInputElement;
  private open = false;
  private off: () => void;

  constructor(
    private scene: Phaser.Scene,
    private opts: ChatOptions,
  ) {
    const r = (this.root = document.createElement('div'));
    Object.assign(r.style, {
      position: 'fixed',
      zIndex: '7',
      display: 'flex',
      flexDirection: opts.grow === 'up' ? 'column-reverse' : 'column',
      gap: '0.4em',
      pointerEvents: 'none',
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#f1e6d2',
    });

    {
      // lobby: who is online; battle: a small chat button (phones have no Enter key)
      const pill = (this.pill = document.createElement('button'));
      pill.type = 'button';
      Object.assign(pill.style, {
        pointerEvents: 'auto',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        background: 'rgba(10,7,5,0.82)',
        color: '#f1e6d2',
        border: '1px solid #8a6430',
        borderRadius: '999px',
        padding: '0.45em 1em',
        font: 'inherit',
        fontWeight: '700',
        cursor: 'pointer',
      });
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.open) this.close();
        else this.openInput();
      });
    }

    // the input row (hidden until Enter)
    const row = (this.row = document.createElement('div'));
    Object.assign(row.style, { display: 'none', gap: '0.4em', pointerEvents: 'auto' });
    const input = (this.input = document.createElement('input'));
    input.type = 'text';
    input.maxLength = CHAT_MAX;
    input.placeholder = opts.mode === 'battle' ? '상대에게 한마디 · Enter 보내기 · Esc 닫기' : '메시지 · Enter 보내기 · Esc 닫기';
    input.setAttribute('aria-label', '채팅 입력');
    Object.assign(input.style, {
      flex: '1',
      minWidth: '0',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff4e2',
      border: '1px solid #e9b65c',
      borderRadius: '8px',
      padding: '0.45em 0.7em',
      font: 'inherit',
      outline: 'none',
    });
    // keys typed here never reach the game (Phaser listens on the window)
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    input.addEventListener('keyup', stop);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return; // Korean IME still composing
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = input.value;
        input.value = '';
        if (text.trim()) duel.say(text);
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    row.appendChild(input);

    if (opts.mode === 'lobby') {
      // the open panel: who is here, then the chat log, then the input
      const panel = (this.panel = document.createElement('div'));
      Object.assign(panel.style, {
        display: 'none',
        flexDirection: 'column',
        gap: '0.5em',
        pointerEvents: 'auto',
        background: 'rgba(10,7,5,0.92)',
        border: '1px solid #8a6430',
        borderRadius: '12px',
        padding: '0.8em',
      });
      const who = (this.who = document.createElement('div'));
      Object.assign(who.style, { fontSize: '0.9em', lineHeight: '1.5', maxHeight: '7.5em', overflowY: 'auto', borderBottom: '1px solid #3a2a1a', paddingBottom: '0.5em' });
      const log = (this.log = document.createElement('div'));
      Object.assign(log.style, { height: '11em', overflowY: 'auto', lineHeight: '1.45', wordBreak: 'break-all' });
      panel.append(who, log, row);
    }

    // recent lines over the game (lobby: while the panel is closed; battle: always)
    const feed = (this.feed = document.createElement('div'));
    Object.assign(feed.style, { display: 'flex', flexDirection: 'column', gap: '0.2em', lineHeight: '1.4', wordBreak: 'break-all' });
    // from the anchored edge outwards (column-reverse when growing up): the pill, then the rest
    r.replaceChildren(...(this.panel ? [this.pill!, feed, this.panel] : [this.pill!, row, feed]));

    document.body.appendChild(r);
    this.place();
    window.addEventListener('resize', this.place);
    window.addEventListener('keydown', this.onKey, true);
    this.off = duel.on((m) => this.onMsg(m));
    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());
    scene.events.on('pause', this.onPause);
    scene.events.on('resume', this.onResume);
    this.refresh();
  }

  /** Follow the canvas: position and text size in screen pixels. */
  private place = () => {
    const c = this.scene.game.canvas.getBoundingClientRect();
    const k = c.width / W;
    const fs = Math.max(12, 15 * k * (this.opts.scale ?? 1));
    const left = c.left + this.opts.x * k;
    Object.assign(this.root.style, { left: `${left}px`, width: `${this.opts.w * k}px`, fontSize: `${fs}px` });
    if (this.opts.grow === 'up') {
      this.root.style.top = '';
      this.root.style.bottom = `${window.innerHeight - (c.top + this.opts.y * k)}px`;
    } else {
      this.root.style.bottom = '';
      this.root.style.top = `${c.top + this.opts.y * k}px`;
    }
    void H;
  };

  /** Enter opens the input (only while this scene is the one being played). */
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || this.open || e.isComposing) return;
    if (!this.scene.sys.isActive() || !this.root.isConnected || this.root.style.display === 'none') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.openInput();
  };

  private onPause = () => {
    this.close();
    this.root.style.display = 'none';
  };

  private onResume = () => {
    this.root.style.display = 'flex';
    this.place();
  };

  private openInput() {
    if (!duel.connected) {
      this.flash('온라인에 연결되면 채팅할 수 있습니다');
      return;
    }
    this.open = true;
    const kb = this.scene.input.keyboard;
    if (kb) {
      kb.resetKeys(); // no key stays held (the player stops walking)
      kb.enabled = false;
    }
    this.row.style.display = 'flex';
    if (this.panel) {
      this.panel.style.display = 'flex';
      this.feed.style.display = 'none';
      this.renderLog();
    }
    this.input.focus();
  }

  private close() {
    if (!this.open) return;
    this.open = false;
    this.input.blur();
    this.row.style.display = 'none';
    if (this.panel) {
      this.panel.style.display = 'none';
      this.feed.style.display = 'flex';
    }
    const kb = this.scene.input.keyboard;
    if (kb) kb.enabled = true;
  }

  private onMsg(m: DuelMsg) {
    if (m.t === 'lobby' || m.t === 'welcome' || m.t === 'closed') this.refresh();
    if (m.t === 'chatHistory') this.renderLog();
    if (m.t === 'chat' && this.wants(m)) {
      this.renderLog();
      this.addFeed(m);
    }
  }

  /** Lobby screens show the lobby room; a duel shows only what the two fighters say. */
  private wants(l: ChatLine): boolean {
    return this.opts.mode === 'battle' ? l.room === 'match' : l.room === 'lobby';
  }

  /** Who is online: the pill text and the panel's list. */
  private refresh() {
    if (!this.pill) return;
    if (this.opts.mode === 'battle') {
      this.pill.textContent = '💬 채팅 · Enter';
      return;
    }
    if (!duel.connected) {
      this.pill.textContent = '💬 온라인 연결 중…';
      if (this.who) this.who.textContent = '';
      return;
    }
    const everyone = duel.lobby;
    const others = everyone.filter((p) => p.uid !== duel.me?.uid);
    const names = others.slice(0, 4).map((p) => p.name).join(', ');
    this.pill.textContent = `💬 접속 중 ${everyone.length}명${names ? ` · ${names}${others.length > 4 ? ' …' : ''}` : ' · 나 혼자'} · Enter 채팅`;
    if (!this.who) return;
    this.who.replaceChildren();
    const head = document.createElement('div');
    head.textContent = `🟢 지금 접속 중 ${everyone.length}명`;
    Object.assign(head.style, { color: '#ffd27a', fontWeight: '900' });
    this.who.appendChild(head);
    for (const p of [...everyone].sort((a, b) => Number(b.uid === duel.me?.uid) - Number(a.uid === duel.me?.uid))) this.who.appendChild(this.whoLine(p));
  }

  private whoLine(p: LobbyPlayer): HTMLDivElement {
    const d = document.createElement('div');
    const me = p.uid === duel.me?.uid;
    const where = p.busy ? '결투 중' : WHERE_NAME[p.where ?? 'duel'];
    d.textContent = `${me ? '나 · ' : ''}${p.name}  ·  +${p.level}  ·  ${where}`;
    d.style.color = me ? '#ffd27a' : p.busy ? '#ff8a7a' : '#d6ecff';
    return d;
  }

  private renderLog() {
    if (!this.log) return;
    const lines = duel.chat.filter((l) => this.wants(l));
    this.log.replaceChildren(...(lines.length ? lines.map((l) => this.line(l)) : [this.note('아직 아무 말도 없다. 첫 인사를 건네 보자.')]));
    this.log.scrollTop = this.log.scrollHeight;
  }

  private line(l: ChatLine): HTMLDivElement {
    const d = document.createElement('div');
    const who = document.createElement('span');
    who.textContent = `${l.name}: `;
    who.style.color = l.uid === duel.me?.uid ? '#ffd27a' : '#9ad0ff';
    who.style.fontWeight = '900';
    const text = document.createElement('span');
    text.textContent = l.text;
    d.append(who, text);
    return d;
  }

  private note(t: string): HTMLDivElement {
    const d = document.createElement('div');
    d.textContent = t;
    d.style.color = '#9a8a7a';
    return d;
  }

  /** A line over the game that fades after a while. */
  private addFeed(l: ChatLine) {
    const d = this.line(l);
    Object.assign(d.style, { background: 'rgba(0,0,0,0.6)', borderRadius: '6px', padding: '0.15em 0.6em', alignSelf: 'flex-start', maxWidth: '100%', transition: 'opacity 0.6s' });
    this.feed.appendChild(d);
    while (this.feed.childElementCount > (this.opts.mode === 'battle' ? 5 : 3)) this.feed.firstElementChild?.remove();
    setTimeout(() => (d.style.opacity = '0'), FEED_MS);
    setTimeout(() => d.remove(), FEED_MS + 700);
  }

  private flash(t: string) {
    const d = this.note(t);
    Object.assign(d.style, { background: 'rgba(0,0,0,0.6)', borderRadius: '6px', padding: '0.15em 0.6em', alignSelf: 'flex-start' });
    this.feed.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  destroy() {
    if (!this.root.isConnected) return;
    this.close();
    this.off();
    window.removeEventListener('resize', this.place);
    window.removeEventListener('keydown', this.onKey, true);
    this.scene.events.off('pause', this.onPause);
    this.scene.events.off('resume', this.onResume);
    this.root.remove();
  }
}
