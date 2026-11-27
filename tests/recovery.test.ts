// Out of gold (QA 2026-11-27): the hint must name something the player can actually do.
import { describe, expect, it } from 'vitest';
import { goldRecovery, goldRecoveryText } from '../src/core/systems/recovery';
import { runWith } from './helpers';

describe('gold recovery hint', () => {
  it('sell when any weapon is worth gold', () => {
    const s = { ...runWith([{ level: 0 }, { level: 2 }]), gold: 0 };
    expect(goldRecovery(s)).toBe('sell');
    expect(goldRecoveryText(s)).toContain('팔아');
  });

  it('every weapon +0 (worth 0G) and room on the rack: fill it, then the next morning overflows for gold', () => {
    const s = { ...runWith([{ level: 0 }]), gold: 0, inventoryCap: 3 };
    expect(goldRecovery(s)).toBe('fill-rack');
    expect(goldRecoveryText(s)).toContain('새 무기 받기');
    expect(goldRecoveryText(s)).not.toContain('무기를 팔아');
  });

  it('rack full (or no free weapons left today): go to the next day', () => {
    const full = { ...runWith([{ level: 0 }, { level: 0 }, { level: 0 }]), gold: 0, inventoryCap: 3 };
    expect(goldRecovery(full)).toBe('next-day');
    expect(goldRecoveryText(full)).toContain('다음 날');
  });
});
