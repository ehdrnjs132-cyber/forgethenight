// Art direction for Higgsfield generation (DECISIONS.md, 2026-11-18: style B).
// Every asset prompt ends with STYLE so the whole game reads as one hand.
import type { Element, WeaponClass } from '../../src/config/weapons';

export const STYLE =
  'Bold hand-painted 2D game icon, thick dark ink outline, simplified highly readable shapes, two-tone cel shading, vivid saturated colors.';

export const NEGATIVE = 'No text, no hands, no people, no background, no frame.';

/** The approved style sample, passed as an image reference for consistency. */
export const STYLE_REFERENCE = 'tools/art/reference/style-b.png';

export const ELEMENT_PROMPT: Record<Element, string> = {
  fire: 'fire element: ember-orange and crimson accents, faint glowing flame runes',
  earth: 'earth element: rugged bronze and mossy stone accents, carved rock runes',
  lightning: 'lightning element: electric yellow with violet spark accents, jagged bolt runes',
  water: 'water element: deep ocean blue accents, flowing wave runes',
  ice: 'ice element: pale frost cyan and white accents, crystalline frost runes',
};

export const CLASS_PROMPT: Record<WeaponClass, string> = {
  sword: 'longsword lying horizontally, hilt on the left, blade pointing right, flared crossguard',
  spear: 'long spear lying horizontally, wooden shaft on the left, leaf-shaped steel spearhead pointing right',
  axe: 'battle axe lying horizontally, wooden handle on the left, single crescent axe head at the right end with its cutting edge facing up',
};

export function weaponPrompt(cls: WeaponClass, element: Element): string {
  return [
    `Single fantasy ${CLASS_PROMPT[cls]}, game asset, entire weapon fully visible with empty margin around it.`,
    `${ELEMENT_PROMPT[element]}.`,
    'A sturdy, well-forged starting weapon with modest decoration and element-colored accents.',
    STYLE,
    NEGATIVE,
  ].join(' ');
}

export const WEAPON_GEN = {
  model: 'gpt_image_2_6',
  aspectRatio: '21:9',
  resolution: '2k',
  quality: 'high',
} as const;
