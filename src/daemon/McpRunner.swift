// Invokes the cosmos-mcp CLI from the menu bar app. Prefers a global `cosmos-mcp`
// binary when present; otherwise pins to the bundle's CFBundleShortVersionString.

import Foundation

struct RunResult {
    let ok: Bool
    let stdout: String
    let stderr: String
}

enum McpRunner {
    private static let npxPaths = ["/opt/homebrew/bin/npx", "/usr/local/bin/npx"]
    private static let nodePaths = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
    private static let npmModuleRoots = [
        "/opt/homebrew/lib/node_modules",
        "/usr/local/lib/node_modules",
    ]
    private static let cosmosMcpPaths = [
        "/opt/homebrew/bin/cosmos-mcp",
        "/usr/local/bin/cosmos-mcp",
    ]

    static var packageVersion: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "latest"
    }

    @discardableResult
    static func run(_ args: [String], wait: Bool = true) -> RunResult {
        let (cmd, baseArgs) = resolveInvocation()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cmd)
        process.arguments = baseArgs + args
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? "")
        process.environment = env
        let outPipe = Pipe()
        let errPipe = Pipe()
        if wait {
            process.standardOutput = outPipe
            process.standardError = errPipe
        } else {
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
        }
        do {
            try process.run()
            if wait {
                process.waitUntilExit()
                let stdout = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let stderr = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                return RunResult(ok: process.terminationStatus == 0, stdout: stdout, stderr: stderr)
            }
            return RunResult(ok: true, stdout: "", stderr: "")
        } catch {
            return RunResult(ok: false, stdout: "", stderr: error.localizedDescription)
        }
    }

    private static func resolveInvocation() -> (String, [String]) {
        if let node = resolveExecutable(nodePaths) {
            for root in npmModuleRoots {
                let js = "\(root)/@polarity-lab/cosmos-mcp/bin/cosmos-mcp.js"
                if FileManager.default.fileExists(atPath: js) {
                    return (node, [js])
                }
            }
        }
        if let cosmos = resolveExecutable(cosmosMcpPaths) {
            return (cosmos, [])
        }
        if let which = whichExecutable("cosmos-mcp") {
            return (which, [])
        }
        guard let npx = resolveExecutable(npxPaths) ?? whichExecutable("npx") else {
            return ("/usr/bin/false", [])
        }
        return (npx, ["-y", "@polarity-lab/cosmos-mcp@\(packageVersion)"])
    }

    private static func resolveExecutable(_ paths: [String]) -> String? {
        paths.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private static func whichExecutable(_ name: String) -> String? {
        let which = Process()
        which.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        which.arguments = [name]
        let pipe = Pipe()
        which.standardOutput = pipe
        which.standardError = FileHandle.nullDevice
        do {
            try which.run()
            which.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return path.isEmpty ? nil : path
        } catch {
            return nil
        }
    }

    static func formatOutput(_ result: RunResult) -> String {
        var parts: [String] = []
        if !result.stdout.isEmpty { parts.append(result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)) }
        if !result.stderr.isEmpty { parts.append(result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)) }
        if parts.isEmpty { parts.append(result.ok ? "(no output)" : "Command failed.") }
        return parts.joined(separator: "\n\n")
    }
}
