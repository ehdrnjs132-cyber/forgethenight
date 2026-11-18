import type { GameState, Records } from './types';
import { START_LIVES } from '../../config/rules';

export const STATE_VERSION = 1;

export function createRun(seed: number): GameState {
  return {
    version: STATE_VERSION,
    rng: seed | 0,
    day: 1,
    phase: 'day',
    lives: START_LIVES,
    gold: 0,
    weapons: [],
    equippedId: null,
    weaponSeq: 0,
    grantedDays: [],
    player: { level: 1, xp: 0, skillPoints: 0 },
    skills: {},
    totems: { owned: [], equipped: [] },
    items: {},
    tutorials: {},
    nightSnapshot: null,
    lastEnhance: null,
    story: { flags: {} },
    stats: { enhanceAttempts: 0, destroyed: 0, bestLevel: 0 },
  };
}

export function createRecords(): Records {
  return { bestDay: 0, bestLevel: 0, kills: 0, deaths: 0, bossesKilled: [], runs: 0 };
}
