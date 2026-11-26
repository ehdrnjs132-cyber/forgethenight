// GameStateManager (§24): owns the current state, applies actions, saves after every change,
// then notifies the presentation layer. Phaser never mutates state directly.
import { createRun } from './state/initial';
import type { EnhanceCandidate, GameOverSummary, GameState, Records, RentNotice, Weapon } from './state/types';
import { SaveManager, type LoadSource, type StorageLike } from './save/save';
import { beginSplit, chooseSplit, enhance, type EnhanceOptions, type EnhanceResult, type SplitBlock } from './systems/enhancement';
import { buyWeapon, equip, grantDaily, type GrantResult, type WeaponBuyBlock } from './systems/weapons';
import { drainStamina, fateSplitLeft, staminaLeft } from './systems/forgeSkills';
import { buyNode, treeEffects, type NodeBuyBlock } from './systems/skillTree';
import { collectRent } from './systems/rent';
import { playCard, playWeaponCard, type CardBlock, type CardFace, type WeaponCardBlock } from './systems/cards';
import { buy, consume, itemCount, openMerchant, sell, toggleArmed, undoEnhance, type BuyBlock, type SellBlock, type UndoBlock } from './systems/economy';
import type { EnhanceItem, ItemId } from '../config/economy';
import { learn, resetSkills, type LearnBlock, type ResetBlock } from './systems/skills';
import { completeTutorial, type TutorialId } from './systems/tutorial';
import { loseGamble, sleep, startNight, winGamble, type NightBlock, type NightReport, type NightWeapon } from './systems/daynight';
import { randomSeed } from './rng';
import { endPrologue, inPrologue } from './systems/prologue';
import { tonightsRivals, type Doppelganger } from './systems/doppelganger';

export type Action =
  | { type: 'ENHANCE'; weaponId: string; confirmLast?: boolean; rhythm?: boolean }
  | { type: 'EQUIP'; weaponId: string }
  | { type: 'COMPLETE_TUTORIAL'; id: TutorialId }
  | { type: 'START_NIGHT' }
  | ({ type: 'NIGHT_WON'; xp: number } & NightReport)
  | ({ type: 'NIGHT_LOST'; reason: 'death' | 'abandon' } & NightReport)
  | { type: 'NEW_RUN'; seed?: number }
  | { type: 'SELL'; weaponId: string }
  | { type: 'BUY_WEAPON' }
  | { type: 'BUY'; item: ItemId }
  | { type: 'TOGGLE_ITEM'; item: EnhanceItem }
  | { type: 'UNDO_ENHANCE' }
  | { type: 'USE_REVIVE' }
  | { type: 'LEARN_SKILL'; id: string }
  | { type: 'RESET_SKILLS' }
  | { type: 'SLEEP' }
  | { type: 'TOGGLE_SPLIT' }
  | { type: 'CHOOSE_SPLIT'; index: 0 | 1 }
  | { type: 'BUY_NODE'; id: string }
  /** 운명의 카드: the chosen card and the bet (2026-11-26; replaces paying the rent early). */
  | { type: 'CARD_BET'; pick: 0 | 1; bet: number }
  /** 운명의 무기 카드 (DAY 30+): the chosen weapons at stake. */
  | { type: 'WEAPON_CARD'; pick: 0 | 1; weaponIds: string[] }
  /** Work time passed at the forge: stamina drains (sent about once a second while the forge is open). */
  | { type: 'DRAIN_STAMINA'; seconds: number }
  /** Online duel settled by the server: the bet won (+) or lost (−). */
  | { type: 'DUEL_GOLD'; delta: number };

