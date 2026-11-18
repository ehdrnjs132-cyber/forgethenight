import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/game';
import { MemoryStorage, SaveManager } from '../src/core/save/save';
import { START_GOLD, START_LIVES } from '../src/config/rules';

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

  it('falls back to the starter hammer when no weapons are left (§13)', () => {
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

describe('tonight\'s doppelgangers (reboot)', () => {
  it('DAY 1 sends three, and a same-day retry meets the very same three', () => {
    const { game } = readyGame();
    const first = game.dispatch({ type: 'START_NIGHT' });
    if (first.type !== 'nightStarted') throw new Error();
    expect(first.lineup).toHaveLength(3);
    game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 5 });
    const again = game.dispatch({ type: 'START_NIGHT' });
    if (again.type !== 'nightStarted') throw new Error();
    expect(again.lineup).toEqual(first.lineup);
  });
});

describe('winning a night', () => {
  it('advances the day, grants three new weapons and keeps the XP', () => {
    const { game } = readyGame();
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_WON', kills: 40, seconds: 180, xp: 250 });
    expect(r.type).toBe('nightWon');
    expect(game.state.day).toBe(2);
    expect(game.state.phase).toBe('day');
    expect(game.state.nightSnapshot).toBeNull();
    // only 3 slots at the start: the new deliveries are sold at the +0 price
    expect(game.state.weapons).toHaveLength(3);
    expect(game.state.gold).toBe(START_GOLD + 30);
    expect(game.state.player).toEqual({ level: 2, xp: 150, skillPoints: 1 });
    expect(game.state.stats.kills).toBe(40);
    expect(game.records.kills).toBe(40);
  });
});

describe('losing a night (§13, QA 9)', () => {
  it('costs one life, returns to the same day and discards that night\'s XP', () => {
    const { game } = readyGame();
    const before = structuredClone(game.state);
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 12, seconds: 70 });
    expect(r).toEqual({ type: 'nightLost', livesLeft: START_LIVES - 1, gameOver: null });
    expect(game.state.day).toBe(1);
    expect(game.state.phase).toBe('day');
    expect(game.state.lives).toBe(START_LIVES - 1);
    expect(game.state.player).toEqual(before.player);
    expect(game.state.weapons).toEqual(before.weapons);
    expect(game.state.stats.deaths).toBe(1);
    expect(game.records.deaths).toBe(1);
  });

  it('keeps the life loss after a reload and does not hand out the day\'s weapons again (QA 8, 9)', () => {
    const { game, storage } = readyGame();
    game.dispatch({ type: 'START_NIGHT' });
    game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 0, seconds: 10 });
    const again = new GameCore(storage);
    expect(again.state.lives).toBe(START_LIVES - 1);
    expect(again.state.weapons).toHaveLength(3);
    expect(again.lastGrant).toHaveLength(0);
  });

  it('treats closing the game during a night as a loss (§25)', () => {
    const { game, storage } = readyGame();
    game.dispatch({ type: 'START_NIGHT' });
    const reopened = new GameCore(storage);
    expect(reopened.state.phase).toBe('day');
    expect(reopened.state.lives).toBe(START_LIVES - 1);
    expect(reopened.notice).toEqual({ kind: 'abandoned', livesLeft: START_LIVES - 1 });
  });
});

describe('game over (§13, QA 10)', () => {
  it('wipes the run at zero lives, keeps records and tutorial progress', () => {
    const { game, storage } = readyGame();
    game.state = { ...game.state, lives: 1, day: 4, stats: { ...game.state.stats, bestLevel: 17, kills: 300 } };
    game.dispatch({ type: 'START_NIGHT' });
    const r = game.dispatch({ type: 'NIGHT_LOST', reason: 'death', kills: 20, seconds: 95 });
    expect(r.type).toBe('nightLost');
    if (r.type !== 'nightLost') return;
    expect(r.gameOver).toEqual({ day: 4, bestLevel: 17, kills: 320, bossesKilled: 0, nightSeconds: 95 });
    expect(game.state.day).toBe(1);
    expect(game.state.lives).toBe(START_LIVES);
    expect(game.state.gold).toBe(START_GOLD);
    expect(game.state.weapons).toHaveLength(3);
    expect(game.state.weapons.every((w) => w.level === 0)).toBe(true);
    expect(game.state.tutorials.firstEnhance).toBe(true);
    expect(game.records.runs).toBe(2);
    expect(game.records.deaths).toBe(1);
    const reloaded = new GameCore(storage);
    expect(reloaded.state.day).toBe(1);
    expect(reloaded.state.lives).toBe(START_LIVES);
  });

  it('a reload during the last life\'s night ends the run', () => {
    const { game, storage } = readyGame();
    game.state = { ...game.state, lives: 1 };
    game.dispatch({ type: 'START_NIGHT' });
    const reopened = new GameCore(storage);
    expect(reopened.notice?.kind).toBe('gameOver');
    expect(reopened.state.lives).toBe(START_LIVES);
    expect(reopened.state.day).toBe(1);
  });
});
