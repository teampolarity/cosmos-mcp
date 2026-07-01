// Plain-JS port of cosmos-mcp's src/sources/browser/filter.ts. Reads
// the same shared filter-rules.json the CLI does (synced via
// scripts/sync-filter-rules.sh). The filtering decisions must stay in
// lockstep with the CLI so a URL the user dropped via the extension
// matches the same URL dropped via `cosmos-mcp browser sync`.
//
// Exported as ES module so background.js (the MV3 service worker)
// can `import { dedupeAndFilter } from './filter.js'`.

import rules from './shared/filter-rules.json' with { type: 'json' };

const NOISE_ROOT_HOSTS = new Set(rules.noise_root_hosts);
const DROP_HOSTS = new Set(rules.drop_hosts);
const NOISE_PATH_PREFIXES = rules.noise_path_prefixes;
const NOISE_PATH_PATTERNS = (rules.noise_path_patterns || []).map((s) => new RegExp(s));
const NOISE_TITLE_PATTERNS = rules.noise_title_patterns.map((s) => new RegExp(s));
const MIN_TITLE_LENGTH = rules.min_title_length ?? 12;
const NORMALIZE_PATTERNS = ((rules.normalize_url_rules && rules.normalize_url_rules.patterns) || []).map(
  (p) => ({ match: new RegExp(p.match), replace: p.replace }),
);

export function normalizeUrl(url) {
  let u = url;
  for (const p of NORMALIZE_PATTERNS) {
    if (p.match.test(u)) {
      u = u.replace(p.match, p.replace);
      break;
    }
  }
  return u;
}

function isLikelyContent(p) {
  const title = (p.title || '').trim();
  if (title.length < MIN_TITLE_LENGTH) return false;

  const t = title.toLowerCase();
  for (const re of NOISE_TITLE_PATTERNS) if (re.test(t)) return false;

  let parsed;
  try { parsed = new URL(p.url); } catch { return false; }

  if (DROP_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (DROP_HOSTS.has(parsed.hostname.toLowerCase().replace(/^www\./, ''))) return false;

  for (const re of NOISE_PATH_PATTERNS) if (re.test(parsed.pathname)) return false;

  const hostKey = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (NOISE_ROOT_HOSTS.has(hostKey)) {
    const path = parsed.pathname;
    if (path === '/' || path === '' || path === '/home' || path === '/feed') return false;
    if (parsed.searchParams.has('q') && path.startsWith('/search')) return false;
  }

  for (const pre of NOISE_PATH_PREFIXES) if (parsed.pathname.startsWith(pre)) return false;

  return true;
}

// De-dupe across replay windows. Normalize before keying so the same
// content visited from /u/0/ and /u/2/ collapses to one row.
export function dedupeAndFilter(pages) {
  const byUrl = new Map();
  for (const p of pages) {
    if (!isLikelyContent(p)) continue;
    const normalized = normalizeUrl(p.url);
    const stamped = normalized === p.url ? p : { ...p, url: normalized };
    const key = normalized;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, stamped);
    } else {
      existing.visit_count = Math.max(existing.visit_count, stamped.visit_count);
      if (stamped.last_visit > existing.last_visit) {
        existing.last_visit = stamped.last_visit;
        if ((stamped.title || '').length > (existing.title || '').length) {
          existing.title = stamped.title;
        }
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => b.last_visit.localeCompare(a.last_visit));
}
