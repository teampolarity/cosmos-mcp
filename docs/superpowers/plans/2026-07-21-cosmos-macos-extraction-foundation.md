# Cosmos macOS Extraction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a dedicated history-preserving `cosmos-macos` repository with a working Tauri 2 application, a tested `cosmos-mcp` status contract, and Hermes configuration that treats web, iOS, macOS, and MCP as one coordinated Cosmos workspace.

**Architecture:** The new Tauri app owns desktop presentation and packaging while `cosmos-mcp` remains the headless sync and integration engine. The first executable slice resolves the existing CLI, reads machine-readable daemon state, and renders that state in a React shell; the existing Swift app stays in `cosmos-mcp` until the later feature-port and release-cutover plans pass acceptance.

**Tech Stack:** Tauri 2, Rust 1.94, React, TypeScript, Vite, Vitest, npm, existing `cosmos-mcp` TypeScript and Vitest, Hermes projects, MCP, local skills, and shell hooks.

## Global Constraints

- Work from current upstream state and never overwrite dirty user work.
- Create the local repository at `/Users/shadrack/projects/cosmos/apps/macos` and target `teampolarity/cosmos-macos` as its remote.
- Keep `cosmos-mcp` desktop source and the current public Mac artifact intact during this phase.
- Use bundle identifier `com.polaritylab.cosmos.macos` for the Tauri app.
- Preserve the Keychain services, `cosmos-mcp` URL scheme, sync launchd label, and installed path used by the existing app.
- Never write credentials, certificates, MCP keys, Cloudflare tokens, or App Store Connect values into a repository.
- Product-surface accounting covers web, iOS, and macOS; MCP and Obsidian enter scope only for shared contracts, authentication, ingestion, sync, or release integration.
- No external publish under `sh6drack` when `teampolarity/cosmos-macos` cannot be created.

---

### Task 1: Extract the desktop history into its own repository

**Files:**
- Create repository: `/Users/shadrack/projects/cosmos/apps/macos`
- Preserve: `reference/swift/src/daemon/**`
- Preserve: `reference/swift/scripts/build-daemon-app.sh`
- Preserve: `reference/swift/scripts/build-daemon-app-dev.sh`
- Preserve: `reference/swift/scripts/render-app-icons.sh`
- Preserve: `reference/swift/scripts/resolve-sign-identity.sh`
- Preserve: `reference/swift/docs/macos-release-signing.md`
- Preserve: `reference/swift/tests/daemon/**`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/README.md`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/AGENTS.md`

**Interfaces:**
- Consumes: Git history from `/Users/shadrack/projects/cosmos/services/mcp` at branch `codex/cosmos-macos-tauri-split`.
- Produces: A standalone `main` branch whose history contains the desktop source commits and whose active root is ready for Tauri.

- [ ] **Step 1: Verify the destination is absent and the source is clean**

Run:

```bash
test ! -e /Users/shadrack/projects/cosmos/apps/macos
git -C /Users/shadrack/projects/cosmos/services/mcp status --short
```

Expected: the first command exits zero and the source status contains only the committed plan work.

- [ ] **Step 2: Clone and filter the relevant history**

Run:

```bash
git clone --no-local --single-branch --branch codex/cosmos-macos-tauri-split /Users/shadrack/projects/cosmos/services/mcp /Users/shadrack/projects/cosmos/apps/macos
cd /Users/shadrack/projects/cosmos/apps/macos
git filter-repo --force \
  --path src/daemon/ \
  --path scripts/build-daemon-app.sh \
  --path scripts/build-daemon-app-dev.sh \
  --path scripts/render-app-icons.sh \
  --path scripts/resolve-sign-identity.sh \
  --path docs/macos-release-signing.md \
  --path assets/cosmos-app-icon.svg \
  --path assets/cosmos-orb.svg \
  --path assets/cosmos-orb-menubar.svg \
  --path tests/daemon/
git branch -M main
```

Expected: `git log --oneline -- src/daemon` contains the prior native application commits, including the native hub and source-progress work.

- [ ] **Step 3: Move the retained implementation under a reference boundary**

Run:

```bash
mkdir -p reference/swift/src reference/swift/scripts reference/swift/docs reference/swift/tests reference/swift/assets
git mv src/daemon reference/swift/src/daemon
git mv scripts/*.sh reference/swift/scripts/
git mv docs/macos-release-signing.md reference/swift/docs/macos-release-signing.md
git mv tests/daemon reference/swift/tests/daemon
git mv assets/*.svg reference/swift/assets/
```

