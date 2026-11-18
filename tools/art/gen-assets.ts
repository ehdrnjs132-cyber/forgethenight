// Generates the v2 world art with the Higgsfield CLI.
//   npx.cmd tsx tools/art/gen-assets.ts forge_bg night_ground   (these keys, overwriting)
// Raw results: tools/art/out/v2/<key>.png (not committed). Process with process-assets.ts.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ASSETS, type AssetSpec } from './assets';

const OUT = 'tools/art/out/v2';
const MANIFEST = `${OUT}/manifest.json`;
const CLI = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';

const keys = process.argv.slice(2);
if (!keys.length) throw new Error('name the asset keys to generate');
mkdirSync(OUT, { recursive: true });
const manifest: Record<string, { prompt: string; url: string; at: string }> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const jobs = keys.map((k) => {
  const spec = ASSETS.find((a) => a.key === k);
  if (!spec) throw new Error(`unknown asset ${k}`);
  return spec;
});

function run(a: AssetSpec): Promise<string> {
  const args = [
    'generate', 'create', 'gpt_image_2_6',
    '--prompt', `"${a.prompt.replace(/"/g, "'")}"`,
    '--aspect_ratio', a.aspect,
    '--resolution', '2k',
    '--quality', 'high',
    '--output_format', 'png',
    '--wait', '--wait-timeout', '15m',
  ];
  if (a.transparent) args.push('--background', 'transparent');
  for (const r of a.refs ?? []) {
    const path = `${OUT}/${r}.png`;
    if (!existsSync(path)) throw new Error(`${a.key}: reference ${r} not generated yet`);
    args.push('--image-references', path);
  }
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, args, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      const url = out.match(/https:\/\/\S+?\.(png|jpg|jpeg|webp)/)?.[0];
      if (code === 0 && url) resolve(url);
      else reject(new Error(`${a.key}: exit ${code}\n${out.slice(-600)}`));
    });
  });
}

await Promise.all(
  jobs.map(async (a) => {
    const t = Date.now();
    try {
      const url = await run(a);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${a.key}: download ${res.status}`);
      writeFileSync(`${OUT}/${a.key}.png`, Buffer.from(await res.arrayBuffer()));
      manifest[a.key] = { prompt: a.prompt, url, at: new Date().toISOString() };
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`done  ${a.key}  ${((Date.now() - t) / 1000).toFixed(0)}s`);
    } catch (e) {
      console.log(`FAIL  ${(e as Error).message}`);
    }
  }),
);
console.log('ALL DONE');
