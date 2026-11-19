// Generates animation videos with Higgsfield Kling 4.0 (image-to-video).
//   npx.cmd tsx tools/art/gen-anims.ts <anim keys…>     → tools/art/out/anim/<key>.mp4
// Then: npx tsx tools/art/process-anims.ts
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ANIMS, MOTION_LOCK, type AnimSpec } from './anims';

const OUT = 'tools/art/out/anim';
const MANIFEST = `${OUT}/manifest.json`;
const CLI = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';
/** Higgsfield allows 8 concurrent jobs on this plan. */
const CONCURRENCY = 6;

const keys = process.argv.slice(2);
const jobs = (keys.length ? keys : ANIMS.map((a) => a.key)).map((k) => {
  const a = ANIMS.find((x) => x.key === k);
  if (!a) throw new Error(`unknown anim ${k}`);
  return a;
});
mkdirSync(OUT, { recursive: true });
const manifest: Record<string, unknown> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

function run(a: AnimSpec): Promise<string> {
  const key = `tools/art/out/keys/${a.subject}.png`;
  if (!existsSync(key)) throw new Error(`${a.key}: missing key frame ${key}`);
  const prompt = `${a.action}. ${MOTION_LOCK}`.replace(/"/g, "'");
  const args = [
    'generate', 'create', 'kling4_0',
    '--mode', 'image-to-video',
    '--start-image', key,
    ...(a.loop ? ['--end-image', key] : []),
    '--prompt', `"${prompt}"`,
    '--aspect_ratio', '1:1',
    '--duration', '5',
    '--resolution', a.resolution ?? '1080p',
    '--wait', '--wait-timeout', '30m',
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, args, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      const url = out.match(/https:\/\/\S+?\.mp4/)?.[0];
      if (code === 0 && url) resolve(url);
      else reject(new Error(`${a.key}: exit ${code}\n${out.slice(-500)}`));
    });
  });
}

async function worker(queue: AnimSpec[]) {
  for (let a = queue.shift(); a; a = queue.shift()) {
    const t = Date.now();
    try {
      const url = await run(a);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${a.key}: download ${res.status}`);
      writeFileSync(`${OUT}/${a.key}.mp4`, Buffer.from(await res.arrayBuffer()));
      manifest[a.key] = { url, at: new Date().toISOString() };
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`done  ${a.key}  ${((Date.now() - t) / 1000).toFixed(0)}s`);
    } catch (e) {
      console.log(`FAIL  ${(e as Error).message}`);
    }
  }
}

console.log(`videos: ${jobs.map((j) => j.key).join(', ')}`);
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));
console.log('ALL DONE');
