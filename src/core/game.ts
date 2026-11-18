// GameStateManager (§24): owns the current state, applies actions, saves after every change,
// then notifies the presentation layer. Phaser never mutates state directly.
import { createRun } from './state/initial';
import type { GameState, Records, Weapon } from './state/types';
import { SaveManager, type LoadSource, type StorageLike } from './save/save';
import { enhance, type EnhanceBlock, type EnhanceOptions, type EnhanceResult } from './systems/enhancement';
import { equip, grantDaily } from './systems/weapons';
import { completeTutorial, type TutorialId } from './systems/tutorial';
import { randomSeed } from './rng';

export type Action =
  | { type: 'ENHANCE'; weaponId: string; confirmLast?: boolean }
  | { type: 'EQUIP'; weaponId: string }
  | { type: 'COMPLETE_TUTORIAL'; id: TutorialId }
  | { type: 'NEW_RUN'; seed?: number };

export type ActionResult =
  | { type: 'enhanced'; result: EnhanceResult }
  | { type: 'blocked'; reason: EnhanceBlock }
  | { type: 'ok' };

export interface GameEvents {
  changed: GameState;
  enhanced: EnhanceResult;
}

type Listener<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;
type AnyListener = (payload: unknown) => void;

export class GameCore {
  state: GameState;
  records: Records;
  readonly loadedFrom: LoadSource;
  readonly recoveredFromCorruption: boolean;
  /** Weapons handed out by the most recent daily grant in this session (for a "you received" notice). */
  lastGrant: Weapon[] = [];
  private readonly save: SaveManager;
  private listeners = new Map<keyof GameEvents, Set<AnyListener>>();

  constructor(storage: StorageLike, seed: number = randomSeed()) {
    this.save = new SaveManager(storage);
    const loaded = this.save.loadRun();
    this.loadedFrom = loaded.source;
    this.recoveredFromCorruption = loaded.recovered;
    this.records = this.save.loadRecords();
    this.state = loaded.state ?? this.startRun(seed);
    // Today's weapons, once per day. A no-op if they were already handed out.
    const grant = grantDaily(this.state);
    this.lastGrant = grant.granted;
    this.commit(grant.state);
  }

  private startRun(seed: number): GameState {
    this.records = { ...this.records, runs: this.records.runs + 1 };
    this.save.saveRecords(this.records);
    return createRun(seed);
  }

  on<K extends keyof GameEvents>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    const f = fn as AnyListener;
    set.add(f);
    return () => {
      set.delete(f);
    };
  }

  private emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  /** Replace state and persist immediately (§6.4 step 5, §25). */
  private commit(next: GameState) {
    this.state = next;
    this.save.saveRun(next);
    if (next.stats.bestLevel > this.records.bestLevel || next.day > this.records.bestDay) {
      this.records = {
        ...this.records,
        bestLevel: Math.max(this.records.bestLevel, next.stats.bestLevel),
        bestDay: Math.max(this.records.bestDay, next.day),
      };
      this.save.saveRecords(this.records);
    }
  }

  dispatch(action: Action): ActionResult {
    switch (action.type) {
      case 'ENHANCE': {
        const opts: EnhanceOptions = { confirmLast: action.confirmLast };
        const attempt = enhance(this.state, action.weaponId, opts);
        if (!attempt.ok) return { type: 'blocked', reason: attempt.blocked };
        this.commit(attempt.state); // saved before any animation starts
        this.emit('enhanced', attempt.result);
        this.emit('changed', this.state);
        return { type: 'enhanced', result: attempt.result };
      }
      case 'EQUIP': {
        this.commit(equip(this.state, action.weaponId));
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'COMPLETE_TUTORIAL': {
        this.commit(completeTutorial(this.state, action.id));
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'NEW_RUN': {
        this.save.clearRun();
        const fresh = this.startRun(action.seed ?? randomSeed());
        const grant = grantDaily(fresh);
        this.lastGrant = grant.granted;
        this.commit(grant.state);
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
    }
  }
}
