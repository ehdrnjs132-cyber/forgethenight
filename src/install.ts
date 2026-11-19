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

  help = document.createElement('div');
  help.id = 'install-help';
  document.body.append(help);

  const show = () => (btn.style.display = 'flex');
  const hide = () => (btn.style.display = 'none');

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).classList.contains('x')) return hide();
    if ((await installApp()) === 'accepted') hide();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    show();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hide();
  });
  if (isIos()) show();
}

let deferred: InstallPromptEvent | null = null;
let help: HTMLDivElement | null = null;

/** Whether an "install" button makes sense here (not already running as the app). */
export function canOfferInstall(): boolean {
  return !isApp();
}

const IOS_HELP = `<b>홈 화면에 앱으로 추가하기</b><br><br>
  1. Safari 아래쪽(아이패드는 위쪽)의 <b>공유 버튼</b> <span style="font-size:18px">⎋</span> 을 누릅니다.<br>
  2. 목록에서 <b>홈 화면에 추가</b>를 누릅니다.<br>
  3. 홈 화면의 <b>FORGE</b> 아이콘으로 실행하면 주소창 없이 꽉 찬 화면으로 열립니다.<br><br>
  <span style="opacity:.7;font-size:13px">Safari가 아닌 브라우저(카카오톡·크롬 등)라면 Safari로 이 주소를 열어 주세요.</span>`;

const OTHER_HELP = `<b>앱으로 설치하기</b><br><br>
  1. 브라우저 오른쪽 위(또는 아래)의 <b>메뉴 ⋮</b> 를 누릅니다.<br>
  2. <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누릅니다.<br>
  3. 홈 화면의 <b>FORGE</b> 아이콘으로 실행하면 주소창 없이 꽉 찬 화면으로 열립니다.<br><br>
  <span style="opacity:.7;font-size:13px">카카오톡 같은 앱 안에서 열었다면, 크롬이나 삼성 인터넷으로 이 주소를 열어 주세요.</span>`;

/** Install: the browser's own prompt when it offers one, otherwise step-by-step help. */
export async function installApp(): Promise<'accepted' | 'dismissed' | 'help'> {
  if (deferred) {
    const d = deferred;
    deferred = null;
    await d.prompt();
    return (await d.userChoice).outcome;
  }
  if (help) {
    help.innerHTML = `<div>${isIos() ? IOS_HELP : OTHER_HELP}<button type="button">확인</button></div>`;
    help.querySelector('button')!.addEventListener('click', () => (help!.style.display = 'none'));
    help.style.display = 'grid';
  }
  return 'help';
}
