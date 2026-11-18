// Generates the 15 base weapon images (5 elements x 3 classes) with the Higgsfield CLI.
// Run in a real shell where `higgsfield` is installed and logged in:
//   npx.cmd tsx tools/art/gen-weapons.ts            (only missing ones)
//   npx.cmd tsx tools/art/gen-weapons.ts sword_fire (only these keys, overwriting)
// Raw results go to tools/art/out/raw/ (not committed); run process-weapons.ts afterwards.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ELEMENTS, WEAPON_CLASSES, type Element, type WeaponClass } from '../../src/config/weapons';
import { STYLE_REFERENCE, WEAPON_GEN, weaponPrompt } from './style';

const OUT = 'tools/art/out/raw';
const MANIFEST = `${OUT}/manifest.json`;
const CONCURRENCY = 4;
const CLI = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';

interface Job {
  key: string;
  cls: WeaponClass;
  element: Element;
  prompt: string;
}

const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const manifest: Record<string, { prompt: string; url: string; at: string }> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const jobs: Job[] = [];
for (const cls of WEAPON_CLASSES) {
  for (const element of ELEMENTS) {
    const key = `${cls}_${element}`;
    if (only.length ? !only.includes(key) : existsSync(`${OUT}/${key}.png`)) continue;
    jobs.push({ key, cls, element, prompt: weaponPrompt(cls, element) });
  }
}

function run(job: Job): Promise<string> {
  const args = [
    'generate', 'create', WEAPON_GEN.model,
    '--prompt', `"${job.prompt}"`,
    '--image-references', STYLE_REFERENCE,
    '--aspect_ratio', WEAPON_GEN.aspectRatio,
    '--resolution', WEAPON_GEN.resolution,
    '--quality', WEAPON_GEN.quality,
    '--background', 'transparent',
    '--output_format', 'png',
    '--wait', '--wait-timeout', '15m',
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, args, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      const url = out.match(/https:\/\/\S+?\.png/)?.[0];
      if (code === 0 && url) resolve(url);
      else reject(new Error(`${job.key}: exit ${code}\n${out.slice(-600)}`));
    });
  });
}

async function worker(queue: Job[]) {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const started = Date.now();
    try {
      const url = await run(job);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${job.key}: download ${res.status}`);
      writeFileSync(`${OUT}/${job.key}.png`, Buffer.from(await res.arrayBuffer()));
      manifest[job.key] = { prompt: job.prompt, url, at: new Date().toISOString() };
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`done  ${job.key}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    } catch (e) {
      console.log(`FAIL  ${(e as Error).message}`);
    }
  }
}

console.log(`generating ${jobs.length}: ${jobs.map((j) => j.key).join(', ')}`);
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));
console.log('ALL DONE');
