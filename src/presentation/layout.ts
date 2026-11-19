// Screen orientation for this session (user decision 2026-11-19: phones get a portrait version,
// PC stays landscape). Decided once at boot; the game canvas is 720×1280 in portrait, 1280×720 otherwise.
//
// While the portrait screens are being built, portrait is opt-in with `?portrait` (and `?landscape`
// forces the old layout), so the live site keeps working in landscape meanwhile.

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  if (q.has('landscape')) return false;
  if (q.has('portrait')) return true;
  return false; // later: phones held upright → window.matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth
}

export const PORTRAIT = detect();

/**
 * Portrait canvas height: 720 wide, as tall as the phone's own shape (9:16 up to about 9:21), so a tall
 * phone gets no black bands. Layouts anchor their lower block to the bottom using `H - 1280`.
 */
export function portraitHeight(): number {
  if (typeof window === 'undefined') return 1280;
  const ratio = window.innerHeight / Math.max(1, window.innerWidth);
  return Math.round(Math.min(1600, Math.max(1280, 720 * ratio)));
}
