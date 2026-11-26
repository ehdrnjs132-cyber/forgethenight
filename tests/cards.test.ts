// 운명의 카드 (2026-11-26): from DAY 10, once a day; O pays the bet doubled, X loses it.
import { describe, expect, it } from 'vitest';
import { CARD_GAME, NIGHT_UNLOCK_DAY, WEAPON_CARD } from '../src/config/economy';
import { nightUnlocked, startNight } from '../src/core/systems/daynight';
import { PROLOGUE_ENABLED } from '../src/core/systems/prologue';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { betFromShare, cardPlayedToday, cardUnlocked, checkCard, checkWeaponCard, playCard, playWeaponCard } from '../src/core/systems/cards';
import type { GameState } from '../src/core/state/types';
import { runWith } from './helpers';

const at = (day: number, gold = 1_000): GameState => ({ ...runWith([{}]), day, gold });

describe('night dwarf battle (2026-11-26)', () => {
  it('is offered from DAY 20 only (the first-day prologue keeps its scripted night)', () => {
    expect(NIGHT_UNLOCK_DAY).toBe(20);
    const s = runWith([{ level: 5 }]);
    const armed = { ...s, equippedId: s.weapons[0].id };
    expect(nightUnlocked({ ...armed, day: 19 })).toBe(false);
    expect(startNight({ ...armed, day: 19 })).toEqual({ ok: false, reason: 'early' });
    expect(startNight({ ...armed, day: 20 }).ok).toBe(true);
    const prologue = { ...armed, day: 1, tutorials: { ...armed.tutorials, prologueDone: false } };
    expect(nightUnlocked(prologue)).toBe(PROLOGUE_ENABLED); // the prologue is switched off in this build
  });
});

describe('운명의 카드', () => {
  it('opens on DAY 10', () => {
    expect(CARD_GAME.unlockDay).toBe(10);
    expect(cardUnlocked(at(9))).toBe(false);
    expect(cardUnlocked(at(10))).toBe(true);
    expect(checkCard(at(9), 100)).toBe('locked');
    expect(checkCard(at(10), 100)).toBeNull();
  });

  it('the bar maps left → right onto 0 → all of the gold', () => {
    expect(betFromShare(1_000, 0)).toBe(0);
    expect(betFromShare(1_000, 0.0001)).toBe(1);
    expect(betFromShare(1_000, 0.37)).toBe(370);
    expect(betFromShare(1_000, 1)).toBe(1_000);
    expect(betFromShare(1_000, 2)).toBe(1_000);
    expect(betFromShare(0, 0.5)).toBe(0);
  });

  it('only a bet between 1 and the gold you have', () => {
    expect(checkCard(at(10, 500), 0)).toBe('bet');
    expect(checkCard(at(10, 500), 501)).toBe('bet');
    expect(checkCard(at(10, 500), 2.5)).toBe('bet');
    expect(checkCard({ ...at(10), phase: 'night' }, 10)).toBe('night');
  });

  it('O pays the bet doubled, X loses it; one card of each; once a day', () => {
    let wins = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = { ...at(12, 1_000), rng: seed };
      const r = playCard(s, 0, 300);
      if (!r.ok) throw new Error(r.reason);
      expect([...r.faces].sort()).toEqual(['O', 'X']);
      expect(r.win).toBe(r.faces[0] === 'O');
      expect(r.state.gold).toBe(r.win ? 1_000 - 300 + 600 : 700);
      expect(r.payout).toBe(r.win ? 600 : 0);
      expect(cardPlayedToday(r.state)).toBe(true);
      expect(playCard(r.state, 1, 10)).toEqual({ ok: false, reason: 'played' });
      if (r.win) wins++;
    }
    // a fair coin: roughly half
    expect(wins).toBeGreaterThan(150);
    expect(wins).toBeLessThan(250);
  });

  it('a new day allows another game', () => {
    const r = playCard({ ...at(12), rng: 7 }, 1, 100);
    if (!r.ok) throw new Error();
    expect(checkCard({ ...r.state, day: 13 }, 100)).toBeNull();
  });

  it('운명의 무기 카드 (DAY 30): O → every weapon +10, X → every weapon gone; once a day', () => {
    expect(WEAPON_CARD).toEqual({ unlockDay: 30, levels: 10 });
    const rack = (day: number): GameState => ({ ...runWith([{ level: 3 }, { level: 12 }, { level: 95 }]), day });
    expect(checkWeaponCard(rack(29))).toBe('locked');
    expect(checkWeaponCard({ ...rack(30), weapons: [] })).toBe('no-weapons');
    let sawWin = false;
    let sawLoss = false;
    for (let seed = 1; seed <= 60; seed++) {
      const r = playWeaponCard({ ...rack(30), rng: seed }, 0);
      if (!r.ok) throw new Error(r.reason);
      expect(r.count).toBe(3);
      if (r.win) {
        sawWin = true;
        expect(r.state.weapons.map((w) => w.level)).toEqual([13, 22, 100]); // capped at +100
        expect(r.state.stats.bestLevel).toBeGreaterThanOrEqual(100);
      } else {
        sawLoss = true;
        expect(r.state.weapons).toEqual([]);
        expect(r.state.equippedId).toBeNull();
      }
      expect(checkWeaponCard(r.state)).toBe('played');
    }
    expect(sawWin && sawLoss).toBe(true);
  });

  it('the gold cards and the weapon cards are counted separately', () => {
    const s = { ...runWith([{ level: 5 }]), day: 30, gold: 1_000, rng: 9 };
    const a = playCard(s, 0, 100);
    if (!a.ok) throw new Error();
    expect(checkWeaponCard(a.state)).toBeNull();
  });

  it('CARD_BET through the core is saved before the card is shown', () => {
    const storage = new MemoryStorage();
    const core = new GameCore(storage, 5);
    core.state = { ...core.state, day: 10, gold: 2_000, tutorials: { ...core.state.tutorials, prologueDone: true } };
    const r = core.dispatch({ type: 'CARD_BET', pick: 0, bet: 1_000 });
    if (r.type !== 'cardPlayed') throw new Error(r.type);
    expect(r.goldAfter).toBe(r.win ? 3_000 : 1_000);
    const saved = new SaveManager(storage).loadRun().state!;
    expect(saved.gold).toBe(r.goldAfter);
    expect(saved.cardDay).toBe(10);
    expect(core.dispatch({ type: 'CARD_BET', pick: 1, bet: 10 })).toEqual({ type: 'cardBlocked', reason: 'played' });
  });
});