export type ActionResult =
  | { type: 'enhanced'; result: EnhanceResult }
  | { type: 'blocked'; reason: SplitBlock | 'split-pending' }
  | { type: 'splitPending'; candidates: [EnhanceCandidate, EnhanceCandidate] }
  | { type: 'nightStarted'; weapon: NightWeapon; lineup: Doppelganger[] }
  | { type: 'nightBlocked'; reason: NightBlock }
  | { type: 'nightWon'; day: number; levelBefore: number; level: number; levelsGained: number; granted: number; cleared: boolean; goldBefore: number; goldAfter: number; gameOver: GameOverSummary | null }
  | { type: 'nightLost'; livesLeft: number; gameOver: GameOverSummary | null; prologue?: boolean; goldBefore?: number; goldAfter?: number }
  | { type: 'slept'; day: number; rent: RentNotice | null; gameOver: GameOverSummary | null }
  | { type: 'sleepBlocked' }
  | { type: 'nodeBought'; id: string; cost: number }
  | { type: 'nodeBlocked'; reason: NodeBuyBlock }
  | { type: 'cardPlayed'; win: boolean; faces: [CardFace, CardFace]; bet: number; payout: number; goldBefore: number; goldAfter: number }
  | { type: 'cardBlocked'; reason: CardBlock }
  | { type: 'weaponCardPlayed'; win: boolean; faces: [CardFace, CardFace]; count: number }
  | { type: 'weaponCardBlocked'; reason: WeaponCardBlock }
  | { type: 'drained'; left: number; secondWind: number }
  | { type: 'sold'; price: number }
  | { type: 'sellBlocked'; reason: SellBlock | 'prologue' }
  | { type: 'weaponBought'; weapon: Weapon; price: number }
  | { type: 'weaponBuyBlocked'; reason: WeaponBuyBlock | 'prologue' }
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
    // §25: closing the game during a night must not dodge the outcome. It counts as a lost night.
    if (this.state.phase === 'night') {
      if (inPrologue(this.state)) {
        const g = endPrologue(this.state);
        this.commit(g.state);
        return;
      }
      const r = this.loseNight({ kills: 0, seconds: 0 });
      this.notice = r.gameOver ? { kind: 'gameOver', summary: r.gameOver } : { kind: 'abandoned', livesLeft: this.state.lives };
      return;
    }
    // Today's weapons (once per day), Morr, and the king's rent (once per visit).
    const over = this.morning(this.state);
    if (over) this.notice = { kind: 'gameOver', summary: over };
  }

  /** Morning: today's free weapons (once per day), Morr's shelf on visiting days, the king's rent. */
  private beginDay(state: GameState): GrantResult & { rent: RentNotice | null } {
    const newDay = !state.grantedDays.includes(state.day);
    const grant = grantDaily(state);
    // 아침 보호석 (skill tree): stones every new morning
    const stones = newDay ? treeEffects(grant.state).morningStones : 0;
    if (stones > 0) grant.state = { ...grant.state, items: { ...grant.state.items, protect: (grant.state.items.protect ?? 0) + stones } };
    const rent = collectRent(openMerchant(grant.state));
    return { ...grant, state: rent.state, rent: rent.notice };
  }

  /** The king's visit this morning, if he came (for the forge to announce once). */
  lastRentNotice: RentNotice | null = null;
  /**
   * The unpaid visit that just ended the run (for the king's wrath scene), else null. Kept apart from
   * lastRentNotice, which is cleared so the new run starts clean (bug 2026-11-26: the wrath never played).
   */
  gameOverRent: RentNotice | null = null;

  /**
   * Start a morning and save it. Unpaid rent can take the last life: then the run ends here and a fresh
   * one begins; the summary is returned so the caller can show the game-over screen.
   */
  private morning(state: GameState): GameOverSummary | null {
    const g = this.beginDay(state);
    this.lastGrant = g.granted;
    this.lastOverflow = { count: g.overflow, gold: g.overflowGold };
    this.lastRentNotice = g.rent;
    this.gameOverRent = null;
    if (g.state.lives <= 0) {
      this.gameOverRent = g.rent?.lifeLost ? g.rent : null;
      const s = g.state.stats;
      const summary: GameOverSummary = { day: g.state.day, bestLevel: s.bestLevel, kills: s.kills, bossesKilled: s.bossesKilled, nightSeconds: s.nightSeconds };
      this.save.clearRun();
      this.lastRentNotice = null; // the game-over screen tells it; the new run starts clean
      const fresh = this.beginDay(this.startRun(randomSeed(), g.state.tutorials));
      this.lastGrant = fresh.granted;
      this.commit(fresh.state);
      return summary;
    }
    this.commit(g.state);
    return null;
  }

  /** Lost (or abandoned) night gamble: half the gold, then the next morning. */
  private loseNight(report: NightReport): { goldBefore: number; goldAfter: number; gameOver: GameOverSummary | null } {
    const r = loseGamble(this.state, report);
    this.addRecords({ kills: report.kills, deaths: 1 });
    return { goldBefore: r.goldBefore, goldAfter: r.goldAfter, gameOver: this.morning(r.state) };
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

  dispatch(action: Action): ActionResult {
    switch (action.type) {
      case 'ENHANCE': {
        if (this.state.phase !== 'day') return { type: 'ok' };
        if (this.state.pendingSplit) return { type: 'blocked', reason: 'split-pending' };
        const opts: EnhanceOptions = { confirmLast: action.confirmLast, rhythm: action.rhythm, force: inPrologue(this.state) ? 'destroy' : undefined };
        // 운명 분열 switched on: pay, roll two, and wait for the pick
        if (this.state.splitArmed && !opts.force) {
          const s = beginSplit(this.state, action.weaponId, opts);
          if (!s.ok) return { type: 'blocked', reason: s.blocked };
          this.commit(s.state);
          this.emit('changed', this.state);
          return { type: 'splitPending', candidates: s.candidates };
        }
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
        if (this.state.pendingSplit) return { type: 'nightBlocked', reason: 'not-day' };
        // Night is a new action: the time stone can no longer undo the day's last attempt.
        const r = startNight({ ...this.state, lastEnhance: null });
        if (!r.ok) return { type: 'nightBlocked', reason: r.reason };
        // Tonight's rivals come from the saved RNG (after the snapshot): the same ones the preview showed.
        const g = tonightsRivals(r.state);
        this.commit({ ...r.state, rng: g.rng }); // phase 'night' is on disk before the fight begins
        return { type: 'nightStarted', weapon: r.weapon, lineup: g.lineup };
      }
      case 'NIGHT_WON': {
        if (this.state.phase !== 'night') return { type: 'ok' };
        const r = winGamble(this.state, action);
        this.addRecords({ kills: action.kills });
        const over = this.morning(r.state);
        this.emit('changed', this.state);
        return {
          type: 'nightWon',
          day: this.state.day,
          levelBefore: r.levelBefore,
          level: this.state.player.level,
          levelsGained: r.levelsGained,
          granted: this.lastGrant.length,
          cleared: r.cleared,
          goldBefore: r.goldBefore,
          goldAfter: r.state.gold,
          gameOver: over,
        };
      }
      case 'SLEEP': {
        // the night is optional: go straight to the next morning
        if (this.state.phase !== 'day' || this.state.pendingSplit) return { type: 'ok' };
        if (inPrologue(this.state)) return { type: 'sleepBlocked' };
        const over = this.morning(sleep(this.state));
        this.emit('changed', this.state);
        // a run ended by unpaid rent reports that visit (the wrath scene shows it)
        return { type: 'slept', day: this.state.day, rent: over ? this.gameOverRent : this.lastRentNotice, gameOver: over };
      }
      case 'DUEL_GOLD': {
        const delta = Math.trunc(action.delta);
        if (!Number.isFinite(delta) || delta === 0) return { type: 'ok' };
        this.commit({ ...this.state, gold: Math.max(0, this.state.gold + delta) });
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'DRAIN_STAMINA': {
        if (this.state.phase !== 'day') return { type: 'drained', left: staminaLeft(this.state), secondWind: 0 };
        const d = drainStamina(this.state, action.seconds);
        // saved, but no 'changed': the forge animates the bar itself and must not rebuild every second
        if (d.drained !== 0) this.commit(d.state);
        return { type: 'drained', left: staminaLeft(this.state), secondWind: d.secondWind };
      }
      case 'CARD_BET': {
        const goldBefore = this.state.gold;
        const r = playCard(this.state, action.pick, action.bet);
        if (!r.ok) return { type: 'cardBlocked', reason: r.reason };
        this.commit(r.state); // saved before the card turns
        this.emit('changed', this.state);
        return { type: 'cardPlayed', win: r.win, faces: r.faces, bet: action.bet, payout: r.payout, goldBefore, goldAfter: this.state.gold };
      }
      case 'WEAPON_CARD': {
        if (this.state.pendingSplit) return { type: 'weaponCardBlocked', reason: 'night' };
        const r = playWeaponCard(this.state, action.pick, action.weaponIds);
        if (!r.ok) return { type: 'weaponCardBlocked', reason: r.reason };
        this.commit(r.state); // saved before the card turns
        this.emit('changed', this.state);
        return { type: 'weaponCardPlayed', win: r.win, faces: r.faces, count: r.count };
      }
      case 'TOGGLE_SPLIT': {
        if (this.state.phase !== 'day' || this.state.pendingSplit) return { type: 'ok' };
        if (!this.state.splitArmed && fateSplitLeft(this.state) <= 0) return { type: 'ok' };
        this.commit({ ...this.state, splitArmed: !this.state.splitArmed });
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'CHOOSE_SPLIT': {
        const r = chooseSplit(this.state, action.index);
        if (!r.ok) return { type: 'ok' };
        this.commit(r.state);
        this.emit('enhanced', r.result);
        this.emit('changed', this.state);
        return { type: 'enhanced', result: r.result };
      }
      case 'BUY_NODE': {
        const r = buyNode(this.state, action.id);
        if (!r.ok) return { type: 'nodeBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'nodeBought', id: action.id, cost: r.cost };
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
        const r = this.loseNight(action);
        this.emit('changed', this.state);
        return { type: 'nightLost', livesLeft: this.state.lives, gameOver: r.gameOver, goldBefore: r.goldBefore, goldAfter: r.goldAfter };
      }
      case 'NEW_RUN': {
        this.save.clearRun();
        const fresh = this.startRun(action.seed ?? randomSeed(), this.state.tutorials);
        this.morning(fresh);
        this.emit('changed', this.state);
        return { type: 'ok' };
      }
      case 'BUY_WEAPON': {
        // the first-day prologue is scripted: no shopping your way out of it
        if (inPrologue(this.state)) return { type: 'weaponBuyBlocked', reason: 'prologue' };
        const r = buyWeapon(this.state);
        if (!r.ok) return { type: 'weaponBuyBlocked', reason: r.reason };
        this.commit(r.state);
        this.emit('changed', this.state);
        return { type: 'weaponBought', weapon: r.weapon, price: r.price };
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
