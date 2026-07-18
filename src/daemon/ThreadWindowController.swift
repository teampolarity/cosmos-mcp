// Native Today window — same product as the browser, native SwiftUI.

import AppKit
import SwiftUI

final class ThreadWindowController: NSWindowController {
    private var hosting: NSHostingController<CosmosAppView>!

    init(menuApp: CosmosMenuApp) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 800),
            styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Cosmos"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 420, height: 560)
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(white: 0.02, alpha: 1.0)
        super.init(window: window)

        let view = CosmosAppView(onOpenSettings: { [weak menuApp] in
            menuApp?.openPreferences()
        })
        hosting = NSHostingController(rootView: view)

        let visualEffect = NSVisualEffectView()
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.material = .hudWindow
        visualEffect.autoresizingMask = [.width, .height]
        visualEffect.frame = window.contentView?.bounds ?? NSRect(x: 0, y: 0, width: 520, height: 800)

        let hostingView = hosting.view
        hostingView.frame = visualEffect.bounds
        hostingView.autoresizingMask = [.width, .height]
        visualEffect.addSubview(hostingView)
        window.contentView = visualEffect
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    func presentThread() {
        window?.center()
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    func presentConnect() {
        presentThread()
        NotificationCenter.default.post(name: .cosmosShowConnect, object: nil)
    }

    /// Keychain session is read per API call; post refresh after sign-in/out.
    func reloadSession() {
        NotificationCenter.default.post(name: .cosmosRefreshThread, object: nil)
    }
}
