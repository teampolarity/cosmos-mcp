// Local MCP key — keychain (primary) + ~/.config/cosmos-mcp/token JSON fallback.

import Foundation
import Security

enum McpKeyStore {
    private static let keychainService = "cosmos-mcp-key"
    private static let keychainAccount = "cosmos-mcp"

    private static var tokenPath: String {
        NSHomeDirectory() + "/.config/cosmos-mcp/token"
    }

    static var isProvisioned: Bool {
        guard let key = loadKey() else { return false }
        return key.hasPrefix("pmk_") && key.count > 12
    }

    static func loadKey() -> String? {
        if let fromChain = readKeychain(), fromChain.hasPrefix("pmk_") { return fromChain }
        return readTokenFile()
    }

    static var handlerInstalled: Bool {
        let path = NSHomeDirectory() + "/Library/Application Support/cosmos-mcp/cosmos-mcp-handler.app"
        return FileManager.default.fileExists(atPath: path)
    }

    private static func readKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return value
    }

    private static func readTokenFile() -> String? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: tokenPath)) else { return nil }
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let key = json["key"] as? String {
            let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if let raw = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           raw.hasPrefix("pmk_") {
            return raw
        }
        return nil
    }
}
