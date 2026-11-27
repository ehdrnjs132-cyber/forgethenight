// Hard-mode comparison (QA proposal, user request 2026-11-27). Plays whole runs through the real GameCore
// (morning delivery, free weapons, stamina, selling, overflow) up to the third rent on DAY 22, with two
// strategies and two rule sets on the SAME random seeds. No night battle and no cards.
//
//   npx tsx tools/sim/hard-mode-sim.ts  →  docs/sim/hard-mode-report.md
//
// Rule sets
//   current: the game as it is (table rows as shipped, hammer ×0.50 → ×0.55 → ×0.60, rent 150 × 1.16^(day−1))
//   hard:    the QA experiment — +0 success 50% / great 8% (the cut moved to keep, fading out by +15),
//            hammer ×0.45 → ×0.48 → ×0.51, rent 600 / 2,050 / 5,000 G on DAY 8 / 15 / 22
//
// Model of time: one strike (raise, hit, result, unlock) takes STRIKE_SEC_AT_1 / speed seconds of stamina
// drain. Measured in the browser on 2026-11-27: ~0.94 s per held strike at ×0.50 → 0.47 s at ×1. The
// awakening's extra wait no longer drains (fixed the same day), so it is not counted.
import { writeFileSync } from 'node:fs';
import { ENHANCE_TABLE, type EnhanceRow } from '../../src/config/enhancement';
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
const RENT_DAYS = [8, 15, 22] as const;
const LAST_DAY = 22;

interface Mode {
  name: string;
  speed: [number, number, number]; // base, after sp1, after sp2
  rent: (day: number) => number;
  /** Rows changed for this mode (restored afterwards). */
  table: (row: EnhanceRow, level: number) => EnhanceRow;
}

const CURRENT: Mode = { name: '현재', speed: [0.5, 0.55, 0.6], rent: (d) => rentAmount(d), table: (r) => r };
const HARD: Mode = {
  name: '하드(실험값)',
  speed: [0.45, 0.48, 0.51],
  rent: (d) => ({ 8: 600, 15: 2050, 22: 5000 })[d as 8 | 15 | 22] ?? 0,
  table: (r, level) => {
    // +0: success 56 → 50, great 10 → 8; the cut goes to keep and fades out linearly by +15
    const f = Math.max(0, 1 - level / 15);
    const ds = 6 * f;
    const dg = 2 * f;
    return { ...r, success: r.success - ds, great: r.great - dg, keep: r.keep + ds + dg };
  },
};

type Strategy = { name: string; target: (rng: Rng) => number };
const LOW: Strategy = { name: '저강화 판매 (+3)', target: () => 3 };
const MIXED: Strategy = { name: '+8~+12 혼합 판매', target: (rng) => 8 + rng.int(5) };

interface RunLog {
  day1Strikes: number;
  week1Strikes: number;
  /** Rent visits paid (0..3) before going broke. */
  paid: number;
  /** Gold left right after each paid rent (before any skill). */
  leftAfter: number[];
  /** Could the next speed star be bought right after the rent. */
  couldBuy: boolean[];
}

function playRun(seed: number, mode: Mode, strat: Strategy): RunLog {
  const core = new GameCore(new MemoryStorage(), seed);
  core.state = { ...core.state, tutorials: { ...core.state.tutorials, firstEnhance: true, prologueDone: true }, rentDueDay: 10_000 };
  const pick = new Rng(seed * 7919 + 13); // the strategy's own choices, the same for both modes
  const targets = new Map<string, number>();
  const targetOf = (id: string) => {
    if (!targets.has(id)) targets.set(id, strat.target(pick));
    return targets.get(id)!;
  };
  let speedStars = 0;
  const log: RunLog = { day1Strikes: 0, week1Strikes: 0, paid: 0, leftAfter: [], couldBuy: [] };

  for (let day = 1; day <= LAST_DAY; day++) {
    const s = () => core.state;
    // ── morning: the king (handled here so both rent rules use the same code path)
    if ((RENT_DAYS as readonly number[]).includes(day)) {
      const rent = mode.rent(day);
      // short of gold: sell the most valuable weapons first
      for (const w of [...s().weapons].sort((a, b) => b.level - a.level)) {
        if (s().gold >= rent) break;
        if (sellPrice(s(), w.level, w.golden) > 0) core.dispatch({ type: 'SELL', weaponId: w.id });
      }
      if (s().gold < rent) return log; // broke: the run ends
      core.state = { ...s(), gold: s().gold - rent };
      log.paid++;
      log.leftAfter.push(s().gold);
      // after paying: the next speed star, if it can be afforded (the evening shop, here in the morning)
      const next = ['sp1', 'sp2'][speedStars];
      const cost = next ? TREE_BY_ID[next].cost : Infinity;
      log.couldBuy.push(s().gold >= cost);
      if (next && s().gold >= cost) {
        core.dispatch({ type: 'BUY_NODE', id: next, evening: true });
        speedStars++;
      }
    }
    // ── the day's work
    const speed = mode.speed[speedStars];
    let strikes = 0;
    for (let guard = 0; guard < 500; guard++) {
      // sell whatever reached its target
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
        // sell the most valuable other weapon to keep going; else the day is over
        const other = [...s().weapons].filter((w) => w.id !== work.id && sellPrice(s(), w.level, w.golden) > 0).sort((a, b) => b.level - a.level)[0];
        if (!other) break;
        core.dispatch({ type: 'SELL', weaponId: other.id });
        continue;
      }
      const r = core.dispatch({ type: 'ENHANCE', weaponId: work.id, confirmLast: true });
      if (r.type !== 'enhanced') break;
      strikes++;
      core.dispatch({ type: 'DRAIN_STAMINA', seconds: STRIKE_SEC_AT_1 / speed });
    }
    if (day === 1) log.day1Strikes = strikes;
    if (day <= 7) log.week1Strikes += strikes;
    // ── night: sleep (no cards, no battle); the core's own rent stays far away
    core.dispatch({ type: 'SLEEP' });
    core.state = { ...core.state, rentDueDay: 10_000 };
  }
  return log;
}

