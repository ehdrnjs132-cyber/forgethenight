// GameStateManager (§24): owns the current state, applies actions, saves after every change,
// then notifies the presentation layer. Phaser never mutates state directly.
import { createRun } from './state/initial';
import type { GameOverSummary, GameState, Records, Weapon } from './state/types';
import { SaveManager, type LoadSource, type StorageLike } from './save/save';
import { enhance, type EnhanceBlock, type EnhanceOptions, type EnhanceResult } from './systems/enhancement';
import { equip, grantDaily, type GrantResult } from './systems/weapons';
import { buy, consume, itemCount, openMerchant, sell, toggleArmed, undoEnhance, type BuyBlock, type SellBlock, type UndoBlock } from './systems/economy';
import type { EnhanceItem, ItemId } from '../config/economy';
import { learn, resetSkills, type LearnBlock, type ResetBlock } from './systems/skills';
import { completeTutorial, type TutorialId } from './systems/tutorial';
import { loseNight, startNight, winNight, type NightBlock, type NightReport, type NightWeapon } from './systems/daynight';
import { randomSeed } from './rng';
import { endPrologue, inPrologue } from './systems/prologue';
import { generateNight, type Doppelganger } from './systems/doppelganger';

export type Action =
  | { type: 'ENHANCE'; weaponId: string; confirmLast?: boolean }
  | { type: 'EQUIP'; weaponId: string }
  | { type: 'COMPLETE_TUTORIAL'; id: TutorialId }
  | { type: 'START_NIGHT' }
  | ({ type: 'NIGHT_WON'; xp: number } & NightReport)
  | ({ type: 'NIGHT_LOST'; reason: 'death' | 'abandon' } & NightReport)
  | { type: 'NEW_RUN'; seed?: number }
  | { type: 'SELL'; weaponId: string }
  | { type: 'BUY'; item: ItemId }
  | { type: 'TOGGLE_ITEM'; item: EnhanceItem }
  | { type: 'UNDO_ENHANCE' }
  | { type: 'USE_REVIVE' }
  | { type: 'LEARN_SKILL'; id: string }
  | { type: 'RESET_SKILLS' };

export type ActionResult =
  | { type: 'enhanced'; result: EnhanceResult }
  | { type: 'blocked'; reason: EnhanceBlock }
  | { type: 'nightStarted'; weapon: NightWeapon; lineup: Doppelganger[] }
  | { type: 'nightBlocked'; reason: NightBlock }
  | { type: 'nightWon'; day: number; levelBefore: number; level: number; levelsGained: number; granted: number; cleared: boolean }
  | { type: 'nightLost'; livesLeft: number; gameOver: GameOverSummary | null; prologue?: boolean }
  | { type: 'sold'; price: number }
  | { type: 'sellBlocked'; reason: SellBlock | 'prologue' }
  | { type: 'bought'; item: ItemId }
  | { type: 'buyBlocked'; reason: BuyBlock }
  | { type: 'undone'; weapon: Weapon }
  | { type: 'undoBlocked'; reason: UndoBlock }
  | { type: 'revived' }
  | { type: 'noRevive' }
  | { type: 'learned'; id: string }
  | { type: 'learnBlocked'; reason: LearnBlock }
  | { type: 'skillsReset'; refunded: number }
  | { type: 'resetBlocked'; reason: ResetBlock }
  | { type: 'ok' };

export interface GameEvents {
  changed: GameState;
  enhanced: EnhanceResult;
}

/** Something the forge should tell the player once after loading. */
export type LoadNotice = { kind: 'abandoned'; livesLeft: number } | { kind: 'gameOver'; summary: GameOverSummary };

type Listener<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;
type AnyListener = (payload: unknown) => void;

export class GameCore {
  state: GameState;
  records: Records;
  readonly loadedFrom: LoadSource;
  /** True once after loading from the backup save; the UI clears it after telling the player. */
  recoveredFromCorruption: boolean;
  /** Weapons handed out by the most recent daily grant in this session (for a "you received" notice). */
  lastGrant: Weapon[] = [];
  /** Deliveries that did not fit this morning and were sold at the +0 price. */
  lastOverflow = { count: 0, gold: 0 };
  notice: LoadNotice | null = null;
  private readonly save: SaveManager;
  private listeners = new Map<keyof GameEvents, Set<AnyListener>>();

  constructor(storage: StorageLike, seed: number = randomSeed()) {
    this.save = new SaveManager(storage);
    const loaded = this.save.loadRun();
    this.loadedFrom = loaded.source;
    this.recoveredFromCorruption = loaded.recovered;
    this.records = this.save.loadRecords();
    this.state = loaded.state ?? this.startRun(seed);
    // §25: closing the game during a night must not dodge the death. It counts as a lost night.
    if (this.state.phase === 'night') {
      const r = this.applyLoss({ kills: 0, seconds: 0 });
      this.notice = r.gameOver ? { kind: 'gameOver', summary: r.gameOver } : { kind: 'abandoned', livesLeft: r.livesLeft };
      return;
    }
    // Today's weapons, once per day. A no-op if they were already handed out.
    const grant = this.beginDay(this.state);
    this.lastGrant = grant.granted;
    this.lastOverflow = { count: grant.overflow, gold: grant.overflowGold };
    this.commit(grant.state);
  }

  /** Morning: today's free weapons (once per day) and, on visiting days, Morr's shelf. */
  private beginDay(state: GameState): GrantResult {
    const grant = grantDaily(state);
    return { ...grant, state: openMerchant(grant.state) };
  }

