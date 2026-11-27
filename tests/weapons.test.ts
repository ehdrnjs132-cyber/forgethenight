import { describe, expect, it } from 'vitest';
import { createRun } from '../src/core/state/initial';
import { equip, grantDaily } from '../src/core/systems/weapons';
import { INVENTORY_CAP, INVENTORY_START } from '../src/config/weapons';

describe('daily weapon grant (QA 8)', () => {
  it('hands out two swords at +0 (two since 2026-11-27) (swords only since 2026-11-19)', () => {
    const { state, granted } = grantDaily(createRun(7));
    expect(granted.map((w) => w.cls)).toEqual(['sword', 'sword']);
    expect(granted.every((w) => w.level === 0 && w.bornDay === 1)).toBe(true);
    expect(state.weapons).toHaveLength(2);
    expect(state.grantedDays).toEqual([1]);
  });

  it('gives nothing the second time on the same day', () => {
    const once = grantDaily(createRun(7)).state;
    const twice = grantDaily(once);
    expect(twice.granted).toHaveLength(0);
    expect(twice.state.weapons).toHaveLength(2);
    expect(twice.state).toBe(once);
  });

  it('gives two more on the next day with unique ids', () => {
    const day1 = grantDaily({ ...createRun(7), inventoryCap: 8 }).state; // room for two days of deliveries
    const day2 = grantDaily({ ...day1, day: 2 }).state;
    expect(day2.weapons).toHaveLength(4);
    expect(new Set(day2.weapons.map((w) => w.id)).size).toBe(4);
  });

  it('never exceeds the owned slots; extra deliveries are sold at the +0 price', () => {
    const day1 = grantDaily(createRun(3)).state;
    expect(day1.inventoryCap).toBe(INVENTORY_START);
    const r = grantDaily({ ...day1, day: 2 });
    expect(r.state.weapons).toHaveLength(INVENTORY_START);
    expect(r.overflow).toBe(1); // 2 + 2 delivered, 3 slots open
    expect(r.state.gold).toBe(day1.gold + 10);
    let s = { ...createRun(3), inventoryCap: INVENTORY_CAP };
    for (let day = 1; day <= 10; day++) s = grantDaily({ ...s, day }).state;
    expect(s.weapons.length).toBe(INVENTORY_CAP);
  });
});

describe('equip', () => {
  it('equips an owned weapon and ignores unknown ids', () => {
    const s = grantDaily(createRun(1)).state;
    const id = s.weapons[1].id;
    expect(equip(s, id).equippedId).toBe(id);
    expect(equip(s, 'nope')).toBe(s);
  });
});
