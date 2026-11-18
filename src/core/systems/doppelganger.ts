// Doppelganger generation (reboot spec §3.3, §3.6): each blacksmith from another world really forges
// its weapon with the player's own enhancement table, and keeps an honest record of how it got there.
import { ENHANCE_TABLE, type Outcome } from '../../config/enhancement';
import { CLASS_WORD, ELEMENT_TITLE, ELEMENT_WORD, ROLES, TEMPERAMENTS, nightPlan, type Temperament } from '../../config/doppelganger';
import { ELEMENTS, MAX_LEVEL, WEAPON_CLASSES, type Element, type WeaponClass } from '../../config/weapons';
import { Rng } from '../rng';
import { levelAfter, rollOutcome } from './enhancement';

/** What the defeat card shows (spec §3.6). Counts are for the weapon it brought, plus weapons it lost. */
export interface ForgeRecord {
  attempts: number;
  great: number;
  success: number;
  keep: number;
  down: number;
  /** Earlier weapons this blacksmith shattered before forging the one it brought. */
  destroyedWeapons: number;
  /** Attempts spent on those lost weapons. */
  lostAttempts: number;
  /** The final step, e.g. [42, 43]; null if it never enhanced. */
  lastStep: [number, number] | null;
  /** Level after every attempt on the brought weapon (for a sparkline / audit). */
  path: number[];
}

export interface Doppelganger {
  id: string;
  name: string;
  temperament: Temperament;
  weapon: { cls: WeaponClass; element: Element; level: number };
  record: ForgeRecord;
}

const emptyRecord = (): ForgeRecord => ({ attempts: 0, great: 0, success: 0, keep: 0, down: 0, destroyedWeapons: 0, lostAttempts: 0, lastStep: null, path: [] });

/**
 * Forge one weapon the way the player would: same table, same outcomes, a budget of attempts and a
 * temperament that decides when to stop. A destroyed weapon is gone; it starts a new +0 one while it
 * still has retries and budget left. It always brings its current (never a destroyed) weapon.
 */
export function forgeWeapon(
  rng: Rng,
  temperament: Temperament,
  budget: number,
  expectedLevel: number,
  /** Weapons its own anvil has given it (three a day in its world too). */
  weapons = 3,
): { level: number; record: ForgeRecord } {
  const t = TEMPERAMENTS[temperament];
  const target = Math.min(MAX_LEVEL, Math.round(expectedLevel * t.targetFactor) + rng.int(t.targetJitter + 1));
  const maxWeapons = weapons + t.retries;
  let spent = 0;
  let lost = 0;
  let lostAttempts = 0;
  let best: { level: number; rec: ForgeRecord } | null = null;
  for (let n = 0; n < maxWeapons && spent < budget; n++) {
    let level = 0;
    const rec = emptyRecord();
    let broke = false;
    while (spent < budget && level < target) {
      spent++;
      const outcome: Outcome = rollOutcome(ENHANCE_TABLE[Math.min(level, ENHANCE_TABLE.length - 1)], rng.next());
      const next = levelAfter(level, outcome);
      if (next === null) {
        // shattered: that weapon is gone for good, along with every attempt spent on it
        lost++;
        lostAttempts += rec.attempts + 1;
        broke = true;
        break;
      }
      rec.attempts++;
      rec[outcome as 'great' | 'success' | 'keep' | 'down']++;
      rec.lastStep = [level, next];
      level = next;
      rec.path.push(level);
    }
    if (!broke && (!best || level >= best.level)) best = { level, rec };
    if (!broke && level >= target) break; // reached what it wanted: stop forging
  }
  // It brings its best surviving weapon; if every one shattered, an untouched +0 from today's anvil.
  const chosen = best ?? { level: 0, rec: emptyRecord() };
  chosen.rec.destroyedWeapons = lost;
  chosen.rec.lostAttempts = lostAttempts;
  return { level: chosen.level, record: chosen.rec };
}

function pickWeighted<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const keys = Object.keys(weights) as T[];
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rng.next() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

/** Tonight's visitors. Deterministic for a given RNG state, so a same-day retry meets the same rivals. */
export function generateNight(day: number, seed: number): { doppelgangers: Doppelganger[]; rng: number } {
  const rng = new Rng(seed);
  const plan = nightPlan(day);
  const list: Doppelganger[] = [];
  for (let i = 0; i < plan.count; i++) {
    const temperament = pickWeighted(rng, plan.weights);
    const cls = rng.pick(WEAPON_CLASSES);
    const element = rng.pick(ELEMENTS);
    const { level, record } = forgeWeapon(rng, temperament, plan.attemptBudget, plan.expectedLevel, plan.weapons);
    const name = `${rng.pick(ELEMENT_TITLE[element])} ${rng.pick(ROLES)}`;
    list.push({ id: `d${day}-${i}`, name, temperament, weapon: { cls, element, level }, record });
  }
  return { doppelgangers: list, rng: rng.state };
}

/** "FIRE SWORD +??" before the showdown, "+43 THUNDER SPEAR" after. */
export function weaponLabel(d: Doppelganger, revealed: boolean): string {
  const w = `${ELEMENT_WORD[d.weapon.element]} ${CLASS_WORD[d.weapon.cls]}`;
  return revealed ? `+${d.weapon.level} ${w}` : `${w} +??`;
}
