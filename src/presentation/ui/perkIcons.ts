// Icons for the 왕의 하사품 cards (user 2026-11-27: "각 스킬별 클로드로 그림 그려줘"), drawn with vector shapes
// in the tier's metal: bronze, silver, gold, or a rainbow shimmer. Centered on (0, 0), about `s` px across.
import Phaser from 'phaser';
import type { PerkIcon, PerkTier } from '../../config/rentPerks';
import { mix } from '../theme';

export const TIER_COLOR: Record<PerkTier, { main: number; hi: number; dark: number; edge: number }> = {
  bronze: { main: 0xc98447, hi: 0xf0b884, dark: 0x5e3416, edge: 0x8a5528 },
  silver: { main: 0xc3ccd6, hi: 0xf4f8fc, dark: 0x4a5563, edge: 0x8d98a6 },
  gold: { main: 0xf0bd4f, hi: 0xffeaa8, dark: 0x6e4a10, edge: 0xc99232 },
  rainbow: { main: 0xd58cff, hi: 0xfff0ff, dark: 0x3a1f5a, edge: 0xff9ad5 },
};

export const RAINBOW = [0xff6b6b, 0xffb84d, 0xfff06b, 0x6bff9a, 0x6bc8ff, 0xa66bff];

/** Draw `icon` into `g`. */
export function drawPerkIcon(g: Phaser.GameObjects.Graphics, icon: PerkIcon, tier: PerkTier, s = 96) {
  const k = s / 96;
  const t = TIER_COLOR[tier];
  const M = t.main;
  const HI = t.hi;
  const D = t.dark;
  const glow = tier === 'rainbow' ? RAINBOW : [M];
  // soft halo behind every icon
  glow.forEach((c, i) => {
    g.fillStyle(c, tier === 'rainbow' ? 0.14 : 0.12);
    g.fillCircle(((i % 3) - 1) * 6 * k, (Math.floor(i / 3) - 0.5) * 6 * k, 44 * k);
  });
  g.fillStyle(M, 0.1).fillCircle(0, 0, 30 * k);
  const L = (w: number, c: number, a = 1) => g.lineStyle(w * k, c, a);
  const F = (c: number, a = 1) => g.fillStyle(c, a);
  const p = (x: number, y: number) => new Phaser.Math.Vector2(x * k, y * k);
  const poly = (pts: number[][], fill: number, line?: number) => {
    const v = pts.map(([x, y]) => p(x, y));
    F(fill).fillPoints(v, true);
    if (line !== undefined) L(2.5, line).strokePoints(v, true);
  };
  const circ = (x: number, y: number, r: number, fill: number, line?: number) => {
    F(fill).fillCircle(x * k, y * k, r * k);
    if (line !== undefined) L(2.5, line).strokeCircle(x * k, y * k, r * k);
  };
  const rect = (x: number, y: number, w: number, h: number, fill: number, r = 3, line?: number) => {
    F(fill).fillRoundedRect(x * k, y * k, w * k, h * k, r * k);
    if (line !== undefined) L(2.5, line).strokeRoundedRect(x * k, y * k, w * k, h * k, r * k);
  };
  const coin = (x: number, y: number, r = 10) => {
    F(D).fillEllipse(x * k, (y + 3) * k, 2 * r * k, 1.1 * r * k);
    F(M).fillEllipse(x * k, y * k, 2 * r * k, 1.1 * r * k);
    L(1.5, HI).strokeEllipse(x * k, y * k, 2 * r * k, 1.1 * r * k);
  };
  const spark = (x: number, y: number, r: number, c = HI) => poly([[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], c);

  switch (icon) {
    case 'hammer':
      rect(-4, -10, 8, 46, D, 3, M);
      rect(-26, -30, 52, 22, M, 5, HI);
      rect(-26, -30, 10, 22, HI, 4);
      spark(26, -34, 9);
      break;
    case 'shield':
      poly([[0, -34], [28, -24], [26, 6], [0, 34], [-26, 6], [-28, -24]], M, HI);
      poly([[0, -24], [18, -17], [17, 4], [0, 22]], HI);
      L(3, D).lineBetween(0, -24 * k, 0, 22 * k);
      break;
    case 'spark':
      spark(0, 0, 34, M);
      spark(0, 0, 18, HI);
      spark(26, -24, 8);
      spark(-24, 22, 6);
      break;
    case 'heart':
      F(M).fillCircle(-12 * k, -8 * k, 15 * k).fillCircle(12 * k, -8 * k, 15 * k);
      poly([[-26, -2], [26, -2], [0, 30]], M);
      F(HI, 0.8).fillCircle(-16 * k, -12 * k, 5 * k);
      L(3, D).beginPath();
      g.moveTo(-22 * k, 2 * k).lineTo(-8 * k, 2 * k).lineTo(-3 * k, -8 * k).lineTo(4 * k, 12 * k).lineTo(9 * k, 2 * k).lineTo(22 * k, 2 * k);
      g.strokePath();
      break;
    case 'lungs':
      F(M).fillEllipse(-14 * k, 6 * k, 22 * k, 46 * k).fillEllipse(14 * k, 6 * k, 22 * k, 46 * k);
      L(5, D).lineBetween(0, -32 * k, 0, -8 * k);
      L(4, D).lineBetween(0, -8 * k, -10 * k, 0).lineBetween(0, -8 * k, 10 * k, 0);
      L(2, HI, 0.8).strokeEllipse(-14 * k, 6 * k, 22 * k, 46 * k).strokeEllipse(14 * k, 6 * k, 22 * k, 46 * k);
      break;
    case 'wing':
      for (let i = 0; i < 4; i++) poly([[-30 + i * 4, 18 - i * 12], [24 - i * 2, -26 + i * 8], [16 - i * 4, -16 + i * 10]], i % 2 ? HI : M);
      L(3, D).lineBetween(-30 * k, 22 * k, 28 * k, -30 * k);
      break;
    case 'coins':
      coin(-12, 18, 14);
      coin(-12, 10, 14);
      coin(-12, 2, 14);
      coin(14, 20, 13);
      coin(14, 12, 13);
      coin(2, -16, 13);
      spark(24, -24, 7);
      break;
    case 'scale':
      L(4, M).lineBetween(0, -30 * k, 0, 28 * k).lineBetween(-28 * k, -20 * k, 28 * k, -20 * k);
      rect(-16, 26, 32, 6, M, 2);
      L(2, HI).lineBetween(-28 * k, -20 * k, -36 * k, 6 * k).lineBetween(-28 * k, -20 * k, -20 * k, 6 * k);
      L(2, HI).lineBetween(28 * k, -20 * k, 20 * k, 0).lineBetween(28 * k, -20 * k, 36 * k, 0);
      F(M).slice(-28 * k, 6 * k, 10 * k, 0, Math.PI, false).fillPath();
      F(M).slice(28 * k, 0, 10 * k, 0, Math.PI, false).fillPath();
      circ(0, -30, 5, HI);
      break;
    case 'sun':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        L(4, i % 2 ? M : HI).lineBetween(Math.cos(a) * 22 * k, Math.sin(a) * 22 * k, Math.cos(a) * 34 * k, Math.sin(a) * 34 * k);
      }
      circ(0, 0, 18, M, HI);
      coin(0, 2, 9);
      break;
    case 'shard':
      poly([[-6, -34], [8, -6], [-2, -2], [6, 30], [-18, -4], [-8, -8]], M, HI);
      poly([[16, -24], [28, -10], [18, -4]], HI);
      poly([[18, 10], [30, 22], [16, 26]], M);
      coin(-20, 26, 8);
      break;
    case 'drop':
      F(M).fillCircle(0, 8 * k, 22 * k);
      poly([[-19, -2], [19, -2], [0, -36]], M);
      F(HI, 0.85).fillEllipse(-8 * k, 4 * k, 8 * k, 16 * k);
      L(2, HI).strokeCircle(0, 8 * k, 22 * k);
      break;
    case 'clover':
      for (const [x, y] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) circ(x, y, 13, M);
      circ(0, 0, 7, HI);
      L(4, D).lineBetween(4 * k, 6 * k, 18 * k, 34 * k);
      break;
    case 'vault':
      rect(-30, -28, 60, 56, M, 6, HI);
      circ(0, 0, 16, D, HI);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        L(3, HI).lineBetween(0, 0, Math.cos(a) * 14 * k, Math.sin(a) * 14 * k);
      }
      rect(-26, -10, 5, 20, D, 2);
      break;
    case 'bag':
      F(M).fillEllipse(0, 10 * k, 54 * k, 46 * k);
      poly([[-10, -16], [10, -16], [16, -30], [-16, -30]], M, HI);
      L(4, D).lineBetween(-12 * k, -14 * k, 12 * k, -14 * k);
      L(3, HI, 0.6).strokeEllipse(0, 10 * k, 54 * k, 46 * k);
      F(D).fillCircle(0, 10 * k, 11 * k);
      F(HI).fillRect(-2 * k, 1 * k, 4 * k, 18 * k);
      break;
    case 'flame':
      poly([[0, -36], [20, -8], [22, 14], [0, 32], [-22, 14], [-18, -10], [-8, 0]], M);
      poly([[0, -12], [12, 8], [0, 26], [-12, 8]], HI);
      spark(24, -26, 6);
      break;
    case 'anvil':
      poly([[-34, -16], [24, -16], [34, -8], [14, -2], [10, 10], [-10, 10], [-14, -2], [-26, -6]], M, HI);
      rect(-20, 10, 40, 8, D, 2);
      rect(-26, 18, 52, 10, M, 3, HI);
      spark(-4, -28, 8);
      break;
    case 'apprentice':
      circ(0, -16, 13, M, HI);
      poly([[-24, 30], [-20, 4], [20, 4], [24, 30]], M, HI);
      rect(14, -6, 6, 30, D, 2);
      rect(8, -14, 18, 10, HI, 3);
      break;
    case 'cart':
      rect(-30, -14, 50, 28, M, 4, HI);
      circ(-16, 20, 8, D, HI);
      circ(10, 20, 8, D, HI);
      L(4, M).lineBetween(20 * k, -10 * k, 34 * k, -24 * k);
      coin(-8, -20, 8);
      break;
    case 'card':
      g.fillStyle(D, 1);
      rect(-30, -24, 34, 48, D, 5, M);
      rect(-6, -30, 34, 48, M, 5, HI);
      L(4, D).strokeCircle(11 * k, -6 * k, 9 * k);
      break;
    case 'dawn':
      rect(-34, 8, 68, 4, M, 2);
      F(M).slice(0, 8 * k, 20 * k, Math.PI, 0, false).fillPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i + 1) * (Math.PI / 6);
        L(4, HI).lineBetween(Math.cos(a) * 26 * k, 8 * k + Math.sin(a) * 26 * k, Math.cos(a) * 36 * k, 8 * k + Math.sin(a) * 36 * k);
      }
      L(3, M, 0.6).lineBetween(-26 * k, 22 * k, 26 * k, 22 * k);
      break;
    case 'stone':
      poly([[-22, -8], [-8, -28], [18, -24], [28, 0], [14, 26], [-16, 24]], M, HI);
      poly([[-8, -16], [10, -14], [14, 4], [-6, 10]], HI);
      break;
    case 'crown':
      poly([[-32, 18], [-32, -18], [-16, 0], [0, -26], [16, 0], [32, -18], [32, 18]], M, HI);
      rect(-32, 18, 64, 10, D, 2, M);
      circ(0, -26, 4, HI);
      circ(-32, -18, 4, HI);
      circ(32, -18, 4, HI);
      circ(0, 8, 5, D);
      break;
    case 'scroll':
      rect(-24, -24, 48, 50, M, 4, HI);
      circ(-24, -24, 7, D);
      circ(24, 26, 7, D);
      for (let i = 0; i < 4; i++) L(3, D, 0.8).lineBetween(-14 * k, (-10 + i * 10) * k, 14 * k, (-10 + i * 10) * k);
      break;
    case 'chain':
      for (let i = 0; i < 3; i++) {
        L(6, i % 2 ? HI : M).strokeEllipse((-22 + i * 22) * k, (14 - i * 14) * k, 28 * k, 18 * k);
      }
      spark(26, -26, 7);
      break;
    case 'feather':
      poly([[24, -34], [8, 4], [-20, 30], [-12, 4]], M, HI);
      poly([[24, -34], [16, -6], [-4, 12]], HI);
      L(3, D).lineBetween(-24 * k, 34 * k, 20 * k, -26 * k);
      spark(-20, -18, 8, mix(M, 0xff6a2a, 0.5));
      break;
    case 'blood':
      F(0xc42a2a).fillCircle(-6 * k, 10 * k, 18 * k);
      poly([[-21, 2], [9, 2], [-6, -30]], 0xc42a2a);
      F(0xff8a8a, 0.8).fillEllipse(-12 * k, 6 * k, 6 * k, 12 * k);
      coin(18, 20, 11);
      coin(18, 12, 11);
      break;
    case 'skull':
      circ(0, -6, 24, M, HI);
      rect(-14, 12, 28, 16, M, 4, HI);
      circ(-9, -6, 7, D);
      circ(9, -6, 7, D);
      poly([[0, 2], [-4, 10], [4, 10]], D);
      L(3, D).lineBetween(-5 * k, 16 * k, -5 * k, 26 * k).lineBetween(5 * k, 16 * k, 5 * k, 26 * k);
      break;
    case 'gem':
      poly([[-26, -10], [-14, -26], [14, -26], [26, -10], [0, 30]], M, HI);
      poly([[-14, -26], [0, -10], [14, -26]], HI);
      poly([[-26, -10], [0, -10], [0, 30]], mix(M, D, 0.35));
      spark(26, -28, 8);
      break;
    case 'box':
      poly([[-28, -8], [0, -22], [28, -8], [0, 6]], HI);
      poly([[-28, -8], [0, 6], [0, 34], [-28, 20]], M);
      poly([[28, -8], [0, 6], [0, 34], [28, 20]], mix(M, D, 0.4));
      L(3, D).lineBetween(-14 * k, -15 * k, 14 * k, -1 * k);
      break;
    case 'twin':
      for (const sx of [-1, 1]) {
        const x = sx * 13;
        rect(x - 3, -8, 6, 40, D, 2, M);
        rect(x - 13, -30, 26, 18, M, 4, HI);
      }
      spark(0, -36, 8);
      break;
    case 'furnace':
      rect(-30, -22, 60, 52, D, 6, M);
      F(0xff7a2a).fillCircle(0, 12 * k, 15 * k);
      poly([[0, -6], [10, 10], [0, 26], [-10, 10]], 0xffe0a0);
      rect(-34, -30, 68, 10, M, 3, HI);
      break;
    case 'eye':
      F(M).fillEllipse(0, 0, 64 * k, 34 * k);
      circ(0, 0, 13, D);
      circ(-4, -4, 4, HI);
      break;
  }
}
