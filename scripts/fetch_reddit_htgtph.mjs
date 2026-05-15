/**
 * Fetch commute guides from r/HowToGetTherePH (public JSON API).
 * Outputs reviewable JSON — run import:community after approving routes.
 *
 * Usage:
 *   node scripts/fetch_reddit_htgtph.mjs
 *   node scripts/fetch_reddit_htgtph.mjs --limit=50 --sort=top --time=year
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_RAW = path.join(__dirname, '..', 'commute-data', 'reddit-htgtph-raw.json');
const OUT_ROUTES = path.join(__dirname, '..', 'commute-data', 'reddit-htgtph-routes.json');

const SUBREDDIT = 'HowToGetTherePH';
const USER_AGENT = 'CommuteManila/1.0 (community-import; contact: commute-manila)';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 100, sort: 'top', time: 'all', pages: 3 };
  for (const a of args) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'limit') opts.limit = Math.min(100, parseInt(v, 10) || 100);
    if (k === 'sort') opts.sort = v || 'top';
    if (k === 'time') opts.time = v || 'all';
    if (k === 'pages') opts.pages = parseInt(v, 10) || 3;
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SKIP_TITLE =
  /\b(faq|cheatsheet|guide|modus|snatcher|beware|question:|paano bumaba|megathread|weekly)\b/i;
const PLACE_HINT =
  /\b(cubao|divisoria|makati|bgc|ortigas|fairview|pitx|naia|lawton|quiapo|edsa|mrt|lrt|sm |up diliman|taguig|pasig|manila|quezon|caloocan|paranaque|pasay|mandaluyong|marikina|antipolo|alabang|trinoma|novaliches|baclaran|monumento)\b/i;

function looksLikePlace(text) {
  const t = text.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/^(how|what|why|for|not|sorry|have|is it|edit)\b/i.test(t)) return false;
  if (/^(get there|cause fear|ride a)\b/i.test(t)) return false;
  if (PLACE_HINT.test(t)) return true;
  // Title-case landmark or "X, City" pattern
  if (/,\s*(quezon|manila|makati|pasay|taguig|mandaluyong|pasig|caloocan|paranaque|muntinlupa)/i.test(t))
    return true;
  return /^[A-Z0-9][\w\s.'/-]{2,}$/.test(t) && t.split(/\s+/).length <= 8;
}

/** "How to get from Cubao to Divisoria" — strict parsing for real OD pairs */
function parseOriginDest(title, selftext) {
  if (SKIP_TITLE.test(title)) return null;

  const titleOnly = title.replace(/\s+/g, ' ').trim();
  const patterns = [
    /how\s+to\s+get\s+(?:from\s+)?(.+?)\s+to\s+(.+?)(?:\?|$)/i,
    /commute\s+from\s+(.+?)\s+to\s+(.+?)(?:\?|$)/i,
    /^(.+?)\s+to\s+(.+?)(?:\?|$)/i,
  ];

  for (const re of patterns) {
    const m = titleOnly.match(re);
    if (!m) continue;
    const origin = m[1].replace(/[\[\]()]/g, '').trim();
    const dest = m[2].replace(/[\[\]()]/g, '').trim();
    if (looksLikePlace(origin) && looksLikePlace(dest) && origin.toLowerCase() !== dest.toLowerCase()) {
      return { originText: origin, destText: dest };
    }
  }

  // Body: "from Cubao to Divisoria" in first 500 chars
  const bodyHead = (selftext || '').slice(0, 500);
  const bodyMatch = bodyHead.match(/from\s+([A-Za-z0-9][\w\s.'/-]{2,50}?)\s+to\s+([A-Za-z0-9][\w\s.'/-]{2,50}?)(?:\.|,|\n|$)/i);
  if (bodyMatch) {
    const origin = bodyMatch[1].trim();
    const dest = bodyMatch[2].trim();
    if (looksLikePlace(origin) && looksLikePlace(dest)) {
      return { originText: origin, destText: dest };
    }
  }

  return null;
}

function extractModes(text) {
  const modes = [];
  const checks = [
    [/jeep(?:ney)?/i, 'jeepney'],
    [/mrt[- ]?3|mrt\b/i, 'mrt-3'],
    [/lrt[- ]?1/i, 'lrt-1'],
    [/lrt[- ]?2/i, 'lrt-2'],
    [/bus|carousel|p2p/i, 'bus'],
    [/uv\s*express/i, 'uv'],
    [/grab|tnvs|angkas|joyride/i, 'ride_hail'],
    [/ferry/i, 'ferry'],
    [/tricycle|trike/i, 'tricycle'],
    [/fx\b/i, 'uv'],
  ];
  for (const [re, slug] of checks) {
    if (re.test(text) && !modes.includes(slug)) modes.push(slug);
  }
  return modes;
}