Expected: no active Swift source remains at the repository root, while `git log --follow` still reaches the original files.

- [ ] **Step 4: Add repository instructions**

Create `README.md` with this content:

```markdown
# Cosmos for macOS

The dedicated Tauri desktop client for Cosmos.

`cosmos-macos` owns the desktop interface, app lifecycle, signing, notarization, DMG, and updater. `@polarity-lab/cosmos-mcp` remains the headless source-connector and sync engine.

The previous Swift implementation is retained under `reference/swift` until the Tauri replacement passes the live desktop acceptance lane.
```

Create `AGENTS.md` with this content:

```markdown
# Cosmos macOS

## Boundaries

- This repository owns the Tauri desktop app and macOS release artifacts.
- Connector and sync-engine behavior belongs in `../mcp` and must remain callable without this UI.
- Web and iOS do not need identical presentation, but every product feature must record a web, iOS, and macOS disposition.
- Preserve `cosmos-mcp` Keychain service names, the provisioning URL scheme, the sync launchd label, and `~/Applications/Cosmos.app` through migration.
- Do not remove the reference Swift app until a signed and notarized Tauri release passes live acceptance.

## Verification

- Frontend tests use `npm test`.
- Rust tests use `cargo test --manifest-path src-tauri/Cargo.toml`.
- Production builds use `npm run tauri build`.
- A release is not proven by compilation. Verify the installed app, live authenticated data, signing, notarization, and updater failure behavior.
```

- [ ] **Step 5: Verify history and commit the extraction boundary**

Run:

```bash
git log --follow --oneline -- reference/swift/src/daemon/MenuApp.swift | head
git status --short
git add README.md AGENTS.md reference
git commit -m "chore: extract cosmos macos history" -m "Co-authored-by: Codex <codex@openai.com>"
```

Expected: history reaches commits from `cosmos-mcp`, and the commit contains only the reference move plus repository instructions.

---

### Task 2: Add a machine-readable daemon status contract to cosmos-mcp

**Files:**
- Modify: `/Users/shadrack/projects/cosmos/services/mcp/src/daemon/cli.ts`
- Modify: `/Users/shadrack/projects/cosmos/services/mcp/tests/daemon/cli.test.ts`

**Interfaces:**
- Consumes: `getDaemonStatus()` from `src/daemon/manage.ts`.
- Produces: `cosmos-mcp daemon status --json`, returning one JSON object with `installed`, `loaded`, `plist_path`, `app_path`, `log_path`, `config`, and `last_imessage_sync_at`.

- [ ] **Step 1: Write the failing JSON contract test**

Add this test to `tests/daemon/cli.test.ts`:

