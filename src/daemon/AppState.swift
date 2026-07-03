// Reads local cosmos sync state written by the daemon runner and settings UI.

import Foundation

enum FdaStatus: String {
    case unknown
    case granted
    case denied
    case noImessage
}

struct SourceStatus {
    let name: String
    let status: String
    let finishedAt: Date?
    let message: String
}

struct DaemonTickStatus {
    let finishedAt: Date?
    let imessageExit: Int?
    let browserExit: Int?
    let calendarExit: Int?
    let claudeDesktopExit: Int?
    let shellHistoryExit: Int?
}

enum AppState {
    private static let home = NSHomeDirectory()

    static var daemonStatusPath: String { "\(home)/.cosmos/daemon-status.json" }
    static var syncResultsPath: String { "\(home)/.cosmos/sync-results.json" }
    static var imessageStatePath: String { "\(home)/.cosmos/imessage-state.json" }
    static var syncConfigPath: String { "\(home)/.cosmos/sync-config.json" }
    static var daemonPlistPath: String {
        "\(home)/Library/LaunchAgents/com.polaritylab.cosmos-mcp.sync.plist"
    }
    static var menuPlistPath: String {
        "\(home)/Library/LaunchAgents/com.polaritylab.cosmos-mcp.menu.plist"
    }
    static var installedAppPath: String {
        let apps = "\(home)/Applications"
        for name in ["Cosmos.app", "Cosmos Sync.app"] {
            let path = "\(apps)/\(name)"
            if FileManager.default.fileExists(atPath: path) { return path }
        }
        return "\(apps)/Cosmos.app"
    }

    static var backgroundSyncInstalled: Bool {
        FileManager.default.fileExists(atPath: daemonPlistPath)
    }

    static var menuAtLoginInstalled: Bool {
        FileManager.default.fileExists(atPath: menuPlistPath)
    }

    static func loadDaemonTick() -> DaemonTickStatus? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: daemonStatusPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return DaemonTickStatus(
            finishedAt: parseDate(json["finished_at"] as? String),
            imessageExit: json["imessage_exit"] as? Int,
            browserExit: json["browser_exit"] as? Int,
            calendarExit: json["calendar_exit"] as? Int,
            claudeDesktopExit: json["claude_desktop_exit"] as? Int,
            shellHistoryExit: json["shell_history_exit"] as? Int
        )
    }

    static func loadSourceStatuses() -> [SourceStatus] {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: syncResultsPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sources = json["sources"] as? [String: Any] else {
            return []
        }
        let order = ["imessage", "browser", "calendar", "claude-desktop", "shell-history"]
        return order.compactMap { key -> SourceStatus? in
            guard let row = sources[key] as? [String: Any] else { return nil }
            return SourceStatus(
                name: key,
                status: (row["status"] as? String) ?? "unknown",
                finishedAt: parseDate(row["finished_at"] as? String),
                message: (row["message"] as? String) ?? ""
            )
        }
    }

    /// Last successful iMessage pull — same field Settings shows as "Last iMessage".
    static func lastImessageSyncDate() -> Date? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: imessageStatePath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return parseDate(json["last_sync_at"] as? String)
    }

    static func lastBackgroundRunDate() -> Date? {
        let tick = loadDaemonTick()?.finishedAt
        let results = loadSourceStatuses().compactMap(\.finishedAt).max()
        switch (tick, results) {
        case let (a?, b?): return max(a, b)
        case let (a?, nil): return a
        case let (nil, b?): return b
        default: return nil
        }
    }

    static func lastActivityDate() -> Date? {
        lastImessageSyncDate() ?? lastBackgroundRunDate()
    }

    static func overallHealth(fda: FdaStatus) -> String {
        if fda == .denied { return "needs_full_disk_access" }
        if let tick = loadDaemonTick() {
            if tick.imessageExit == 1 { return "imessage_failed" }
            if [tick.browserExit, tick.calendarExit, tick.claudeDesktopExit, tick.shellHistoryExit]
                .contains(where: { $0 == 1 }) {
                return "partial_failure"
            }
            if tick.finishedAt != nil { return "ok" }
        }
        if backgroundSyncInstalled { return "waiting" }
        return "not_configured"
    }

    static func relativeTime(_ date: Date?) -> String {
        guard let date else { return "never" }
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "just now" }
        if seconds < 3600 { return "\(seconds / 60)m ago" }
        if seconds < 86400 { return "\(seconds / 3600)h ago" }
        return "\(seconds / 86400)d ago"
    }

    static func parseProbeJson(_ text: String) -> (ok: Bool, chats: Int?, error: String?) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = trimmed.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (false, nil, trimmed.isEmpty ? "probe failed" : trimmed)
        }
        let ok = (json["ok"] as? Bool) ?? false
        let chats = json["chat_count"] as? Int
        let error = json["error"] as? String
        return (ok, chats, error)
    }

    private static func parseDate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: raw)
    }
}
