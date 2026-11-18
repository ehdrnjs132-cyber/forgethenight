// Run-level rules from GAME_DESIGN.md §1, §3, §13. Confirmed values; change only with a design decision.

export const START_LIVES = 10;
export const MAX_LIVES = 10;
export const LAST_DAY = 50;
export const BOSS_EVERY = 5;
export const MERCHANT_EVERY = 3;

/** Seconds of survival per night (§3 suggestion, tune by play testing). */
export const NIGHT_SECONDS = 180;
export const BOSS_NIGHT_SECONDS = 300;

/** Suggested presentation length of one enhancement, in ms (§7.2: 0.7–0.9 s). */
export const ENHANCE_ANIM_MS = 820;
