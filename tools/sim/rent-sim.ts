// Can players pay the king? (2026-11-27: "플레이어들이 3번째 상납금을 전혀 못 내고 죽고 있어")
// Plays whole runs through the real GameCore (delivery, free weapons, stamina, selling, enhance costs)
// to the fourth rent on DAY 29, for a few sale-bonus / rent-growth options and three ways of selling,
// all on the same random seeds. No night battle, no cards; speed stars bought when affordable after rent.
//
//   npx tsx tools/sim/rent-sim.ts  →  docs/sim/rent-report.md
//
// Time model as in hard-mode-sim.ts: one strike drains 0.47 s ÷ hammer speed of stamina.
import { writeFileSync } from 'node:fs';
import { RENT, SALE_AWAKEN } from '../../src/config/economy';
import { TREE_BY_ID } from '../../src/config/skillTree';
import { GameCore } from '../../src/core/game';
import { MemoryStorage } from '../../src/core/save/save';
import { Rng } from '../../src/core/rng';
import { enhanceCostFor, sellPrice } from '../../src/core/systems/economy';
import { staminaLeft } from '../../src/core/systems/forgeSkills';
import { rentAmount } from '../../src/core/systems/rent';
import { freeWeaponsLeft } from '../../src/core/systems/weapons';

const RUNS = 300;
const STRIKE_SEC_AT_1 = 0.47;
const RENT_DAYS = [8, 15, 22, 29] as const;
const LAST_DAY = 29;
const SPEED = [0.5, 0.55, 0.6];

interface Option {
  name: string;
  awakenMul: number;
  growth: number;
}
const OPTIONS: Option[] = [
  { name: '지금 (보너스 없음 · 하루 16%)', awakenMul: 1, growth: 1.16 },
  { name: '+10부터 ×2', awakenMul: 2, growth: 1.16 },
  { name: '+10부터 ×2.5', awakenMul: 2.5, growth: 1.16 },
  { name: '+10부터 ×3', awakenMul: 3, growth: 1.16 },
  { name: '+10부터 ×2.5 · 하루 13%', awakenMul: 2.5, growth: 1.13 },
];

type Strategy = { name: string; target: (rng: Rng) => number };
const STRATS: Strategy[] = [
  { name: '+3 판매', target: () => 3 },
  { name: '+8~+12 판매', target: (rng) => 8 + rng.int(5) },
  { name: '+10 판매', target: () => 10 },
];

interface RunLog {
  paid: number;
  leftAfter: number[];
}

function playRun(seed: number, strat: Strategy): RunLog {
  const core = new GameCore(new MemoryStorage(), seed);
  core.state = { ...core.state, tutorials: { ...core.state.tutorials, firstEnhance: true, prologueDone: true }, rentDueDay: 10_000 };
  const pick = new Rng(seed * 7919 + 13);
  const targets = new Map<string, number>();
  const targetOf = (id: string) => {
    if (!targets.has(id)) targets.set(id, strat.target(pick));
    return targets.get(id)!;
  };
  let speedStars = 0;
  const log: RunLog = { paid: 0, leftAfter: [] };
  for (let day = 1; day <= LAST_DAY; day++) {
    const s = () => core.state;
    if ((RENT_DAYS as readonly number[]).includes(day)) {
      const rent = rentAmount(day);
      for (const w of [...s().weapons].sort((a, b) => b.level - a.level)) {
        if (s().gold >= rent) break;
        if (sellPrice(s(), w.level, w.golden) > 0) core.dispatch({ type: 'SELL', weaponId: w.id });
      }
      if (s().gold < rent) return log;
      core.state = { ...s(), gold: s().gold - rent };
      log.paid++;
      log.leftAfter.push(s().gold);
      const next = ['sp1', 'sp2'][speedStars];
      if (next && s().gold >= TREE_BY_ID[next].cost) {
        core.dispatch({ type: 'BUY_NODE', id: next, evening: true });
        speedStars++;
      }
    }
    const speed = SPEED[speedStars];
    for (let guard = 0; guard < 500; guard++) {
      for (const w of s().weapons) if (w.level >= targetOf(w.id)) core.dispatch({ type: 'SELL', weaponId: w.id });
      if (staminaLeft(s()) <= 0) break;
      const work = [...s().weapons].filter((w) => w.level < targetOf(w.id)).sort((a, b) => b.level - a.level)[0];
      if (!work) {
        if (s().weapons.length < s().inventoryCap && freeWeaponsLeft(s()) > 0) {
          core.dispatch({ type: 'BUY_WEAPON' });
          continue;
        }
        break;
      }
      if (s().gold < enhanceCostFor(s(), work.level)) {
        const other = [...s().weapons].filter((w) => w.id !== work.id && sellPrice(s(), w.level, w.golden) > 0).sort((a, b) => b.level - a.level)[0];
        if (!other) break;
        core.dispatch({ type: 'SELL', weaponId: other.id });
        continue;
      }
      const r = core.dispatch({ type: 'ENHANCE', weaponId: work.id, confirmLast: true });
      if (r.type !== 'enhanced') break;
      core.dispatch({ type: 'DRAIN_STAMINA', seconds: STRIKE_SEC_AT_1 / speed });
    }
    core.dispatch({ type: 'SLEEP' });
    core.state = { ...core.state, rentDueDay: 10_000 };
  }
  return log;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const pct = (n: number) => `${Math.round((100 * n) / RUNS)}%`;
const g = (n: number) => (Number.isNaN(n) ? '—' : `${Math.round(n).toLocaleString()}G`);

const saved = { mul: SALE_AWAKEN.mul, growth: RENT.growth };
const lines: string[] = ['# 월세 납부 시뮬레이션 (2026-11-27)', ''];
lines.push(`실제 게임 코어로 DAY 1~${LAST_DAY}를 ${RUNS}판씩. 같은 난수 시드. 밤 결투·카드 없음, 월세를 낸 뒤 살 수 있으면 속도 별 구매.`, '');
lines.push('| 설정 | 월세 (DAY 8 / 15 / 22 / 29) | 전략 | 1차 | 2차 | **3차** | 4차 | 3차 후 잔액(중앙) |');
lines.push('|---|---|---|---:|---:|---:|---:|---:|');
for (const opt of OPTIONS) {
  SALE_AWAKEN.mul = opt.awakenMul;
  RENT.growth = opt.growth;
  const rents = RENT_DAYS.map((d) => rentAmount(d).toLocaleString()).join(' / ');
  for (const st of STRATS) {
    const logs = Array.from({ length: RUNS }, (_, i) => playRun(1000 + i, st));
    const paid = (k: number) => logs.filter((l) => l.paid >= k).length;
    const left3 = median(logs.filter((l) => l.paid >= 3).map((l) => l.leftAfter[2]));
    lines.push(`| ${opt.name} | ${rents} | ${st.name} | ${pct(paid(1))} | ${pct(paid(2))} | **${pct(paid(3))}** | ${pct(paid(4))} | ${g(left3)} |`);
  }
}
SALE_AWAKEN.mul = saved.mul;
RENT.growth = saved.growth;
lines.push('', '납부율은 그 월세까지 살아남아 낸 판의 비율(누적).');
writeFileSync('docs/sim/rent-report.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
