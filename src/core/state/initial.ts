import type { GameState, Records } from './types';
import { START_GOLD, START_LIVES } from '../../config/rules';
import { INVENTORY_START } from '../../config/weapons';

export const STATE_VERSION = 4;

export function createStats(): GameState['stats'] {
  return { enhanceAttempts: 0, destroyed: 0, bestLevel: 0, kills: 0, nightSeconds: 0, nightsWon: 0, deaths: 0, bossesKilled: 0, sold: 0, goldEarned: 0, goldSpentEnhancing: 0 };
}

export function createRun(seed: number): GameState {
  return {
    version: STATE_VERSION,
    rng: seed | 0,
    day: 1,
    phase: 'day',
    lives: START_LIVES,
    gold: START_GOLD,
    weapons: [],
    inventoryCap: INVENTORY_START,
    equippedId: null,
    weaponSeq: 0,
    grantedDays: [],
    player: { level: 1, xp: 0, skillPoints: 0 },
    skills: {},
    totems: { owned: [], equipped: [] },
    items: {},
    armed: {},
    merchant: null,
    tutorials: {},
    nightSnapshot: null,
    lastEnhance: null,
    story: { flags: {} },
    stats: createStats(),
  };
}

export function createRecords(): Records {
  return { bestDay: 0, bestLevel: 0, kills: 0, deaths: 0, bossesKilled: [], runs: 0 };
}
