// Builds a contact sheet of the processed weapons on the forge background colour, for review.
//   npx tsx tools/art/contact-sheet.ts   →  tools/art/out/weapons-contact.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ELEMENTS, WEAPON_CLASSES } from '../../src/config/weapons';

const CELL_W = 420;
const CELL_H = 170;
const PAD = 12;
const BG = [20, 16, 24];
const sheet = new PNG({ width: WEAPON_CLASSES.length * CELL_W, height: ELEMENTS.length * CELL_H });
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = BG[0];
  sheet.data[i + 1] = BG[1];
  sheet.data[i + 2] = BG[2];
  sheet.data[i + 3] = 255;
}

ELEMENTS.forEach((el, row) => {
  WEAPON_CLASSES.forEach((cls, col) => {
    const src = PNG.sync.read(readFileSync(`public/assets/weapons/${cls}_${el}.png`));
    const scale = Math.min((CELL_W - PAD * 2) / src.width, (CELL_H - PAD * 2) / src.height);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    const ox = col * CELL_W + Math.round((CELL_W - w) / 2);
    const oy = row * CELL_H + Math.round((CELL_H - h) / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (Math.min(src.height - 1, Math.floor(y / scale)) * src.width + Math.min(src.width - 1, Math.floor(x / scale))) * 4;
        const d = ((oy + y) * sheet.width + ox + x) * 4;
        const a = src.data[s + 3] / 255;
        for (let c = 0; c < 3; c++) sheet.data[d + c] = Math.round(src.data[s + c] * a + sheet.data[d + c] * (1 - a));
      }
    }
  });
});
writeFileSync('tools/art/out/weapons-contact.png', PNG.sync.write(sheet));
console.log('wrote tools/art/out/weapons-contact.png');
