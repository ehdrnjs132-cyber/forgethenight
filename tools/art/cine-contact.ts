// Contact sheet of the cutscene first frames: tools/art/out/cine-frames.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FRAMES } from './cinematics-spec';

const CW = 480, CH = 270, COLS = 4;
const rows = Math.ceil(FRAMES.length / COLS);
const sheet = new PNG({ width: COLS * CW, height: rows * CH });
FRAMES.forEach((f, i) => {
  const src = PNG.sync.read(readFileSync(`tools/art/out/cine/${f.key}.png`));
  const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const s = (Math.floor((y * src.height) / CH) * src.width + Math.floor((x * src.width) / CW)) * 4;
      const d = ((oy + y) * sheet.width + ox + x) * 4;
      sheet.data[d] = src.data[s]; sheet.data[d + 1] = src.data[s + 1]; sheet.data[d + 2] = src.data[s + 2]; sheet.data[d + 3] = 255;
    }
});
writeFileSync('tools/art/out/cine-frames.png', PNG.sync.write(sheet));
console.log('tools/art/out/cine-frames.png');
