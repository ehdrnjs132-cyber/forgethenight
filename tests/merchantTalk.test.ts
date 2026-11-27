// 상인 모르의 방문 대화 (user 2026-11-27): a talk on every merchant day, once a visit.
import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage } from '../src/core/save/save';
import { markMerchantTalk, merchantGreeting, merchantTalkDue } from '../src/core/systems/merchantTalk';
import { MERCHANT_FIRST, MERCHANT_GREETINGS } from '../src/config/story';
import type { GameState } from '../src/core/state/types';
import { runWith } from './helpers';

/** Morr in on DAY 6, rent far away, nothing special in stock. */
const visit = (over: Partial<GameState> = {}): GameState => ({
  ...runWith([{ level: 5 }]),
  day: 6,
  phase: 'day',
  rentDueDay: 20,
  merchant: { day: 6, stock: [{ item: 'protect', price: 1_200, left: 2 }] },
  ...over,
});

describe('merchant visit talk', () => {
  it('is due only on a day Morr is here, and only once that day', () => {
    expect(merchantTalkDue(visit())).toBe(true);
    expect(merchantTalkDue(visit({ merchant: null }))).toBe(false);
    expect(merchantTalkDue(visit({ phase: 'night' }))).toBe(false);
    expect(merchantTalkDue(markMerchantTalk(visit()))).toBe(false);
    expect(merchantTalkDue({ ...markMerchantTalk(visit()), day: 9, merchant: { day: 9, stock: [] } })).toBe(true);
  });

  it('picks the most pressing greeting: rare stone > rent close > broken since last talk > +50 > plain', () => {
    expect(merchantGreeting(visit())).toBe('basic');
    expect(merchantGreeting(visit({ weapons: runWith([{ level: 55 }]).weapons }))).toBe('big');
    const talked = markMerchantTalk(visit());
    expect(merchantGreeting({ ...talked, stats: { ...talked.stats, destroyed: talked.stats.destroyed + 1 } })).toBe('broke');
    expect(merchantGreeting(visit({ rentDueDay: 8 }))).toBe('rent');
    const rare = visit({ rentDueDay: 8, merchant: { day: 6, stock: [{ item: 'timeStone', price: 3_000, left: 1 }] } });
    expect(merchantGreeting(rare)).toBe('rare');
  });

  it('every greeting starts in daylight with Morr, and the first visit introduces the shop', () => {
    for (const lines of [MERCHANT_FIRST, ...Object.values(MERCHANT_GREETINGS)]) {
      expect(lines[0].beat).toBe('morning');
      expect(lines.every((l) => l.text.length > 0)).toBe(true);
    }
    expect(MERCHANT_FIRST.some((l) => l.topic === '강화 보호석')).toBe(true);
  });

  it('MERCHANT_TALKED through the core is saved once', () => {
    const core = new GameCore(new MemoryStorage(), 4);
    core.state = visit({ stats: { ...core.state.stats, destroyed: 3 } });
    core.dispatch({ type: 'MERCHANT_TALKED' });
    expect(core.state.merchantTalkDay).toBe(6);
    expect(core.state.merchantTalkDestroyed).toBe(3);
    expect(merchantTalkDue(core.state)).toBe(false);
  });
});
