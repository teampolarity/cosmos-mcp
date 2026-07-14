// @ts-nocheck
// Recovered from the @polarity-lab/cosmos-mcp@0.9.25 published artifact.
// Original source was not present in git or the npm tarball; runtime source: ../../../../../../tmp/cosmos-mcp-pack/package/dist/settings/page.js
// Embedded settings UI (served at http://127.0.0.1:<port>/).
export const SETTINGS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cosmos</title>
<style>
  :root {
    color-scheme: dark;
    --void: #000000;
    --surface: #0a0a0a;
    --surface-raised: #111114;
    --text: rgba(255, 255, 255, 0.92);
    --text-secondary: rgba(255, 255, 255, 0.65);
    --text-muted: rgba(255, 255, 255, 0.50);
    --text-faint: rgba(255, 255, 255, 0.35);
    --border: rgba(255, 255, 255, 0.08);
    --accent: #22d3ee;
    --accent-dim: rgba(34, 211, 238, 0.14);
    --tint: rgba(255, 255, 255, 0.03);
    --tint-hover: rgba(255, 255, 255, 0.06);
    --ok: #34d399;
    --err: #f87171;
    --warn: #fbbf24;
    --radius: 10px;
    --radius-lg: 12px;
  }
  * { box-sizing: border-box; }
  html { -webkit-font-smoothing: antialiased; }
  body {
    margin: 0;
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    letter-spacing: -0.011em;
    background: var(--void);
    color: var(--text);
    padding: 20px 22px 16px;
    max-width: 640px;
  }
  body.embedded { padding: 16px 18px 12px; max-width: none; min-height: 100vh; display: flex; flex-direction: column; }
  body.embedded .page-header { display: none; }
  body.embedded main { flex: 1; }
  ::-webkit-scrollbar { width: 7px; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 100px; }
  ::selection { background: rgba(34, 211, 238, 0.35); color: #fff; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { color: var(--text-muted); margin: 0 0 18px; font-size: 13px; }
  .tab-bar {
    display: flex;
    gap: 2px;
    margin-bottom: 14px;
    padding: 3px;
    background: var(--tint);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .tab {
    flex: 1;
    background: transparent;
    color: var(--text-muted);
    border: none;
    border-radius: 7px;
    padding: 7px 8px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .tab:hover { color: var(--text-secondary); }
  .tab.active {
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }
  .panel { display: none; }
  .panel.active { display: block; }
  section {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: 10px;
    overflow: hidden;
  }
  section > h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-faint);
    margin: 0;
    padding: 12px 14px 6px;
    font-weight: 600;
  }
  .section-body { padding: 2px 14px 14px; }
  .fda-card { background: var(--surface); }
  .fda-card.ok { border-color: rgba(52, 211, 153, 0.2); }
  .fda-card.err { border-color: rgba(248, 113, 113, 0.18); }
  .fda-card.compact .fda-row { padding-bottom: 10px; }
  .fda-card.compact .btn-row { margin-top: 0; }
  .fda-row { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px 2px; }
  .fda-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; background: var(--text-faint); flex-shrink: 0; }
  .fda-dot.ok { background: var(--ok); }
  .fda-dot.err { background: var(--err); }
  .fda-dot.warn { background: var(--warn); }
  .fda-title { font-weight: 600; font-size: 14px; }
  .fda-desc { font-size: 12px; color: var(--text-muted); margin-top: 3px; line-height: 1.4; }
  .summary {
    padding: 10px 12px;
    background: var(--tint);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 10px;
  }
  .summary b { color: var(--text); font-weight: 500; }
  .source-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip {
    font-size: 10px;
    padding: 4px 9px;
    border-radius: 980px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border: 1px solid var(--border);
    color: var(--text-faint);
    background: var(--tint);
  }
  .chip.ok { color: var(--ok); border-color: rgba(52, 211, 153, 0.25); background: rgba(52, 211, 153, 0.08); }
  .chip.fail { color: var(--err); border-color: rgba(248, 113, 113, 0.25); background: rgba(248, 113, 113, 0.08); }
  .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 14px 14px; }
  .section-body .btn-row { margin: 8px 0 0; }
  button {
    background: var(--accent);
    color: #000;
    border: none;
    border-radius: 980px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover:not(:disabled) { opacity: 0.9; }
  button.secondary {
    background: var(--tint);
    color: var(--text);
    font-weight: 500;
    border: 1px solid var(--border);
  }
  button.secondary:hover:not(:disabled) { background: var(--tint-hover); }
  button:disabled { opacity: 0.4; cursor: default; }
  button.linkish {
    background: transparent;
    color: var(--accent);
    border: none;
    padding: 0;
    font-size: 12px;
    font-weight: 500;
  }
  .group {
    background: var(--tint);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-top: 8px;
    overflow: hidden;
  }
  label.row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  label.row:last-child { border-bottom: none; }
  label.row:hover { background: var(--tint-hover); }
  input[type=radio], input[type=checkbox] { accent-color: var(--accent); margin-top: 2px; }
  .opt-title { font-weight: 500; font-size: 13px; }
  .opt-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; line-height: 1.35; }
  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    min-height: 40px;
    font-size: 13px;
  }
  select {
    background: var(--tint);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 5px 26px 5px 10px;
    font-size: 13px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath fill='rgba(255,255,255,0.45)' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .source-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 12px;
    font-size: 13px;
    margin-top: 4px;
  }
  .source-grid label { display: flex; align-items: center; gap: 8px; padding: 5px 0; color: var(--text-secondary); }
  .threads { max-height: 200px; overflow: auto; margin-top: 8px; }
  .thread {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    align-items: center;
  }
  .thread:last-child { border-bottom: none; }
  .thread-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
  .chk { display: flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 11px; }
  .log {
    background: #000;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    font: 11px/1.4 ui-monospace, Menlo, monospace;
    max-height: 160px;
    overflow: auto;
    color: var(--text-muted);
    white-space: pre-wrap;
    margin-top: 8px;
    display: none;
  }
  .log.show { display: block; }
  .status { margin-top: 6px; font-size: 12px; color: var(--text-muted); min-height: 16px; }
  .status.err { color: var(--err); }
  .status.ok { color: var(--ok); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .hint { font-size: 11px; color: var(--text-faint); margin-top: 8px; line-height: 1.4; }
  .results { width: 100%; border-collapse: collapse; font-size: 12px; }
  .results th { text-align: left; color: var(--text-faint); font-weight: 500; padding: 6px 8px 6px 0; font-size: 10px; text-transform: uppercase; }
  .results td { padding: 8px 8px 8px 0; border-top: 1px solid var(--border); color: var(--text-secondary); vertical-align: top; }
  .pill { font-size: 10px; padding: 2px 7px; border-radius: 980px; font-weight: 600; text-transform: uppercase; }
  .pill.ok { background: rgba(52, 211, 153, 0.12); color: var(--ok); }
  .pill.fail { background: rgba(248, 113, 113, 0.12); color: var(--err); }
  .pill.empty { background: var(--tint); color: var(--text-faint); }
  .result-msg { color: var(--text-faint); font-size: 10px; margin-top: 3px; max-width: 280px; }
  progress { width: 100%; height: 4px; accent-color: var(--accent); }
  .app-footer {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-faint);
    text-align: center;
  }
  .detail-link { margin-top: 6px; }
