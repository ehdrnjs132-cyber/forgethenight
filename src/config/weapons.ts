// Weapon elements and classes (GAME_DESIGN.md §5). Display values only; balance lives in the other config files.

export const ELEMENTS = ['fire', 'earth', 'lightning', 'water', 'ice'] as const;
export type Element = (typeof ELEMENTS)[number];

export const WEAPON_CLASSES = ['sword', 'spear', 'axe'] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];

export interface ElementInfo {
  name: string;
  trait: string;
  /** Main body colour of the blade. */
  color: number;
  /** Glow / rune colour. */
  glow: number;
}

export const ELEMENT_INFO: Record<Element, ElementInfo> = {
  fire: { name: '불', trait: '화상, 폭발, 연쇄 폭발', color: 0xff5a1f, glow: 0xffb347 },
  earth: { name: '대지', trait: '기절, 넉백, 충격파', color: 0xb8863b, glow: 0xe2c77a },
  lightning: { name: '번개', trait: '연쇄 공격, 다중 타격', color: 0xffd84a, glow: 0xc9a2ff },
  water: { name: '물', trait: '밀쳐내기, 회복, 파동', color: 0x2f7bff, glow: 0x7fc8ff },
  ice: { name: '얼음', trait: '둔화, 빙결, 파쇄', color: 0xbff3ff, glow: 0xffffff },
};

export interface ClassInfo {
  name: string;
  style: string;
  /** Seconds between automatic attacks (§5 suggestion). */
  attackInterval: number;
}

export const CLASS_INFO: Record<WeaponClass, ClassInfo> = {
  sword: { name: '검', style: '균형형', attackInterval: 0.85 },
  spear: { name: '창', style: '긴 사거리', attackInterval: 1.05 },
  axe: { name: '도끼', style: '느리지만 강력한 광역 공격', attackInterval: 1.35 },
};

/** Highest enhancement level for every weapon (user decision 2026-11-26: +100, was +50). */
export const MAX_LEVEL = 100;

/**
 * Classes that are handed out (2026-11-19): swords only, because only swords have a name and an image
 * for every level (config/swordNames.ts, 150 images). Spears and axes stay in the code for old saves,
 * which load as swords (save.ts migrate).
 */
export const DROP_CLASSES: readonly WeaponClass[] = ['sword'];

/** The morning delivery, element random (was one per class, decision #3). */
// 2 since 2026-11-27: with a 4-slot rack a third weapon was mostly auto-sold for 10G.
export const DAILY_GRANT: readonly WeaponClass[] = ['sword', 'sword'];

/**
 * Weapon rack: 4 slots, 3 open at the start; the merchant's key opens the fourth
 * (user decision 2026-11-18; cut from 8 to 4 slots on 2026-11-27: "무기보관함 아래 4개 삭제").
 */
export const INVENTORY_START = 3;
export const INVENTORY_CAP = 4;
export const INVENTORY_STEP = 1;
