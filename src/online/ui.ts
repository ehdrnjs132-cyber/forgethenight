// HTML overlays for the online part: the first-launch login screen (Google / guest nickname / later)
// and the ranking page (best enhancement level, top 50 + my rank, my account).
import { account, googleLogin, ranking, refreshMe, rename, serverConfig, signOut, startGuest, type RankRow } from './account';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
          renderButton(el: HTMLElement, o: Record<string, unknown>): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}

const CSS = `
.ol-back { position: fixed; inset: 0; z-index: 25; display: grid; place-items: center; background: rgba(4,3,6,.78); font-family: "Noto Sans KR", sans-serif; }
.ol-card { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 22px 24px; border-radius: 16px;
  background: linear-gradient(#21170f, #160f0a); border: 2px solid #b8873f; color: #f1e3c2; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.ol-title { font: 800 26px Cinzel, serif; color: #ffd27a; text-align: center; letter-spacing: .04em; }
.ol-sub { text-align: center; color: #bfae8c; font-size: 14px; margin: 6px 0 18px; }
.ol-row { display: flex; gap: 8px; margin-top: 10px; }
.ol-input { flex: 1; min-width: 0; padding: 11px 12px; border-radius: 10px; border: 1px solid #6d5434; background: #0f0a06; color: #fff; font: 600 15px "Noto Sans KR", sans-serif; }
.ol-btn { padding: 11px 16px; border-radius: 10px; border: 0; background: #e9b65c; color: #1b1410; font: 800 15px "Noto Sans KR", sans-serif; cursor: pointer; white-space: nowrap; }
.ol-btn.ghost { background: transparent; color: #d8c59c; border: 1px solid #6d5434; }
.ol-btn:disabled { opacity: .5; }
.ol-or { text-align: center; color: #8a7a5c; font-size: 12px; margin: 14px 0 4px; }
.ol-g { display: flex; justify-content: center; min-height: 44px; }
.ol-msg { min-height: 18px; margin-top: 10px; text-align: center; font-size: 13px; color: #ff9a7a; }
.ol-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ol-x { background: none; border: 0; color: #d8c59c; font-size: 26px; cursor: pointer; line-height: 1; }
.ol-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
.ol-table td { padding: 7px 6px; border-bottom: 1px solid rgba(184,135,63,.18); }
.ol-table td.r { width: 34px; text-align: center; font: 800 15px Cinzel, serif; color: #bfae8c; }
.ol-table tr.top1 td.r { color: #ffd34d; } .ol-table tr.top2 td.r { color: #d8dde6; } .ol-table tr.top3 td.r { color: #e0a070; }
.ol-table tr.me td { background: rgba(233,182,92,.14); }
.ol-table td.lv { text-align: right; font: 900 18px "Noto Sans KR", sans-serif; color: #ffcf5a; white-space: nowrap; }
.ol-table td.w { color: #bfae8c; font-size: 12px; }
.ol-me { margin-top: 14px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.28); font-size: 14px; }
.ol-small { font-size: 12px; color: #8a7a5c; }
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.append(s);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ───────────────────────── Google button

let gisClient: string | null | undefined;
let gisLoading: Promise<boolean> | null = null;

function loadGoogle(): Promise<boolean> {
  if (gisLoading) return gisLoading;
  gisLoading = serverConfig()
    .then((cfg) => {
      gisClient = cfg.googleClientId;
      if (!gisClient) return false;
      return new Promise<boolean>((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => {
          window.google!.accounts.id.initialize({ client_id: gisClient!, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
          resolve(true);
        };
        s.onerror = () => resolve(false);
        document.head.append(s);
      });
    })
    .catch(() => {
      gisLoading = null; // server asleep or unreachable: try again next time
      return false;
    });
  return gisLoading;
}

let afterGoogle: ((msg?: string) => void) | null = null;
async function onCredential(r: { credential: string }) {
  try {
    const res = await googleLogin(r.credential);
    afterGoogle?.(res.switched ? '구글 계정의 기존 기록을 불러왔습니다' : undefined);
  } catch {
    afterGoogle?.('구글 로그인에 실패했습니다');
  }
}

async function mountGoogle(el: HTMLElement, text: 'continue_with' | 'signin_with') {
  el.innerHTML = '<span class="ol-small">구글 로그인 준비 중…</span>';
  const ok = await loadGoogle();
  if (!ok) {
    el.innerHTML = gisClient === null ? '' : '<span class="ol-small">서버가 깨어나는 중이에요. 잠시 후 다시 열어 주세요.</span>';
    return;
  }
  el.innerHTML = '';
  window.google!.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text, width: 280, locale: 'ko' });
}

// ───────────────────────── login screen (first launch)

export async function showLoginIfNeeded(): Promise<void> {
  if (account.user || account.skipped || new URLSearchParams(location.search).has('slot')) {
    void refreshMe();
    return;
  }
  // Only when the ranking server answers quickly: a sleeping or missing server must never put a dead
  // login screen in front of the game (the 🏆 button still offers sign-in later).
  const up = await Promise.race([serverConfig().then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]);
  if (!up || account.user) return;
  style();
  const back = document.createElement('div');
  back.className = 'ol-back';
  back.innerHTML = `<div class="ol-card">
    <div class="ol-title">FORGE THE NIGHT</div>
    <div class="ol-sub">로그인하면 내 최고 강화 기록이 랭킹에 올라갑니다</div>
    <div class="ol-g" id="ol-g"></div>
    <div class="ol-or">또는 닉네임으로 시작</div>
    <div class="ol-row"><input class="ol-input" id="ol-name" maxlength="12" placeholder="닉네임 (2~12자)" /><button class="ol-btn" id="ol-guest">게스트로 시작</button></div>
    <div class="ol-msg" id="ol-msg"></div>
    <div class="ol-row" style="justify-content:center"><button class="ol-btn ghost" id="ol-later">나중에 하기 (랭킹 없이 플레이)</button></div>
  </div>`;
  document.body.append(back);
  const $ = <T extends HTMLElement>(id: string) => back.querySelector<T>(`#${id}`)!;
  const close = () => back.remove();
  const msg = (t: string) => ($('ol-msg').textContent = t);
  afterGoogle = (m) => (account.user ? close() : msg(m ?? ''));
  void mountGoogle($('ol-g'), 'continue_with');

  $('ol-guest').addEventListener('click', async () => {
    const name = $<HTMLInputElement>('ol-name').value.trim();
    if (name.length < 2) return msg('닉네임은 2자 이상으로 적어 주세요');
    const b = $<HTMLButtonElement>('ol-guest');
    b.disabled = true;
    msg('서버에 연결하는 중… (처음엔 30초쯤 걸릴 수 있어요)');
    try {
      await startGuest(name);
      close();
    } catch {
      msg('서버에 연결하지 못했습니다. 나중에 랭킹 버튼에서 다시 시도할 수 있어요');
      b.disabled = false;
    }
  });
  $('ol-later').addEventListener('click', () => {
    account.skip();
    close();
  });
  // keep keyboard input out of the game while typing
  back.addEventListener('keydown', (e) => e.stopPropagation());
}

