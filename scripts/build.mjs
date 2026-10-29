// Builds the static site into _site/: the gallery and the blog, in French (/) and
// English (/en/). Reads content/, media/ and data/activity.json.
//
// BASE_PATH (e.g. /site-projets-github) is set by the workflow when the site is
// served from a sub-folder; SITE_URL is its full address, for the RSS feed.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { parse } from 'yaml';
import { marked } from 'marked';

const OUT = '_site';
const LANGS = ['fr', 'en'];
const WEEKS = 12;
const BASE = (process.env.BASE_PATH ?? '').replace(/\/$/, '');
const url = (path) => BASE + path;

const T = {
  fr: {
    projects: 'Projets', blog: 'Blog', other: 'English', otherLang: 'en',
    kinds: { game: 'Jeu', app: 'Appli', explorable: 'Explorable', story: 'Histoire', engine: 'Moteur', tool: 'Outil' },
    never: 'pas encore de commit', commits: (n) => `${n} commit${n > 1 ? 's' : ''} ces 12 dernières semaines`,
    openSource: 'Open source', tba: 'Sortie : TBA', close: 'Fermer', noPosts: 'Rien pour l’instant.', back: '← Tous les articles',
    updated: 'Mis à jour le', langTag: { fr: '', en: 'EN' }, notFound: 'Cette page n’existe pas.', home: 'Retour à l’accueil',
  },
  en: {
    projects: 'Projects', blog: 'Blog', other: 'Français', otherLang: 'fr',
    kinds: { game: 'Game', app: 'App', explorable: 'Explorable', story: 'Story', engine: 'Engine', tool: 'Tool' },
    never: 'no commits yet', commits: (n) => `${n} commit${n > 1 ? 's' : ''} in the last 12 weeks`,
    openSource: 'Open source', tba: 'Release: TBA', close: 'Close', noPosts: 'Nothing yet.', back: '← All posts',
    updated: 'Updated', langTag: { fr: 'FR', en: '' }, notFound: 'This page doesn’t exist.', home: 'Back home',
  },
};

const site = parse(readFileSync('content/site.yml', 'utf8'));
const { projects } = parse(readFileSync('content/projects.yml', 'utf8'));
const activity = existsSync('data/activity.json')
  ? JSON.parse(readFileSync('data/activity.json', 'utf8'))
  : { repos: {} };
