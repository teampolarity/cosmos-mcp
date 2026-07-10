// Shared WKWebView session for cosmos.polarity-lab.com (auth + localStorage).

import WebKit

enum CosmosWebStore {
    static let processPool = WKProcessPool()
    private static let origin = "cosmos.polarity-lab.com"

    static func makeConfiguration(scriptHandler: WKScriptMessageHandler? = nil, handlerName: String = "cosmosApp") -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.processPool = processPool
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.applicationNameForUserAgent = "Cosmos/\(McpRunner.packageVersion) (Macintosh; macOS)"
        if let scriptHandler {
            config.userContentController.add(scriptHandler, name: handlerName)
        }
        if let script = CosmosAuthStore.makeUserScript() {
            config.userContentController.addUserScript(script)
        }
        return config
    }

    /// Signed-in home (Today). Same surface as the browser, with app chrome hints.
    static func threadURL(connect: Bool = false) -> URL {
        var parts = ["app=1"]
        if connect { parts.append("connect=1") }
        return URL(string: "https://\(origin)/?\(parts.joined(separator: "&"))")!
    }

    static func isCosmosSite(_ url: URL?) -> Bool {
        guard let host = url?.host?.lowercased() else { return false }
        return host == origin || host == "www.\(origin)"
    }
}
