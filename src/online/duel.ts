// Online duels (user request 2026-11-20): the live connection to server/duel.js and the shared rules.
// One connection for the whole game; scenes listen to its messages while they are open.
import { API, accountCreds, tempGuest } from './account';

/**
 * Must match DUEL in server/duel.js. The fight itself is the night-gamble fight (NightScene online mode):
 * same moves, a fixed square field so both screens agree on positions, and the night's damage rule.
 */
export const DUEL_RULES = {
  arena: { w: 1400, h: 1400 },
  hp: 120,
  betPcts: [10, 25, 50] as const,
};

/** One attack's look, sent so the other screen can draw it. */
export interface DuelFx {
  kind: 'arc' | 'line' | 'circle' | 'heavy' | 'element';
  ang: number;
  range: number;
  arcDeg?: number;
  width?: number;
  power: number;
  el?: string;
}

export interface LobbyPlayer {
  uid: string;
  name: string;
  level: number;
  element: string;
  weaponName: string;
  gold: number;
  busy: boolean;
  /** In the main lobby (only present) or the duel lobby (can be challenged). Older servers: absent. */
  where?: Where;
}

export type Where = 'lobby' | 'duel';

/** One line of chat (2026-11-27). 'lobby' reaches everyone not fighting; 'match' only the two fighters. */
export interface ChatLine {
  uid: string;
  name: string;
  text: string;
  at: number;
  room: 'lobby' | 'match';
}

/** Longest message the server keeps (server/duel.js DUEL.chatMax). */
export const CHAT_MAX = 100;

export interface MatchSide {
  uid: string;
  name: string;
  level: number;
  element: string;
  weaponName: string;
  x: number;
  y: number;
}

export interface MatchInfo {
  id: string;
  bet: number;
  sides: [MatchSide, MatchSide];
  you: 0 | 1;
  countdownMs: number;
  fightMs: number;
}

export type DuelMsg =
  | { t: 'welcome'; you: { uid: string; name: string } }
  | { t: 'lobby'; players: LobbyPlayer[] }
  | { t: 'challenged'; id: string; from: LobbyPlayer; bet: number; seconds: number }
  | { t: 'challengeSent'; id: string; to: LobbyPlayer; bet: number }
  | { t: 'challengeFailed'; reason: 'busy' | 'gold' }
  | { t: 'challengeGone'; id: string }
  | { t: 'declined'; id: string; reason: 'no' | 'busy' | 'timeout' | 'left' }
  | { t: 'start'; match: MatchInfo }
  | { t: 'opp'; x: number; y: number; aim: number; act: string }
  | { t: 'oppFx'; fx: DuelFx }
  | { t: 'hp'; hp: [number, number]; by: 0 | 1; dmg: number }
  | { t: 'end'; winner: 0 | 1 | null; reason: 'ko' | 'time' | 'leave'; bet: number; hp: [number, number] }
  | { t: 'gold'; delta: number; note: string }
  | ({ t: 'chat' } & ChatLine)
  | { t: 'chatHistory'; messages: ChatLine[] }
  | { t: 'error'; error: string }
  | { t: 'closed' };

type Listener = (m: DuelMsg) => void;

export interface MyDuelInfo {
  weapon: { level: number; element: string; name: string };
  gold: number;
}

class DuelLink {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  /** Gold won or lost: applied by main.ts to the game, also when no duel screen is open. */
  onGold: ((delta: number, note: string) => void) | null = null;
  me: { uid: string; name: string } | null = null;
  lobby: LobbyPlayer[] = [];
  /** Recent chat, newest last (the lobby's history on arrival, then everything that comes in). */
  chat: ChatLine[] = [];
  private where: Where = 'duel';

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.me !== null;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(m: DuelMsg) {
    if (m.t === 'gold') this.onGold?.(m.delta, m.note);
    if (m.t === 'lobby') this.lobby = m.players;
    if (m.t === 'welcome') this.me = m.you;
    if (m.t === 'chatHistory') this.chat = m.messages.slice(-50);
    if (m.t === 'chat') this.chat = [...this.chat, m].slice(-50);
    this.listeners.forEach((f) => f(m));
  }

  /** Open the connection and announce this player (weapon and gold) and where they are. */
  async connect(info: MyDuelInfo, where: Where = 'duel'): Promise<void> {
    this.where = where;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.update(info);
      this.send({ t: 'where', where });
      return;
    }
    const q = new URLSearchParams(location.search);
    // test slot: `&duelguest=NAME` duels as a throwaway guest so two tabs can fight each other
    const creds = q.has('slot') && q.get('duelguest') ? await tempGuest(q.get('duelguest')!) : accountCreds();
    if (!creds) throw new Error('login');
    const url = API.replace(/^http/, 'ws') + '/ws';
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('timeout')), 45_000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'hello', ...creds, ...info, where: this.where }));
      };
      ws.onmessage = (e) => {
        let m: DuelMsg;
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === 'welcome') {
          clearTimeout(timer);
          resolve();
        }
        if (m.t === 'error' && m.error === 'auth') {
          clearTimeout(timer);
          reject(new Error('auth'));
        }
        this.emit(m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws === ws) {
          this.ws = null;
          this.me = null;
          this.emit({ t: 'closed' });
        }
        reject(new Error('closed'));
      };
    });
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Say one line (the server decides who hears it: the lobby, or the other fighter in a duel). */
  say(text: string) {
    const t = text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (t) this.send({ t: 'chat', text: t });
  }

  update(info: MyDuelInfo) {
    this.send({ t: 'update', ...info });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.me = null;
    this.lobby = [];
    this.chat = [];
  }
}

export const duel = new DuelLink();