const now = Date.now();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.fr ?? v.en : v);
const prefix = (lang) => (lang === 'fr' ? '' : `/${lang}`);
const dateLabel = (iso, lang) =>
  new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function hue(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function write(path, html) {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ---- media ------------------------------------------------------------------

// Width and height of a JPEG or PNG, read from its header, so the page doesn't jump while loading.
function size(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

// media/<id>/ in name order: videos (with a same-named .jpg as poster) and images.
function findMedia(id) {
  const dir = join('media', id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const files = readdirSync(dir).sort();
  const stems = new Set(files.filter((f) => extname(f) === '.mp4').map((f) => basename(f, '.mp4')));
  return files.flatMap((f) => {
    const ext = extname(f).toLowerCase();
    const stem = basename(f, extname(f));
    const src = url(`/media/${id}/${f}`);
    if (ext === '.mp4') {
      const poster = files.find((p) => p !== f && basename(p, extname(p)) === stem);
      return [{ video: src, poster: poster && url(`/media/${id}/${poster}`), size: poster && size(join(dir, poster)) }];
    }
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && !stems.has(stem))
      return [{ image: src, size: ['.jpg', '.jpeg', '.png'].includes(ext) ? size(join(dir, f)) : null }];
    return [];
  });
}

const ratio = (m) => (m.size ? ` style="aspect-ratio:${m.size[0]}/${m.size[1]}"` : "");

function mediaTag(m, alt, { eager = false } = {}) {
  const dims = m.size ? ` width="${m.size[0]}" height="${m.size[1]}"` : '';
  if (m.video)
    return `<video muted loop playsinline preload="${eager ? 'metadata' : 'none'}"${m.poster ? ` poster="${m.poster}"` : ''}${dims} src="${m.video}" aria-label="${esc(alt)}"></video>`;
  return `<img src="${m.image}" alt="${esc(alt)}"${dims}${eager ? '' : ' loading="lazy"'} decoding="async">`;
}

// ---- projects ---------------------------------------------------------------

function weeks(commits = {}) {
  const counts = Array(WEEKS).fill(0);
  for (const [day, n] of Object.entries(commits)) {
    const age = Math.floor((now - Date.parse(day + 'T12:00:00Z')) / (7 * 864e5));
    if (age >= 0 && age < WEEKS) counts[WEEKS - 1 - age] += n;
  }
  return counts;
}

const items = projects
  .filter((p) => !p.hidden)
  .map((p) => {
    const repo = (p.repo && activity.repos[p.repo]) || {};
    return {
      ...p,
      media: findMedia(p.id),
      last: repo.last ?? null,
      repoUrl: repo.private === false ? repo.url : null,
      weeks: weeks(repo.commits),
    };
  })
  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.last ?? '').localeCompare(a.last ?? ''));

const maxWeek = Math.max(1, ...items.flatMap((p) => p.weeks));

function spark(p, t) {
  const total = p.weeks.reduce((a, b) => a + b, 0);
  const bars = p.weeks
    .map((n) => `<i style="--h:${n ? Math.max(0.15, Math.log1p(n) / Math.log1p(maxWeek)).toFixed(2) : 0}"></i>`)
    .join('');
  return `<span class="spark" title="${esc(t.commits(total))}" aria-label="${esc(t.commits(total))}">${bars}</span>`;
}

function meta(p, t, lang) {
  const when = p.last ? `<time datetime="${p.last}">${dateLabel(p.last, lang)}</time>` : `<span>${t.never}</span>`;
  return `<div class="meta">
      <span class="kind">${esc(t.kinds[p.kind] ?? p.kind ?? '')}</span>
      <span class="activity"${p.last ? ` data-last="${p.last}"` : ''}><i class="dot"></i>${when}</span>
      ${p.last ? spark(p, t) : ''}
    </div>`;
}

function cover(p, title) {
  const style = `--hue:${hue(p.id)}`;
  if (!p.media.length)
    return `<div class="media placeholder" style="${style}" aria-hidden="true"><span>${esc(title)}</span></div>`;
  if (p.format === 'phone')
    return `<div class="media phones n${Math.min(3, p.media.length)}" style="${style}">${p.media
      .slice(0, 3)
      .map((m) => `<div class="screen${m.size && m.size[0] > m.size[1] ? ' wide' : ''}"${ratio(m)}>${mediaTag(m, title)}</div>`)
      .join('')}</div>`;
  return `<div class="media" style="${style}">${mediaTag(p.media[0], title)}</div>`;
}

// The row at the bottom of a card or sheet: the project's links, "Open source" for a
// public repo, and "TBA" for a game that isn't out yet.
function linkRow(p, lang) {
  const t = T[lang];
  const links = [...(p.links ?? []).map((l) => [pick(l, lang), l.url]), ...(p.repoUrl ? [[t.openSource, p.repoUrl]] : [])];
  const chips = links.map(([label, href]) => `<a class="chip" href="${esc(href)}" rel="noopener">${esc(label)} ↗</a>`);
  if (p.kind === 'game' && !p.links?.length) chips.unshift(`<span class="chip tba">${t.tba}</span>`);
  return chips.length ? `<div class="links">${chips.join('')}</div>` : '';
}

function card(p, lang) {
  const title = pick(p.title, lang) ?? p.id;
  return `
<article class="card">
  ${cover(p, title)}
  <div class="body">
    ${meta(p, T[lang], lang)}
    <h2><a class="open" href="#${esc(p.id)}" data-project="${esc(p.id)}">${esc(title)}</a></h2>
    <p>${marked.parseInline(pick(p, lang) ?? '')}</p>
    ${linkRow(p, lang)}
  </div>
</article>`;
}

// The project sheet, opened over the gallery. Kept in a <template> until clicked.
function detail(p, lang) {
  const t = T[lang];
  const title = pick(p.title, lang) ?? p.id;
  // each line of `more` is its own paragraph, blank line or not
  const text = (pick(p.more, lang) ?? pick(p, lang) ?? '').replace(/\n+/g, '\n\n');
  const shots = p.media.length
    ? `<div class="shots${p.format === 'phone' ? ' phone' : ''}${p.media.length === 1 ? ' single' : ''}" style="--hue:${hue(p.id)}">${p.media
        .map((m) => `<figure class="shot${m.size && m.size[0] > m.size[1] ? ' wide' : ''}"${ratio(m)}>${mediaTag(m, title, { eager: true })}</figure>`)
        .join('')}</div>`
    : `<div class="media placeholder" style="--hue:${hue(p.id)}" aria-hidden="true"><span>${esc(title)}</span></div>`;
  return `<template id="detail-${esc(p.id)}">
  ${shots}
  <div class="sheet-text">
    ${meta(p, t, lang)}
    <h2>${esc(title)}</h2>
    ${marked.parse(text)}
    ${linkRow(p, lang)}
  </div>
</template>`;
}

// ---- blog -------------------------------------------------------------------

function readPosts() {
  if (!existsSync('content/posts')) return [];
  return readdirSync('content/posts')
    .filter((f) => /\.(fr|en)\.md$/.test(f))
    .map((f) => {
      const [, slug, lang] = f.match(/^(.+)\.(fr|en)\.md$/);
      const raw = readFileSync(join('content/posts', f), 'utf8').replace(/\r\n/g, '\n');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const meta = m ? parse(m[1]) : {};
      const date = meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : String(meta.date ?? '');
      return { slug, lang, title: meta.title ?? slug, date, draft: meta.draft, html: marked.parse(m ? m[2] : raw) };
    })
    .filter((p) => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date));
}

const posts = readPosts();
const postPath = (p) => `${prefix(p.lang)}/blog/${p.slug}/`;

