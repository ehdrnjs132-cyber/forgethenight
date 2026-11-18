// "앱 설치" button (user request 2026-11-18): installed as an app, the game opens full screen in
// landscape with no browser bars. Android/Chrome gets the real install prompt; iPhone/iPad Safari
// has no prompt, so the button shows how to use "홈 화면에 추가" instead. Hidden once running as an app.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isApp = () =>
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const CSS = `
#install-btn { position: fixed; left: max(10px, env(safe-area-inset-left)); bottom: max(10px, env(safe-area-inset-bottom)); z-index: 20;
  display: none; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 999px; border: 2px solid #e9b65c;
  background: rgba(20, 12, 6, .88); color: #ffe2a0; font: 800 14px "Noto Sans KR", sans-serif; cursor: pointer; }
#install-btn .x { margin-left: 4px; opacity: .6; font-weight: 400; padding: 0 2px; }
#install-help { position: fixed; inset: 0; z-index: 30; display: none; place-items: center; background: rgba(0,0,0,.7); }
#install-help > div { max-width: 420px; margin: 16px; padding: 20px 22px; border-radius: 14px; background: #1b1410; border: 2px solid #e9b65c;
  color: #f1e3c2; font: 500 15px/1.6 "Noto Sans KR", sans-serif; }
#install-help b { color: #ffd27a; }
#install-help button { margin-top: 14px; width: 100%; padding: 10px; border-radius: 10px; border: 0; background: #e9b65c; color: #1b1410; font: 800 15px "Noto Sans KR", sans-serif; }
`;

export function setupInstall() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
  if (isApp()) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const btn = document.createElement('button');
  btn.id = 'install-btn';
  btn.innerHTML = '📲 앱 설치 · 전체화면<span class="x" aria-label="닫기">✕</span>';
  document.body.append(btn);

  const help = document.createElement('div');
  help.id = 'install-help';
  help.innerHTML = `<div>
    <b>홈 화면에 앱으로 추가하기</b><br><br>
    1. Safari 아래쪽(아이패드는 위쪽)의 <b>공유 버튼</b> <span style="font-size:18px">⎋</span> 을 누릅니다.<br>
    2. 목록에서 <b>홈 화면에 추가</b>를 누릅니다.<br>
    3. 홈 화면의 <b>FORGE</b> 아이콘으로 실행하면 주소창 없이 꽉 찬 화면으로 열립니다.<br><br>
    <span style="opacity:.7;font-size:13px">Safari가 아닌 브라우저(카카오톡·크롬 등)라면 Safari로 이 주소를 열어 주세요.</span>
    <button type="button">확인</button></div>`;
  document.body.append(help);
  help.querySelector('button')!.addEventListener('click', () => (help.style.display = 'none'));

  let deferred: InstallPromptEvent | null = null;
  const show = () => (btn.style.display = 'flex');
  const hide = () => (btn.style.display = 'none');

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).classList.contains('x')) return hide();
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') hide();
      deferred = null;
    } else if (isIos()) help.style.display = 'grid';
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    show();
  });
  window.addEventListener('appinstalled', hide);
  if (isIos()) show();
}
