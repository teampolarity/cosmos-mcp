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
            styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Cosmos"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 440, height: 480)
        window.isReleasedWhenClosed = false
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

        let visualEffect = NSVisualEffectView()
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.material = .hudWindow
        visualEffect.autoresizingMask = [.width, .height]

        let hostingView = hosting.view
        hostingView.autoresizingMask = [.width, .height]
        visualEffect.addSubview(hostingView)
        window.contentView = visualEffect
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
