// Hack-and-slash combat tuning (reboot spec PART 4). PROVISIONAL: all values are play-test placeholders.
import type { AttackShape } from './combat';

export type MoveClass = 'sword' | 'spear' | 'axe' | 'hammer';

export interface ComboDef {
  /** One entry per combo step: hit shape, damage multiplier, seconds the swing takes. */
  steps: { shape: AttackShape; mul: number; time: number; lunge?: number }[];
  /** Seconds after the last step before the chain resets. */
  window: number;
  /** Movement speed multiplier while swinging. */
  moveWhileAttacking: number;
}

const arc = (range: number, deg: number): AttackShape => ({ kind: 'arc', range, arcDeg: deg, interval: 0, damageMul: 1, knockback: 160, engage: 1 });
const line = (range: number, width: number): AttackShape => ({ kind: 'line', range, width, interval: 0, damageMul: 1, knockback: 140, engage: 1 });
const circle = (range: number): AttackShape => ({ kind: 'circle', range, interval: 0, damageMul: 1, knockback: 220, engage: 1 });

/** Sword: fast chains. Spear: reach and a lunge. Axe: wide, heavy, staggering. */
export const COMBOS: Record<MoveClass, ComboDef> = {
  sword: { steps: [{ shape: arc(118, 120), mul: 1, time: 0.26 }, { shape: arc(118, 120), mul: 1.1, time: 0.26 }, { shape: arc(132, 160), mul: 1.7, time: 0.38, lunge: 60 }], window: 0.4, moveWhileAttacking: 0.5 },
  spear: { steps: [{ shape: line(200, 46), mul: 1, time: 0.34 }, { shape: line(210, 46), mul: 1.15, time: 0.34 }, { shape: line(250, 56), mul: 1.9, time: 0.46, lunge: 120 }], window: 0.42, moveWhileAttacking: 0.45 },
  axe: { steps: [{ shape: arc(128, 170), mul: 1.4, time: 0.46 }, { shape: circle(140), mul: 2.1, time: 0.6 }], window: 0.45, moveWhileAttacking: 0.35 },
  hammer: { steps: [{ shape: arc(100, 120), mul: 1, time: 0.4 }, { shape: arc(108, 140), mul: 1.5, time: 0.5 }], window: 0.42, moveWhileAttacking: 0.4 },
};

export const HEAVY = {
  /** Seconds of right-button hold for a full charge. */
  chargeTime: 0.6,
  /** Damage multiplier at no charge → full charge. */
  mul: [2, 3.5] as const,
  radius: 150,
  knockback: 420,
  stagger: 0.7,
  cooldown: 1.0,
};

export const DASH = { distance: 230, time: 0.16, iframes: 0.28, cooldown: 0.75 };

/** Hit-stop on contact: seconds the world freezes (light / heavy / kill). */
export const HITSTOP = { light: 0.035, heavy: 0.09, kill: 0.06 };

export const PLAYER_COMBAT = { maxHp: 120, speed: 250, radius: 16, hurtInvuln: 0.5 };

/** Element skill on Q (E and R are planned skill-tree unlocks). */
export const ELEMENT_SKILL = { cooldown: 6, range: 300 };

/** Combo counter: hits within this many seconds keep the chain alive. */
export const COMBO_COUNTER_WINDOW = 2.2;

/** Doppelganger AI movement (px/s) and spacing. */
export const DOPPEL_AI = {
  approach: 165,
  strafe: 115,
  keepDistance: 0.85,
  /** At most this many rivals may be winding up an attack at the same time (fairness). */
  maxSimultaneousWindups: 2,
  recover: 0.55,
  heavyChance: 0.3,
  dodgeCooldown: 2.2,
  dash: 200,
  /** Seconds between rivals coming through the rift. */
  arrivalGap: 1.1,
  arena: { width: 1800, height: 1300 },
};
