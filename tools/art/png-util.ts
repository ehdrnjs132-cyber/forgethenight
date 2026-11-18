// Shared PNG helpers for the art pipeline: trim the transparent margin and downscale cleanly.
import { PNG } from 'pngjs';

const PAD = 10;
const ALPHA_MIN = 16;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bbox(png: PNG): Box {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('image is fully transparent');
  return {
    x0: Math.max(0, x0 - PAD),
    y0: Math.max(0, y0 - PAD),
    x1: Math.min(png.width - 1, x1 + PAD),
    y1: Math.min(png.height - 1, y1 + PAD),
  };
}

/** Box-filter downscale with premultiplied alpha, so edges don't pick up dark fringes. */
export function cropResize(src: PNG, b: Box, outW: number): PNG {
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const scale = Math.min(1, outW / cw);
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy0 = b.y0 + Math.floor(y / scale);
    const sy1 = Math.max(sy0 + 1, b.y0 + Math.floor((y + 1) / scale));
    for (let x = 0; x < w; x++) {
      const sx0 = b.x0 + Math.floor(x / scale);
      const sx1 = Math.max(sx0 + 1, b.x0 + Math.floor((x + 1) / scale));
      let r = 0, g = 0, bl = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy <= b.y1; sy++) {
        for (let sx = sx0; sx < sx1 && sx <= b.x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          bl += src.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(bl / a);
      }
      out.data[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}
