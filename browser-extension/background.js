// MV3 service worker. Three responsibilities, that's it:
//   1. On install + every hour, walk chrome.history.search for
//      everything visited since the last sync.
//   2. Filter the raw list with the same noise rules cosmos-mcp's CLI
//      uses (filter.js, fed by shared/filter-rules.json).
//   3. POST batches to /api/me/connectors/browser/visits using the
//      stored MCP key as X-MCP-Key.
//
// Watermark (lastSyncMs) lives in chrome.storage.local so we don't
// resend the same visits. We never store visit bodies; only the
// timestamp of our most recent successful sync.
//
// On any failure we leave lastSyncMs untouched so the next tick
// catches up. Server-side ingestion is idempotent on (source, url)
// so resends are safe.

import { dedupeAndFilter } from './filter.js';

const ENDPOINT = 'https://cosmos.polarity-lab.com/api/me/connectors/browser/visits';
const BATCH_SIZE = 200;
const ALARM_NAME = 'cosmos-hourly-sync';
const ALARM_PERIOD_MIN = 60;
// First-install lookback. Anything older than this is dropped on the
// first sync. 90 days is a sensible default — captures roughly the
// last quarter of browsing without blasting the entire history into
// the graph on day one. A user who wants more can clear lastSyncMs
// from the options page and re-sync; 90 days picks up most "current
// thinking" while keeping the install payload bounded.
const FIRST_SYNC_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 5000;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
  // Don't auto-sync on install — the user hasn't set their key yet.
  // The popup's "sync now" is the explicit handshake.
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await runSync({ source: 'alarm' }).catch(() => { /* logged inside */ });
});

// Popup messages here to trigger a manual sync. Response shape stays
// consistent across alarm and manual paths so the popup can render
// the same status either way.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'sync-now') {
    runSync({ source: 'manual' })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // async response
  }
  if (msg?.type === 'get-status') {
    chrome.storage.local.get(['lastSyncMs', 'lastResult']).then((s) => {
      sendResponse({ ok: true, lastSyncMs: s.lastSyncMs || 0, lastResult: s.lastResult || null });
    });
    return true;
  }
  return false;
});

async function runSync({ source }) {
  const store = await chrome.storage.local.get(['mcpKey', 'lastSyncMs']);
  const key = (store.mcpKey || '').trim();
  if (!key) {
    const result = { ok: false, error: 'no_key', message: 'paste your cosmos MCP key in the extension options' };
    await chrome.storage.local.set({ lastResult: { ...result, at: Date.now(), source } });
    return result;
  }

  const startTime = store.lastSyncMs
    ? Number(store.lastSyncMs)
    : Date.now() - FIRST_SYNC_LOOKBACK_MS;

  // chrome.history.search caps at maxResults — we ask for more than
  // we ever expect to need in an hour. Any overflow gets caught on
  // the next tick because we don't advance lastSyncMs on failure.
  const raw = await chrome.history.search({
    text: '',
    startTime,
    maxResults: MAX_PER_RUN,
  });

  // Normalize to the shape filter.js + the server endpoint expect.
  // Visit count is the API-provided cumulative count. `source: 'web'`
  // is a static label since the extension cannot distinguish browsers
  // by API.
  const pages = raw
    .filter((r) => r.url && r.lastVisitTime)
    .map((r) => {
      let hostname = '';
      try { hostname = new URL(r.url).hostname.toLowerCase(); } catch { /* skip */ }
      return {
        url: r.url,
        title: r.title || '',
        hostname,
        last_visit: new Date(r.lastVisitTime).toISOString(),
        visit_count: r.visitCount || 1,
        source: 'web',
      };
    });

  const kept = dedupeAndFilter(pages);

  if (kept.length === 0) {
    await chrome.storage.local.set({
      lastSyncMs: Date.now(),
      lastResult: { ok: true, sent: 0, at: Date.now(), source },
    });
    return { ok: true, sent: 0 };
  }

  let sent = 0;
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < kept.length; i += BATCH_SIZE) {
    const batch = kept.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MCP-Key': key,
        },
        body: JSON.stringify({ pages: batch }),
      });
      if (!res.ok) {
        errors += batch.length;
        if (res.status === 401 || res.status === 403) {
          const result = { ok: false, error: 'unauthorized', message: 'cosmos rejected the key — open options and re-paste it' };
          await chrome.storage.local.set({ lastResult: { ...result, at: Date.now(), source } });
          return result;
        }
        // Any other failure: stop, don't advance watermark, try next tick.
        const result = { ok: false, error: `http_${res.status}`, sent };
        await chrome.storage.local.set({ lastResult: { ...result, at: Date.now(), source } });
        return result;
      }
      const data = await res.json().catch(() => ({}));
      created += Number(data?.created || 0);
      updated += Number(data?.updated || 0);
      sent += batch.length;
    } catch (e) {
      const result = { ok: false, error: 'network', message: String(e?.message || e), sent };
      await chrome.storage.local.set({ lastResult: { ...result, at: Date.now(), source } });
      return result;
    }
  }

  const result = { ok: true, sent, created, updated, errors };
  await chrome.storage.local.set({
    lastSyncMs: Date.now(),
    lastResult: { ...result, at: Date.now(), source },
  });
  return result;
}