  /** A fresh run. Tutorial progress is knowledge, not run state, so it carries over. */
  private startRun(seed: number, tutorials: GameState['tutorials'] = {}): GameState {
    this.records = { ...this.records, runs: this.records.runs + 1 };
    this.save.saveRecords(this.records);
    return { ...createRun(seed), tutorials: { ...tutorials } };
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

  /** Remember a watched cutscene (records survive game over, like the intro flag). */
  markSeen(id: string) {
    if (this.records.seen.includes(id)) return;
    this.records = { ...this.records, seen: [...this.records.seen, id] };
    this.save.saveRecords(this.records);
  }

  hasSeen(id: string): boolean {
    return this.records.seen.includes(id);
  }

  private addRecords(p: Partial<Pick<Records, 'kills' | 'deaths'>>) {
    this.records = { ...this.records, kills: this.records.kills + (p.kills ?? 0), deaths: this.records.deaths + (p.deaths ?? 0) };
    this.save.saveRecords(this.records);
  }

  /** Lost night: restore the snapshot with a life fewer, or end the run at zero lives (§13). */
  private applyLoss(report: NightReport) {
    const r = loseNight(this.state, report);
    this.addRecords({ kills: report.kills, deaths: 1 });
    if (r.gameOver) {
      this.save.clearRun();
      const fresh = this.startRun(randomSeed(), this.state.tutorials);
      const grant = this.beginDay(fresh);
      this.lastGrant = grant.granted;
    this.lastOverflow = { count: grant.overflow, gold: grant.overflowGold };
      this.commit(grant.state);
    } else {
      this.commit(r.state);
    }
    return r;
  }

  dispatch(action: Action): ActionResult {
    switch (action.type) {
      case 'ENHANCE': {
        if (this.state.phase !== 'day') return { type: 'ok' };
        const opts: EnhanceOptions = { confirmLast: action.confirmLast, force: inPrologue(this.state) ? 'destroy' : undefined };
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
      case 'START_NIGHT': {
        // Night is a new action: the time stone can no longer undo the day's last attempt.
        const r = startNight({ ...this.state, lastEnhance: null });
        if (!r.ok) return { type: 'nightBlocked', reason: r.reason };
        // Tonight's rivals come from the saved RNG (after the snapshot), so a same-day retry meets the same ones.
        const g = generateNight(r.state.day, r.state.rng);
        this.commit({ ...r.state, rng: g.rng }); // phase 'night' is on disk before the fight begins
        return { type: 'nightStarted', weapon: r.weapon, lineup: g.doppelgangers };
      }
      case 'NIGHT_WON': {
        if (this.state.phase !== 'night') return { type: 'ok' };
        const r = winNight(this.state, action);
        this.addRecords({ kills: action.kills });
        const grant = this.beginDay(r.state);
        this.lastGrant = grant.granted;
    this.lastOverflow = { count: grant.overflow, gold: grant.overflowGold };
        this.commit(grant.state);
        this.emit('changed', this.state);
        return {
          type: 'nightWon',
          day: this.state.day,
          levelBefore: r.levelBefore,
          level: this.state.player.level,
          levelsGained: r.levelsGained,
          granted: grant.granted.length,
          cleared: r.cleared,
        };
      }
      case 'NIGHT_LOST': {
        if (this.state.phase !== 'night') return { type: 'ok' };
        if (inPrologue(this.state)) {
          // the scripted first defeat: no life lost, DAY 1 again with three new weapons
          const g = endPrologue(this.state);
          this.lastGrant = g.granted;
          this.lastOverflow = { count: g.overflow, gold: g.overflowGold };
          this.commit(g.state);
          this.emit('changed', this.state);
          return { type: 'nightLost', livesLeft: this.state.lives, gameOver: null, prologue: true };
        }
        const r = this.applyLoss(action);
        this.emit('changed', this.state);
        return { type: 'nightLost', livesLeft: r.livesLeft, gameOver: r.gameOver };
      }
      case 'NEW_RUN': {
        this.save.clearRun();
        const fresh = this.startRun(action.seed ?? randomSeed(), this.state.tutorials);
        const grant = this.beginDay(fresh);
        this.lastGrant = grant.granted;
    this.lastOverflow = { count: grant.overflow, gold: grant.overflowGold };
        this.commit(grant.state);
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'SELL': {
        if (inPrologue(this.state)) return { type: 'sellBlocked', reason: 'prologue' };
        const r = sell(this.state, action.weaponId);
        if (!r.ok) return { type: 'sellBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'sold', price: r.price };
      }
      case 'BUY': {
        const r = buy(this.state, action.item);
        if (!r.ok) return { type: 'buyBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'bought', item: action.item };
      }
      case 'TOGGLE_ITEM': {
        if (this.state.phase !== 'day') return { type: 'ok' };
        this.commit(toggleArmed(this.state, action.item));
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'UNDO_ENHANCE': {
        const r = undoEnhance(this.state);
        if (!r.ok) return { type: 'undoBlocked', reason: r.reason };
        const weapon = this.state.lastEnhance!.weaponBefore;
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'undone', weapon };
      }
      case 'USE_REVIVE': {
        // Spent during the night. If the night is still lost later, the snapshot gives it back
        // together with everything else from the start of the night (decision #4).
        if (this.state.phase !== 'night' || itemCount(this.state, 'revive') <= 0) return { type: 'noRevive' };
        this.commit(consume(this.state, 'revive'));
        return { type: 'revived' };
      }
      case 'LEARN_SKILL': {
        const r = learn(this.state, action.id);
        if (!r.ok) return { type: 'learnBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'learned', id: action.id };
      }
      case 'RESET_SKILLS': {
        const r = resetSkills(this.state);
        if (!r.ok) return { type: 'resetBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'skillsReset', refunded: r.refunded };
      }
    }
  }
}
