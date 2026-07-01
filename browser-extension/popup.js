// Popup wiring. The popup is dumb — it asks the service worker for
// current status and forwards a "sync now" message. All real work
// happens in background.js.
//
// All text rendering goes through textContent + createElement; we
// never set innerHTML even on chrome.storage values, because future
// status payloads could carry unexpected characters and HTML
// injection in an extension popup is a bad time.

const statusEl = document.getElementById('status');
const syncBtn = document.getElementById('sync');
const optionsLink = document.getElementById('options');

function relTime(ms) {
  if (!ms) return 'never';
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Build a status node with optional bold-emphasized "last sync · X ago"
// header. Always plain text, no innerHTML.
function setStatus(headerLabel, headerValue, detailText) {
  statusEl.replaceChildren();
  if (headerLabel && headerValue) {
    statusEl.appendChild(document.createTextNode(headerLabel + ' · '));
    const b = document.createElement('b');
    b.textContent = headerValue;
    statusEl.appendChild(b);
  }
  if (detailText) {
    if (headerLabel) statusEl.appendChild(document.createElement('br'));
    statusEl.appendChild(document.createTextNode(detailText));
  }
}

function renderStatus(s) {
  if (!s?.ok && !s?.lastSyncMs) {
    setStatus(null, null, 'paste your cosmos MCP key in options to start.');
    return;
  }
  const last = relTime(s.lastSyncMs);
  if (s.lastResult && !s.lastResult.ok) {
    const msg = String(s.lastResult.message || s.lastResult.error || 'failed');
    setStatus('last sync', last, msg);
    return;
  }
  if (s.lastResult?.ok) {
    const sent = Number(s.lastResult.sent || 0);
    const created = Number(s.lastResult.created || 0);
    setStatus('last sync', last, `${sent} pages · ${created} new`);
    return;
  }
  setStatus('last sync', last, null);
}

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'get-status' });
  renderStatus(res || {});
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'syncing…';
  const res = await chrome.runtime.sendMessage({ type: 'sync-now' });
  if (res?.ok) {
    syncBtn.textContent = `synced ${res.sent}`;
  } else {
    syncBtn.textContent = res?.error === 'no_key' ? 'set key first' : 'failed';
  }
  setTimeout(() => {
    syncBtn.disabled = false;
    syncBtn.textContent = 'sync now';
    refresh();
  }, 1100);
});

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
