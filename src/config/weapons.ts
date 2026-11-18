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

export const MAX_LEVEL = 50;

/** Decision #3: one sword, one spear and one axe per day, element random. */
export const DAILY_GRANT: readonly WeaponClass[] = WEAPON_CLASSES;

/** Inventory: starts at 3 slots, bought up to 20 from the merchant (user decision 2026-11-18). */
export const INVENTORY_START = 3;
export const INVENTORY_CAP = 20;
export const INVENTORY_STEP = 2;
