// Trims the transparent margin off raw weapon images and downsizes them for the game.
//   npx tsx tools/art/process-weapons.ts
// tools/art/out/raw/{cls}_{element}.png  →  public/assets/weapons/{cls}_{element}.png
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const RAW = 'tools/art/out/raw';
const OUT = 'public/assets/weapons';
/** Output width in px: the anvil shows weapons ~440 px wide, so this leaves headroom for zoom effects. */
const TARGET_W = 768;
const PAD = 10;
const ALPHA_MIN = 16;

function bbox(png: PNG) {
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
function cropResize(src: PNG, b: ReturnType<typeof bbox>, outW: number): PNG {
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

mkdirSync(OUT, { recursive: true });
const files = readdirSync(RAW).filter((f) => /^(sword|spear|axe)_[a-z]+\.png$/.test(f));
for (const f of files) {
  const src = PNG.sync.read(readFileSync(`${RAW}/${f}`));
  const b = bbox(src);
  const out = cropResize(src, b, TARGET_W);
  const dest = `${OUT}/${f}`;
  writeFileSync(dest, PNG.sync.write(out, { colorType: 6 }));
  const kb = (statSync(dest).size / 1024).toFixed(0);
  console.log(`${f.padEnd(20)} raw ${src.width}x${src.height} → crop ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1} → ${out.width}x${out.height} (${kb} KB)`);
}
if (!existsSync(OUT)) console.log('nothing processed');
