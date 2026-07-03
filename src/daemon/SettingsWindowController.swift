// Native Settings window — SwiftUI replaces embedded WKWebView panel.

import AppKit
import SwiftUI

final class SettingsWindowController: NSWindowController {
    private weak var menuApp: CosmosMenuApp?
    private var hosting: NSHostingController<NativeSettingsView>!

    init(menuApp: CosmosMenuApp) {
        self.menuApp = menuApp
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 640),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Cosmos"
        window.minSize = NSSize(width: 440, height: 480)
        window.isReleasedWhenClosed = false
        window.backgroundColor = .black
        super.init(window: window)

        let view = NativeSettingsView(
            onOpenThread: { [weak menuApp] in menuApp?.presentThread() },
            onOpenFdaSettings: { [weak menuApp] in menuApp?.openFullDiskAccessSettings() },
            onRecheckFda: { [weak menuApp] in
                menuApp?.currentFdaStatus = FdaChecker.loadPersistedStatus()
            },
            onMenuRebuild: { [weak menuApp] in menuApp?.rebuildMenuFromOutside() }
        )
        hosting = NSHostingController(rootView: view)
        window.contentView = hosting.view
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    func present(focus: String? = nil) {
        _ = focus
        window?.center()
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        _ = FdaChecker.checkAndPersist()
        menuApp?.currentFdaStatus = FdaChecker.loadPersistedStatus()
    }
}
