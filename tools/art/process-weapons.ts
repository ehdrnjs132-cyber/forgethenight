// Trims the transparent margin off raw weapon images and downsizes them for the game.
//   npx tsx tools/art/process-weapons.ts
// tools/art/out/raw/{cls}_{element}.png  →  public/assets/weapons/{cls}_{element}.png
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { bbox, cropResize } from './png-util';

const RAW = 'tools/art/out/raw';
const OUT = 'public/assets/weapons';
/** Output width in px: the anvil shows weapons ~440 px wide, so this leaves headroom for zoom effects. */
const TARGET_W = 768;

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