// ───────────────────────── ranking page

export async function openRanking(): Promise<void> {
  style();
  document.querySelector('.ol-back')?.remove();
  const back = document.createElement('div');
  back.className = 'ol-back';
  back.innerHTML = `<div class="ol-card">
    <div class="ol-head"><div class="ol-title" style="text-align:left">🏆 강화 랭킹</div><button class="ol-x" aria-label="닫기">×</button></div>
    <div class="ol-small" id="ol-total">최고 강화 단계 순 · 같은 단계면 먼저 달성한 사람이 위</div>
    <div id="ol-list"><div class="ol-msg" style="color:#bfae8c">불러오는 중… (서버가 자고 있으면 30초쯤 걸려요)</div></div>
    <div class="ol-me" id="ol-me"></div>
  </div>`;
  document.body.append(back);
  const $ = <T extends HTMLElement>(id: string) => back.querySelector<T>(`#${id}`)!;
  const close = () => back.remove();
  back.querySelector('.ol-x')!.addEventListener('click', close);
  back.addEventListener('click', (e) => e.target === back && close());
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });

  const renderMe = () => {
    const u = account.user;
    const me = $('ol-me');
    if (!u) {
      me.innerHTML = `<b>로그인하면 내 기록이 랭킹에 올라갑니다</b>
        <div class="ol-g" id="ol-g" style="margin-top:10px"></div>
        <div class="ol-row"><input class="ol-input" id="ol-name" maxlength="12" placeholder="닉네임 (2~12자)" /><button class="ol-btn" id="ol-guest">게스트로 시작</button></div>
        <div class="ol-msg" id="ol-msg"></div>`;
      void mountGoogle($('ol-g'), 'continue_with');
      $('ol-guest').addEventListener('click', async () => {
        const name = $<HTMLInputElement>('ol-name').value.trim();
        if (name.length < 2) return ($('ol-msg').textContent = '닉네임은 2자 이상으로 적어 주세요');
        $('ol-msg').textContent = '연결하는 중…';
        try {
          await startGuest(name);
          void openRanking();
        } catch {
          $('ol-msg').textContent = '서버에 연결하지 못했습니다';
        }
      });
      return;
    }
    me.innerHTML = `<div class="ol-head"><div><b>${esc(u.name)}</b> ${u.google ? '<span class="ol-small">· 구글 연결됨</span>' : '<span class="ol-small">· 게스트</span>'}<br>
        <span class="ol-small">내 최고 기록 ${u.best ? `+${u.best.level} ${esc(u.best.weapon)}` : '아직 없음'}</span></div>
        <button class="ol-btn ghost" id="ol-out">로그아웃</button></div>
      <div class="ol-row"><input class="ol-input" id="ol-name" maxlength="12" value="${esc(u.name)}" /><button class="ol-btn ghost" id="ol-rename">이름 바꾸기</button></div>
      ${u.google ? '' : '<div class="ol-small" style="margin-top:10px">구글로 로그인하면 다른 기기에서도 같은 기록으로 이어집니다</div><div class="ol-g" id="ol-g" style="margin-top:8px"></div>'}
      <div class="ol-msg" id="ol-msg"></div>`;
    if (!u.google) void mountGoogle($('ol-g'), 'signin_with');
    $('ol-rename').addEventListener('click', async () => {
      try {
        await rename($<HTMLInputElement>('ol-name').value);
        void openRanking();
      } catch {
        $('ol-msg').textContent = '이름은 2~12자로 적어 주세요';
      }
    });
    $('ol-out').addEventListener('click', () => {
      try {
        window.google?.accounts.id.disableAutoSelect();
      } catch {
        /* ignore */
      }
      signOut();
      void openRanking();
    });
  };
  afterGoogle = (m) => {
    if (m) $('ol-msg') && ($('ol-msg').textContent = m);
    void openRanking();
  };
  renderMe();

  try {
    const r = await ranking();
    const row = (x: RankRow, me = false) =>
      `<tr class="${x.rank <= 3 ? `top${x.rank}` : ''} ${me ? 'me' : ''}"><td class="r">${x.rank}</td><td><b>${esc(x.name)}</b><div class="w">${esc(x.weapon || '')} · DAY ${x.day}</div></td><td class="lv">+${x.level}</td></tr>`;
    const meId = account.user?.uid;
    const inTop = r.top.some((x) => x.uid === meId);
    $('ol-total').textContent = `참가자 ${r.total}명 · 최고 강화 단계 순 · 같은 단계면 먼저 달성한 사람이 위`;
    $('ol-list').innerHTML = r.top.length
      ? `<table class="ol-table">${r.top.map((x) => row(x, x.uid === meId)).join('')}${!inTop && r.me ? `<tr><td colspan="3" class="ol-small" style="text-align:center">⋯</td></tr>${row(r.me, true)}` : ''}</table>`
      : '<div class="ol-msg" style="color:#bfae8c">아직 기록이 없습니다. 첫 번째 주인공이 되어 보세요!</div>';
  } catch {
    $('ol-list').innerHTML = '<div class="ol-msg">랭킹 서버에 연결하지 못했습니다. 잠시 후 다시 열어 주세요.</div>';
  }
}
