// Fetches, for each project repo, the date of its last commit and its commits per
// day over the last 12 weeks, into data/activity.json. The file only changes when
// a repo gets new commits, so the daily workflow doesn't commit noise.
//
// Token: PROJECTS_TOKEN or GH_TOKEN, or else whatever `gh auth token` gives locally.
// A repo that can't be read keeps its previous entry.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

const WINDOW_DAYS = 84;
const OUT = 'data/activity.json';

const site = parse(readFileSync('content/site.yml', 'utf8'));
const { projects } = parse(readFileSync('content/projects.yml', 'utf8'));
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { repos: {} };

function token() {
  if (process.env.PROJECTS_TOKEN) return process.env.PROJECTS_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'lihogloglo-site' };
const t = token();
if (t) headers.Authorization = `Bearer ${t}`;
else console.warn('No token: only public repos will be read.');

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 409) return []; // empty repository
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function readRepo(owner, name) {
  const repo = await gh(`/repos/${owner}/${name}`);
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const commits = {};
  let last = null;
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${owner}/${name}/commits?since=${since}&per_page=100&page=${page}`);
    for (const c of batch) {
      const date = c.commit.committer.date;
      if (!last || date > last) last = date;
      const day = date.slice(0, 10);
      commits[day] = (commits[day] || 0) + 1;
    }
    if (batch.length < 100) break;
  }
  if (!last) {
    const [latest] = await gh(`/repos/${owner}/${name}/commits?per_page=1`);
    last = latest?.commit.committer.date ?? null;
  }
  const sorted = Object.fromEntries(Object.entries(commits).sort());
  return { last, private: repo.private, url: repo.html_url, commits: sorted };
}

const repos = {};
for (const p of projects) {
  if (!p.repo) continue;
  try {
    repos[p.repo] = await readRepo(site.github, p.repo);
    console.log(`${p.repo.padEnd(24)} ${repos[p.repo].last ?? '—'}`);
  } catch (err) {
    console.warn(`${p.repo.padEnd(24)} kept previous (${err.message})`);
    if (previous.repos[p.repo]) repos[p.repo] = previous.repos[p.repo];
  }
}

if (JSON.stringify(repos) !== JSON.stringify(previous.repos)) {
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), repos }, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
} else {
  console.log('No change.');
}
