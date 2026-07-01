#!/usr/bin/env bash
# One-shot helper to mint a Chrome Web Store refresh token.
#
# Runs ONCE per OAuth client. The resulting refresh token never expires
# (unless you revoke it in your Google account), so every future
# `chrome-publish.sh` invocation is non-interactive.
#
# Uses Google's loopback redirect flow: this script spins up a tiny
# one-shot HTTP listener on http://127.0.0.1:<port>/ and points Google's
# consent screen at it. Google deprecated the older "out-of-band" (oob)
# flow that pasted a code on a Google page; new Desktop OAuth clients
# refuse it with "Error 400: invalid_request". Loopback works on any
# port without needing to register the redirect URI — Google's Desktop
# OAuth policy allows any 127.0.0.1 port automatically.
#
# Prereqs:
#   1. Cloud Console (https://console.cloud.google.com):
#      a. APIs & Services -> Library -> "Chrome Web Store API" -> Enable.
#      b. APIs & Services -> OAuth consent screen -> External. Add your
#         Google address under Test users.
#      c. APIs & Services -> Credentials -> Create credentials
#         -> OAuth client ID -> Application type: Desktop app
#         -> Name: cosmos chrome web store publisher -> Create.
#   2. Copy the client id + client secret from the dialog.
#   3. Run this script.
#
# Usage:
#   ./scripts/chrome-refresh-token.sh
#   ./scripts/chrome-refresh-token.sh <client_id> <client_secret>

set -euo pipefail

CLIENT_ID="${1:-${CHROME_CLIENT_ID:-}}"
CLIENT_SECRET="${2:-${CHROME_CLIENT_SECRET:-}}"

if [ -z "$CLIENT_ID" ]; then
  read -rp "CHROME_CLIENT_ID: " CLIENT_ID
fi
if [ -z "$CLIENT_SECRET" ]; then
  read -rsp "CHROME_CLIENT_SECRET (hidden): " CLIENT_SECRET
  echo
fi

# Hand the OAuth dance off to python — it can pick a free port, run an
# HTTPServer, decode the redirect, and exchange the code in one place.
# The script env passes the client id/secret as env vars so they never
# touch argv (visible in ps).
export CLIENT_ID CLIENT_SECRET
python3 - <<'PY'
import http.server, json, os, socket, sys, threading, urllib.parse, urllib.request, webbrowser

CLIENT_ID = os.environ["CLIENT_ID"]
CLIENT_SECRET = os.environ["CLIENT_SECRET"]
SCOPE = "https://www.googleapis.com/auth/chromewebstore"

# Pick a free ephemeral port. The kernel hands us one on bind(0), then we
# close and hand the number to HTTPServer. Tiny TOCTOU race but fine for
# a one-shot local tool.
s = socket.socket()
s.bind(("127.0.0.1", 0))
PORT = s.getsockname()[1]
s.close()
REDIRECT = f"http://127.0.0.1:{PORT}/"

state = {"code": None, "error": None}

# Minimal response page — the user sees this in the browser after they
# click Allow. Auto-close lets us not leave a tab around.
SUCCESS_HTML = (
    b"<!doctype html><meta charset=utf-8><title>cosmos-mcp</title>"
    b"<style>body{font-family:system-ui;background:#0a0a0a;color:#eee;"
    b"display:flex;align-items:center;justify-content:center;height:100vh;margin:0}"
    b"main{max-width:480px;padding:24px;text-align:center}h1{font-weight:500;font-size:18px;margin:0 0 8px}"
    b"p{opacity:.7;font-size:14px;margin:0}</style>"
    b"<main><h1>cosmos-mcp is authenticated.</h1>"
    b"<p>You can close this tab. Return to the terminal.</p></main>"
    b"<script>setTimeout(()=>window.close(),1500)</script>"
)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(q)
        if "code" in params:
            state["code"] = params["code"][0]
        elif "error" in params:
            state["error"] = params["error"][0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(SUCCESS_HTML)))
        self.end_headers()
        self.wfile.write(SUCCESS_HTML)
    # Quiet down the default request logging.
    def log_message(self, *a, **kw):
        pass

server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
t = threading.Thread(target=server.serve_forever, daemon=True)
t.start()

auth_url = (
    "https://accounts.google.com/o/oauth2/v2/auth"
    "?response_type=code"
    f"&client_id={urllib.parse.quote(CLIENT_ID, safe='')}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT, safe='')}"
    f"&scope={urllib.parse.quote(SCOPE, safe='')}"
    "&access_type=offline&prompt=consent"
)

print("")
print("------------------------------------------------------------")
print(f"listener up on {REDIRECT}")
print("opening browser. if it does not open, paste this URL manually:")
print("------------------------------------------------------------")
print("")
print(auth_url)
print("")
print("waiting for Google to redirect back...")

webbrowser.open(auth_url)

# Wait up to 5 minutes for the user to click Allow.
import time
deadline = time.time() + 300
while state["code"] is None and state["error"] is None and time.time() < deadline:
    time.sleep(0.25)

server.shutdown()

if state["error"]:
    print(f"\nGoogle returned an error: {state['error']}", file=sys.stderr)
    sys.exit(1)
if not state["code"]:
    print("\ntimed out waiting for the redirect. cancel and re-run.", file=sys.stderr)
    sys.exit(1)

print("got code from redirect. exchanging for refresh token...")

body = urllib.parse.urlencode({
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "code": state["code"],
    "grant_type": "authorization_code",
    "redirect_uri": REDIRECT,
}).encode()

req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body)
try:
    with urllib.request.urlopen(req) as resp:
        payload = json.load(resp)
except urllib.error.HTTPError as e:
    print("\ntoken exchange failed:", file=sys.stderr)
    print(e.read().decode(), file=sys.stderr)
    sys.exit(1)

refresh = payload.get("refresh_token")
if not refresh:
    print("\nGoogle returned no refresh_token. raw payload:", file=sys.stderr)
    print(json.dumps(payload, indent=2), file=sys.stderr)
    print("\nThis usually means you previously authorized this client and Google", file=sys.stderr)
    print("cached your consent. Revoke at https://myaccount.google.com/permissions", file=sys.stderr)
    print("and re-run this script.", file=sys.stderr)
    sys.exit(1)

print("")
print("refresh token minted. add the following four lines to ~/.zshrc:")
print("")
print(f'export CHROME_CLIENT_ID="{CLIENT_ID}"')
print(f'export CHROME_CLIENT_SECRET="{CLIENT_SECRET}"')
print(f'export CHROME_REFRESH_TOKEN="{refresh}"')
print('export CHROME_EXTENSION_ID="jomeclciefpboanjnlfcdfgfjalldfno"')
print("")
print("then: source ~/.zshrc && ./scripts/chrome-publish.sh draft")
PY
