// Online duels (user request 2026-11-20): the live connection to server/duel.js and the shared rules.
// One connection for the whole game; scenes listen to its messages while they are open.
import { API, accountCreds, tempGuest } from './account';

/** Must match DUEL in server/duel.js. */
export const DUEL_RULES = {
  arena: { w: 1000, h: 1000 },
  hp: 1000,
  damage: (level: number) => 40 + Math.max(0, Math.min(50, level)) * 5,
  range: 130,
  swingMs: 420,
  /** Swing arc either side of facing (radians). */
  arc: 1.05,
  speed: 320,
  dash: { speed: 980, ms: 170, cooldownMs: 1100 },
  betPcts: [10, 25, 50] as const,
};

export interface LobbyPlayer {
  uid: string;
  name: string;
  level: number;
  element: string;
  weaponName: string;
  gold: number;
  busy: boolean;
}

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
  | { t: 'opp'; x: number; y: number; fx: number; fy: number; act: string }
  | { t: 'hp'; hp: [number, number]; by: 0 | 1; dmg: number }
  | { t: 'end'; winner: 0 | 1 | null; reason: 'ko' | 'time' | 'leave'; bet: number; hp: [number, number] }
  | { t: 'gold'; delta: number; note: string }
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
    this.listeners.forEach((f) => f(m));
  }

  /** Open the connection and announce this player (weapon and gold). */
  async connect(info: MyDuelInfo): Promise<void> {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.update(info);
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
        ws.send(JSON.stringify({ t: 'hello', ...creds, ...info }));
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

  update(info: MyDuelInfo) {
    this.send({ t: 'update', ...info });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.me = null;
  }
}

export const duel = new DuelLink();
