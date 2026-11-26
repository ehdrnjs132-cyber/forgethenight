// Placeholder weapon drawings (design principle 8: temporary art must still show every rule).
// Drawn horizontally, centred on (0,0), tip pointing right. Replaced by Higgsfield art in M7;
// the look still reflects class, element, milestone tier and appearance stage so evolution is visible now.
import Phaser from 'phaser';
import { ELEMENT_INFO, type Element, type WeaponClass } from '../config/weapons';
import { milestoneTier, visualStage } from '../config/appearance';
import { swordFormIndex } from '../config/swordNames';
import { mix } from './theme';

export interface WeaponLook {
  cls: WeaponClass;
  element: Element;
  level: number;
}

/** Texture key of the Higgsfield base image for a class/element pair (public/assets/weapons). */
export function weaponTexture(cls: WeaponClass, element: Element): string {
  return `weapon-${cls}-${element}`;
}

export function weaponImagePath(cls: WeaponClass, element: Element): string {
  return `assets/weapons/${cls}_${element}.png`;
}

/** Texture key of one sword form image (public/assets/swords/<element>_<nn>.webp, tools/art/process-swords.ts). */
export function swordFormTexture(element: Element, form: number): string {
  return `sword-${element}-${String(form).padStart(2, '0')}`;
}

/**
 * The image to draw for a weapon: a sword's own form image when it is loaded, else the class/element base image.
 * Returns the key even if neither is loaded; callers check `textures.exists` and fall back to drawWeapon.
 */
export function weaponLookTexture(scene: Phaser.Scene, look: WeaponLook): string {
  if (look.cls === 'sword') {
    // forms added for +60..+100 may not have their image yet: use the newest form image that exists
    for (let i = swordFormIndex(look.level); i >= 0; i--) {
      const key = swordFormTexture(look.element, i);
      if (scene.textures.exists(key)) return key;
    }
  }
  return weaponTexture(look.cls, look.element);
}

/**
 * Glow strength for a level: nothing at +0/+1, then rising with each appearance stage (§9 "강화 단계별 발광").
 * Returned as the outer strength of Phaser's glow effect.
 */
export function glowStrength(level: number): number {
  const stage = visualStage(level);
  return stage <= 0 ? 0 : 0.5 + stage * 0.34;
}

type Pt = [number, number];

function poly(g: Phaser.GameObjects.Graphics, pts: Pt[], k: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0][0] * k, pts[0][1] * k);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * k, pts[i][1] * k);
  g.closePath();
  g.fillPath();
}

function grown(pts: Pt[], s: number): Pt[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
}

/** Glow halo: the same shape scaled up a few times at low alpha. */
function halo(g: Phaser.GameObjects.Graphics, pts: Pt[], k: number, color: number, strength: number) {
  if (strength <= 0) return;
  for (let i = 3; i >= 1; i--) poly(g, grown(pts, 1 + i * 0.09), k, color, strength / (i + 1));
}

function rect(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, k: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
}

function runes(g: Phaser.GameObjects.Graphics, from: number, to: number, count: number, k: number, color: number, alpha: number) {
  if (count <= 0) return;
  const step = (to - from) / (count + 1);
  for (let i = 1; i <= count; i++) {
    const x = from + step * i;
    poly(g, [[x - 3.5, 0], [x, -4], [x + 3.5, 0], [x, 4]], k, color, alpha);
  }
}