</style>
</head>
<body>
  <div class="page-header">
    <h1>Cosmos</h1>
    <p class="sub">Keep Thread in sync with this Mac. <span id="version-label"></span></p>
  </div>

  <nav class="tab-bar" role="tablist">
    <button type="button" class="tab active" data-tab="overview" role="tab">Overview</button>
    <button type="button" class="tab" data-tab="schedule" role="tab">Schedule</button>
    <button type="button" class="tab" data-tab="photos" role="tab">Photos</button>
    <button type="button" class="tab" data-tab="advanced" role="tab">Advanced</button>
  </nav>

  <main>
    <div id="panel-overview" class="panel active" role="tabpanel">
      <section id="fda-section" class="fda-card">
        <h2>Mac access</h2>
        <div class="fda-row">
          <div class="fda-dot" id="fda-dot"></div>
          <div>
            <div class="fda-title" id="fda-title">Checking iMessage access…</div>
            <div class="fda-desc" id="fda-desc"></div>
          </div>
        </div>
        <div class="btn-row" id="fda-actions" hidden>
          <button type="button" id="fda-open-settings" class="secondary">Open System Settings</button>
          <button type="button" id="fda-recheck" class="secondary">Test again</button>
        </div>
      </section>

      <div class="summary" id="overview-summary">Loading…</div>

      <section>
        <h2>Sync now</h2>
        <div class="section-body">
          <div class="btn-row" id="sync-buttons" style="margin:0">
            <button type="button" data-sync="imessage">Sync now</button>
          </div>
          <p class="hint" style="margin-top:8px">Pulls new messages from this Mac with a live log. Photo captioning runs on the background schedule.</p>
          <div class="log" id="sync-log"></div>
          <div class="status" id="sync-status"></div>
        </div>
      </section>

      <div class="source-chips" id="source-chips"></div>
    </div>

    <div id="panel-schedule" class="panel" role="tabpanel">
      <section>
        <h2>Background sync</h2>
        <div class="section-body">
          <label class="toggle-row">
            <span>Run enabled sources automatically</span>
            <input type="checkbox" id="daemon-enabled">
          </label>
          <label class="toggle-row">
            <span>How often</span>
            <select id="interval_hours">
              <option value="1">Every hour</option>
              <option value="2">Every 2 hours</option>
              <option value="4">Every 4 hours</option>
              <option value="8">Every 8 hours</option>
              <option value="12">Every 12 hours</option>
              <option value="24">Once a day</option>
            </select>
          </label>
          <label class="toggle-row"><span>iMessage</span><input type="checkbox" id="src-imessage" data-src="imessage"></label>
          <label class="toggle-row"><span>Browser history</span><input type="checkbox" id="src-browser" data-src="browser"></label>
          <label class="toggle-row"><span>Calendar</span><input type="checkbox" id="src-calendar" data-src="calendar"></label>
          <label class="toggle-row"><span>Claude Desktop</span><input type="checkbox" id="src-claude-desktop" data-src="claude_desktop"></label>
          <label class="toggle-row"><span>Shell history</span><input type="checkbox" id="src-shell-history" data-src="shell_history"></label>
          <p class="hint">Schedule changes save automatically. Use <b>Sync now</b> on Overview for a manual pull with live progress.</p>
          <div class="status" id="daemon-status"></div>
        </div>
      </section>
    </div>

    <div id="panel-photos" class="panel" role="tabpanel">
      <section>
        <h2>iMessage photos</h2>
        <div class="section-body">
          <label class="toggle-row">
            <span>Photo moments on <a href="https://cosmos.polarity-lab.com/" id="thread-link">Thread</a></span>
            <input type="checkbox" id="propose_photos">
          </label>
          <div class="group">
            <label class="row"><input type="radio" name="caption_mode" value="off"><div><div class="opt-title">Don't describe photos</div><div class="opt-desc">Messages only.</div></div></label>
            <label class="row"><input type="radio" name="caption_mode" value="local"><div><div class="opt-title">On this Mac</div><div class="opt-desc">Ollama + vision. Images stay local.</div></div></label>
            <label class="row"><input type="radio" name="caption_mode" value="server"><div><div class="opt-title">In the cloud</div><div class="opt-desc">Fast caption, image discarded after.</div></div></label>
          </div>
          <div id="threads-section" hidden style="margin-top:10px">
            <div class="opt-desc" style="margin-bottom:4px">Skip photos from a conversation</div>
            <div class="threads" id="threads"></div>
          </div>
          <button type="button" id="save-photos" hidden>Save photo settings</button>
          <p class="hint" style="margin-top:8px">Photo settings save automatically.</p>
          <div class="status" id="photo-status"></div>
        </div>
      </section>
    </div>

    <div id="panel-advanced" class="panel" role="tabpanel">
      <section id="update-section" hidden>
        <h2>Update</h2>
        <div class="section-body">
          <p class="opt-desc" id="update-text"></p>
          <div class="btn-row" style="margin:8px 0 0">
            <button type="button" id="update-install">Update now</button>
          </div>
          <div id="update-progress-wrap" hidden style="margin-top:10px">
            <progress id="update-progress" max="100" value="0"></progress>
            <p class="opt-desc" id="update-progress-label" style="margin-top:4px"></p>
          </div>
          <label class="toggle-row" style="margin-top:8px">
            <span>Install updates automatically</span>
            <input type="checkbox" id="auto_update">
          </label>
          <div class="status" id="update-status"></div>
        </div>
      </section>

      <section>
        <h2>iMessage log</h2>
        <div class="section-body">
          <table class="results" id="source-results">
            <thead><tr><th>Source</th><th>Result</th><th>When</th></tr></thead>
            <tbody id="source-results-body"></tbody>
          </table>
        </div>
      </section>
    </div>
  </main>

  <footer class="app-footer" id="app-footer"></footer>

