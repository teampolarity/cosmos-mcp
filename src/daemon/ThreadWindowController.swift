// Native Today window — same product as the browser, native SwiftUI.

import AppKit
import SwiftUI

final class ThreadWindowController: NSWindowController {
    private var hosting: NSHostingController<NativeTodayView>!

    init(menuApp: CosmosMenuApp) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 780),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Cosmos"
        window.minSize = NSSize(width: 360, height: 560)
        window.isReleasedWhenClosed = false
        window.backgroundColor = .black
        super.init(window: window)

        let view = NativeTodayView(onOpenSettings: { [weak menuApp] in
            menuApp?.openPreferences()
        })
        hosting = NSHostingController(rootView: view)
        window.contentView = hosting.view
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
