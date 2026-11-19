// SaveManager (§25). Versioned, checksummed saves with one rolling backup.
// The run and the permanent records are stored separately so a game over wipes only the run.
import { createRecords, createStats, STATE_VERSION } from '../state/initial';
import type { GameState, Records } from '../state/types';
import { INVENTORY_CAP, INVENTORY_START } from '../../config/weapons';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const KEYS = {
  run: 'ftn.run',
  runBackup: 'ftn.run.bak',
  runCorrupt: 'ftn.run.corrupt',
  records: 'ftn.records',
} as const;

interface Envelope<T> {
  v: number;
  sum: string;
  data: T;
}

/** FNV-1a over the JSON text. Detects truncation and corruption, not tampering. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function wrap<T>(data: T, v: number): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ v, sum: checksum(body), data } satisfies Envelope<T>);
}

function unwrap<T>(text: string | null): { data: T; v: number } | null {
  if (!text) return null;
  try {
    const env = JSON.parse(text) as Envelope<T>;
    if (typeof env !== 'object' || env === null || !('data' in env)) return null;
    if (checksum(JSON.stringify(env.data)) !== env.sum) return null;
    return { data: env.data, v: env.v };
  } catch {
    return null;
  }
}

/** Upgrade older saves. Each version adds a step here. */
export function migrate(data: GameState, fromVersion: number): GameState | null {
  if (fromVersion > STATE_VERSION) return null;
  let s = data;
  if (fromVersion < 2) {
    // v2 (M3): run totals for the game over screen; snapshot is now typed.
    s = { ...s, version: 2, stats: { ...createStats(), ...s.stats }, nightSnapshot: null };
  }
  if (fromVersion < 3) {
    // v3 (M4): selling and the merchant. An old undo record has no index, so drop it.
    s = { ...s, version: 3, armed: {}, merchant: null, lastEnhance: null, stats: { ...createStats(), ...s.stats } };
    if (s.nightSnapshot) s.nightSnapshot = { ...s.nightSnapshot, version: 3, armed: {}, merchant: null, lastEnhance: null, stats: { ...createStats(), ...s.nightSnapshot.stats } };
  }
  // Defensive defaults: a field added by a later version must never load as undefined.
  if (typeof s.inventoryCap !== 'number') s = { ...s, inventoryCap: Math.min(INVENTORY_CAP, Math.max(INVENTORY_START, s.weapons.length)) };
  if (fromVersion < 4) {
    // v4: bought inventory slots. Older runs keep room for what they already hold.
    const cap = (x: GameState) => Math.min(INVENTORY_CAP, Math.max(INVENTORY_START, x.weapons.length));
    s = { ...s, version: 4, inventoryCap: cap(s), stats: { ...createStats(), ...s.stats } };
    if (s.nightSnapshot) s.nightSnapshot = { ...s.nightSnapshot, version: 4, inventoryCap: cap(s.nightSnapshot as GameState), stats: { ...createStats(), ...s.nightSnapshot.stats } };
  }
  // 2026-11-19: only swords exist now (they alone have a name and image per level). Spears and axes in
  // an older save become swords of the same element and level.
  const toSwords = (x: GameState): GameState =>
    x.weapons.some((w) => w.cls !== 'sword') ? { ...x, weapons: x.weapons.map((w) => (w.cls === 'sword' ? w : { ...w, cls: 'sword' })) } : x;
  s = toSwords(s);
  if (s.nightSnapshot) s = { ...s, nightSnapshot: toSwords(s.nightSnapshot as GameState) as typeof s.nightSnapshot };
  return s;
}

export type LoadSource = 'saved' | 'backup' | 'none';

export interface LoadResult {
  state: GameState | null;
  source: LoadSource;
  /** True when the main save was unreadable (kept aside under KEYS.runCorrupt). */
  recovered: boolean;
}

export class SaveManager {
  constructor(private readonly storage: StorageLike) {}

  /** Persist the run. The previous good save becomes the backup first. */
  saveRun(state: GameState): void {
    const current = this.storage.getItem(KEYS.run);
    if (current && unwrap<GameState>(current)) this.storage.setItem(KEYS.runBackup, current);
    this.storage.setItem(KEYS.run, wrap(state, STATE_VERSION));
  }

  loadRun(): LoadResult {
    const raw = this.storage.getItem(KEYS.run);
    const main = unwrap<GameState>(raw);
    if (main) {
      const state = migrate(main.data, main.v);
      if (state) return { state, source: 'saved', recovered: false };
    }
    const recovered = raw !== null;
    if (recovered) this.storage.setItem(KEYS.runCorrupt, raw!);
    const bak = unwrap<GameState>(this.storage.getItem(KEYS.runBackup));
    if (bak) {
      const state = migrate(bak.data, bak.v);
      if (state) return { state, source: 'backup', recovered };
    }
    return { state: null, source: 'none', recovered };
  }

  /** Game over (§13): delete the current run only. Records are untouched. */
  clearRun(): void {
    this.storage.removeItem(KEYS.run);
    this.storage.removeItem(KEYS.runBackup);
  }

  saveRecords(records: Records): void {
    this.storage.setItem(KEYS.records, wrap(records, 1));
  }

  loadRecords(): Records {
    // merge with defaults so fields added later (e.g. `seen`) are never undefined
    return { ...createRecords(), ...(unwrap<Records>(this.storage.getItem(KEYS.records))?.data ?? {}) };
  }
}

/** In-memory storage for tests and for browsers that block localStorage. */
export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/**
 * localStorage, optionally under a separate save slot (`?slot=test` keeps test runs away from the real
 * save: every key gets a `slot:<name>:` prefix).
 */
export function browserStorage(slot: string | null = null): StorageLike {
  try {
    const probe = '__ftn_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    if (!slot) return window.localStorage;
    const ls = window.localStorage;
    const p = `slot:${slot}:`;
    return {
      getItem: (k) => ls.getItem(p + k),
      setItem: (k, v) => ls.setItem(p + k, v),
      removeItem: (k) => ls.removeItem(p + k),
    };
  } catch {
    return new MemoryStorage();
  }
}