<script>
const $ = (id) => document.getElementById(id);
let pollTimer = null;
let saveDaemonTimer = null;
let savePhotosTimer = null;
let bootstrapReady = false;
const params = new URLSearchParams(location.search);
if (params.get('embedded') === '1') document.body.classList.add('embedded');

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === 'panel-' + name);
  });
  if (name === 'photos') void loadThreads();
}

let threadsLoaded = false;

function renderThreads(threads) {
  const threadsEl = $('threads');
  threadsEl.innerHTML = '';
  if (threads.length) {
    $('threads-section').hidden = false;
    for (const t of threads) {
      const row = document.createElement('div');
      row.className = 'thread';
      row.dataset.id = t.id;
      row.innerHTML = '<div class="thread-name"></div>' +
        '<label class="chk"><input type="checkbox" class="inc"> photos</label>';
      row.querySelector('.thread-name').textContent = t.label;
      row.querySelector('.inc').checked = t.caption && t.propose;
      threadsEl.appendChild(row);
    }
  } else {
    $('threads-section').hidden = true;
  }
}

async function loadThreads() {
  if (threadsLoaded) return;
  try {
    const data = await api('/api/threads');
    renderThreads(data.threads || []);
    threadsLoaded = true;
  } catch {
  }
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => showTab(btn.dataset.tab);
});

