// Options page wiring. Reads the existing key into the field if one
// is set, lets the user save or clear it, and exposes a "sync now"
// button identical to the popup's. The key never leaves
// chrome.storage.local except as the X-MCP-Key header on the POST to
// cosmos.polarity-lab.com.

const keyInput = document.getElementById('key');
const saveBtn  = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const syncBtn  = document.getElementById('syncnow');
const statusEl = document.getElementById('status');

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

async function init() {
  const { mcpKey } = await chrome.storage.local.get(['mcpKey']);
  if (mcpKey) {
    keyInput.value = mcpKey;
    setStatus('key saved.');
  }
}

saveBtn.addEventListener('click', async () => {
  const v = keyInput.value.trim();
  if (!v) {
    setStatus('paste a key first.', 'err');
    return;
  }
  if (!v.startsWith('pmk_')) {
    setStatus('that does not look like a cosmos MCP key (expected pmk_…).', 'err');
    return;
  }
  await chrome.storage.local.set({ mcpKey: v });
  setStatus('saved.', 'ok');
});

clearBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['mcpKey', 'lastSyncMs', 'lastResult']);
  keyInput.value = '';
  setStatus('cleared.', 'ok');
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  setStatus('syncing…');
  const res = await chrome.runtime.sendMessage({ type: 'sync-now' });
  if (res?.ok) {
    setStatus(`sent ${res.sent} pages · ${res.created || 0} new.`, 'ok');
  } else {
    setStatus(res?.message || res?.error || 'failed.', 'err');
  }
  syncBtn.disabled = false;
});

init();
