// Reads/writes ~/.cosmos/sync-config.json (mirrors src/daemon/config.ts).

import Foundation

struct SyncSources: Codable, Equatable {
    var imessage: Bool = true
    var browser: Bool = false
    var calendar: Bool = false
    var claude_desktop: Bool = false
    var shell_history: Bool = false
}

struct SyncConfig: Codable, Equatable {
    var interval_hours: Int = 4
    var sources: SyncSources = SyncSources()
    var auto_update: Bool = false

    static let intervalOptions = [1, 2, 4, 8, 12, 24]

    static var fileURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".cosmos/sync-config.json")
    }

    static func load() -> SyncConfig {
        guard let data = try? Data(contentsOf: fileURL),
              var cfg = try? JSONDecoder().decode(SyncConfig.self, from: data) else {
            return SyncConfig()
        }
        if !intervalOptions.contains(cfg.interval_hours) {
            cfg.interval_hours = 4
        }
        return cfg
    }

    func save() {
        let dir = Self.fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(self) {
            try? data.write(to: Self.fileURL)
        }
    }
}
