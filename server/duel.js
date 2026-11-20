// Online duels (user request 2026-11-20): a live duel lobby, challenges with a gold bet, and a referee
// for real-time fights. Runs on the same Render web service over a WebSocket at /ws.
//
// The game itself runs in the browser, so a player's gold and weapon level are what their game says
// (like the ranking). The server keeps the fight fair between the two: it owns the HP, checks that a
// claimed hit is in range and not faster than the swing cooldown, works out the damage itself, and
// decides the winner. Gold owed to a player who already left is kept and handed over on their next visit.
//
// The numbers must match src/online/duelRules.ts.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

export const DUEL = {
  // the night-gamble fight's field and player HP (src/config/hackslash.ts PLAYER_COMBAT.maxHp)
  arena: { w: 1400, h: 1400 },
  hp: 120,
  /**
   * Damage of one hit, the night rule (DOPPEL_COMBAT.damage): base × growth^(how far the attacker's
   * weapon is above the defender's) × the attack's multiplier (combo step, heavy charge, element skill).
   */
  damage: (attLv, defLv, mul) => Math.max(1, Math.round(12 * clamp(mul, 0.5, 3.5) * Math.pow(1.12, Math.max(0, attLv - defLv)))),
  /** Longest reach of any attack (spear finisher + lunge, element skill) plus lag slack. */
  reach: 330,
  slack: 160,
  /** Fastest two hits may follow each other (combo steps are ≥ 0.26 s). */
  hitGapMs: 150,
  countdownMs: 3000,
  fightMs: 75_000,
  challengeMs: 20_000,
  betPcts: [10, 25, 50],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * @param {import('node:http').Server} server
 * @param {{ auth: (body: unknown) => any, store: any }} deps
 */
export function attachDuels(server, { auth, store }) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  /** uid → { ws, uid, name, weapon, gold, matchId|null } */
  const players = new Map();
  /** id → { id, from, to, bet, timer } */
  const challenges = new Map();
  /** id → match */
  const matches = new Map();

  const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const toUid = (uid, msg) => send(players.get(uid)?.ws, msg);

  const view = (p) => ({ uid: p.uid, name: p.name, level: p.weapon.level, element: p.weapon.element, weaponName: p.weapon.name, gold: p.gold, busy: !!p.matchId });
  function broadcastLobby() {
    const list = [...players.values()].map(view);
    for (const p of players.values()) send(p.ws, { t: 'lobby', players: list });
  }

  /** Gold for a player: sent now, or kept for their next visit if they are gone. */
  function settle(uid, delta, note) {
    if (!delta) return;
    const p = players.get(uid);
    if (p && p.ws.readyState === 1) send(p.ws, { t: 'gold', delta, note });
    else {
      const k = `pend:${uid}`;
      const prev = store.get(k) || { delta: 0 };
      store.set(k, { delta: prev.delta + delta });
    }
  }

  function endMatch(m, winner, reason) {
    if (m.over) return;
    m.over = true;
    clearTimeout(m.timer);
    matches.delete(m.id);
    for (const s of m.sides) {
      const p = players.get(s.uid);
      if (p && p.matchId === m.id) p.matchId = null;
      send(p?.ws, { t: 'end', winner, reason, bet: m.bet, hp: m.hp });
    }
    if (winner !== null) {
      const w = m.sides[winner];
      const l = m.sides[1 - winner];
      settle(w.uid, m.bet, `${l.name}에게 이겼다`);
      settle(l.uid, -m.bet, `${w.name}에게 졌다`);
    }
    broadcastLobby();
  }

  function startMatch(a, b, bet) {
    const id = crypto.randomBytes(6).toString('hex');
    const side = (p, x) => ({ uid: p.uid, name: p.name, level: p.weapon.level, element: p.weapon.element, weaponName: p.weapon.name, x, y: DUEL.arena.h / 2, lastSwing: 0 });
    const m = { id, bet, sides: [side(a, 450), side(b, 950)], hp: [DUEL.hp, DUEL.hp], over: false, startAt: Date.now() + DUEL.countdownMs, timer: null };
    m.timer = setTimeout(() => {
      const [h0, h1] = m.hp;
      endMatch(m, h0 === h1 ? null : h0 > h1 ? 0 : 1, 'time');
    }, DUEL.countdownMs + DUEL.fightMs);
    matches.set(id, m);
    a.matchId = id;
    b.matchId = id;
    const info = { id, bet, sides: m.sides.map(({ lastSwing: _l, ...s }) => s), countdownMs: DUEL.countdownMs, fightMs: DUEL.fightMs };
    send(a.ws, { t: 'start', match: { ...info, you: 0 } });
    send(b.ws, { t: 'start', match: { ...info, you: 1 } });
    broadcastLobby();
  }

  wss.on('connection', (ws) => {
    let me = null;
    const alive = { ok: true };
    ws.on('pong', () => (alive.ok = true));
    ws._alive = alive;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;

      if (msg.t === 'hello') {
        const u = auth(msg);
        if (!u) return send(ws, { t: 'error', error: 'auth' });
        // one connection per account: the newest wins
        const old = players.get(u.uid);
        if (old && old.ws !== ws) {
          send(old.ws, { t: 'error', error: 'elsewhere' });
          old.ws.close();
        }
        me = { ws, uid: u.uid, name: u.name, weapon: cleanWeapon(msg.weapon), gold: cleanGold(msg.gold), matchId: old?.matchId ?? null };
        players.set(u.uid, me);
        const pend = store.get(`pend:${u.uid}`);
        if (pend?.delta) {
          send(ws, { t: 'gold', delta: pend.delta, note: '자리를 비운 사이 끝난 결투' });
          store.set(`pend:${u.uid}`, { delta: 0 });
        }
        send(ws, { t: 'welcome', you: { uid: u.uid, name: u.name } });
        broadcastLobby();
        return;
      }
      if (!me) return;

      switch (msg.t) {
        case 'update': {
          me.weapon = cleanWeapon(msg.weapon);
          me.gold = cleanGold(msg.gold);
          broadcastLobby();
          break;
        }
        case 'challenge': {
          const target = players.get(String(msg.to));
          if (!target || target === me || target.matchId || me.matchId) return send(ws, { t: 'challengeFailed', reason: 'busy' });
          const pct = DUEL.betPcts.includes(msg.pct) ? msg.pct : DUEL.betPcts[0];
          const bet = Math.floor((Math.min(me.gold, target.gold) * pct) / 100);
          if (bet <= 0) return send(ws, { t: 'challengeFailed', reason: 'gold' });
          const id = crypto.randomBytes(6).toString('hex');
          const timer = setTimeout(() => {
            if (!challenges.delete(id)) return;
            send(ws, { t: 'declined', id, reason: 'timeout' });
            toUid(target.uid, { t: 'challengeGone', id });
          }, DUEL.challengeMs);
          challenges.set(id, { id, from: me.uid, to: target.uid, bet, timer });
          send(target.ws, { t: 'challenged', id, from: view(me), bet, seconds: DUEL.challengeMs / 1000 });
          send(ws, { t: 'challengeSent', id, to: view(target), bet });
          break;
        }
        case 'cancel': {
          const c = challenges.get(String(msg.id));
          if (!c || c.from !== me.uid) return;
          clearTimeout(c.timer);
          challenges.delete(c.id);
          toUid(c.to, { t: 'challengeGone', id: c.id });
          break;
        }
        case 'answer': {
          const c = challenges.get(String(msg.id));
          if (!c || c.to !== me.uid) return;
          clearTimeout(c.timer);
          challenges.delete(c.id);
          const from = players.get(c.from);
          if (!msg.accept || !from || from.matchId || me.matchId) {
            toUid(c.from, { t: 'declined', id: c.id, reason: msg.accept ? 'busy' : 'no' });
            return;
          }
          startMatch(from, me, c.bet);
          break;
        }
        case 'state': {
          const m = matches.get(me.matchId);
          if (!m || m.over) return;
          const i = m.sides[0].uid === me.uid ? 0 : 1;
          const s = m.sides[i];
          s.x = clamp(Number(msg.x) || 0, 0, DUEL.arena.w);
          s.y = clamp(Number(msg.y) || 0, 0, DUEL.arena.h);
          toUid(m.sides[1 - i].uid, { t: 'opp', x: s.x, y: s.y, aim: Number(msg.aim) || 0, act: String(msg.act || 'idle').slice(0, 8) });
          break;
        }
        case 'fx': {
          // what my attack looks like, for the other screen (no game effect)
          const m = matches.get(me.matchId);
          if (!m || m.over) return;
          const i = m.sides[0].uid === me.uid ? 0 : 1;
          const fx = msg.fx && typeof msg.fx === 'object' ? msg.fx : null;
          if (fx && JSON.stringify(fx).length < 400) toUid(m.sides[1 - i].uid, { t: 'oppFx', fx });
          break;
        }
        case 'hit': {
          const m = matches.get(me.matchId);
          if (!m || m.over || Date.now() < m.startAt) return;
          const i = m.sides[0].uid === me.uid ? 0 : 1;
          const a = m.sides[i];
          const d = m.sides[1 - i];
          const now = Date.now();
          if (now - a.lastSwing < DUEL.hitGapMs) return; // faster than any attack allows
          if (Math.hypot(a.x - d.x, a.y - d.y) > DUEL.reach + DUEL.slack) return; // out of reach
          a.lastSwing = now;
          const dmg = DUEL.damage(a.level, d.level, Number(msg.mul) || 1);
          m.hp[1 - i] = Math.max(0, m.hp[1 - i] - dmg);
          for (const s of m.sides) toUid(s.uid, { t: 'hp', hp: m.hp, by: i, dmg });
          if (m.hp[1 - i] <= 0) endMatch(m, i, 'ko');
          break;
        }
        case 'leave': {
          const m = matches.get(me.matchId);
          if (m) endMatch(m, m.sides[0].uid === me.uid ? 1 : 0, 'leave');
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!me || players.get(me.uid)?.ws !== ws) return;
      players.delete(me.uid);
      for (const c of [...challenges.values()]) {
        if (c.from !== me.uid && c.to !== me.uid) continue;
        clearTimeout(c.timer);
        challenges.delete(c.id);
        toUid(c.from === me.uid ? c.to : c.from, c.from === me.uid ? { t: 'challengeGone', id: c.id } : { t: 'declined', id: c.id, reason: 'left' });
      }
      const m = matches.get(me.matchId);
      if (m) endMatch(m, m.sides[0].uid === me.uid ? 1 : 0, 'leave');
      broadcastLobby();
    });
  });

  // drop dead connections (phones that went to sleep)
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws._alive?.ok) {
        ws.terminate();
        continue;
      }
      ws._alive.ok = false;
      ws.ping();
    }
  }, 20_000).unref();

  return { players, matches };
}

function cleanWeapon(w) {
  return {
    level: clamp(Math.floor(Number(w?.level) || 0), 0, 50),
    element: ['fire', 'earth', 'lightning', 'water', 'ice'].includes(w?.element) ? w.element : 'fire',
    name: String(w?.name || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24),
  };
}

function cleanGold(g) {
  return clamp(Math.floor(Number(g) || 0), 0, 1e12);
}
