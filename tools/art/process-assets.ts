// Trims, resizes and splits the v2 world art for the game.
//   npx tsx tools/art/process-assets.ts      tools/art/out/v2/*.png → public/assets/world/*.png
// Also writes tools/art/out/v2-contact.png for review.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const RAW = 'tools/art/out/v2';
const OUT = 'public/assets/world';
const ALPHA_MIN = 20;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** key → how to size it: a max width and/or height in px; `trim` crops transparent margins. */
const JOBS: Record<string, { w?: number; h?: number; trim: boolean }> = {
  forge_bg: { w: 1280, trim: false },
  forge_rack_bg: { w: 1280, trim: false },
  night_ground: { w: 768, trim: false },
  anvil: { w: 440, trim: true },
  hammer: { w: 420, trim: true },
  smith_raise: { h: 440, trim: true },
  smith_strike: { h: 440, trim: true },
  skeleton: { h: 128, trim: true },
  slime: { h: 120, trim: true },
  player_top: { h: 150, trim: true },
  morr: { h: 380, trim: true },
  smith_anvil: { h: 560, trim: true },
  rack_slot: { w: 260, trim: true },
  padlock: { h: 120, trim: true },
  lock_key: { h: 120, trim: true },
  hero_sword: { h: 300, trim: true },
  hero_spear: { h: 300, trim: true },
  hero_axe: { h: 300, trim: true },
  hero_hammer: { h: 300, trim: true },
};

function alphaBox(png: PNG, b: Box = { x0: 0, y0: 0, x1: png.width - 1, y1: png.height - 1 }): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++)
      if (png.data[(y * png.width + x) * 4 + 3] > ALPHA_MIN) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) throw new Error('empty');
  const pad = 6;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(png.width - 1, x1 + pad), y1: Math.min(png.height - 1, y1 + pad) };
}

/** Box-filter resize of a region with premultiplied alpha. */
function resize(src: PNG, b: Box, w: number, h: number): PNG {
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const sx = cw / w;
  const sy = ch / h;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const ya = b.y0 + Math.floor(y * sy);
    const yb = Math.max(ya + 1, b.y0 + Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const xa = b.x0 + Math.floor(x * sx);
      const xb = Math.max(xa + 1, b.x0 + Math.floor((x + 1) * sx));
      let r = 0, g = 0, bl = 0, a = 0, n = 0;
      for (let yy = ya; yy < yb && yy <= b.y1; yy++)
        for (let xx = xa; xx < xb && xx <= b.x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          bl += src.data[i + 2] * al;
          a += al;
          n++;
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

function fit(src: PNG, b: Box, maxW?: number, maxH?: number): PNG {
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const k = Math.min(1, maxW ? maxW / cw : Infinity, maxH ? maxH / ch : Infinity);
  return resize(src, b, Math.max(1, Math.round(cw * k)), Math.max(1, Math.round(ch * k)));
}

/** Separate sprites on a transparent sheet: connected opaque regions (on a coarse grid), biggest first. */
function components(png: PNG): Box[] {
  const cell = 8;
  const gw = Math.ceil(png.width / cell);
  const gh = Math.ceil(png.height / cell);
  const filled = new Uint8Array(gw * gh);
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3] > ALPHA_MIN) filled[Math.floor(y / cell) * gw + Math.floor(x / cell)] = 1;
  const seen = new Uint8Array(gw * gh);
  const boxes: (Box & { n: number })[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!filled[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % gw;
      const cy = Math.floor(c / gw);
      n++;
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (filled[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (n > 40) boxes.push({ x0: x0 * cell, y0: y0 * cell, x1: Math.min(png.width - 1, x1 * cell + cell - 1), y1: Math.min(png.height - 1, y1 * cell + cell - 1), n });
  }
  // reading order: top row first, then left to right
  return boxes.sort((a, b) => (Math.abs(a.y0 - b.y0) > 120 ? a.y0 - b.y0 : a.x0 - b.x0));
}

mkdirSync(OUT, { recursive: true });
const made: { name: string; png: PNG }[] = [];
for (const [key, job] of Object.entries(JOBS)) {
  const path = `${RAW}/${key}.png`;
  if (!existsSync(path)) continue;
  const src = PNG.sync.read(readFileSync(path));
  const b = job.trim ? alphaBox(src) : { x0: 0, y0: 0, x1: src.width - 1, y1: src.height - 1 };
  const out = fit(src, b, job.w, job.h);
  writeFileSync(`${OUT}/${key}.png`, PNG.sync.write(out, { colorType: job.trim ? 6 : 2 }));
  made.push({ name: key, png: out });
  console.log(`${key.padEnd(14)} ${src.width}x${src.height} → ${out.width}x${out.height}`);
}
if (existsSync(`${RAW}/props.png`)) {
  const src = PNG.sync.read(readFileSync(`${RAW}/props.png`));
  components(src).forEach((b, i) => {
    const out = fit(src, alphaBox(src, b), 260, 260);
    writeFileSync(`${OUT}/prop_${i}.png`, PNG.sync.write(out, { colorType: 6 }));
    made.push({ name: `prop_${i}`, png: out });
    console.log(`prop_${i}         ${b.x1 - b.x0}x${b.y1 - b.y0} → ${out.width}x${out.height}`);
  });
}

// contact sheet on a mid-grey checker so transparency and outlines are both visible
const CELL = 300;
const cols = 5;
const rows = Math.ceil(made.length / cols);
const sheet = new PNG({ width: cols * CELL, height: rows * CELL });
for (let y = 0; y < sheet.height; y++)
  for (let x = 0; x < sheet.width; x++) {
    const o = (y * sheet.width + x) * 4;
    const v = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 ? 70 : 90;
    sheet.data[o] = v;
    sheet.data[o + 1] = v;
    sheet.data[o + 2] = v + 6;
    sheet.data[o + 3] = 255;
  }
made.forEach(({ png }, i) => {
  const k = Math.min(1, (CELL - 16) / png.width, (CELL - 16) / png.height);
  const w = Math.round(png.width * k);
  const h = Math.round(png.height * k);
  const ox = (i % cols) * CELL + Math.round((CELL - w) / 2);
  const oy = Math.floor(i / cols) * CELL + Math.round((CELL - h) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (Math.min(png.height - 1, Math.floor(y / k)) * png.width + Math.min(png.width - 1, Math.floor(x / k))) * 4;
      const d = ((oy + y) * sheet.width + ox + x) * 4;
      const a = png.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) sheet.data[d + c] = Math.round(png.data[s + c] * a + sheet.data[d + c] * (1 - a));
    }
});
writeFileSync('tools/art/out/v2-contact.png', PNG.sync.write(sheet));
console.log('contact sheet: tools/art/out/v2-contact.png');
