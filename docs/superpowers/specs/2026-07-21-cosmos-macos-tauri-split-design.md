# Cosmos macOS Tauri split

## Decision

Cosmos macOS becomes a dedicated repository named `cosmos-macos`. The repository owns the desktop application, its Tauri host, the desktop interface, macOS permissions, packaging, signing, notarization, updates, and release artifacts.

`cosmos-mcp` remains the headless integration package. It owns the MCP server, local source connectors, sync orchestration, the background sync contract, and the command line interface used by other clients. It no longer owns a desktop interface or a distributable application after the Tauri replacement passes acceptance.

The split is staged. The existing signed Swift application remains distributable until the Tauri application proves the same user-visible paths. We do not remove a working release path merely because the new repository exists.

## Why the boundary changes

The current `cosmos-mcp` repository contains two products with different release rhythms. Its TypeScript package exposes MCP tools and synchronizes local sources; roughly 6,100 lines of Swift implement a macOS application with Today, Thread, Know, settings, authentication, Full Disk Access guidance, update handling, and direct Cosmos API reads. The web repository then reaches into `cosmos-mcp`, builds that application, and publishes `Cosmos-mac.zip` beside the web release.

That coupling makes a desktop interface change look like an MCP package change, makes npm versions double as app versions, and forces the web deployment path to know the internal layout of another repository. Tauri does not fix this boundary by itself. A dedicated repository does.

## Repository ownership

| Repository | Owns | Does not own |
| --- | --- | --- |
| `cosmos-fork` | Cloudflare backend, web client, shared API contracts, public download metadata | Native desktop implementation |
| `cosmos-ios` | iPhone and iPad client behavior, Apple mobile entitlements, TestFlight | Web or desktop presentation |
| `cosmos-macos` | Tauri desktop app, desktop UI, local app lifecycle, DMG, signing, notarization, updater | MCP protocol implementation or connector business logic |
| `cosmos-mcp` | MCP server, source connectors, sync engine, daemon command contract, npm package | Desktop UI, app bundle, DMG, desktop release metadata |
| `obsidian-cosmos` | Obsidian ingestion plugin | Product-surface parity |

The intended GitHub remote is `teampolarity/cosmos-macos`. The local repository may be created and completed before remote creation, but it must not be silently published under another owner when the `teampolarity` account is unavailable.

## Tauri application shape

The new app uses Tauri 2 with a TypeScript frontend and a Rust host. The initial frontend uses React and Vite because the current desktop application has several stateful surfaces and long-lived background activity; this choice does not require the web client to adopt React or share visual components.

The Tauri app uses the bundle identifier `com.polaritylab.cosmos.macos`. The installed path remains `~/Applications/Cosmos.app`. The existing `cosmos-mcp` URL scheme, Keychain service names, and sync launchd label remain compatible during migration because they belong to provisioning and the headless sync engine, not to the old Swift UI. The release migration verifies Keychain access, URL handoff, launchd state, Full Disk Access behavior, and installed-path behavior before cutover. User credentials remain in the macOS Keychain. No MCP key, App Store Connect key, Cloudflare token, or signing material enters either repository.

The desktop app calls a versioned `cosmos-mcp` command contract. The adapter resolves the integration engine in this order.

1. A bundled and signed sidecar, once its native dependencies pass universal-build and notarization acceptance.
2. A globally installed `cosmos-mcp` executable.
3. A pinned `npx -y @polarity-lab/cosmos-mcp@<compatible-version>` invocation.

This preserves the behavior of the current `McpRunner` while giving the new app a path toward a self-contained distribution. Sidecar execution receives the smallest Tauri capability scope needed for the allowed commands. Arbitrary shell access is not exposed to the frontend.

The command boundary is JSON, not parsed human output. Status, source progress, connection identity, daemon state, update availability, and sync results need stable machine-readable forms in `cosmos-mcp` before the corresponding Tauri screen depends on them.

## Product surfaces and parity accounting

Hermes treats web, iOS, and macOS as the three product surfaces. A feature does not need identical code or presentation on all three. Every product change records one outcome for each surface.

- Implement the same behavior where the capability belongs.
- Adapt the behavior to the platform's interaction model.
- Leave the surface unchanged with a concrete reason.

`cosmos-mcp` and `obsidian-cosmos` enter the review only when a change affects authentication, sync, ingestion, local sources, shared API contracts, or release integration. They are not included in visual parity by default.

## Migration sequence

### Preserve source history