/** Draw a weapon of total length `length` px. */
export function drawWeapon(g: Phaser.GameObjects.Graphics, look: WeaponLook, length = 300) {
  g.clear();
  const k = length / 300;
  const el = ELEMENT_INFO[look.element];
  const tier = milestoneTier(look.level);
  const stage = visualStage(look.level);
  const metal = mix(0x7d828d, el.color, 0.22 + tier * 0.13);
  const metalDark = mix(metal, 0x000000, 0.35);
  const edge = mix(0xe4e8ef, el.glow, 0.2 + tier * 0.14);
  const fitting = tier >= 3 ? 0xe9c46a : tier >= 1 ? 0xb08d57 : 0x6e5a44;
  const glow = look.level >= 4 ? 0.1 + tier * 0.07 : 0;
  const w = 1 + stage * 0.014;
  const runeCount = Math.min(12, Math.floor(stage / 2));
  const runeAlpha = tier >= 1 ? 0.95 : 0.55;

  if (look.cls === 'sword') {
    const blade: Pt[] = [[-86, -11 * w], [118, -9 * w], [152, 0], [118, 9 * w], [-86, 11 * w]];
    halo(g, blade, k, el.glow, glow);
    poly(g, blade, k, metal);
    poly(g, [[-86, -11 * w], [118, -9 * w], [152, 0], [-86, 0]], k, edge, 0.55);
    rect(g, -80, -1.5, 112, 1.5, k, metalDark, 0.8);
    runes(g, -78, 104, runeCount, k, el.glow, runeAlpha);
    const gh = 30 + tier * 5;
    rect(g, -96, -gh, -84, gh, k, fitting);
    if (tier >= 2) {
      g.fillStyle(fitting, 1);
      g.fillCircle(-90 * k, -gh * k, 6 * k);
      g.fillCircle(-90 * k, gh * k, 6 * k);
    }
    rect(g, -146, -7, -96, 7, k, 0x3b2416);
    for (let x = -142; x < -98; x += 8) rect(g, x, -7, x + 3, 7, k, 0x24160d);
    g.fillStyle(fitting, 1);
    g.fillCircle(-151 * k, 0, 9 * k);
  } else if (look.cls === 'spear') {
    const blade: Pt[] = [[92, -6], [116, -17 * w], [154, 0], [116, 17 * w], [92, 6]];
    halo(g, blade, k, el.glow, glow);
    rect(g, -150, -5, 90, 5, k, 0x5a3a22);
    rect(g, -150, -5, 90, -2, k, 0x7a5333);
    for (const x of [-110, -40, 30]) rect(g, x, -6, x + 6, 6, k, fitting);
    rect(g, -156, -7, -148, 7, k, fitting);
    rect(g, 84, -9, 94, 9, k, fitting);
    poly(g, blade, k, metal);
    poly(g, [[92, -6], [116, -17 * w], [154, 0], [92, 0]], k, edge, 0.55);
    runes(g, 98, 140, Math.min(4, runeCount), k, el.glow, runeAlpha);
    if (tier >= 2) poly(g, [[86, 9], [70, 26], [92, 12]], k, el.color, 0.9);
  } else {
    // axe: crescent head on top of the shaft end
    const head: Pt[] = [];
    const cx = 92;
    for (let i = 0; i <= 12; i++) {
      const a = Phaser.Math.DegToRad(-160 + (140 * i) / 12);
      head.push([cx + Math.cos(a) * 66 * w, Math.sin(a) * 74 * w]);
    }
    head.push([cx + 18, -8], [cx - 22, -8]);
    halo(g, head, k, el.glow, glow);
    rect(g, -150, -6, 104, 6, k, 0x4e321d);
    rect(g, -150, -6, 104, -2, k, 0x6e4a2c);
    for (let x = -146; x < -104; x += 8) rect(g, x, -6, x + 3, 6, k, 0x2a190e);
    poly(g, head, k, metal);
    poly(g, head.slice(0, 7).concat([[cx, -8]]), k, edge, 0.4);
    poly(g, [[cx - 6, 6], [cx + 10, 6], [cx + 2, 26 + tier * 3]], k, metalDark);
    rect(g, cx - 14, -12, cx + 14, 10, k, fitting);
    runes(g, cx - 40, cx + 40, Math.min(5, runeCount), k, el.glow, runeAlpha);
    rect(g, -156, -8, -148, 8, k, fitting);
  }
}
