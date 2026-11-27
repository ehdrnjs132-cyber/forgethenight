// Duel invitations (user request 2026-11-27: "온라인 결투 창 들어가서 게임중인 친구 초대"). Someone in
// the duel room invites a player who is busy in their game; the invitation pops up over whatever screen
// that player is on. Accepting takes them to the duel room, where the inviter can then challenge them.
// A page overlay (not a Phaser scene) so it shows over every scene.
import type Phaser from 'phaser';
import { duel, type DuelMsg, type LobbyPlayer } from '../../online/duel';

/** Screens that must not be left in the middle: a fight, the king's visit, the run's end. */
const BUSY = ['Night', 'KingWrath', 'GameOver'];

export function setupInvites(game: Phaser.Game) {
  let card: HTMLDivElement | null = null;
  let timer: number | null = null;

  const close = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    card?.remove();
    card = null;
  };

  const goToDuelRoom = () => {
    if (game.scene.isActive('DuelLobby')) return;
    for (const s of game.scene.getScenes(false)) {
      const st = s.sys.settings.status;
      // Phaser scene states 2..7: starting, loading, creating, running, paused, sleeping
      if (s.sys.settings.key !== 'Boot' && st >= 2 && st <= 7) game.scene.stop(s.sys.settings.key);
    }
    game.scene.start('DuelLobby');
  };

  const show = (id: string, from: LobbyPlayer, seconds: number) => {
    close();
    const c = (card = document.createElement('div'));
    c.setAttribute('role', 'alertdialog');
    c.setAttribute('aria-label', `${from.name}님의 결투 초대`);
    Object.assign(c.style, {
      position: 'fixed',
      left: '50%',
      top: '14px',
      transform: 'translateX(-50%)',
      zIndex: '20',
      width: 'min(92vw, 420px)',
      boxSizing: 'border-box',
      padding: '16px 18px',
      borderRadius: '16px',
      background: 'linear-gradient(160deg, rgba(42,14,16,0.97), rgba(14,9,7,0.97))',
      border: '1px solid #d1484c',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,120,120,0.15) inset',
      color: '#f6e9da',
      fontFamily: '"Noto Sans KR", sans-serif',
    });
    const head = document.createElement('div');
    head.textContent = '⚔ 결투 초대';
    Object.assign(head.style, { fontWeight: '900', fontSize: '13px', letterSpacing: '1px', color: '#ff8a8a' });
    const who = document.createElement('div');
    who.textContent = `${from.name}님이 결투장으로 부릅니다`;
    Object.assign(who.style, { fontWeight: '900', fontSize: '18px', margin: '6px 0 2px' });
    const sub = document.createElement('div');
    sub.textContent = `+${from.level} ${from.weaponName}`;
    Object.assign(sub.style, { fontSize: '13px', color: '#d9c2a8' });
    const left = document.createElement('div');
    Object.assign(left.style, { fontSize: '12px', color: '#a89584', marginTop: '6px' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '12px' });
    const btn = (text: string, primary: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      Object.assign(b.style, {
        flex: primary ? '1.4' : '1',
        padding: '10px 12px',
        borderRadius: '10px',
        border: primary ? '1px solid #ff9a9a' : '1px solid #5a4632',
        background: primary ? 'linear-gradient(180deg, #c0282f, #8e1a20)' : 'rgba(255,255,255,0.04)',
        color: '#fff',
        font: 'inherit',
        fontWeight: '900',
        fontSize: '15px',
        cursor: 'pointer',
      });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      // keys pressed on these buttons never reach the game underneath
      b.addEventListener('keydown', (e) => e.stopPropagation());
      row.appendChild(b);
      return b;
    };
    const accept = btn('결투장으로 가기', true, () => {
      duel.send({ t: 'inviteAnswer', id, accept: true });
      close();
      goToDuelRoom();
    });
    btn('거절', false, () => {
      duel.send({ t: 'inviteAnswer', id, accept: false });
      close();
    });
    c.append(head, who, sub, left, row);
    document.body.appendChild(c);
    accept.focus({ preventScroll: true });
    let n = seconds;
    const tick = () => (left.textContent = `${n}초 안에 대답 · 결투장에서 판돈을 정해 다시 신청합니다`);
    tick();
    timer = window.setInterval(() => {
      n--;
      if (n <= 0) close();
      else tick();
    }, 1000);
  };

  duel.on((m: DuelMsg) => {
    if (m.t === 'invited') {
      // in a fight, at the king's visit or at the run's end: say so instead of popping up
      if (BUSY.some((k) => game.scene.isActive(k))) {
        duel.send({ t: 'inviteAnswer', id: m.id, accept: false, busy: true });
        return;
      }
      // already in the duel room: accept quietly, the inviter can challenge right away
      if (game.scene.isActive('DuelLobby')) {
        duel.send({ t: 'inviteAnswer', id: m.id, accept: true });
        return;
      }
      show(m.id, m.from, m.seconds);
    }
    if (m.t === 'inviteGone' || m.t === 'closed') close();
  });
}
