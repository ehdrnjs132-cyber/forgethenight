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

/** Placeholder curve, pending the user's confirmation (DECISIONS.md #5). */
// Tuned so that pushing a fresh weapon until it breaks reaches roughly
// +10: 72%, +20: 39%, +30: 13%, +40: 2.4%, +50: 0.2%  (see docs/sim/enhance-report.md).
export const PARAMS: CurveParams = {
  great: [10, 6, 1],
  success: [56, 52, 1],
  down: [3, 7, 1],
  destroy: [2, 20, 1.7],
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function generateTable(p: CurveParams): EnhanceRow[] {
  const rows: EnhanceRow[] = [];
  for (let level = 0; level < 50; level++) {
    const t = level / 49;
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = generateTable(PARAMS);
  const out = {
    note: 'Placeholder enhancement table (+0..+49). Percent per outcome; each row sums to 100. Edit freely; tests verify the sums.',
    status: 'pending-confirmation',
    params: PARAMS,
    rows,
  };
  const path = fileURLToPath(new URL('../../src/config/enhancement-table.json', import.meta.url));
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${rows.length} rows → ${path}`);
}
