// What weapons do the doppelgangers bring? Level distribution per day (PROVISIONAL tuning check).
//   npx tsx tools/sim/doppel-sim.ts → docs/sim/doppel-report.md
import { writeFileSync } from 'node:fs';
import { generateNight } from '../../src/core/systems/doppelganger';
import { TEMPERAMENTS, nightPlan } from '../../src/config/doppelganger';

const NIGHTS = 3000;
const lines = ['# 도플갱어 무기 단계 분포 (임시값 점검)', '', `날짜별 ${NIGHTS}번의 밤을 생성. 플레이어와 같은 강화 확률표 사용.`, ''];
lines.push('| DAY | 인원 | 시도 예산 | 평균 | 중앙값 | 상위 10% | 최고 | +30 이상 비율 | 한 명당 잃은 무기 |');
lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const day of [1, 5, 10, 15, 20, 25, 30, 40, 50]) {
  const levels: number[] = [];
  let lost = 0;
  for (let n = 1; n <= NIGHTS; n++) {
    for (const d of generateNight(day, n * 7919 + day).doppelgangers) {
      levels.push(d.weapon.level);
      lost += d.record.destroyedWeapons;
    }
  }
  levels.sort((a, b) => a - b);
  const q = (p: number) => levels[Math.min(levels.length - 1, Math.floor(levels.length * p))];
  const avg = levels.reduce((s, l) => s + l, 0) / levels.length;
  const hi = levels.filter((l) => l >= 30).length / levels.length;
  const plan = nightPlan(day);
  lines.push(`| ${day} | ${plan.count} | ${plan.attemptBudget} | ${avg.toFixed(1)} | +${q(0.5)} | +${q(0.9)} | +${levels.at(-1)} | ${(hi * 100).toFixed(1)}% | ${(lost / levels.length).toFixed(2)} |`);
}
lines.push('', '성향: ' + Object.values(TEMPERAMENTS).map((t) => `${t.name}(${t.desc})`).join(', '));
writeFileSync('docs/sim/doppel-report.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
