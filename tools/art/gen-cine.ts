// Cutscene production with the Higgsfield CLI.
//   npx.cmd tsx tools/art/gen-cine.ts refs            reference images
//   npx.cmd tsx tools/art/gen-cine.ts frames [keys]   first frames
//   npx.cmd tsx tools/art/gen-cine.ts videos [keys]   videos → public/assets/cinematics/<key>.mp4
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { FRAMES, GAME_FRAMES, GAME_VIDEOS, MOTION_TAIL, REFS, VIDEOS, type CineImage, type CineVideo } from './cinematics-spec';

const OUT = 'tools/art/out/cine';
const PUBLIC = 'public/assets/cinematics';
const CLI = process.platform === 'win32' ? 'higgsfield.cmd' : 'higgsfield';
const CONCURRENCY = 6;

const [stage, ...only] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
mkdirSync(PUBLIC, { recursive: true });

function refPath(r: string): string {
  const p = r.startsWith('v2:') ? `tools/art/out/v2/${r.slice(3)}.png` : `${OUT}/${r}.png`;
  if (!existsSync(p)) throw new Error(`missing reference ${p}`);
  return p;
}

function run(args: string[], ext: RegExp): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, args, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      const url = out.match(ext)?.[0];
      if (code === 0 && url) resolve(url);
      else reject(new Error(`exit ${code}\n${out.slice(-400)}`));
    });
  });
}

async function save(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function image(i: CineImage) {
  const args = ['generate', 'create', 'gpt_image_2_6', '--prompt', `"${i.prompt.replace(/"/g, "'")}"`, '--aspect_ratio', i.aspect, '--resolution', '2k', '--quality', 'high', '--output_format', 'png', '--wait', '--wait-timeout', '15m'];
  for (const r of i.refs) args.push('--image-references', refPath(r));
  const url = await run(args, /https:\/\/\S+?\.(png|jpg|jpeg|webp)/);
  await save(url, `${OUT}/${i.key}.png`);
}

async function video(v: CineVideo) {
  const start = `${OUT}/${v.frame}.png`;
  if (!existsSync(start)) throw new Error(`missing first frame ${start}`);
  const prompt = `${v.motion} ${MOTION_TAIL}`.replace(/"/g, "'");
  const args = ['generate', 'create', 'kling4_0', '--mode', 'image-to-video', '--start-image', start, '--prompt', `"${prompt}"`, '--aspect_ratio', '16:9', '--duration', String(v.seconds), '--resolution', '1080p', '--wait', '--wait-timeout', '40m'];
  const url = await run(args, /https:\/\/\S+?\.mp4/);
  await save(url, `${PUBLIC}/${v.key}.mp4`);
}

async function pool<T extends { key: string }>(items: T[], fn: (t: T) => Promise<void>) {
  const queue = [...items];
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const t = Date.now();
      try {
        await fn(it);
        console.log(`done  ${it.key}  ${((Date.now() - t) / 1000).toFixed(0)}s`);
      } catch (e) {
        console.log(`FAIL  ${it.key}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

const pick = <T extends { key: string }>(list: T[]) => (only.length ? list.filter((x) => only.includes(x.key)) : list);

if (stage === 'refs') {
  // ref_smith first: the others are made from it
  const list = pick(REFS);
  const first = list.filter((r) => r.refs.every((x) => x.startsWith('v2:')));
  await pool(first, image);
  await pool(list.filter((r) => !first.includes(r)), image);
} else if (stage === 'frames') await pool(pick(FRAMES), image);
else if (stage === 'videos') await pool(pick(VIDEOS), video);
// game-style sample: frame, then a 5 s 720p clip into tools/art/out/cine (not the game) for approval
else if (stage === 'gframes') await pool(pick(GAME_FRAMES), image);
else if (stage === 'gvideos')
  await pool(pick(GAME_VIDEOS), async (v) => {
    const start = `${OUT}/${v.frame}.png`;
    const prompt = `${v.motion} Hand-drawn 2D cartoon animation, same art style as the image, smooth natural motion, consistent faces, no text appears.`.replace(/"/g, "'");
    const args = ['generate', 'create', 'kling4_0', '--mode', 'image-to-video', '--start-image', start, '--prompt', `"${prompt}"`, '--aspect_ratio', '16:9', '--duration', String(v.seconds), '--resolution', '720p', '--wait', '--wait-timeout', '40m'];
    const url = await run(args, /https:\/\/\S+?\.mp4/);
    await save(url, `${OUT}/${v.key}.mp4`);
  });
else throw new Error('stage: refs | frames | videos');
console.log('ALL DONE');