const focus = params.get('focus');
if (focus === 'fda') {
  showTab('overview');
  requestAnimationFrame(() => $('fda-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function bridge(action) {
  if (window.webkit?.messageHandlers?.cosmosSync) {
    window.webkit.messageHandlers.cosmosSync.postMessage({ action });
    return true;
  }
  return false;
}

function renderFda(fda) {
  const card = $('fda-section');
  const dot = $('fda-dot');
  const title = $('fda-title');
  const desc = $('fda-desc');
  const actions = $('fda-actions');
  dot.className = 'fda-dot';
  card.className = 'fda-card';
  if (!fda) {
    title.textContent = 'Open from the menu bar app';
    desc.textContent = 'FDA is checked from Cosmos.app, not Terminal.';
    actions.hidden = false;
    card.hidden = false;
    return;
  }
  if (fda.ok) {
    dot.classList.add('ok');
    card.classList.add('ok', 'compact');
    const n = fda.chat_count != null ? fda.chat_count + ' conversations' : 'iMessage';
    title.textContent = 'Full Disk Access is on';
    desc.textContent = n + ' on this Mac' + (fda.latest_message ? ', latest ' + fmtTime(fda.latest_message) : '') + '.';
    actions.hidden = true;
    card.hidden = focus !== 'fda';
    return;
  }
  card.hidden = false;
  if (fda.error === 'no_imessage') {
    dot.classList.add('warn');
    title.textContent = 'No iMessage on this Mac';
    desc.textContent = 'Sign in to Messages, then test again.';
    actions.hidden = false;
    return;
  }
  dot.classList.add('err');
  card.classList.add('err');
  title.textContent = 'Full Disk Access needed';
  const stale = 'If Cosmos Sync is already in the list, remove it with −, quit this app, add it again with +, then reopen.';
  desc.textContent = fda.error === 'fda_denied'
    ? stale + ' Each new build needs a fresh grant.'
    : 'Enable Cosmos Sync in System Settings → Privacy & Security → Full Disk Access.';
  actions.hidden = false;
}
window.cosmosOnFdaUpdate = renderFda;

$('fda-open-settings').onclick = () => bridge('openFdaSettings');
$('fda-recheck').onclick = () => {
  if (bridge('recheckFda')) {
    $('fda-title').textContent = 'Testing…';
    setTimeout(() => load(), 4000);
    return;
  }
  load();
};
$('thread-link').onclick = (e) => { if (bridge('openThread')) e.preventDefault(); };

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function fmtTime(iso) {
  if (!iso) return 'never';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function setSyncButtons(disabled) {
  document.querySelectorAll('[data-sync]').forEach((b) => { b.disabled = disabled; });
}

function renderChips(sr) {
  const el = $('source-chips');
  el.innerHTML = '';
  const order = ['imessage'];
  for (const name of order) {
    const row = sr.sources && sr.sources[name];
    const chip = document.createElement('span');
    chip.className = 'chip' + (row?.status === 'ok' ? ' ok' : row?.status === 'failed' ? ' fail' : '');
    chip.textContent = name + (row?.status === 'ok' ? ' ✓' : row?.status === 'failed' ? ' ✗' : '');
    el.appendChild(chip);
  }
}

async function load() {
  $('overview-summary').textContent = 'Loading local status…';
  try {
    const data = await api('/api/bootstrap');
    const d = data.daemon;
    const sr = data.sync_results || {};
    const daemonLabel = d.installed && d.loaded ? 'on' : (d.installed ? 'installed' : 'off');
    $('overview-summary').innerHTML =
      '<b>Background sync</b> ' + daemonLabel +
      ' · <b>Last iMessage</b> ' + fmtTime(d.last_imessage_sync_at) +
      ' · <b>Interval</b> every ' + d.config.interval_hours + 'h' +
      (sr.last_run_at ? '<br><b>Last background run</b> ' + (sr.last_run_status || '—') + ' · ' + fmtTime(sr.last_run_at) : '');
    $('daemon-enabled').checked = d.installed;
    $('interval_hours').value = String(d.config.interval_hours);
    $('src-imessage').checked = d.config.sources?.imessage !== false;
    $('src-browser').checked = d.config.sources?.browser === true;
    $('src-calendar').checked = d.config.sources?.calendar === true;
    $('src-claude-desktop').checked = d.config.sources?.claude_desktop === true;
    $('src-shell-history').checked = d.config.sources?.shell_history === true;
    $('auto_update').checked = !!d.config.auto_update;
    const ver = data.version || '?';
    $('version-label').textContent = 'v' + ver;
    $('app-footer').textContent = 'Cosmos v' + ver + ' · polarity lab';
    renderFda(data.fda);
    renderChips(sr);
    const upd = data.update;
    if (upd?.update_available) {
      $('update-section').hidden = false;
      $('update-text').textContent = 'Version ' + upd.current + ' → ' + upd.latest + ' on npm.';
      document.querySelector('.tab[data-tab="advanced"]')?.classList.add('has-update');
    } else {
      $('update-section').hidden = true;
    }
    for (const inp of document.querySelectorAll('#source-toggles input, [data-src="imessage"]')) {
      if (inp.dataset.src) inp.checked = !!d.config.sources[inp.dataset.src];
    }
    $('propose_photos').checked = !!data.prefs.propose_photos;
    for (const r of document.querySelectorAll('input[name=caption_mode]')) {
      r.checked = r.value === data.prefs.caption_mode;
    }
    const tbody = $('source-results-body');
    tbody.innerHTML = '';
    const order = ['imessage'];
    for (const name of order) {
      const row = sr.sources && sr.sources[name];
      const tr = document.createElement('tr');
      const pill = row
        ? (row.status === 'ok' ? '<span class="pill ok">ok</span>' : row.status === 'failed' ? '<span class="pill fail">failed</span>' : '<span class="pill empty">empty</span>')
        : '<span class="pill empty">—</span>';
      tr.innerHTML = '<td>' + name + '</td><td>' + pill + '<div class="result-msg">' + (row?.message ? row.message.replace(/</g,'&lt;') : '') + '</div></td><td>' + (row ? fmtTime(row.finished_at) : '—') + '</td>';
      tbody.appendChild(tr);
    }
    const threadsEl = $('threads');
    threadsEl.innerHTML = '';
    $('threads-section').hidden = true;
    threadsLoaded = false;
    if (data.sync_running) {
      setSyncButtons(true);
      $('sync-log').classList.add('show');
      startPoll(data.active_job_id);
    }
  } catch (e) {
    $('overview-summary').textContent = e.message || 'Could not reach settings server.';
    $('overview-summary').style.color = 'var(--err)';
  } finally {
    bootstrapReady = true;
    bridge('ready');
  }
}

function startPoll(jobId) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const j = await api('/api/sync/' + jobId);
      $('sync-log').textContent = j.lines.join('\\n');
      $('sync-log').scrollTop = $('sync-log').scrollHeight;
      if (j.status !== 'running') {
        clearInterval(pollTimer);
        pollTimer = null;
        setSyncButtons(false);
        $('sync-status').textContent = j.status === 'done' ? 'Sync finished.' : 'Finished with errors.';
        $('sync-status').className = 'status ' + (j.status === 'done' ? 'ok' : 'err');
        load();
      }
    } catch { /* retry */ }
  }, 800);
}

