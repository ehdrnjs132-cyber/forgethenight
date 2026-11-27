// Small text formats shared by scenes (no Phaser here, so tests can use them).

/** "1시간 12분 5초" / "12분 5초" / "45초". */
export function playTime(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h) return `${h}시간 ${m}분 ${s}초`;
  if (m) return `${m}분 ${s}초`;
  return `${s}초`;
}