// For each slug, the version in the page language if it exists, else the other one.
function postsFor(lang) {
  const bySlug = new Map();
  for (const p of posts) if (!bySlug.has(p.slug) || p.lang === lang) bySlug.set(p.slug, p);
  return [...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// ---- layout -----------------------------------------------------------------

function page({ lang, title, description, section, body, alt, redirect }) {
  const t = T[lang];
  const p = prefix(lang);
  const fullTitle = title ? `${title} · ${site.title}` : site.title;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<link rel="icon" href="${url('/assets/favicon.png')}" type="image/png">
<link rel="apple-touch-icon" href="${url('/assets/apple-touch-icon.png')}">
<link rel="stylesheet" href="${url('/assets/style.css')}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${url('/feed.xml')}">
${redirect ? `<script>try{if(!localStorage.getItem('lang')&&!navigator.languages.some(l=>l.startsWith('fr')))location.replace('${url('/en/')}'+location.hash)}catch(e){}</script>` : ''}
</head>
<body>
<header class="site">
  <a class="name" href="${url(p + '/')}"><img src="${url('/assets/logo.png')}" alt="" width="46" height="48">${esc(site.title)}</a>
  <nav>
    <a href="${url(p + '/')}"${section === 'projects' ? ' aria-current="page"' : ''}>${t.projects}</a>
    <a href="${url(p + '/blog/')}"${section === 'blog' ? ' aria-current="page"' : ''}>${t.blog}</a>
    <a class="lang" href="${url(alt)}" hreflang="${t.otherLang}" data-lang="${t.otherLang}">${t.other}</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site">
  <a href="https://github.com/${esc(site.github)}" rel="noopener">GitHub</a>
  <span>${t.updated} ${dateLabel(new Date(now).toISOString(), lang)}</span>
</footer>
<script src="${url('/assets/app.js')}" defer></script>
</body>
</html>
`;
}

// ---- pages ------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
cpSync('assets', join(OUT, 'assets'), { recursive: true });
if (existsSync('media')) cpSync('media', join(OUT, 'media'), { recursive: true });
if (site.domain) writeFileSync(join(OUT, 'CNAME'), site.domain + '\n');
writeFileSync(join(OUT, '.nojekyll'), '');

for (const lang of LANGS) {
  const t = T[lang];
  const p = prefix(lang);
  const other = prefix(t.otherLang);
  const tagline = pick(site.tagline, lang);

  write(`${p}/index.html`, page({
    lang, description: tagline, section: 'projects', alt: `${other}/`, redirect: lang === 'fr',
    body: `<p class="intro">${esc(tagline)}</p>
<section class="grid">${items.map((it) => card(it, lang)).join('')}
</section>
<dialog class="sheet" aria-label="${esc(t.projects)}">
  <button class="close" type="button" aria-label="${t.close}">×</button>
  <div class="sheet-body"></div>
</dialog>
${items.map((it) => detail(it, lang)).join('\n')}`,
  }));

  const list = postsFor(lang);
  write(`${p}/blog/index.html`, page({
    lang, title: t.blog, description: tagline, section: 'blog', alt: `${other}/blog/`,
    body: list.length
      ? `<ul class="posts">${list.map((po) => `
  <li><time datetime="${po.date}">${dateLabel(po.date, lang)}</time><a href="${url(postPath(po))}">${esc(po.title)}</a>${t.langTag[po.lang] ? ` <span class="tag">${t.langTag[po.lang]}</span>` : ''}</li>`).join('')}
</ul>`
      : `<p class="empty">${t.noPosts}</p>`,
  }));
}

for (const po of posts) {
  const t = T[po.lang];
  const twin = posts.find((x) => x.slug === po.slug && x.lang !== po.lang);
  write(`${postPath(po)}index.html`, page({
    lang: po.lang, title: po.title, description: po.title, section: 'blog',
    alt: twin ? postPath(twin) : `${prefix(t.otherLang)}/blog/`,
    body: `<article class="post">
<h1>${esc(po.title)}</h1>
<p class="date"><time datetime="${po.date}">${dateLabel(po.date, po.lang)}</time></p>
${po.html}
<p class="back"><a href="${url(prefix(po.lang) + '/blog/')}">${t.back}</a></p>
</article>`,
  }));
}

write('404.html', page({
  lang: 'fr', title: '404', description: T.fr.notFound, alt: '/en/',
  body: `<p class="empty">${T.fr.notFound} <a href="${url('/')}">${T.fr.home}</a></p>`,
}));

const siteUrl = (process.env.SITE_URL || (site.domain ? `https://${site.domain}` : `https://${site.github}.github.io${BASE}`)).replace(/\/$/, '');
write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<title>${esc(site.title)}</title><link>${siteUrl}/blog/</link><description>${esc(pick(site.tagline, 'fr'))}</description>
${posts.map((po) => `<item><title>${esc(po.title)}</title><link>${siteUrl}${postPath(po)}</link><guid>${siteUrl}${postPath(po)}</guid><pubDate>${new Date(po.date).toUTCString()}</pubDate><description>${esc(po.html)}</description></item>`).join('\n')}
</channel></rss>
`);

console.log(`Built ${items.length} projects, ${posts.length} posts → ${OUT}/${BASE ? ` (base ${BASE})` : ''}`);