function withTable<T>(mode: Mode, fn: () => T): T {
  const saved = ENHANCE_TABLE.map((r) => ({ ...r }));
  ENHANCE_TABLE.forEach((r, i) => Object.assign(r, mode.table(r, i)));
  try {
    return fn();
  } finally {
    ENHANCE_TABLE.forEach((r, i) => Object.assign(r, saved[i]));
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`;
const g = (n: number) => (Number.isNaN(n) ? '—' : `${Math.round(n).toLocaleString()}G`);

const lines: string[] = [];
lines.push('# 하드 모드 비교 (QA 실험값, 2026-11-27)', '');
lines.push(`실제 게임 코어로 DAY 1~${LAST_DAY}를 ${RUNS}판씩 진행. 두 규칙과 두 전략 모두 같은 난수 시드. 밤 결투·카드 없음.`);
lines.push(`타격 1회의 체력 소모 시간 = ${STRIKE_SEC_AT_1}초 ÷ 망치 속도 (브라우저 실측 기반). 월세를 낸 직후 다음 속도 별을 살 수 있으면 산다.`, '');
lines.push(`- 현재: 표 그대로, 속도 ×${CURRENT.speed.join(' → ×')}, 월세 ${RENT_DAYS.map((d) => `DAY ${d} ${g(CURRENT.rent(d))}`).join(' · ')}`);
lines.push(`- 하드: +0 성공 50%·대성공 8% (줄인 몫은 유지로, +15까지 점점 0), 속도 ×${HARD.speed.join(' → ×')}, 월세 ${RENT_DAYS.map((d) => `DAY ${d} ${g(HARD.rent(d))}`).join(' · ')}`);
lines.push(`- 속도 별 가격: sp1 ${g(TREE_BY_ID.sp1.cost)}, sp2 ${g(TREE_BY_ID.sp2.cost)}`, '');
lines.push('| 규칙 | 전략 | DAY 1 타수 | 첫 주 타수 | 1차 납부율 | 2차 | 3차 | 1차 후 잔액(중앙) | 2차 후 | 3차 후 | 1차 후 속도 별 구매 가능 | 2차 후 |');
lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const mode of [CURRENT, HARD]) {
  for (const strat of [LOW, MIXED]) {
    const logs = withTable(mode, () => Array.from({ length: RUNS }, (_, i) => playRun(1000 + i, mode, strat)));
    const paid = (k: number) => logs.filter((l) => l.paid >= k).length;
    const left = (k: number) => median(logs.filter((l) => l.paid >= k).map((l) => l.leftAfter[k - 1]));
    const buy = (k: number) => {
      const ok = logs.filter((l) => l.paid >= k);
      return pct(ok.filter((l) => l.couldBuy[k - 1]).length, ok.length);
    };
    lines.push(
      `| ${mode.name} | ${strat.name} | ${avg(logs.map((l) => l.day1Strikes)).toFixed(1)} | ${avg(logs.map((l) => l.week1Strikes)).toFixed(1)} | ${pct(paid(1), RUNS)} | ${pct(paid(2), RUNS)} | ${pct(paid(3), RUNS)} | ${g(left(1))} | ${g(left(2))} | ${g(left(3))} | ${buy(1)} | ${buy(2)} |`,
    );
  }
}
lines.push('', '납부율은 그 월세까지 살아남아 낸 판의 비율(누적). 잔액은 낸 판들만의 중앙값으로, 스킬을 사기 전 금액.');
writeFileSync('docs/sim/hard-mode-report.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
