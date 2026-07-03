// Local MCP key presence (~/.config/cosmos-mcp/token) for Connect UI.

import Foundation

enum McpKeyStore {
    private static var tokenPath: String {
        NSHomeDirectory() + "/.config/cosmos-mcp/token"
    }

    static var isProvisioned: Bool {
        guard let key = loadKey() else { return false }
        return key.hasPrefix("pmk_") && key.count > 8
    }

    static func loadKey() -> String? {
        guard let raw = try? String(contentsOfFile: tokenPath, encoding: .utf8) else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static var handlerInstalled: Bool {
        let path = NSHomeDirectory() + "/Library/Application Support/cosmos-mcp/cosmos-mcp-handler.app"
        return FileManager.default.fileExists(atPath: path)
    }
}
