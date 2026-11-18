// Sword form images for the game: trim, downscale to 640 px wide, encode as WebP with alpha.
//   npx.cmd tsx tools/art/process-swords.ts
// tools/art/out/swords/<element>_<nn>.png  →  public/assets/swords/<element>_<nn>.webp
// plus public/assets/swords/manifest.json (the keys that exist; BootScene loads only those).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { bbox, cropResize } from './png-util';

const RAW = 'tools/art/out/swords';
const OUT = 'public/assets/swords';
const TMP = `${RAW}/tmp`;
const TARGET_W = 640;

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const keys: string[] = [];
let total = 0;
for (const f of readdirSync(RAW).filter((x) => /^[a-z]+_\d\d\.png$/.test(x)).sort()) {
  const key = f.replace('.png', '');
  const src = PNG.sync.read(readFileSync(`${RAW}/${f}`));
  const out = cropResize(src, bbox(src), TARGET_W);
  const tmp = `${TMP}/${f}`;
  writeFileSync(tmp, PNG.sync.write(out, { colorType: 6 }));
  const dest = `${OUT}/${key}.webp`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libwebp', '-quality', '86','-pix_fmt', 'yuva420p', dest]);
  const kb = statSync(dest).size / 1024;
  total += kb;
  keys.push(key);
  console.log(`${key.padEnd(14)} ${out.width}x${out.height}  ${kb.toFixed(0)} KB`);
}
rmSync(TMP, { recursive: true, force: true });
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(keys));
console.log(`${keys.length} swords, ${(total / 1024).toFixed(1)} MB`);
