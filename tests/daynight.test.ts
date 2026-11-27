import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { START_GOLD, START_LIVES } from '../src/config/rules';
import { NIGHT_STAKE, NIGHT_UNLOCK_DAY, RENT } from '../src/config/economy';
import { atNightDay } from './helpers';
import { GAMBLE_RIVALS, tonightsRivals } from '../src/core/systems/doppelganger';
import { rentAmount, rentPaidLine } from '../src/core/systems/rent';
import { NIGHT_ARENA as ARENA_SWITCH } from '../src/config/economy';

// The arena was removed from the game on 2026-11-27; these tests keep its dormant code working.
ARENA_SWITCH.enabled = true;

function readyGame(storage = new MemoryStorage()) {
  const game = new GameCore(storage, 11);
  game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
  game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' }); // these tests are about normal days
  game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
  return { game, storage };
}

/** A ready game on DAY 20, where the night battle is offered (2026-11-26). */
function nightGame(storage = new MemoryStorage()) {
  const r = readyGame(storage);
  r.game.state = atNightDay(r.game.state);
  return r;
}

describe('starting a night', () => {
  it('needs an equipped weapon when the player owns weapons', () => {
    const game = new GameCore(new MemoryStorage(), 1);
    game.state = atNightDay(game.state);
    const r = game.dispatch({ type: 'START_NIGHT' });
    expect(r).toEqual({ type: 'nightBlocked', reason: 'no-weapon' });
  });

  it('falls back to the starter hammer when no weapons are left (§13, test 11: no weapons still plays)', () => {
    const { game } = nightGame();
    game.state = { ...game.state, weapons: [], equippedId: null };
    const r = game.dispatch({ type: 'START_NIGHT' });
    expect(r.type).toBe('nightStarted');
    if (r.type === 'nightStarted') expect(r.weapon.kind).toBe('hammer');
  });

  it('saves the night phase and a snapshot before the fight', () => {
    const { game, storage } = nightGame();
    game.dispatch({ type: 'START_NIGHT' });
    const saved = new SaveManager(storage).loadRun().state!;
    expect(saved.phase).toBe('night');
    expect(saved.nightSnapshot?.weapons).toHaveLength(2);
  });

  it('refuses to enhance during the night', () => {
    const { game } = nightGame();
    game.dispatch({ type: 'START_NIGHT' });
    expect(game.dispatch({ type: 'ENHANCE', weaponId: game.state.weapons[0].id }).type).toBe('ok');
    expect(game.state.stats.enhanceAttempts).toBe(0);
  });
});

describe('the night gamble (user decision 2026-11-19)', () => {
  it('brings two dwarves with random +1..+50 weapons, exactly the ones the forge previews', () => {
    const { game } = nightGame();
    const preview = tonightsRivals(game.state).lineup;
    const r = game.dispatch({ type: 'START_NIGHT' });
    if (r.type !== 'nightStarted') throw new Error();
    expect(r.lineup).toEqual(preview);
    expect(r.lineup).toHaveLength(GAMBLE_RIVALS.count);
    for (const d of r.lineup) {
      expect(d.weapon.level).toBeGreaterThanOrEqual(1);
      expect(d.weapon.level).toBeLessThanOrEqual(50);
    }
  });

  it('a win multiplies the gold by 1.5 and moves on to the next morning, keeping the XP', () => {
    const { game } = nightGame();
    game.state = { ...game.state, gold: 1000 };
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_WON', kills: 2, seconds: 60, xp: 250 });
    if (r.type !== 'nightWon') throw new Error();
    expect(r.goldBefore).toBe(1000);
    expect(r.goldAfter).toBe(1000 * NIGHT_STAKE.winMul);
    expect(game.state.day).toBe(NIGHT_UNLOCK_DAY + 1);
    expect(game.state.phase).toBe('day');
    expect(game.state.player.level).toBe(2);
    expect(game.records.kills).toBe(2);
  });

  it('a loss halves the gold and moves on to the next morning; no life is lost', () => {
    const { game } = nightGame();
    game.state = { ...game.state, gold: 1000 };
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 30 });
    expect(r).toMatchObject({ type: 'nightLost', goldBefore: 1000, goldAfter: 1000 * NIGHT_STAKE.loseMul, gameOver: null });
    expect(game.state.day).toBe(NIGHT_UNLOCK_DAY + 1);
    expect(game.state.lives).toBe(START_LIVES);
    expect(game.state.gold).toBe(500 + game.lastOverflow.gold);
    expect(game.records.deaths).toBe(1);
  });

  it('closing the game during the fight counts as a loss', () => {
    const { game, storage } = nightGame();
    game.state = { ...game.state, gold: 800 };
    game.dispatch({ type: 'START_NIGHT' });
    const reopened = new GameCore(storage);
    expect(reopened.state.phase).toBe('day');
    expect(reopened.state.day).toBe(NIGHT_UNLOCK_DAY + 1);
    expect(reopened.notice?.kind).toBe('abandoned');
    expect(reopened.state.gold).toBe(400 + reopened.lastOverflow.gold);
  });
});

