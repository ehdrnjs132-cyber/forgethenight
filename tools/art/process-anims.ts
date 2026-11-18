// Video → sprite sheet: ffmpeg frames, even frame selection (loops drop the duplicate last frame),
// chroma-key matte (background colour sampled from the frame corners, un-premultiplied against it so
// edges lose the green/magenta fringe), one union box for every frame (no jitter), grid sheet.
//   npx tsx tools/art/process-anims.ts [keys…]   tools/art/out/anim/<key>.mp4 → public/assets/anim/<key>.png + manifest.json
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ANIMS, type AnimSpec } from './anims';

const SRC = 'tools/art/out/anim';
const OUT = 'public/assets/anim';
const MANIFEST = `${OUT}/manifest.json`;
/** Matte ramp: colour distance from the key below T0 is fully transparent, above T1 fully opaque. */
const T0 = 95;
const T1 = 175;

export interface SheetInfo {
  key: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
  loop: boolean;
}

function extract(a: AnimSpec): string[] {
  const dir = `${SRC}/${a.key}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `${SRC}/${a.key}.mp4`, '-vf', 'scale=768:-1', '-fps_mode', 'passthrough',`${dir}/%04d.png`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${a.key}: ffmpeg ${r.stderr || r.error}`);
  return readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => `${dir}/${f}`);
}

/**
 * One-shot clips often hold still before and after the action. Keep only the span where the image
 * changes (mean colour difference between consecutive frames above 12% of the clip's peak), with a
 * little lead-in and tail, so every sheet frame shows motion.
 */
function motionSpan(files: string[]): string[] {
  const step = 4;
  const sig = files.map((f) => {
    const p = PNG.sync.read(readFileSync(f));
    const v: number[] = [];
    for (let y = 0; y < p.height; y += step) for (let x = 0; x < p.width; x += step) v.push(p.data[(y * p.width + x) * 4 + 1], p.data[(y * p.width + x) * 4]);
    return v;
  });
  const diff = sig.map((v, i) => (i === 0 ? 0 : v.reduce((s, c, j) => s + Math.abs(c - sig[i - 1][j]), 0) / v.length));
  const peak = Math.max(...diff);
  const moving = diff.map((d) => d > peak * 0.12);
  const first = moving.indexOf(true);
  const last = moving.lastIndexOf(true);
  if (first < 0) return files;
  return files.slice(Math.max(0, first - 3), Math.min(files.length, last + 4));
}

function pick(all: string[], a: AnimSpec): string[] {
  const files = a.loop ? all : motionSpan(all);
  // loops: N+1 evenly spaced including both ends, then drop the last (it equals the first)
  const n = a.loop ? a.frames + 1 : a.frames;
  const idx = [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (files.length - 1)) / (n - 1))))];
  const chosen = idx.map((i) => files[i]);
  return a.loop ? chosen.slice(0, -1) : chosen;
}

function keyColour(p: PNG): [number, number, number] {
  const samples: number[][] = [];
  const at = (x: number, y: number) => {
    const i = (y * p.width + x) * 4;
    samples.push([p.data[i], p.data[i + 1], p.data[i + 2]]);
  };
  for (let k = 2; k < 40; k += 4) {
    at(k, k);
    at(p.width - 1 - k, k);
    at(k, p.height - 1 - k);
    at(p.width - 1 - k, p.height - 1 - k);
  }
  const med = (c: number) => samples.map((s) => s[c]).sort((x, y) => x - y)[samples.length >> 1];
  return [med(0), med(1), med(2)];
}

