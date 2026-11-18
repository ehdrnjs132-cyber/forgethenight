// §14 경제 밸런스: "목표 단계까지 강화 후 판매" 전략별 무기 1자루의 기대 판매액과 하루 수입.
// 실행: npx tsx tools/sim/economy-sim.ts  →  docs/sim/economy-report.md
import { writeFileSync } from 'node:fs';
import { effectiveRow, levelAfter, rollOutcome } from '../../src/core/systems/enhancement';
import { salePrice } from '../../src/core/systems/economy';
import { ITEMS, MERCHANT } from '../../src/config/economy';

const RUNS = 200_000;

/** Push one +0 weapon until it reaches `target` (sell) or breaks (0 gold). */
function run(target: number): { gold: number; tries: number } {
  let level = 0;
  let tries = 0;
  while (level < target) {
    tries++;
    const next = levelAfter(level, rollOutcome(effectiveRow(level), Math.random()));
    if (next === null) return { gold: 0, tries };
    level = next;
  }
  return { gold: salePrice(level), tries };
}

const lines: string[] = [];
lines.push('# 경제 시뮬레이션 (§14)', '');
lines.push(`무기 1자루를 목표 단계까지 강화한 뒤 판매, 도중에 파괴되면 0G. ${RUNS.toLocaleString()}회 몬테카를로. 하루 무기 3자루, 상인은 ${MERCHANT.every}일마다.`, '');
lines.push('| 목표 | 도달 확률 | 기대 판매액/자루 | 하루 기대 수입 | 상인 방문당(3일) | 평균 강화 횟수 |');
lines.push('|---:|---:|---:|---:|---:|---:|');
let best = { target: 0, ev: 0 };
for (const target of [0, 3, 5, 8, 10, 12, 15, 18, 20, 22, 25, 30]) {
  let gold = 0;
  let hit = 0;
  let tries = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = run(target);
    gold += r.gold;
    tries += r.tries;
    if (r.gold > 0) hit++;
  }
  const ev = gold / RUNS;
  if (ev > best.ev) best = { target, ev };
  lines.push(`| +${target} | ${((hit / RUNS) * 100).toFixed(1)}% | ${Math.round(ev).toLocaleString()}G | ${Math.round(ev * 3).toLocaleString()}G | ${Math.round(ev * 9).toLocaleString()}G | ${(tries / RUNS).toFixed(1)} |`);
}
lines.push('', `가장 기대값이 큰 전략: +${best.target}까지 (자루당 ${Math.round(best.ev).toLocaleString()}G, 상인 방문당 약 ${Math.round(best.ev * 9).toLocaleString()}G).`, '');
lines.push('상인 가격 대비 (방문당 기대 수입으로 살 수 있는 개수):', '');
for (const [id, def] of Object.entries(ITEMS)) lines.push(`- ${def.name} ${def.price.toLocaleString()}G: ${(best.ev * 9 / def.price).toFixed(1)}개 (${id})`);
lines.push('', '참고: 실제로는 전투용 무기를 남겨야 하므로 수입은 이보다 낮다. 판매 vs 보유의 선택이 의미를 갖도록 가격을 조정할 때 이 표를 다시 생성한다.');
writeFileSync('docs/sim/economy-report.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
