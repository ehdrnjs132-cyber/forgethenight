import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { START_GOLD, START_LIVES } from '../src/config/rules';
import { NIGHT_STAKE, RENT } from '../src/config/economy';
import { GAMBLE_RIVALS, tonightsRivals } from '../src/core/systems/doppelganger';
import { rentAmount } from '../src/core/systems/rent';

function readyGame(storage = new MemoryStorage()) {
  const game = new GameCore(storage, 11);
  game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'firstEnhance' });
  game.dispatch({ type: 'COMPLETE_TUTORIAL', id: 'prologueDone' }); // these tests are about normal days
  game.dispatch({ type: 'EQUIP', weaponId: game.state.weapons[0].id });
  return { game, storage };
}

describe('starting a night', () => {
  it('needs an equipped weapon when the player owns weapons', () => {
    const game = new GameCore(new MemoryStorage(), 1);
    const r = game.dispatch({ type: 'START_NIGHT' });
    expect(r).toEqual({ type: 'nightBlocked', reason: 'no-weapon' });
  });

  it('falls back to the starter hammer when no weapons are left (§13, test 11: no weapons still plays)', () => {
    const { game } = readyGame();
    game.state = { ...game.state, weapons: [], equippedId: null };
    const r = game.dispatch({ type: 'START_NIGHT' });
    expect(r.type).toBe('nightStarted');
    if (r.type === 'nightStarted') expect(r.weapon.kind).toBe('hammer');
  });

  it('saves the night phase and a snapshot before the fight', () => {
    const { game, storage } = readyGame();
    game.dispatch({ type: 'START_NIGHT' });
    const saved = new SaveManager(storage).loadRun().state!;
    expect(saved.phase).toBe('night');
    expect(saved.nightSnapshot?.weapons).toHaveLength(3);
  });

  it('refuses to enhance during the night', () => {
    const { game } = readyGame();
    game.dispatch({ type: 'START_NIGHT' });
    expect(game.dispatch({ type: 'ENHANCE', weaponId: game.state.weapons[0].id }).type).toBe('ok');
    expect(game.state.stats.enhanceAttempts).toBe(0);
  });
});

describe('the night gamble (user decision 2026-11-19)', () => {
  it('brings two dwarves with random +1..+50 weapons, exactly the ones the forge previews', () => {
    const { game } = readyGame();
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
    const { game } = readyGame();
    game.state = { ...game.state, gold: 1000 };
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_WON', kills: 2, seconds: 60, xp: 250 });
    if (r.type !== 'nightWon') throw new Error();
    expect(r.goldBefore).toBe(1000);
    expect(r.goldAfter).toBe(1000 * NIGHT_STAKE.winMul);
    expect(game.state.day).toBe(2);
    expect(game.state.phase).toBe('day');
    expect(game.state.player.level).toBe(2);
    expect(game.records.kills).toBe(2);
  });

  it('a loss halves the gold and moves on to the next morning; no life is lost', () => {
    const { game } = readyGame();
    game.state = { ...game.state, gold: 1000 };
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 30 });
    expect(r).toMatchObject({ type: 'nightLost', goldBefore: 1000, goldAfter: 1000 * NIGHT_STAKE.loseMul, gameOver: null });
    expect(game.state.day).toBe(2);
    expect(game.state.lives).toBe(START_LIVES);
    expect(game.state.gold).toBe(500 + game.lastOverflow.gold);
    expect(game.records.deaths).toBe(1);
  });

  it('closing the game during the fight counts as a loss', () => {
    const { game, storage } = readyGame();
    game.state = { ...game.state, gold: 800 };
    game.dispatch({ type: 'START_NIGHT' });
    const reopened = new GameCore(storage);
    expect(reopened.state.phase).toBe('day');
    expect(reopened.state.day).toBe(2);
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

  it('is not possible in the first-day prologue (that night is part of the tutorial)', () => {
    const game = new GameCore(new MemoryStorage(), 3);
    expect(game.dispatch({ type: 'SLEEP' })).toEqual({ type: 'sleepBlocked' });
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

  it('takes what you have and a life when you cannot pay', () => {
    const { game } = readyGame();
    game.state = { ...game.state, gold: 0 };
    let notice = null;
    for (let i = 0; i < RENT.firstAfter; i++) {
      const r = game.dispatch({ type: 'SLEEP' });
      if (r.type === 'slept' && r.rent) notice = r.rent;
    }
    expect(notice).toMatchObject({ lifeLost: true });
    expect(game.state.lives).toBe(START_LIVES - 1);
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
