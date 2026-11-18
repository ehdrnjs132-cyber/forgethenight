// Flattens a transparent sprite onto a solid key colour (with margin) for video/animation models,
// which work best from an opaque image with a clean uniform background.
//   npx tsx tools/art/keyframe.ts <in.png> <out.png> [size=1024] [hex=00b050]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

const [inPath, outPath, sizeArg, hexArg] = process.argv.slice(2);
const size = Number(sizeArg ?? 1024);
const hex = (hexArg ?? '00b050').replace('#', '');
const bg = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

const src = PNG.sync.read(readFileSync(inPath));
// subject bounding box
let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
for (let y = 0; y < src.height; y++)
  for (let x = 0; x < src.width; x++)
    if (src.data[(y * src.width + x) * 4 + 3] > 24) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
const cw = x1 - x0 + 1;
const ch = y1 - y0 + 1;
// subject fills ~70% of the frame, bottom-centred with margin for motion
const k = (size * 0.7) / Math.max(cw, ch);
const out = new PNG({ width: size, height: size });
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = bg[0]; out.data[i + 1] = bg[1]; out.data[i + 2] = bg[2]; out.data[i + 3] = 255;
}
const ox = Math.round((size - cw * k) / 2);
const oy = Math.round(size * 0.88 - ch * k);
for (let y = 0; y < Math.round(ch * k); y++)
  for (let x = 0; x < Math.round(cw * k); x++) {
    const sx = x0 + Math.min(cw - 1, Math.floor(x / k));
    const sy = y0 + Math.min(ch - 1, Math.floor(y / k));
    const s = (sy * src.width + sx) * 4;
    const a = src.data[s + 3] / 255;
    const d = ((oy + y) * size + ox + x) * 4;
    for (let c = 0; c < 3; c++) out.data[d + c] = Math.round(src.data[s + c] * a + out.data[d + c] * (1 - a));
  }
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out, { colorType: 2 }));
console.log(`${inPath} → ${outPath} (${size}px on #${hex})`);
