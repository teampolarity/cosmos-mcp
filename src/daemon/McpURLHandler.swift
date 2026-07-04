// Handles cosmos-mcp://provision?key=pmk_... from Connectors in the running app.

import Foundation

enum McpURLHandler {
    /// Returns a user-facing result message.
    static func handle(_ url: URL, notify: @escaping (String, String) -> Void) {
        guard url.scheme?.lowercased() == "cosmos-mcp" else { return }

        switch url.host?.lowercased() {
        case "provision":
            guard let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "key" })?
                .value?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                key.hasPrefix("pmk_") else {
                notify("MCP key handoff failed", "The link did not include a valid pmk_ key.")
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                let result = McpRunner.run(["provision", key])
                DispatchQueue.main.async {
                    McpKeyStore.invalidateCache()
                    NotificationCenter.default.post(name: .cosmosMcpKeyProvisioned, object: nil)
                    if result.ok {
                        notify("MCP key saved", "Cursor can use Cosmos without copying the key.")
                        NotificationCenter.default.post(name: .cosmosShowConnect, object: nil)
                    } else {
                        notify("MCP key handoff failed", McpRunner.formatOutput(result))
                    }
                }
            }
        default:
            notify("Unknown cosmos-mcp link", url.absoluteString)
        }
    }
}
