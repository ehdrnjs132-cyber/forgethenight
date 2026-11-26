import { describe, expect, it } from 'vitest';
import { SWORD_FORMS, SWORD_NAME_LEVELS, swordForm, swordFormIndex, weaponDisplayName } from '../src/config/swordNames';
import { ELEMENTS, MAX_LEVEL } from '../src/config/weapons';
import { WEAPON_SIZE, weaponSizeScale } from '../src/config/appearance';

describe('sword names', () => {
  // user decision 2026-11-26: cap +100, a new form every +2 → 51 forms (+0, +2, … +100)
  it('has 51 forms per element, one every +2 from +0 to +100', () => {
    expect(MAX_LEVEL).toBe(100);
    expect(SWORD_NAME_LEVELS).toHaveLength(51);
    SWORD_NAME_LEVELS.forEach((l, i) => expect(l).toBe(i * 2));
    expect(SWORD_NAME_LEVELS[50]).toBe(MAX_LEVEL);
    for (const el of ELEMENTS) expect(SWORD_FORMS[el]).toHaveLength(51);
  });

  it('never repeats a name or an art brief across all 255 swords', () => {
    const all = ELEMENTS.flatMap((el) => SWORD_FORMS[el]);
    expect(new Set(all.map((f) => f.name)).size).toBe(255);
    expect(new Set(all.map((f) => f.look)).size).toBe(255);
  });

  it('changes form on every even level and keeps it on the odd one', () => {
    expect(swordFormIndex(0)).toBe(0);
    expect(swordFormIndex(1)).toBe(0);
    expect(swordFormIndex(2)).toBe(1);
    expect(swordFormIndex(21)).toBe(10);
    expect(swordFormIndex(58)).toBe(29);
    expect(swordFormIndex(100)).toBe(50);
    expect(swordForm('fire', 58).name).toBe('우주를 태운 자');
    expect(swordForm('fire', 100).name).toBe('불꽃 그 자체');
    for (let l = 2; l <= MAX_LEVEL; l += 2) expect(swordFormIndex(l)).toBe(swordFormIndex(l - 1) + 1);
  });

  it('weapons grow steadily with level, from small at +0 to the max at +50', () => {
    expect(weaponSizeScale(0)).toBeCloseTo(WEAPON_SIZE.min);
    expect(weaponSizeScale(50)).toBeCloseTo(WEAPON_SIZE.max);
    for (let l = 1; l <= 50; l++) expect(weaponSizeScale(l)).toBeGreaterThan(weaponSizeScale(l - 1));
  });

  it('only swords get form names', () => {
    expect(weaponDisplayName({ cls: 'sword', element: 'ice', level: 0 })).toBe('성에 낀 쇠검');
    expect(weaponDisplayName({ cls: 'axe', element: 'ice', level: 40 })).toBe('얼음 도끼');
  });
});