Create `cosmos-macos` from the `cosmos-mcp` history filtered to the desktop source, app build scripts, signing documentation, release tests, and relevant assets. The first commit after extraction records the original `cosmos-mcp` commit. The old paths remain in `cosmos-mcp` during the compatibility window.

### Establish the contract

Add contract tests around every `cosmos-mcp` command the desktop app needs. Where a command only emits display text, add a JSON mode without removing the existing human output. Cover success, partial source failure, missing credentials, missing Full Disk Access, daemon-not-loaded state, and network failure.

### Build the Tauri shell

Scaffold the Tauri repository, set the app identity and icons, implement Keychain access and the scoped MCP runner, then reproduce the application frame and navigation without porting screen behavior all at once. Development builds may use ad hoc signing; release builds require the Polarity Lab team identity.

### Port behavior in vertical slices

Port Connect and authentication first because every other surface depends on identity. Port sync status and settings next, then Today, Thread, and Know. Each slice calls the live Cosmos API or the real local connector path and reads back the state it created. The Swift source remains the behavioral reference, not a component-by-component template.

### Move the release path

`cosmos-macos` produces the signed and notarized `Cosmos.app`, the distributable DMG, updater artifacts, and a machine-readable release manifest containing the app version, source commit, checksum, signing team, and notarization result.

The web repository stops building desktop source. It downloads or stages a verified `cosmos-macos` release artifact and publishes the public download metadata. `Cosmos-mac.json` changes its source repository from `cosmos-mcp` to `cosmos-macos`. Web deployment refuses a stale or unverified desktop artifact in the same way it currently refuses a stale `cosmos-mcp` bundle.

### Retire the embedded app

After the Tauri DMG passes acceptance on a clean macOS user account, remove Swift UI source, app build scripts, desktop bundle contents, and menu-app commands from `cosmos-mcp`. Keep the headless daemon and connector contract. Publish a compatible MCP version and verify both upgrades and fresh installs before deleting the compatibility path from the Tauri app.

## Signing and release credentials

The macOS release requires a Developer ID Application identity for team `SA5F7PACJE`, the App Store Connect issuer and key identifiers, and the existing private key file outside the repositories. Tauri owns signing and notarization after the cutover.

The current keychain identity name and the old `resolve-sign-identity.sh` name policy disagree. The migration resolves identities by certificate type plus expected team identifier, then verifies the signed bundle's `TeamIdentifier`; it does not trust a display-name substring as the security boundary.

The current web deploy environment file is absent at its documented location. Release work must identify the actual Cloudflare credential source and create a local, permission-restricted environment file or use the existing authenticated Wrangler session. No release script may print credential values.

## Failure behavior

The app distinguishes an unavailable MCP engine from an unavailable Cosmos API. Missing Node or npm cannot be reported as a login failure. A connector may fail without erasing the successful status of other connectors. A failed update retains the last runnable application. A failed notarization never replaces the public artifact.

The repo split is reversible until cutover. The existing Swift application and web manifest remain the production path while Tauri is incomplete. The final removal from `cosmos-mcp` happens only after a tagged Tauri release passes the complete acceptance lane.

## Verification

Repository checks cover TypeScript, Rust, command-contract, and frontend behavior. Contract fixtures are shared by copying versioned JSON examples, not by importing source across repositories.

The desktop acceptance lane proves all of the following on the built application.

- The DMG installs and launches on a clean macOS account.
- `codesign --verify`, `spctl --assess`, stapler validation, and TeamIdentifier checks pass.
- URL provisioning stores the MCP credential in Keychain and `polarity_whoami` returns the expected account.
- Full Disk Access guidance reaches a successful iMessage probe without misreporting other connector state.
- Manual and scheduled syncs report per-source progress and persist their final status.
- Today, Thread, and Know load live authenticated data, and their write actions read back the resulting server state.
- The updater rejects an invalid signature and preserves the installed version on failure.
- The web download points at the exact tested `cosmos-macos` release commit and checksum.

Cross-surface verification also records the web, iOS, and macOS disposition for the migrated capabilities. This is an accounting requirement, not a demand for identical interfaces.

## Completion boundary

The split is complete when `cosmos-macos` owns a tagged, signed, notarized, installed, and live-verified Tauri release; the public web download resolves to that artifact; `cosmos-mcp` ships without desktop UI or app packaging; and Hermes has a Cosmos project configuration that refreshes all relevant repositories before triage and requires a surface-disposition record for new product behavior.
