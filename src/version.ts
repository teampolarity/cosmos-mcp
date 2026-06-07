// Single source of truth for the runtime version string. Reads
// package.json once at module load, walking up from this file's URL.
// Centralizing here means the User-Agent header, the --version output,
// and the MCP handshake all stay in lockstep with `npm version`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function resolveVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Compiled layout: dist/version.js → ../package.json.
    // Source layout (tests via vitest): src/version.ts → ../package.json.
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
  } catch {
    /* fall through */
  }
  return "0.0.0-unknown";
}

export const PACKAGE_VERSION: string = resolveVersion();
