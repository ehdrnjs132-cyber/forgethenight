import Phaser from 'phaser';

export const W = 1280;
export const H = 720;

/** Dark fantasy palette: soot, iron, ember and gold. Danger is a distinct red (§8.4). */
export const C = {
  bg: 0x07060a,
  bgTop: 0x0d0b12,
  bgBottom: 0x1a0f0a,
  panel: 0x120f0d,
  panelHi: 0x1c1713,
  edge: 0x3b2d1e,
  gold: 0xe9b65c,
  goldHi: 0xffe2a0,
  text: 0xf1e6d2,
  mute: 0x9a8d7a,
  dim: 0x5f564b,
  ember: 0xff7a2a,
  danger: 0xe2343c,
  dangerHi: 0xff6b6b,
  iron: 0x2a2a30,
  ironHi: 0x4a4a55,
} as const;

export const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const DISPLAY = 'Cinzel, "Noto Sans KR", serif';

export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

export interface LabelOpts {
  weight?: 400 | 700 | 900;
  display?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  origin?: [number, number];
  lineSpacing?: number;
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size: number,
  color: number = C.text,
  opts: LabelOpts = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, {
    fontFamily: opts.display ? DISPLAY : FONT,
    fontSize: `${size}px`,
    fontStyle: String(opts.weight ?? 400),
    color: css(color),
    align: opts.align ?? 'left',
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: opts.lineSpacing ?? 0,
    resolution: 2,
  });
  t.setOrigin(...(opts.origin ?? [0, 0]));
  return t;
}

/** Rounded panel with a thin edge, drawn into a Graphics object. */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number = C.panel, edge: number = C.edge, radius = 10) {
  g.fillStyle(fill, 0.92);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(1, edge, 1);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, radius);
}