function extractFareHint(text) {
  const m = text.match(/(?:₱|php|peso[s]?)\s*(\d+(?:\.\d{2})?)/i) || text.match(/(\d+)\s*(?:pesos|php)/i);
  return m ? parseFloat(m[1]) : null;
}

function summarizeDirections(selftext, maxLen = 500) {
  if (!selftext) return null;
  const lines = selftext
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^edit:/i.test(l));
  const joined = lines.slice(0, 12).join(' ');
  return joined.length > maxLen ? `${joined.slice(0, maxLen)}…` : joined;
}

async function fetchListing(sort, limit, after, time) {
  const params = new URLSearchParams({ limit: String(limit), raw_json: '1' });
  if (sort === 'top') params.set('t', time);
  if (after) params.set('after', after);

  const url = `https://www.reddit.com/r/${SUBREDDIT}/${sort}.json?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Reddit ${res.status}: ${url}`);
  return res.json();
}

async function main() {
  const opts = parseArgs();
  const autoApproveScore = parseInt(
    process.argv.find((a) => a.startsWith('--auto-approve-score='))?.split('=')[1] || '0',
    10
  );
  const allPosts = [];
  let after = null;

  for (let page = 0; page < opts.pages; page++) {
    console.log(`Fetching r/${SUBREDDIT}/${opts.sort} page ${page + 1}…`);
    const json = await fetchListing(opts.sort, opts.limit, after, opts.time);
    const children = json?.data?.children || [];
    for (const c of children) {
      if (c.kind === 't3') allPosts.push(c.data);
    }
    after = json?.data?.after;
    if (!after) break;
    await sleep(2000);
  }

  const raw = allPosts.map((p) => ({
    id: p.id,
    title: p.title,
    selftext: p.selftext,
    url: `https://www.reddit.com${p.permalink}`,
    score: p.score,
    numComments: p.num_comments,
    createdUtc: p.created_utc,
    linkFlair: p.link_flair_text,
  }));

  const existingRoutes = fs.existsSync(OUT_ROUTES)
    ? JSON.parse(fs.readFileSync(OUT_ROUTES, 'utf8'))
    : { version: 1, routes: [] };
  const approvedIds = new Set(
    existingRoutes.routes.filter((r) => r.status === 'approved').map((r) => r.redditId)
  );

  const routes = [];
  let parsed = 0;

  for (const p of raw) {
    const od = parseOriginDest(p.title, p.selftext);
    if (!od) continue;
    parsed++;

    const directions = summarizeDirections(p.selftext);
    const modes = extractModes(`${p.title}\n${p.selftext}`);
    const fareHint = extractFareHint(p.selftext);

    const status =
      approvedIds.has(p.id) || (autoApproveScore > 0 && p.score >= autoApproveScore)
        ? 'approved'
        : 'pending';

    routes.push({
      redditId: p.id,
      title: p.title,
      originText: od.originText,
      destText: od.destText,
      modes,
      fareHint,
      directions,
      communityUrl: p.url,
      score: p.score,
      numComments: p.numComments,
      createdUtc: p.createdUtc,
      status,
      source: 'reddit_htgtph',
    });
  }

  // Merge: keep approved status from previous file
  const prevById = Object.fromEntries(
    (existingRoutes.routes || []).map((r) => [r.redditId, r])
  );
  for (const r of routes) {
    if (prevById[r.redditId]?.status === 'approved') r.status = 'approved';
  }

  fs.writeFileSync(OUT_RAW, JSON.stringify({ fetchedAt: new Date().toISOString(), posts: raw }, null, 2));
  fs.writeFileSync(
    OUT_ROUTES,
    JSON.stringify(
      {
        version: 1,
        subreddit: SUBREDDIT,
        fetchedAt: new Date().toISOString(),
        note: 'Set status to "approved" on routes you want imported, then run npm run import:community',
        routes: routes.sort((a, b) => b.score - a.score),
      },
      null,
      2
    )
  );

  console.log(`Fetched ${raw.length} posts → ${parsed} routes with origin/dest parsed`);
  console.log(`  Raw: ${OUT_RAW}`);
  console.log(`  Routes: ${OUT_ROUTES}`);
  console.log(`  Approved in file: ${routes.filter((r) => r.status === 'approved').length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
