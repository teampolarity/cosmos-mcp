// Keychain-backed Cosmos web session (JWT + profile fields for Thread).

import Foundation
import Security
import WebKit

struct CosmosSession {
    let token: String
    let email: String
    let username: String
    let hasAppAccess: Bool
}

enum CosmosAuthStore {
    private static let service = "com.polaritylab.cosmos.session"
    private static let tokenKey = "cosmos_token"
    private static let emailKey = "cosmos_email"
    private static let usernameKey = "cosmos_username"

    static func save(_ session: CosmosSession) {
        write(tokenKey, session.token)
        write(emailKey, session.email)
        write(usernameKey, session.username)
    }

    static func clear() {
        delete(tokenKey)
        delete(emailKey)
        delete(usernameKey)
    }

    static func loadToken() -> String? {
        guard let token = read(tokenKey), !token.isEmpty else { return nil }
        if isExpired(token) {
            clear()
            return nil
        }
        return token
    }

    static func loadEmail() -> String? { read(emailKey) }
    static func loadUsername() -> String? { read(usernameKey) }

    static func isAuthenticated() -> Bool { loadToken() != nil }

    static func loadSession() -> CosmosSession? {
        guard let token = loadToken() else { return nil }
        return CosmosSession(
            token: token,
            email: read(emailKey) ?? "",
            username: read(usernameKey) ?? "",
            hasAppAccess: true
        )
    }

    /// Injects localStorage before Thread scripts run.
    static func makeUserScript() -> WKUserScript? {
        guard let token = loadToken() else { return nil }
        let email = read(emailKey) ?? ""
        let username = read(usernameKey) ?? ""
        let source = """
        (function(){
          try {
            localStorage.setItem('cosmos_token', \(jsLiteral(token)));
            localStorage.setItem('cosmos_email', \(jsLiteral(email)));
            localStorage.setItem('cosmos_username', \(jsLiteral(username)));
          } catch (e) {}
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    private static func jsLiteral(_ value: String) -> String {
        // Do not use JSONSerialization here — it throws Obj-C exceptions (not Swift
        // errors) for some strings and will abort the app on the post-login path.
        if let data = try? JSONEncoder().encode(value),
           let encoded = String(data: data, encoding: .utf8) {
            return encoded
        }
        var out = "\""
        for scalar in value.unicodeScalars {
            switch scalar.value {
            case 0x22: out += "\\\""
            case 0x5c: out += "\\\\"
            case 0x08: out += "\\b"
            case 0x0c: out += "\\f"
            case 0x0a: out += "\\n"
            case 0x0d: out += "\\r"
            case 0x09: out += "\\t"
            case 0x00...0x1f:
                out += String(format: "\\u%04x", scalar.value)
            default:
                out.unicodeScalars.append(scalar)
            }
        }
        out += "\""
        return out
    }

    private static func isExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return true }
        var b64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let pad = (4 - b64.count % 4) % 4
        b64 += String(repeating: "=", count: pad)
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? Double else {
            return false
        }
        return exp * 1000 < Date().timeIntervalSince1970 * 1000 - 30_000
    }

    private static func write(_ account: String, _ value: String) {
        delete(account)
        let bytes = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: bytes,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func read(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }

    private static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
