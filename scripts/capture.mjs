// Opens web projects in Chrome, plays the steps listed in content/captures.yml,
// then films a few seconds (or takes a screenshot) into media/<id>/.
//
//   npm run capture              every entry of captures.yml
//   npm run capture -- tamagosea only these ids

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { chromium } from 'playwright-core';
import { convert } from './media.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};

// Serves a folder (a project's built web app) on a free port.
function serve(root) {
  const server = createServer(async (req, res) => {
    let file = join(root, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

const all = parse(readFileSync('content/captures.yml', 'utf8'));
const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : Object.keys(all);
// an id can hold one capture or a list of them
const jobs = ids.flatMap((id) => [all[id] ?? null].flat().map((c) => [id, c]));

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch {}
  }
  throw new Error('Neither Chrome nor Edge could be started.');
}

const browser = await launch();

for (const [id, c] of jobs) {
  if (!c) {
    console.warn(`${id}: not in captures.yml`);
    continue;
  }
  const [width, height] = c.size ?? [1280, 800];
  const dir = mkdtempSync(join(tmpdir(), 'capture-'));
  const server = c.serve ? await serve(c.serve) : null;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: c.record ? 1 : (c.scale ?? 1),
    isMobile: Boolean(c.mobile),
    hasTouch: Boolean(c.mobile),
    ...(c.record ? { recordVideo: { dir, size: { width, height } } } : {}),
  });
  if (c.storage) await context.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)) }, c.storage);
  const started = Date.now();
  const page = await context.newPage();
  const url = server
    ? `http://localhost:${server.address().port}/${c.open ?? ''}`
    : /^https?:/.test(c.open) ? c.open : pathToFileURL(c.open).href;

  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    for (const step of c.steps ?? []) {
      console.log(`${id}: ${JSON.stringify(step)}`);
      if (step.click) await page.locator(step.click).filter({ visible: true }).first().click({ timeout: 10000 });
      if (step.press) await page.keyboard.press(step.press);
      if (step.tap) await page.touchscreen.tap(...step.tap);
      if (step.type) await page.keyboard.type(step.type, { delay: 40 });
      if (step.scroll) await page.mouse.wheel(0, step.scroll);
      if (step.wait) await page.waitForTimeout(step.wait);
    }
  } catch (err) {
    console.error(`${id}: step failed, skipped (${err.message.split('\n')[0]})`);
    await context.close();
    server?.close();
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  const name = c.name ?? 'capture';
  if (c.record) {
    const offset = (Date.now() - started) / 1000;
    await page.waitForTimeout(c.record * 1000);
    const video = page.video();
    await context.close();
    convert(await video.path(), id, name, offset, c.record);
  } else {
    const shot = join(dir, 'shot.png');
    await page.screenshot({ path: shot });
    await context.close();
    convert(shot, id, name);
  }
  server?.close();
  rmSync(dir, { recursive: true, force: true });
}

await browser.close();