document.querySelectorAll('[data-sync]').forEach((btn) => {
  btn.onclick = async () => {
    if (btn.dataset.sync !== 'imessage' && btn.dataset.sync !== 'all') showTab('overview');
    $('sync-status').textContent = 'Starting…';
    $('sync-status').className = 'status';
    $('sync-log').classList.add('show');
    $('sync-log').textContent = '';
    setSyncButtons(true);
    try {
      const j = await api('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: btn.dataset.sync }),
      });
    $('sync-status').textContent = 'Syncing messages…';
      startPoll(j.id);
    } catch (e) {
      setSyncButtons(false);
      $('sync-status').textContent = e.message;
      $('sync-status').className = 'status err';
    }
  };
});

async function saveDaemonConfig() {
  $('daemon-status').textContent = 'Saving…';
  $('daemon-status').className = 'status';
  const sources = {
    imessage: $('src-imessage').checked,
    browser: $('src-browser').checked,
    calendar: $('src-calendar').checked,
    claude_desktop: $('src-claude-desktop').checked,
    shell_history: $('src-shell-history').checked,
  };
  try {
    await api('/api/daemon/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: $('daemon-enabled').checked,
        interval_hours: parseInt($('interval_hours').value, 10),
        sources,
        auto_update: $('auto_update').checked,
      }),
    });
    $('daemon-status').textContent = 'Saved.';
    $('daemon-status').className = 'status ok';
    load();
  } catch (e) {
    $('daemon-status').textContent = e.message;
    $('daemon-status').className = 'status err';
  }
}

