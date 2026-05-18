// Browser-history filtering. The raw history is mostly noise:
// LinkedIn feed reloads, Gmail inbox refreshes, X home, your own
// site reloads, OAuth callback URLs. Cosmos wants the SIGNAL: the
// articles you read, the repos you opened, the docs you searched.
//
// We filter on four rules, all upstream of the network call so
// the server never sees the junk in the first place:
//   1. Noise hostnames (utility/social roots, the user's own domains).
//   2. Noise paths — both prefix matches and full-path regex patterns.
//   3. Noise titles (empty, "Inbox (N) ...", login pages, Drive root).
//   4. URL normalization — the same Google Sheet visited from /u/0/
//      and /u/2/ collapses to one source_id so dedup catches them.
//
// The noise lists live in filter-rules.json so the cosmos-browser
// extension can ship the exact same logic without us maintaining
// two copies. Single source of truth, JSON-encoded so a non-TS
// reader can consume it.

import type { BrowserPage } from "./readers.js";
import rules from "./filter-rules.json" with { type: "json" };

const NOISE_ROOT_HOSTS = new Set<string>(rules.noise_root_hosts);
const DROP_HOSTS = new Set<string>(rules.drop_hosts);
const NOISE_PATH_PREFIXES: string[] = rules.noise_path_prefixes;
const NOISE_PATH_PATTERNS: RegExp[] = (rules.noise_path_patterns || []).map((s: string) => new RegExp(s));
const NOISE_TITLE_PATTERNS: RegExp[] = rules.noise_title_patterns.map((s: string) => new RegExp(s));
const MIN_TITLE_LENGTH: number = rules.min_title_length ?? 12;
const NORMALIZE_PATTERNS: Array<{ match: RegExp; replace: string }> =
  ((rules.normalize_url_rules && rules.normalize_url_rules.patterns) || []).map(
    (p: { match: string; replace: string }) => ({ match: new RegExp(p.match), replace: p.replace }),
  );

// Collapse equivalent URLs into one canonical form so /u/0/foo and
// /u/2/foo both become /foo. The endpoint dedupes on source_id, so
// this is what makes "I opened the same Google Sheet 14 times" land
// as one node with reinforcement, not 14 separate nodes.
export function normalizeUrl(url: string): string {
  let u = url;
  for (const p of NORMALIZE_PATTERNS) {
    if (p.match.test(u)) {
      u = u.replace(p.match, p.replace);
      break;
    }
  }
  return u;
}

function isLikelyContent(p: BrowserPage): boolean {
  // Title too short or empty — likely a hub or a bad scrape.
  const title = (p.title || "").trim();
  if (title.length < MIN_TITLE_LENGTH) return false;

  const t = title.toLowerCase();
  for (const re of NOISE_TITLE_PATTERNS) if (re.test(t)) return false;

  let parsed: URL;
  try { parsed = new URL(p.url); } catch { return false; }

  if (DROP_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (DROP_HOSTS.has(parsed.hostname.toLowerCase().replace(/^www\./, ""))) return false;

  // Full-path regex patterns. Catches things like
  // /drive/u/N/search?q=... that path-prefix matching can't express.
  for (const re of NOISE_PATH_PATTERNS) if (re.test(parsed.pathname)) return false;

  // From a noise hub host, only keep if the path looks like a
  // specific document (more than just "/" or "/home").
  const hostKey = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (NOISE_ROOT_HOSTS.has(hostKey)) {
    const path = parsed.pathname;
    if (path === "/" || path === "" || path === "/home" || path === "/feed") return false;
    // Search-result URLs on noise hosts are still noise.
    if (parsed.searchParams.has("q") && path.startsWith("/search")) return false;
  }

  for (const pre of NOISE_PATH_PREFIXES) if (parsed.pathname.startsWith(pre)) return false;

  return true;
}

// De-dupe across browsers: the same URL visited in Zen and Safari
// merges into one record with the max visit_count and the latest
// last_visit. Source becomes the latest one's source. Normalization
// runs before keying so /u/0/X and /u/2/X collapse.
export function dedupeAndFilter(pages: BrowserPage[]): BrowserPage[] {
  const byUrl = new Map<string, BrowserPage>();
  for (const p of pages) {
    if (!isLikelyContent(p)) continue;
    const normalized = normalizeUrl(p.url);
    const stamped: BrowserPage = normalized === p.url ? p : { ...p, url: normalized };
    const key = normalized;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, stamped);
    } else {
      existing.visit_count = Math.max(existing.visit_count, stamped.visit_count);
      if (stamped.last_visit > existing.last_visit) {
        existing.last_visit = stamped.last_visit;
        existing.source = stamped.source;
        if ((stamped.title || "").length > (existing.title || "").length) {
          existing.title = stamped.title;
        }
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => b.last_visit.localeCompare(a.last_visit));
}
