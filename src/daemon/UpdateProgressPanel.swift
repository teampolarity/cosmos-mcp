import AppKit
import Foundation

/// Floating panel with determinate progress while `cosmos-mcp update install` runs.
final class UpdateProgressPanel {
    private var panel: NSPanel?
    private var progressBar: NSProgressIndicator?
    private var statusLabel: NSTextField?
    private var pollTimer: Timer?
    private let progressPath = NSHomeDirectory() + "/.cosmos/update-progress.json"

    func show(title: String = "Installing Cosmos") {
        DispatchQueue.main.async {
            self.hide()
            let panel = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: 360, height: 110),
                styleMask: [.titled, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            panel.title = title
            panel.isFloatingPanel = true
            panel.level = .floating
            panel.hidesOnDeactivate = false
            panel.isReleasedWhenClosed = false
            panel.titlebarAppearsTransparent = true
            panel.titleVisibility = .visible

            let content = NSView(frame: NSRect(x: 0, y: 0, width: 360, height: 110))

            let label = NSTextField(labelWithString: "Starting…")
            label.frame = NSRect(x: 20, y: 58, width: 320, height: 20)
            label.font = NSFont.systemFont(ofSize: 13)
            label.lineBreakMode = .byTruncatingMiddle
            content.addSubview(label)
            self.statusLabel = label

            let bar = NSProgressIndicator(frame: NSRect(x: 20, y: 28, width: 320, height: 20))
            bar.isIndeterminate = false
            bar.minValue = 0
            bar.maxValue = 100
            bar.doubleValue = 0
            bar.isBezeled = true
            content.addSubview(bar)
            self.progressBar = bar

            panel.contentView = content
            panel.center()
            NSApp.activate(ignoringOtherApps: true)
            panel.makeKeyAndOrderFront(nil)
            self.panel = panel

            self.pollTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
                self?.refreshFromDisk()
            }
            RunLoop.main.add(self.pollTimer!, forMode: .common)
        }
    }

    func hide() {
        DispatchQueue.main.async {
            self.pollTimer?.invalidate()
            self.pollTimer = nil
            self.panel?.orderOut(nil)
            self.panel = nil
            self.progressBar = nil
            self.statusLabel = nil
        }
    }

    private func refreshFromDisk() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: progressPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let percent = (json["percent"] as? Double) ?? (json["percent"] as? Int).map(Double.init) ?? 0
        let message = (json["message"] as? String) ?? "Working…"
        progressBar?.doubleValue = percent
        statusLabel?.stringValue = message
    }
}
