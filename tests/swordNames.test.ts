import { describe, expect, it } from 'vitest';
import { SWORD_FORMS, SWORD_NAME_LEVELS, swordForm, swordFormIndex, weaponDisplayName } from '../src/config/swordNames';
import { ELEMENTS, MAX_LEVEL } from '../src/config/weapons';

describe('sword names', () => {
  it('has 30 forms per element and 30 ascending start levels from +0 to the max', () => {
    expect(SWORD_NAME_LEVELS).toHaveLength(30);
    expect(SWORD_NAME_LEVELS[0]).toBe(0);
    expect(SWORD_NAME_LEVELS[29]).toBe(MAX_LEVEL);
    for (let i = 1; i < 30; i++) expect(SWORD_NAME_LEVELS[i]).toBeGreaterThan(SWORD_NAME_LEVELS[i - 1]);
    for (const el of ELEMENTS) expect(SWORD_FORMS[el]).toHaveLength(30);
  });

  it('never repeats a name or an art brief across all 150 swords', () => {
    const all = ELEMENTS.flatMap((el) => SWORD_FORMS[el]);
    expect(new Set(all.map((f) => f.name)).size).toBe(150);
    expect(new Set(all.map((f) => f.look)).size).toBe(150);
  });

  it('maps levels to forms', () => {
    expect(swordFormIndex(0)).toBe(0);
    expect(swordFormIndex(20)).toBe(20);
    expect(swordFormIndex(22)).toBe(20);
    expect(swordFormIndex(49)).toBe(28);
    expect(swordFormIndex(50)).toBe(29);
    expect(swordForm('fire', 50).name).toBe('우주를 태운 자');
  });

  it('only swords get form names', () => {
    expect(weaponDisplayName({ cls: 'sword', element: 'ice', level: 0 })).toBe('성에 낀 쇠검');
    expect(weaponDisplayName({ cls: 'axe', element: 'ice', level: 40 })).toBe('얼음 도끼');
  });
});