```ts
it("prints stable JSON for desktop clients", async () => {
  daemon.getDaemonStatus.mockReturnValue({
    installed: true,
    loaded: true,
    plist_path: "/tmp/cosmos.plist",
    app_path: "/Applications/Cosmos.app",
    log_path: "/tmp/daemon.log",
    config,
    last_imessage_sync_at: "2026-07-21T20:00:00Z",
  });
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await expect(runDaemonCli("status", ["--json"])).resolves.toBe(0);
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(daemon.getDaemonStatus.mock.results[0].value)}\n`);
  } finally {
    stdout.mockRestore();
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the contract is missing**

Run:

```bash
npx vitest run tests/daemon/cli.test.ts
```

Expected: FAIL because `runDaemonCli` ignores `--json` and prints the human status lines.

- [ ] **Step 3: Implement JSON output without changing human output**

Change the function signature and status branch in `src/daemon/cli.ts`:

```ts
export async function runDaemonCli(sub, rest = []) {
  // existing platform guard and setup
  if (action === "status") {
    const st = getDaemonStatus();
    if (rest.includes("--json")) {
      process.stdout.write(`${JSON.stringify(st)}\n`);
      return 0;
    }
    // existing human-readable status output remains unchanged
  }
}
```

- [ ] **Step 4: Verify focused and full MCP suites**

Run:

```bash
npx vitest run tests/daemon/cli.test.ts tests/daemon/manage.test.ts
npm test
npm run build
```

Expected: all tests pass, the build exits zero, and `node bin/cosmos-mcp.js daemon status --json` emits valid JSON.

- [ ] **Step 5: Commit the contract**

Run:

```bash
git add src/daemon/cli.ts tests/daemon/cli.test.ts
git commit -m "feat: expose daemon status as json" -m "Co-authored-by: Codex <codex@openai.com>"
```

---

### Task 3: Scaffold the Tauri 2 application

**Files:**
- Create: `/Users/shadrack/projects/cosmos/apps/macos/package.json`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src/**`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src-tauri/**`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: the extracted repository and Node, npm, Rust, and Cargo already installed on the machine.
- Produces: a Tauri 2 app named Cosmos with bundle identifier `com.polaritylab.cosmos.macos`.

- [ ] **Step 1: Generate the official React TypeScript template**

Run from `/Users/shadrack/projects/cosmos/apps/macos`:

```bash
npm create tauri-app@latest . -- --manager npm --template react-ts --identifier com.polaritylab.cosmos.macos --tauri-version 2 --force --yes
```

Expected: the existing `reference` directory remains and the generator adds the frontend and `src-tauri` trees.

- [ ] **Step 2: Set stable application metadata**

Set the package name to `@polarity-lab/cosmos-macos`, version to `0.1.0`, product name to `Cosmos`, identifier to `com.polaritylab.cosmos.macos`, and main window title to `Cosmos`. Configure `build.beforeDevCommand` as `npm run dev`, `build.beforeBuildCommand` as `npm run build`, `build.devUrl` as `http://localhost:1420`, and `build.frontendDist` as `../dist`.

- [ ] **Step 3: Use the existing Cosmos icon source**

Run:

```bash
npm run tauri icon reference/swift/assets/cosmos-app-icon.svg
```

Expected: Tauri generates the macOS and cross-platform icon set under `src-tauri/icons`.

- [ ] **Step 4: Verify the untouched scaffold**

Run:

```bash
npm install
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --bundles app
```

Expected: frontend build, Rust tests, and the debug `.app` bundle succeed.

- [ ] **Step 5: Commit the scaffold**

Run:

```bash
git add package.json package-lock.json index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts src src-tauri
git commit -m "feat: scaffold cosmos tauri app" -m "Co-authored-by: Codex <codex@openai.com>"
```

---

### Task 4: Implement the scoped cosmos-mcp engine adapter

**Files:**
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src-tauri/src/engine.rs`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `EngineSnapshot { available, version, executable, daemon, error }` serialized with Serde.
- Produces: Tauri command `engine_snapshot() -> Result<EngineSnapshot, String>`.
- Consumes: `cosmos-mcp --version` and `cosmos-mcp daemon status --json`.

- [ ] **Step 1: Write failing Rust tests around executable resolution and JSON parsing**

Create tests inside `src-tauri/src/engine.rs` that create an executable temporary shell script, set `COSMOS_MCP_BIN`, and assert that `snapshot_with_env()` returns `available = true`, the expected version, and parsed daemon state. Add a second test whose script exits nonzero and assert that the snapshot reports the error without panicking.

The test fixture script must return these two outputs:

```text
cosmos-mcp 0.9.57
{"installed":true,"loaded":false,"plist_path":"/tmp/cosmos.plist","app_path":"/Applications/Cosmos.app","log_path":"/tmp/daemon.log","config":{"interval_hours":4,"sources":{"imessage":true}},"last_imessage_sync_at":null}
```

- [ ] **Step 2: Run the Rust tests and confirm the module is missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml engine
```

Expected: FAIL because `engine.rs` and `EngineSnapshot` do not exist.

- [ ] **Step 3: Implement the allowlisted adapter**

Implement `resolve_executable()` with this order.

```rust
const CANDIDATES: &[&str] = &[
    "/opt/homebrew/bin/cosmos-mcp",
    "/usr/local/bin/cosmos-mcp",
];
```

Honor `COSMOS_MCP_BIN` for tests and explicit development overrides. Invoke only `--version` and `daemon status --json`; do not accept arbitrary command strings from the frontend. Deserialize daemon JSON into focused Serde structs and return command errors as data in `EngineSnapshot`.

- [ ] **Step 4: Register the command and verify Rust behavior**

Register with:

```rust
.invoke_handler(tauri::generate_handler![engine::engine_snapshot])
```

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: formatting and all tests pass.

- [ ] **Step 5: Commit the adapter**

Run:

```bash
git add src-tauri/src/engine.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: connect tauri to cosmos mcp" -m "Co-authored-by: Codex <codex@openai.com>"
```

---

### Task 5: Replace the generated screen with the Cosmos desktop shell

**Files:**
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src/lib/engine.ts`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src/components/EngineStatus.tsx`
- Create: `/Users/shadrack/projects/cosmos/apps/macos/src/components/EngineStatus.test.tsx`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/src/App.tsx`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/src/App.css`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/src/main.tsx`
- Modify: `/Users/shadrack/projects/cosmos/apps/macos/package.json`

**Interfaces:**
- Consumes: Tauri command `engine_snapshot`.
- Produces: `loadEngineSnapshot(): Promise<EngineSnapshot>` and a visible desktop state for available, unavailable, installed, and unloaded engine conditions.

- [ ] **Step 1: Add frontend test dependencies**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Add `"test": "vitest run"` to `package.json` and configure Vitest with `environment: "jsdom"` and a setup file importing `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Write the failing status component tests**

Cover these exact states.

```tsx
render(<EngineStatus snapshot={{ available: true, version: "0.9.57", executable: "/opt/homebrew/bin/cosmos-mcp", daemon: { installed: true, loaded: false }, error: null }} />)
expect(screen.getByText("sync paused")).toBeInTheDocument()

render(<EngineStatus snapshot={{ available: false, version: null, executable: null, daemon: null, error: "cosmos-mcp was not found" }} />)
expect(screen.getByText("integration engine unavailable")).toBeInTheDocument()
```

- [ ] **Step 3: Run the tests and confirm the component is missing**

Run:

```bash
npm test
```

Expected: FAIL because `EngineStatus` does not exist.

- [ ] **Step 4: Implement the first Cosmos shell**

Build a three-rail shell with `Today`, `Thread`, `Know`, and `Settings` navigation, while only `Today` is active in this phase. Show the actual engine version, executable source, daemon installed state, daemon loaded state, and configured source count. Use the Cosmos orb asset and the existing black, bone, and electric-violet visual language. Do not copy the Tauri starter screen.

`loadEngineSnapshot()` calls:

```ts
return invoke<EngineSnapshot>("engine_snapshot")
```

Errors render in the status card and do not crash the app.

- [ ] **Step 5: Verify frontend, Rust, and app bundle**

Run:

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --bundles app
```

Expected: every command exits zero and the debug Cosmos app bundle exists.

- [ ] **Step 6: Launch and inspect the built app**

Run:

```bash
open src-tauri/target/debug/bundle/macos/Cosmos.app
```

Expected: the rendered app shows the real local `cosmos-mcp` version and daemon state, with no Tauri starter content.

- [ ] **Step 7: Commit the vertical slice**

Run:

```bash
git add package.json package-lock.json vite.config.ts src src-tauri
git commit -m "feat: show cosmos engine status" -m "Co-authored-by: Codex <codex@openai.com>"
```

---

### Task 6: Configure Hermes for coordinated Cosmos work

**Files:**
- Create: `/Users/shadrack/.hermes/skills/cosmos-workflow/SKILL.md`
- Create: `/Users/shadrack/.hermes/agent-hooks/cosmos-refresh.sh`
- Modify: `/Users/shadrack/.hermes/config.yaml`
- Modify Hermes project state through `hermes project create`
- Modify Hermes MCP state through `hermes mcp add`

**Interfaces:**
- Produces: Hermes project `cosmos` with web as primary plus iOS, macOS, MCP, and Obsidian folders.
- Produces: local skill `cosmos-workflow`.
- Produces: `pre_llm_call` context containing fresh repository state on the first Cosmos turn.
- Produces: Hermes MCP server `cosmos` backed by `@polarity-lab/cosmos-mcp@latest`.

- [ ] **Step 1: Create the local Cosmos workflow skill**

Use the `skill-creator` skill before writing the file. The skill must instruct Hermes to fetch each repository before triage, preserve dirty work, base changes on current `origin/main`, inspect web, iOS, and macOS impact, include MCP or Obsidian only when shared contracts apply, verify the real surface, and distinguish pushed, reviewed, merged, deployed, TestFlight, and notarized states.

- [ ] **Step 2: Create the refresh hook**

The hook reads the Hermes JSON payload from stdin. It exits with `{}` unless `.cwd` is one of the Cosmos project paths. On the first turn it runs `git fetch --prune origin` in each repository, fast-forwards only clean checkouts currently on `main`, and returns a `context` string listing branch, dirty state, local HEAD, and `origin/main` for every repository. A dirty tree or feature branch is reported and never switched or overwritten.

- [ ] **Step 3: Register and approve the hook**

Add this configuration:

```yaml
hooks:
  pre_llm_call:
    - command: /Users/shadrack/.hermes/agent-hooks/cosmos-refresh.sh
      timeout: 60
```

Approve the exact command once with `HERMES_ACCEPT_HOOKS=1`, then run:

```bash
hermes hooks list
hermes hooks doctor
hermes hooks test pre_llm_call
```

Expected: the hook is approved, executable, valid JSON, and finishes within 60 seconds.

- [ ] **Step 4: Create the multi-folder Hermes project**

Run:

```bash
hermes project create Cosmos \
  /Users/shadrack/projects/cosmos/services/web \
  /Users/shadrack/projects/cosmos/apps/ios \
  /Users/shadrack/projects/cosmos/apps/macos \
  /Users/shadrack/projects/cosmos/services/mcp \
  /Users/shadrack/projects/cosmos/clients/obsidian \
  --slug cosmos \
  --primary /Users/shadrack/projects/cosmos/services/web \
  --description "Cosmos web, iOS, macOS, MCP, and connector workspace" \
  --use
```

Expected: `hermes project show cosmos` lists all five folders and web as primary.

- [ ] **Step 5: Add and verify the Cosmos MCP server**

Run:

```bash
hermes mcp add cosmos --command npx --connect-timeout 30 --args -y @polarity-lab/cosmos-mcp@latest
hermes mcp list
```

Start a Hermes one-shot from the Cosmos web folder asking it to call `polarity_whoami`. Expected: it reports the existing Shadrack Cosmos identity with read and write access without exposing the key.

---

### Task 7: Verify, publish what is authorized, and leave the next migration boundary clean

**Files:**
- Modify: `/Users/shadrack/projects/cosmos/services/mcp/docs/superpowers/plans/2026-07-21-cosmos-macos-extraction-foundation.md`
- Create draft PRs only after coherent pushed branches exist.

**Interfaces:**
- Consumes: completed Tasks 1 through 6.
- Produces: a clean local Tauri repository, a tested MCP branch, and verified Hermes configuration.

- [ ] **Step 1: Run the full fresh verification set**

Run:

```bash
cd /Users/shadrack/projects/cosmos/services/mcp
npm test
npm run build

cd /Users/shadrack/projects/cosmos/apps/macos
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --bundles app

hermes project show cosmos
hermes hooks doctor
hermes mcp list
```

Expected: all repository checks pass and every Hermes surface is registered.

- [ ] **Step 2: Exercise the real local behavior**

Launch the built Tauri app and verify that its engine version and daemon state match `cosmos-mcp --version` and `cosmos-mcp daemon status --json`. Run the Hermes Cosmos one-shot and verify `polarity_whoami` against the live service.

- [ ] **Step 3: Attempt the intended GitHub repository creation**

Run from `/Users/shadrack/projects/cosmos/apps/macos`:

```bash
gh repo create teampolarity/cosmos-macos --private --source . --remote origin --push
```

Expected when the active GitHub account has authority: the private repository is created and `main` is pushed. If GitHub rejects ownership, preserve the clean local repository, report the exact authorization blocker, and do not publish under another owner.

- [ ] **Step 4: Push the MCP branch and open a draft PR**

Run:

```bash
cd /Users/shadrack/projects/cosmos/services/mcp
git push -u origin codex/cosmos-macos-tauri-split
gh pr create --draft --base main --head codex/cosmos-macos-tauri-split --title "feat: begin cosmos macos repository split" --body-file /tmp/cosmos-macos-pr-body.md
```

The PR body states the boundary, JSON contract, preserved Swift production path, new repository status, and fresh verification. It does not claim the Tauri replacement is released.

- [ ] **Step 5: Record phase completion**

Check off completed plan steps and commit only the plan checkbox updates with:

```bash
git add docs/superpowers/plans/2026-07-21-cosmos-macos-extraction-foundation.md
git commit -m "docs: record macos extraction foundation" -m "Co-authored-by: Codex <codex@openai.com>"
```

Expected: both repositories are clean. The next plan begins with Connect and authentication, not release cutover or removal of the Swift app.

## STATUS (Theodore cascade 2026-07-23)

- [x] Task 1 — `~/cosmos-macos` extracted with Swift under `reference/swift`
- [x] Task 2 — `daemon status --json` on this branch (tests green); linked locally via `npm link`
- [x] Task 3 — Tauri 2 React/TS scaffold (`com.polaritylab.cosmos.macos`)
- [x] Task 4 — Rust `engine_snapshot` adapter
- [x] Task 5 — Today shell + EngineStatus
- [x] Task 6 — Hermes project `cosmos` + refresh hook + MCP server (Theodore paths)
- [ ] Task 7 — GitHub `teampolarity/cosmos-macos` + draft PR (attempted)
- Swift production app still ships from `cosmos-mcp` until Tauri acceptance

