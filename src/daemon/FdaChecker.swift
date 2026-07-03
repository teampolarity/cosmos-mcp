// Full Disk Access check from the Cosmos Sync.app process (TCC applies here, not child CLIs).

import Foundation
import SQLite3

enum FdaChecker {
    private static let statusPath = NSHomeDirectory() + "/.cosmos/fda-status.json"

    /// Probe chat.db from this process and persist result for the settings UI.
    @discardableResult
    static func checkAndPersist() -> FdaStatus {
        let chatDb = NSHomeDirectory() + "/Library/Messages/chat.db"
        guard FileManager.default.fileExists(atPath: chatDb) else {
            writeStatus(ok: false, error: "no_imessage", chatCount: nil, latestMessage: nil)
            return .noImessage
        }

        var db: OpaquePointer?
        let openResult = sqlite3_open_v2(chatDb, &db, SQLITE_OPEN_READONLY, nil)
        defer {
            if db != nil { sqlite3_close(db) }
        }

        if openResult != SQLITE_OK {
            let msg = db.map { String(cString: sqlite3_errmsg($0)) } ?? "unable to open database"
            let denied = msg.localizedCaseInsensitiveContains("authorization")
                || msg.localizedCaseInsensitiveContains("operation not permitted")
            writeStatus(ok: false, error: denied ? "fda_denied" : msg, chatCount: nil, latestMessage: nil, detail: msg)
            return denied ? .denied : .denied
        }

        var chatCount = 0
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM chat", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                chatCount = Int(sqlite3_column_int(stmt, 0))
            }
            sqlite3_finalize(stmt)
        }

        var latestIso: String?
        if sqlite3_prepare_v2(db, "SELECT MAX(date) FROM message", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                let ns = sqlite3_column_int64(stmt, 0)
                if ns > 0 {
                    // Apple epoch: 2001-01-01 UTC
                    let appleOffset: Int64 = 978_307_200_000
                    let ms = ns / 1_000_000 + appleOffset
                    let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000.0)
                    latestIso = ISO8601DateFormatter().string(from: date)
                }
            }
            sqlite3_finalize(stmt)
        }

        writeStatus(ok: true, error: nil, chatCount: chatCount, latestMessage: latestIso)
        return .granted
    }

    static func loadPersistedStatus() -> FdaStatus {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: statusPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return .unknown
        }
        if (json["ok"] as? Bool) == true { return .granted }
        let err = (json["error"] as? String) ?? ""
        if err == "no_imessage" { return .noImessage }
        if err == "fda_denied" { return .denied }
        return .denied
    }

    private static func writeStatus(ok: Bool, error: String?, chatCount: Int?, latestMessage: String?, detail: String? = nil) {
        var payload: [String: Any] = [
            "ok": ok,
            "checked_at": ISO8601DateFormatter().string(from: Date()),
            "source": "app",
        ]
        if let error { payload["error"] = error }
        if let detail { payload["detail"] = detail }
        if let chatCount { payload["chat_count"] = chatCount }
        if let latestMessage { payload["latest_message"] = latestMessage }
        let dir = (statusPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: []) {
            try? data.write(to: URL(fileURLWithPath: statusPath))
        }
    }
}
