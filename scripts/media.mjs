// Turns a screen recording, a GIF or a screenshot into what the gallery wants,
// inside media/<id>/ (the files are shown in name order; the first one is the cover):
//   video/GIF → <name>.mp4 (H.264, no sound, ≤960 px, a few seconds) + <name>.jpg poster
//   image     → <name>.jpg (≤1600 px)
//
//   npm run media -- <file> <id> [name] [start seconds] [duration seconds]
//   name defaults to the file's own name; prefix it with 01-, 02-… to choose the order.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.avif']);
const FIT = "scale='min(960\\,iw)':'min(960\\,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
const FIT_IMAGE = "scale='min(1600\\,iw)':'min(1600\\,ih)':force_original_aspect_ratio=decrease";

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.error) throw new Error('ffmpeg not found: install it (winget install Gyan.FFmpeg)');
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function convert(input, id, name, start = 0, duration = 8) {
  const dir = `media/${id}`;
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/${slug(name)}`;
  if (IMAGE.has(extname(input).toLowerCase())) {
    if (existsSync(`${out}.mp4`)) rmSync(`${out}.mp4`);
    ffmpeg(['-i', input, '-vf', FIT_IMAGE, '-q:v', '3', `${out}.jpg`]);
    console.log(`${out}.jpg  ${kb(`${out}.jpg`)}`);
    return;
  }
  ffmpeg([
    '-ss', String(start), '-t', String(duration), '-i', input,
    '-an', '-vf', `fps=30,${FIT}`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '31',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    `${out}.mp4`,
  ]);
  ffmpeg(['-ss', String(start + Math.min(1, duration / 2)), '-i', input, '-frames:v', '1', '-vf', FIT, '-q:v', '3', `${out}.jpg`]);
  console.log(`${out}.mp4  ${kb(`${out}.mp4`)}   poster ${out}.jpg  ${kb(`${out}.jpg`)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, id, name, start, duration] = process.argv.slice(2);
  if (!input || !id) {
    console.log('Usage: npm run media -- <file> <id> [name] [start seconds] [duration seconds]');
    process.exit(1);
  }
  convert(resolve(input), id, name || basename(input, extname(input)), Number(start ?? 0), Number(duration ?? 8));
}
