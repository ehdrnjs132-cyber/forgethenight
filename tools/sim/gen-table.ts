// Generates src/config/enhancement-table.json from a few curve parameters.
// The JSON is the source of truth the game reads; this script only makes it easy to reshape.
// Hand edits to the JSON are fine too: tests check that every row still sums to 100.
//
//   npm run table

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EnhanceRow } from '../../src/config/enhancement';

export interface CurveParams {
  /** [value at +0, value at +49, curve exponent]. value(L) = a + (b - a) * (L/49)^p */
  great: [number, number, number];
  success: [number, number, number];
  down: [number, number, number];
  destroy: [number, number, number];
}

/** Confirmed curve (DECISIONS.md #5, 2026-11-18). Regenerating keeps the confirmed status; changing PARAMS is a design change. */
// 2026-11-18 user feedback: destroy chance raised (was [2, 20, 1.7]: +10 3.2%, +20 5.9%, +30 9.8%, +49 20%).
// Now roughly +10 5.7%, +20 10%, +30 15.6%, +40 21.7%, +49 28%. Run `npm run sim` for reach rates.
export const PARAMS: CurveParams = {
  great: [10, 6, 1],
  success: [56, 52, 1],
  down: [3, 7, 1],
  // 2026-11-19: harsher from the very start (user: "초반에는 파괴확률을 높게"); skills such as 불사조의 모루
  // are what make the early game survivable now. Was [3, 28, 1.4].
  destroy: [5, 30, 1.2],
};

/**
 * +50..+99 (user decision 2026-11-26: the cap went from +50 to +100). The confirmed +0..+49 rows stay
 * exactly as they were; this second segment starts where they end and keeps getting harsher.
 * [value at +50, value at +99, curve exponent]. First guess, awaiting the user's review.
 */
export const EXT_PARAMS: CurveParams = {
  great: [6, 4, 1],
  success: [52, 44, 1],
  down: [7, 9, 1],
  destroy: [30, 40, 1],
};

const round1 = (v: number) => Math.round(v * 10) / 10;

function segment(p: CurveParams, from: number, to: number): EnhanceRow[] {
  const rows: EnhanceRow[] = [];
  for (let level = from; level <= to; level++) {
    const t = (level - from) / (to - from);
    const curve = ([a, b, e]: [number, number, number]) => round1(a + (b - a) * Math.pow(t, e));
    const great = curve(p.great);
    const success = curve(p.success);
    const down = curve(p.down);
    const destroy = curve(p.destroy);
    const keep = round1(100 - great - success - down - destroy);
    if (keep < 0) throw new Error(`level ${level}: outcomes exceed 100%`);
    rows.push({ great, success, keep, down, destroy });
  }
  return rows;
}

export function generateTable(p: CurveParams, ext: CurveParams = EXT_PARAMS): EnhanceRow[] {
  return [...segment(p, 0, 49), ...segment(ext, 50, 99)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = generateTable(PARAMS);
  const out = {
    note: 'Enhancement table (+0..+99). Rows +0..+49 confirmed by the user on 2026-11-18; +50..+99 added 2026-11-26 (cap raised to +100), first guess. Percent per outcome; each row sums to 100. Tests verify the sums.',
    status: 'confirmed',
    confirmedAt: '2026-11-18',
    params: PARAMS,
    extParams: EXT_PARAMS,
    rows,
  };
  const path = fileURLToPath(new URL('../../src/config/enhancement-table.json', import.meta.url));
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${rows.length} rows → ${path}`);
}
