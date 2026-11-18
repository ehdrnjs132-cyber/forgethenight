// Enhancement simulation report (§14, §27 A/D). Writes docs/sim/enhance-report.md.
//   npm run sim
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENHANCE_TABLE, ENHANCE_TABLE_STATUS } from '../../src/config/enhancement';
import { ENHANCE_ANIM_MS, LAST_DAY } from '../../src/config/rules';
import { DAILY_GRANT } from '../../src/config/weapons';
import { Rng } from '../../src/core/rng';
import { pushToEnd, reachProbability } from './model';

const RUNS = 200_000;
const MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const WEAPONS_PER_RUN = DAILY_GRANT.length * LAST_DAY; // 150

const rows = ENHANCE_TABLE;
const rng = new Rng(20261118);

// Monte Carlo: push fresh weapons until they break or hit +50.
const reached = new Array<number>(51).fill(0);
const clicksSum = new Array<number>(51).fill(0);
let totalClicks = 0;
let destroyed = 0;
for (let i = 0; i < RUNS; i++) {
  const r = pushToEnd(rows, () => rng.next());
  if (r.destroyed) destroyed++;
  for (let l = 1; l <= 50; l++) {
    if (r.firstReach[l] >= 0) {
      reached[l]++;
      clicksSum[l] += r.firstReach[l];
    }
  }
  totalClicks += r.clicks;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const secs = (clicks: number) => {
  const s = (clicks * ENHANCE_ANIM_MS) / 1000;
  return s < 90 ? `${s.toFixed(0)}초` : `${(s / 60).toFixed(1)}분`;
};

const lines: string[] = [];
lines.push('# 강화 확률 시뮬레이션 리포트', '');
lines.push(`- 확률표 상태: **${ENHANCE_TABLE_STATUS}** (src/config/enhancement-table.json)`);
lines.push(`- 방법: 새 +0 무기를 파괴되거나 +50이 될 때까지 계속 강화. 정확해(마르코프)와 몬테카를로 ${RUNS.toLocaleString()}회`);
lines.push(`- 강화 1회 연출 ${ENHANCE_ANIM_MS}ms 기준으로 시간 환산. 토템·스킬·아이템 보정 없음`);
lines.push(`- 한 판(50일) 지급 무기 ${WEAPONS_PER_RUN}자루 기준 기대 개수는 "모든 무기를 끝까지 민다"는 가정의 상한`, '');

lines.push('## 확률표 요약', '');
lines.push('| 단계 | 대성공 | 성공 | 유지 | 하락 | 파괴 |', '|---|---:|---:|---:|---:|---:|');
for (const l of [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 49]) {
  const r = rows[l];
  lines.push(`| +${l} | ${r.great}% | ${r.success}% | ${r.keep}% | ${r.down}% | ${r.destroy}% |`);
}
lines.push('');

lines.push('## +0에서 출발해 각 단계에 도달할 확률', '');
lines.push('| 목표 | 도달 확률(정확) | 몬테카를로 | 도달까지 평균 강화 횟수 | 평균 소요 시간 | 150자루 중 기대 개수 |');
lines.push('|---|---:|---:|---:|---:|---:|');
for (const t of MILESTONES) {
  const exact = reachProbability(rows, 0, t);
  const mc = reached[t] / RUNS;
  const avgClicks = reached[t] ? clicksSum[t] / reached[t] : 0;
  lines.push(
    `| +${t} | ${pct(exact, 2)} | ${pct(mc, 2)} | ${avgClicks.toFixed(0)}회 | ${secs(avgClicks)} | ${(exact * WEAPONS_PER_RUN).toFixed(1)} |`,
  );
}
lines.push('');

lines.push('## 구간별 생존 확률 (해당 단계에서 출발)', '');
lines.push('| 구간 | 확률 |', '|---|---:|');
for (const [a, b] of [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50]] as const) {
  lines.push(`| +${a} → +${b} | ${pct(reachProbability(rows, a, b))} |`);
}
lines.push('');

lines.push('## 요약', '');
lines.push(`- 끝까지 밀었을 때 파괴되는 비율: ${pct(destroyed / RUNS, 2)}`);
lines.push(`- 무기 1자루를 끝까지 미는 데 드는 평균 강화 횟수: ${(totalClicks / RUNS).toFixed(0)}회`);
lines.push(`- +50 무기를 한 판에 한 자루라도 얻을 확률(모든 무기를 끝까지 민다고 가정): ${pct(1 - Math.pow(1 - reachProbability(rows, 0, 50), WEAPONS_PER_RUN))}`);
lines.push('');

const out = fileURLToPath(new URL('../../docs/sim/enhance-report.md', import.meta.url));
writeFileSync(out, lines.join('\n'));
console.log(lines.join('\n'));
console.log(`\nwrote ${out}`);