function matte(p: PNG) {
  const [kr, kg, kb] = keyColour(p);
  for (let i = 0; i < p.data.length; i += 4) {
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    const d = Math.hypot(r - kr, g - kg, b - kb);
    let a = Math.max(0, Math.min(1, (d - T0) / (T1 - T0)));
    // Dominance key: the video model lights the screen unevenly (yellow-green patches between arms),
    // so anything clearly dominated by the key hue is background too. None of our subjects use that hue.
    const excess = kg > kr && kg > kb ? g - Math.max(r, b) : kr > kg && kb > kg ? Math.min(r, b) - g : 0;
    if (excess > 18) a = Math.min(a, Math.max(0, 1 - (excess - 18) / 30));
    if (a <= 0) {
      p.data[i + 3] = 0;
      continue;
    }
    if (a < 1) {
      // un-premultiply against the key colour: removes the fringe on soft edges
      p.data[i] = Math.max(0, Math.min(255, Math.round((r - kr * (1 - a)) / a)));
      p.data[i + 1] = Math.max(0, Math.min(255, Math.round((g - kg * (1 - a)) / a)));
      p.data[i + 2] = Math.max(0, Math.min(255, Math.round((b - kb * (1 - a)) / a)));
    }
    // light spill suppression on the dominant key channel
    if (kg > kr && kg > kb) p.data[i + 1] = Math.min(p.data[i + 1], Math.max(p.data[i], p.data[i + 2]) + 4);
    else if (kr > kg && kb > kg) {
      const cap = p.data[i + 1] + 18;
      if (p.data[i] > cap && p.data[i + 2] > cap) {
        p.data[i] = Math.min(p.data[i], cap + 40);
        p.data[i + 2] = Math.min(p.data[i + 2], cap + 40);
      }
    }
    p.data[i + 3] = Math.round(a * 255);
  }
}

function box(frames: PNG[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const p of frames)
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++)
        if (p.data[(y * p.width + x) * 4 + 3] > 40) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
  const pad = 4;
  const w = frames[0].width, h = frames[0].height;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
}

function sheet(a: AnimSpec, frames: PNG[]): SheetInfo {
  const b = box(frames);
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const k = Math.min(1, a.cellH / bh);
  const cw = Math.round(bw * k);
  const ch = Math.round(bh * k);
  const cols = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);
  const out = new PNG({ width: cols * cw, height: rows * ch });
  frames.forEach((p, n) => {
    const ox = (n % cols) * cw;
    const oy = Math.floor(n / cols) * ch;
    for (let y = 0; y < ch; y++) {
      const ya = b.y0 + Math.floor(y / k);
      const yb = Math.max(ya + 1, b.y0 + Math.floor((y + 1) / k));
      for (let x = 0; x < cw; x++) {
        const xa = b.x0 + Math.floor(x / k);
        const xb = Math.max(xa + 1, b.x0 + Math.floor((x + 1) / k));
        let r = 0, g = 0, bl = 0, al = 0, cnt = 0;
        for (let yy = ya; yy < yb && yy <= b.y1; yy++)
          for (let xx = xa; xx < xb && xx <= b.x1; xx++) {
            const i = (yy * p.width + xx) * 4;
            const w = p.data[i + 3] / 255;
            r += p.data[i] * w; g += p.data[i + 1] * w; bl += p.data[i + 2] * w; al += w; cnt++;
          }
        const o = ((oy + y) * out.width + ox + x) * 4;
        if (al > 0) {
          out.data[o] = Math.round(r / al);
          out.data[o + 1] = Math.round(g / al);
          out.data[o + 2] = Math.round(bl / al);
        }
        out.data[o + 3] = Math.round((al / cnt) * 255);
      }
    }
  });
  writeFileSync(`${OUT}/${a.key}.png`, PNG.sync.write(out, { colorType: 6 }));
  return { key: a.key, frameW: cw, frameH: ch, frames: frames.length, fps: a.fps, loop: a.loop };
}

mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const manifest: SheetInfo[] = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
for (const a of ANIMS) {
  if (want.length && !want.includes(a.key)) continue;
  if (!existsSync(`${SRC}/${a.key}.mp4`)) continue;
  const files = pick(extract(a), a);
  const frames = files.map((f) => {
    const p = PNG.sync.read(readFileSync(f));
    matte(p);
    return p;
  });
  const info = sheet(a, frames);
  const i = manifest.findIndex((m) => m.key === a.key);
  if (i >= 0) manifest[i] = info;
  else manifest.push(info);
  console.log(`${a.key.padEnd(20)} ${files.length} frames → ${info.frameW}x${info.frameH} cells`);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`manifest: ${manifest.length} sheets`);
