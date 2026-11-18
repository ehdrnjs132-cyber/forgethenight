// Sword form images (src/config/swordNames.ts): one image per element × form, 150 in all.
//   npx.cmd tsx tools/art/gen-swords.ts fire:0 earth:11 ice:29   (only these, for a sample)
//   npx.cmd tsx tools/art/gen-swords.ts all                      (every missing one; only after a sample is approved)
// Raw results go to tools/art/out/swords/<element>_<nn>.png (not committed).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { ELEMENTS, type Element } from '../../src/config/weapons';
import { SWORD_FORMS } from '../../src/config/swordNames';
import { ELEMENT_PROMPT, NEGATIVE, STYLE, STYLE_REFERENCE, WEAPON_GEN } from './style';

const OUT = 'tools/art/out/swords';
const CLI = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';
const CONCURRENCY = 6;
mkdirSync(OUT, { recursive: true });

/** How grand a form should look: 0 = plain starter, 5 = cosmic. */
function grandeur(i: number): string {
  if (i < 5) return 'A humble, plain, slightly worn early weapon, small and simple.';
  if (i < 10) return 'A well-crafted weapon starting to show its element, modest decoration.';
  if (i < 15) return 'A heroic weapon, clearly magical, bold elemental shape.';
  if (i < 20) return 'A legendary weapon, ornate and imposing, strong glowing effects.';
  if (i < 25) return 'A mythic divine weapon, huge presence, radiant aura, extraordinary silhouette.';
  return 'A cosmic, dimension-bending weapon beyond mortal craft, made of stars and space itself, overwhelming glow.';
}

export function swordPrompt(el: Element, i: number): string {
  return [
    `Single fantasy sword lying horizontally, hilt on the left, blade pointing right, game asset, entire sword fully visible with empty margin around it.`,
    `The sword: ${SWORD_FORMS[el][i].look}.`,
    `${ELEMENT_PROMPT[el]}.`,
    grandeur(i),
    'Its silhouette must be clearly different from an ordinary sword of another tier.',
    STYLE,
    NEGATIVE,
  ].join(' ');
}

const args = process.argv.slice(2);
const jobs: { key: string; el: Element; i: number }[] = [];
for (const el of ELEMENTS)
  for (let i = 0; i < 30; i++) {
    const key = `${el}_${String(i).padStart(2, '0')}`;
    const wanted = args.includes('all') ? !existsSync(`${OUT}/${key}.png`) : args.includes(`${el}:${i}`);
    if (wanted) jobs.push({ key, el, i });
  }

function run(prompt: string): Promise<string> {
  const a = ['generate', 'create', WEAPON_GEN.model, '--prompt', `"${prompt.replace(/"/g, "'")}"`, '--image-references', STYLE_REFERENCE,
    '--aspect_ratio', WEAPON_GEN.aspectRatio, '--resolution', WEAPON_GEN.resolution, '--quality', WEAPON_GEN.quality,
    '--background', 'transparent', '--output_format', 'png', '--wait', '--wait-timeout', '15m'];
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, a, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      const url = out.match(/https:\/\/\S+?\.png/)?.[0];
      if (code === 0 && url) resolve(url);
      else reject(new Error(`exit ${code}\n${out.slice(-500)}`));
    });
  });
}

console.log(`generating ${jobs.length}: ${jobs.map((j) => j.key).join(', ')}`);
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        const url = await run(swordPrompt(j.el, j.i));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        writeFileSync(`${OUT}/${j.key}.png`, Buffer.from(await res.arrayBuffer()));
        console.log(`done  ${j.key}`);
      } catch (e) {
        console.log(`FAIL  ${j.key}: ${(e as Error).message}`);
      }
    }
  }),
);
console.log('ALL DONE');