describe('skipping the night', () => {
  it('sleeping goes to the next morning with that day\'s weapons', () => {
    const { game } = readyGame();
    const r = game.dispatch({ type: 'SLEEP' });
    expect(r.type).toBe('slept');
    expect(game.state.day).toBe(2);
    expect(game.state.grantedDays).toContain(2);
  });

  it('works on day 1 too (no scripted prologue any more)', () => {
    const game = new GameCore(new MemoryStorage(), 3);
    expect(game.dispatch({ type: 'SLEEP' }).type).toBe('slept');
  });
});

describe('the king\'s rent (user decision 2026-11-19)', () => {
  it('comes 3 days in, then every 3–5 days, and rises with the day', () => {
    const { game } = readyGame();
    game.state = { ...game.state, gold: 1_000_000 };
    const visits: number[] = [];
    for (let i = 0; i < 30; i++) {
      const r = game.dispatch({ type: 'SLEEP' });
      if (r.type === 'slept' && r.rent) visits.push(r.rent.day);
    }
    expect(visits[0]).toBe(1 + RENT.firstAfter);
    for (let i = 1; i < visits.length; i++) {
      expect(visits[i] - visits[i - 1]).toBeGreaterThanOrEqual(RENT.minGap);
      expect(visits[i] - visits[i - 1]).toBeLessThanOrEqual(RENT.maxGap);
    }
    expect(rentAmount(20)).toBeGreaterThan(rentAmount(10));
  });

  it('ends the run when you cannot pay (2026-11-20)', () => {
    const { game } = readyGame();
    game.state = { ...game.state, gold: 0 };
    let over = null;
    for (let i = 0; i < RENT.firstAfter; i++) {
      const r = game.dispatch({ type: 'SLEEP' });
      if (r.type === 'slept' && r.gameOver) over = r.gameOver;
    }
    expect(over).not.toBeNull();
    expect(game.state.day).toBe(1);
    expect(game.state.lives).toBe(START_LIVES);
  });

  // 2026-11-26: paying in advance was removed; a visit an older save already paid is still honoured once
  it('a visit already paid in advance by an older save costs nothing and reports what was paid', () => {
    const { game } = readyGame();
    const price = rentAmount(1);
    game.state = { ...game.state, gold: 10_000, rentPrepaid: true, rentPrepaidAmount: price, rentPrepaidDay: 1, rentDueDay: 1 + RENT.firstAfter };
    const gold = game.state.gold;
    let notice = null;
    for (let i = 0; i < RENT.firstAfter; i++) {
      const s = game.dispatch({ type: 'SLEEP' });
      if (s.type === 'slept' && s.rent) notice = s.rent;
    }
    expect(notice).toMatchObject({ prepaid: true, paid: price, prepaidDay: 1, lifeLost: false });
    expect(rentPaidLine(notice!)).toBe(`DAY ${1 + RENT.firstAfter} 월세는 DAY 1에 ${price.toLocaleString()}G로 미리 내 두었습니다.`);
    expect(game.state.gold).toBeGreaterThanOrEqual(gold);
    expect(game.state.rentPrepaid).toBe(false);
  });

  it('an older save without the prepaid amount names no wrong figure', () => {
    expect(rentPaidLine({ day: 4, amount: 270, paid: 0, lifeLost: false, prepaid: true })).toBe('DAY 4 월세는 미리 내 두었습니다.');
    expect(rentPaidLine({ day: 4, amount: 270, paid: 270, lifeLost: false })).toBe('DAY 4 월세 270G를 냈습니다.');
  });

  it('ends the run when unpaid rent takes the last life', () => {
    const { game } = readyGame();
    game.state = { ...game.state, gold: 0, lives: 1, rentDueDay: 2 };
    const r = game.dispatch({ type: 'SLEEP' });
    if (r.type !== 'slept') throw new Error();
    expect(r.gameOver).not.toBeNull();
    expect(game.state.day).toBe(1);
    expect(game.state.lives).toBe(START_LIVES);
    expect(game.state.gold).toBe(START_GOLD);
    expect(game.records.runs).toBe(2);
  });
});