function scheduleSaveDaemon() {
  if (!bootstrapReady) return;
  clearTimeout(saveDaemonTimer);
  saveDaemonTimer = setTimeout(saveDaemonConfig, 400);
}

$('daemon-enabled').onchange = scheduleSaveDaemon;
$('interval_hours').onchange = scheduleSaveDaemon;
$('auto_update').onchange = scheduleSaveDaemon;
for (const source of ['src-imessage', 'src-browser', 'src-calendar', 'src-claude-desktop', 'src-shell-history']) {
  $(source).onchange = scheduleSaveDaemon;
}

async function savePhotoSettings() {
  $('photo-status').textContent = 'Saving…';
  $('photo-status').className = 'status';
  const threads = [...$('threads').querySelectorAll('.thread')].map((row) => {
    const on = row.querySelector('.inc').checked;
    return { id: row.dataset.id, caption: on, propose: on };
  });
  try {
    await api('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propose_photos: $('propose_photos').checked,
        caption_mode: document.querySelector('input[name=caption_mode]:checked')?.value || 'off',
        threads,
      }),
    });
    $('photo-status').textContent = 'Saved.';
    $('photo-status').className = 'status ok';
  } catch (e) {
    $('photo-status').textContent = e.message;
    $('photo-status').className = 'status err';
  }
}

function scheduleSavePhotos() {
  if (!bootstrapReady) return;
  clearTimeout(savePhotosTimer);
  savePhotosTimer = setTimeout(savePhotoSettings, 500);
}

$('propose_photos').onchange = scheduleSavePhotos;
for (const r of document.querySelectorAll('input[name=caption_mode]')) {
  r.onchange = scheduleSavePhotos;
}
$('threads').addEventListener('change', (e) => {
  if (e.target?.classList?.contains('inc')) scheduleSavePhotos();
});

$('save-photos').onclick = savePhotoSettings;

$('update-install').onclick = async () => {
  $('update-status').textContent = '';
  $('update-progress-wrap').hidden = false;
  $('update-install').disabled = true;
  const bar = $('update-progress');
  const label = $('update-progress-label');
  let done = false;
  const poll = setInterval(async () => {
    if (done) return;
    try {
      const p = await api('/api/update/progress');
      bar.value = p.percent || 0;
      label.textContent = p.message || 'Working…';
      if (p.stage === 'done' || p.stage === 'error') {
        done = true;
        clearInterval(poll);
        $('update-status').textContent = p.stage === 'done'
          ? 'Updated. Quit and reopen Cosmos.'
          : (p.message || 'Update failed.');
        $('update-status').className = 'status ' + (p.stage === 'done' ? 'ok' : 'err');
        $('update-install').disabled = false;
        load();
      }
    } catch { /* keep polling */ }
  }, 250);
  try {
    await api('/api/update/install', { method: 'POST' });
  } catch (e) {
    done = true;
    clearInterval(poll);
    $('update-status').textContent = e.message;
    $('update-status').className = 'status err';
    $('update-install').disabled = false;
  }
};

load();
bridge('ready');
</script>
</body>
</html>`;
