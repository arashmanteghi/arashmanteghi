// Builds the profile SVGs in assets/ from live GitHub data.
// Run: GITHUB_TOKEN=xxx node scripts/generate.mjs  (Node 20+, no dependencies)
import { mkdir, writeFile } from 'node:fs/promises';

const LOGIN = process.env.PROFILE_LOGIN || 'arashmanteghi';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is required');

const W = 840;
const FONT = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const gh = async (path, body) => {
  const res = await fetch(`https://api.github.com/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `bearer ${TOKEN}`, 'User-Agent': 'profile-readme-generator' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json;
};

const query = `query($login:String!,$since:GitTimestamp!){user(login:$login){
  login name bio company location websiteUrl twitterUsername createdAt
  followers{totalCount} following{totalCount}
  socialAccounts(first:10){nodes{provider url}}
  repositories(first:100,ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC,orderBy:{field:STARGAZERS,direction:DESC}){
    totalCount
    nodes{name description url stargazerCount forkCount pushedAt
      primaryLanguage{name color}
      languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}}
  active:repositories(first:20,ownerAffiliations:OWNER,privacy:PUBLIC,orderBy:{field:PUSHED_AT,direction:DESC}){
    nodes{name pushedAt primaryLanguage{name}
      defaultBranchRef{target{... on Commit{history(since:$since){totalCount}}}}}}
  contributionsCollection{
    totalCommitContributions totalPullRequestContributions totalIssueContributions
    totalPullRequestReviewContributions restrictedContributionsCount
    contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`;

// ---------- helpers ----------
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cut = (s = '', n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));
const ago = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d < 1 ? 'today' : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
};

// One SVG per visual; colors follow the viewer's light/dark preference.
const svg = (h, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
<style>
svg{--fg:#1f2328;--mute:#656d76;--line:#d0d7de;--soft:#f6f8fa;--acc:#1a7f37}
@media (prefers-color-scheme:dark){svg{--fg:#e6edf3;--mute:#8b949e;--line:#30363d;--soft:#161b22;--acc:#3fb950}}
text{font-family:${FONT};fill:var(--fg);white-space:pre}
.m{fill:var(--mute)}.b{font-weight:700}.acc{fill:var(--acc)}
.box{fill:none;stroke:var(--line)}
.fade{animation:in .6s ease backwards}
@keyframes in{from{opacity:0}}
@keyframes blink{50%{opacity:0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;opacity:1!important}}
</style>
${body}
</svg>`;

const section = (n, title) =>
  `<text x="24" y="34" font-size="13" class="m">${String(n).padStart(2, '0')} ── <tspan class="b" style="fill:var(--fg)">${esc(title)}</tspan></text>
<line x1="24" y1="48" x2="${W - 24}" y2="48" stroke="var(--line)"/>`;

// ---------- visuals ----------
const header = (u) => {
  const years = new Date().getFullYear() - new Date(u.createdAt).getFullYear();
  return svg(190, `
<rect class="box" x="0.5" y="0.5" width="${W - 1}" height="189" rx="10"/>
<circle cx="28" cy="26" r="5" fill="#ff5f57"/><circle cx="46" cy="26" r="5" fill="#febc2e"/><circle cx="64" cy="26" r="5" fill="#28c840"/>
<text x="${W / 2}" y="30" font-size="12" class="m" text-anchor="middle">~/${esc(u.login)}</text>
<text x="32" y="82" font-size="15" class="m">$ echo $USER</text>
<text x="32" y="122" font-size="34" class="b">${esc(u.name || u.login)}<tspan class="acc" style="animation:blink 1s step-end infinite">_</tspan></text>
<text x="32" y="156" font-size="15" class="m">${esc(cut(u.bio || '', 60))}</text>
<circle cx="${W - 150}" cy="152" r="4" class="acc" style="animation:pulse 2s ease-in-out infinite"/>
<text x="${W - 140}" y="156" font-size="12" class="m">${years}y on github</text>`, `${u.name} — ${u.bio}`);
};

const whoami = (u) => {
  const rows = [
    ['name', u.name],
    ['role', u.bio],
    ['company', u.company?.trim()],
    ['location', u.location],
    ['web', u.websiteUrl?.replace(/^https?:\/\//, '')],
    ['x', u.twitterUsername && `@${u.twitterUsername}`],
    // social links from the profile; X is already shown above. GENERIC ones are labelled by domain (codepen, hashnode…)
    ...u.socialAccounts.nodes
      .filter((s) => s.provider !== 'TWITTER')
      .map((s) => {
        const host = new URL(s.url).hostname.replace(/^www\./, '');
        const label = s.provider === 'GENERIC' ? host.split('.').at(-2) : s.provider.toLowerCase();
        return [label, `${host}${new URL(s.url).pathname}`.replace(/\/$/, '')];
      }),
    ['since', `${u.createdAt.slice(0, 10)} (${ago(u.createdAt)})`],
    ['network', `${u.followers.totalCount} followers · ${u.following.totalCount} following`],
  ].filter(([, v]) => v);
  const h = 104 + rows.length * 24;
  const lines = rows
    .map(([k, v], i) => `<text x="40" y="${100 + i * 24}" font-size="14" class="fade" style="animation-delay:${i * 0.12}s"><tspan class="m">${k.padEnd(10)}</tspan>${esc(cut(v, 80))}</text>`)
    .join('\n');
  return svg(h, `${section(1, 'whoami')}
<text x="24" y="76" font-size="14"><tspan class="acc">➜</tspan> <tspan class="m">whoami --verbose</tspan></text>
${lines}`, 'About me');
};

const telemetry = (u) => {
  const c = u.contributionsCollection;
  const repos = u.repositories.nodes;
  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
  const tiles = [
    ['contributions', c.contributionCalendar.totalContributions + c.restrictedContributionsCount],
    ['commits', c.totalCommitContributions],
    ['pull requests', c.totalPullRequestContributions],
    ['reviews', c.totalPullRequestReviewContributions],
    ['stars earned', stars],
    ['public repos', u.repositories.totalCount],
  ];
  const tw = (W - 48 - 5 * 12) / 6;
  const tileSvg = tiles
    .map(([label, v], i) => {
      const x = 24 + i * (tw + 12);
      return `<g class="fade" style="animation-delay:${i * 0.1}s"><rect x="${x}" y="66" width="${tw}" height="76" rx="8" fill="var(--soft)" stroke="var(--line)"/>
<text x="${x + 14}" y="104" font-size="24" class="b">${fmt(v)}</text>
<text x="${x + 14}" y="128" font-size="11" class="m">${label}</text></g>`;
    })
    .join('\n');

  // languages by bytes across all owned repos
  const bytes = new Map();
  for (const r of repos)
    for (const { size, node } of r.languages.edges) {
      const cur = bytes.get(node.name) || { size: 0, color: node.color || '#8b949e' };
      cur.size += size;
      bytes.set(node.name, cur);
    }
  const total = [...bytes.values()].reduce((s, l) => s + l.size, 0) || 1;
  const langs = [...bytes].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const barW = W - 48;
  let x = 24;
  const bar = langs
    .map(([, l]) => {
      const w = (l.size / total) * barW;
      const seg = `<rect x="${x}" y="178" width="${w}" height="10" fill="${l.color}"><animate attributeName="width" from="0" to="${w}" dur="1s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/></rect>`;
      x += w;
      return seg;
    })
    .join('');
  const legend = langs
    .map(([name, l], i) => {
      const lx = 24 + (i % 3) * 270, ly = 214 + Math.floor(i / 3) * 22;
      return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/><text x="${lx + 16}" y="${ly}" font-size="12">${esc(name)} <tspan class="m">${((l.size / total) * 100).toFixed(1)}%</tspan></text>`;
    })
    .join('\n');

  return svg(258, `${section(2, 'telemetry · last 12 months')}
${tileSvg}
<text x="24" y="166" font-size="12" class="m">languages across ${repos.length} repos</text>
<clipPath id="r"><rect x="24" y="178" width="${barW}" height="10" rx="5"/></clipPath>
<rect x="24" y="178" width="${barW}" height="10" rx="5" fill="var(--soft)"/>
<g clip-path="url(#r)">${bar}</g>
${legend}`, 'GitHub statistics and languages');
};

const activity = (u) => {
  const weeks = u.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
  const max = Math.max(1, ...weeks);
  const chartH = 120, base = 196, gap = 3;
  const bw = (W - 48 - gap * (weeks.length - 1)) / weeks.length;
  const bars = weeks
    .map((v, i) => {
      const h = Math.max(2, (v / max) * chartH);
      return `<rect x="${(24 + i * (bw + gap)).toFixed(1)}" y="${base - h}" width="${bw.toFixed(1)}" height="${h}" rx="1.5" fill="var(--fg)" opacity="${v ? 0.35 + 0.65 * (v / max) : 0.12}" class="fade" style="animation-delay:${(i * 0.015).toFixed(2)}s"/>`;
    })
    .join('\n');
  const first = u.contributionsCollection.contributionCalendar.weeks[0].contributionDays[0].date;
  return svg(230, `${section(3, 'activity · weekly contributions')}
<text x="${W - 24}" y="34" font-size="12" class="m" text-anchor="end">peak ${max}/week</text>
${bars}
<text x="24" y="218" font-size="11" class="m">${first}</text>
<text x="${W - 24}" y="218" font-size="11" class="m" text-anchor="end">today</text>`, 'Weekly contribution activity');
};

// Always shown; any free slots are filled with the next most-starred public repos.
const FEATURED = ['git-helper', 'fity-react', 'fity-node', 'simptip', 'national-code', 'modalian'];

const projects = (u) => {
  // repos come from the query already public-only and sorted by stars
  const repos = u.repositories.nodes.filter((r) => r.name !== u.login);
  const top = [...repos.filter((r) => FEATURED.includes(r.name)), ...repos.filter((r) => !FEATURED.includes(r.name))].slice(0, 6);
  const cw = (W - 48 - 16) / 2, ch = 92;
  const cards = top
    .map((r, i) => {
      const x = 24 + (i % 2) * (cw + 16), y = 66 + Math.floor(i / 2) * (ch + 14);
      const lang = r.primaryLanguage;
      return `<g class="fade" style="animation-delay:${i * 0.1}s"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="8" fill="var(--soft)" stroke="var(--line)"/>
<text x="${x + 16}" y="${y + 28}" font-size="14" class="b">${esc(cut(r.name, 34))}</text>
<text x="${x + 16}" y="${y + 50}" font-size="12" class="m">${esc(cut(r.description || 'no description', 48))}</text>
${lang ? `<circle cx="${x + 21}" cy="${y + 72}" r="5" fill="${lang.color || '#8b949e'}"/><text x="${x + 32}" y="${y + 76}" font-size="11" class="m">${esc(lang.name)}</text>` : ''}
<text x="${x + cw - 16}" y="${y + 76}" font-size="11" class="m" text-anchor="end">★ ${fmt(r.stargazerCount)}   ⑂ ${fmt(r.forkCount)}   ${ago(r.pushedAt)}</text></g>`;
    })
    .join('\n');
  const rowsN = Math.ceil(top.length / 2);
  return svg(66 + rowsN * (ch + 14) + 10, `${section(4, 'projects · featured')}
${cards}`, 'Top projects');
};


const commits = (r) => r.defaultBranchRef?.target?.history?.totalCount ?? 0;

// Own public repos with commits in the last 12 months, most recently pushed first.
const log = (u) => {
  const rows = u.active.nodes.filter((r) => r.name !== u.login && commits(r) > 0).slice(0, 8);
  const lines = rows.length
    ? rows
        .map((r, i) => {
          const n = commits(r);
          return `<text x="24" y="${82 + i * 24}" font-size="13" class="fade" style="animation-delay:${i * 0.1}s"><tspan class="m">${r.pushedAt.slice(0, 10)}</tspan>  <tspan>${esc(cut(r.name, 36).padEnd(38))}</tspan><tspan class="m">${esc((r.primaryLanguage?.name || '').padEnd(14))}</tspan><tspan class="acc">${n} commit${n === 1 ? '' : 's'}</tspan></text>`;
        })
        .join('\n')
    : `<text x="24" y="82" font-size="13" class="m">quiet lately…</text>`;
  return svg(70 + Math.max(1, rows.length) * 24, `${section(5, 'log · public repos · last 12 months')}
${lines}`, 'Recent activity across my repositories');
};

const footer = () =>
  svg(44, `<text x="${W / 2}" y="26" font-size="11" class="m" text-anchor="middle">auto-synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · built by a GitHub Action from live data</text>`, 'Last sync');

// ---------- main ----------
const since = new Date(Date.now() - 365 * 864e5).toISOString();
const { data } = await gh('graphql', { query, variables: { login: LOGIN, since } });
const u = data.user;
if (!u) throw new Error(`user ${LOGIN} not found`);

const out = {
  header: header(u),
  whoami: whoami(u),
  telemetry: telemetry(u),
  activity: activity(u),
  projects: projects(u),
  log: log(u),
  footer: footer(),
};
await mkdir('assets', { recursive: true });
await Promise.all(Object.entries(out).map(([name, s]) => writeFile(`assets/${name}.svg`, s)));
console.log(`wrote ${Object.keys(out).length} SVGs for ${LOGIN}`);
