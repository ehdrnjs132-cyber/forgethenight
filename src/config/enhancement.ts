// Enhancement outcome probabilities (§6). The numbers live in enhancement-table.json.
import table from './enhancement-table.json';

export const OUTCOMES = ['great', 'success', 'keep', 'down', 'destroy'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Percent chance of each outcome at one level. Sums to 100. */
export interface EnhanceRow {
  great: number;
  success: number;
  keep: number;
  down: number;
  destroy: number;
}

/** Rows for +0 .. +99. A weapon at +100 (MAX_LEVEL) cannot be enhanced. */
export const ENHANCE_TABLE: readonly EnhanceRow[] = table.rows;

/** Whether the table is still the placeholder awaiting confirmation. */
export const ENHANCE_TABLE_STATUS: string = table.status;

/** Minimum final destroy chance after all bonuses (§16). */
export const DESTROY_FLOOR = 1;

export interface OutcomeInfo {
  name: string;
  /** Level change; destroy removes the weapon. */
  delta: number;
  color: number;
}

export const OUTCOME_INFO: Record<Outcome, OutcomeInfo> = {
  great: { name: '대성공', delta: 2, color: 0xffd34d },
  success: { name: '성공', delta: 1, color: 0xff9a3c },
  keep: { name: '유지', delta: 0, color: 0xa9a29a },
  down: { name: '하락', delta: -1, color: 0xff4a4a },
  destroy: { name: '파괴', delta: 0, color: 0xd11f2a },
};
