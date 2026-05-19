// Cosmos Sync launcher. Sole purpose: give launchd a stable Apple-signed
// bundle id to fire, so macOS TCC can grant Full Disk Access to one
// thing instead of /bin/bash. The actual sync logic lives in
// daemon-run.sh, written by `cosmos-mcp daemon install`.

import Foundation

let runnerPath = NSString(string: "~/Library/Application Support/cosmos-mcp/daemon-run.sh")
    .expandingTildeInPath

guard FileManager.default.fileExists(atPath: runnerPath) else {
    FileHandle.standardError.write(Data("cosmos-sync: runner not found at \(runnerPath). Run `cosmos-mcp daemon install` first.\n".utf8))
    exit(1)
}

// execve into /bin/bash with the runner so daemon-run.sh inherits this
// process's TCC entitlement (Full Disk Access granted to this .app's
// bundle id). Using exec instead of Process means the bash invocation
// IS the responsible process — TCC walks the responsibility chain via
// the parent's bundle id, and our parent IS the .app.
let argv: [String] = ["/bin/bash", runnerPath]
let cArgs = argv.map { strdup($0) } + [nil]
defer { cArgs.forEach { if let p = $0 { free(p) } } }
execv("/bin/bash", cArgs)

// execv only returns on failure.
FileHandle.standardError.write(Data("cosmos-sync: execv failed: \(String(cString: strerror(errno)))\n".utf8))
exit(2)
