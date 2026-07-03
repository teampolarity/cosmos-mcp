// Cosmos menu bar app. Native status, notifications, and preferences.

import AppKit
import UserNotifications

final class CosmosMenuApp: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private static let hasOpenedThreadKey = "cosmosHasOpenedThread"
    private var statusItem: NSStatusItem?
    private var updateItem: NSMenuItem?
    private var statusHeaderItem: NSMenuItem?
    private var fdaItem: NSMenuItem?
    private let updateProgress = UpdateProgressPanel()
    private let updateInfoPath = NSHomeDirectory() + "/.cosmos/update-available.json"
    private var refreshTimer: Timer?
    private var isSyncing = false
    var currentFdaStatus: FdaStatus = .unknown

    func rebuildMenuFromOutside() {
        rebuildMenu()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let iconUrl = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconUrl) {
            NSApp.applicationIconImage = icon
        }
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem?.button {
            button.imagePosition = .imageOnly
        }
        setMenuBarIcon(state: .idle)
        rebuildMenu()

        refreshTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.rebuildMenu()
        }
        RunLoop.main.add(refreshTimer!, forMode: .common)

        DispatchQueue.global(qos: .utility).async { [weak self] in
            let status = FdaChecker.checkAndPersist()
            DispatchQueue.main.async {
                self?.currentFdaStatus = status
                self?.rebuildMenu()
                if status == .denied {
                    self?.openPreferences()
                } else {
                    self?.openThreadOnFirstLaunch()
                }
            }
            _ = McpRunner.run(["update", "check", "--json"])
            DispatchQueue.main.async { self?.rebuildMenu() }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        refreshTimer?.invalidate()
    }

    // MARK: - Menu bar icon

    private enum IconState {
        case idle, syncing, warning, error
    }

    private func menuBarOrbImage() -> NSImage? {
        guard let url = Bundle.main.url(forResource: "cosmos-orb-menubar", withExtension: "png"),
              let image = NSImage(contentsOf: url) else { return nil }
        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = true
        return image
    }

    private func setMenuBarIcon(state: IconState) {
        guard let button = statusItem?.button else { return }
        button.title = ""
        button.image = menuBarOrbImage()
        switch state {
        case .idle:
            button.contentTintColor = nil
            button.toolTip = "Cosmos"
        case .syncing:
            button.contentTintColor = .secondaryLabelColor
            button.toolTip = "Cosmos — syncing"
        case .warning:
            button.contentTintColor = .systemOrange
            button.toolTip = "Cosmos — needs Full Disk Access"
        case .error:
            button.contentTintColor = .systemRed
            button.toolTip = "Cosmos — sync failed"
        }
    }

    private func iconStateForHealth() -> IconState {
        if isSyncing { return .syncing }
        if currentFdaStatus == .denied { return .warning }
        switch AppState.overallHealth(fda: currentFdaStatus) {
        case "imessage_failed", "partial_failure": return .error
        default: return .idle
        }
    }

    // MARK: - Menu

    private var appVersion: String { McpRunner.packageVersion }

    private func readUpdateInfo() -> (available: Bool, current: String, latest: String) {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: updateInfoPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let latest = json["latest"] as? String,
              let current = json["current"] as? String else {
            return (false, appVersion, appVersion)
        }
        let available = (json["update_available"] as? Bool) ?? false
        return (available, current, latest)
    }

    private func statusHeaderTitle() -> String {
        var parts: [String] = []
        if let last = AppState.lastImessageSyncDate() {
            parts.append("Last iMessage sync \(AppState.relativeTime(last))")
        } else if let last = AppState.lastBackgroundRunDate() {
            parts.append("Last background run \(AppState.relativeTime(last))")
        } else {
            parts.append("No sync yet")
        }
        if AppState.backgroundSyncInstalled {
            parts.append("background on")
        }
        return parts.joined(separator: " · ")
    }

    private func statusSubline() -> String? {
        switch currentFdaStatus {
        case .granted: return nil
        case .denied: return "Needs Full Disk Access"
        case .noImessage: return "No iMessage database"
        case .unknown: return nil
        }
    }

    private func rebuildMenu() {
        setMenuBarIcon(state: iconStateForHealth())
        let menu = NSMenu()
        let info = readUpdateInfo()

        let brandItem = NSMenuItem(title: "Cosmos", action: nil, keyEquivalent: "")
        brandItem.isEnabled = false
        menu.addItem(brandItem)

        statusHeaderItem = NSMenuItem(title: statusHeaderTitle(), action: nil, keyEquivalent: "")
        statusHeaderItem?.isEnabled = false
        menu.addItem(statusHeaderItem!)

        if let sub = statusSubline() {
            let subItem = NSMenuItem(title: sub, action: nil, keyEquivalent: "")
            subItem.isEnabled = false
            menu.addItem(subItem)
        }

        if currentFdaStatus == .denied {
            fdaItem = makeItem("Grant Full Disk Access…", action: #selector(openFdaFromMenu))
            menu.addItem(fdaItem!)
        }

        if info.available {
            updateItem = makeItem("Update to v\(info.latest)…", action: #selector(installUpdate))
            menu.addItem(updateItem!)
        }
        menu.addItem(.separator())

        menu.addItem(makeItem("Sync iMessage Now", action: #selector(syncImessage)))
        menu.addItem(makeItem("Run Background Job Now", action: #selector(kickDaemon)))
        menu.addItem(.separator())

        menu.addItem(makeItem("Open Cosmos", action: #selector(openThread), key: "t"))
        menu.addItem(makeItem("Connect…", action: #selector(openConnect), key: "k"))
        menu.addItem(makeItem("Settings…", action: #selector(openPreferencesFromMenu), key: ","))
        menu.addItem(.separator())

        if !AppState.menuAtLoginInstalled {
            menu.addItem(makeItem("Install Menu Bar at Login", action: #selector(installMenu)))
        }
        if !AppState.backgroundSyncInstalled {
            menu.addItem(makeItem("Install Background Sync", action: #selector(installDaemon)))
        }
        menu.addItem(makeItem("Check for Updates", action: #selector(checkUpdates)))
        menu.addItem(.separator())

        if CosmosAuthStore.isAuthenticated() {
            menu.addItem(makeItem("Sign Out", action: #selector(signOut)))
            menu.addItem(.separator())
        }

        let versionTitle = info.available
            ? "v\(info.current) · v\(info.latest) available"
            : "v\(info.current) · up to date"
        let versionItem = NSMenuItem(title: versionTitle, action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        menu.addItem(versionItem)
        menu.addItem(makeItem("Quit Cosmos", action: #selector(quitApp), key: "q"))

        statusItem?.menu = menu
    }

    private func makeItem(_ title: String, action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }

    // MARK: - FDA

    func refreshFdaStatus(completion: ((FdaStatus) -> Void)? = nil) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let status = FdaChecker.checkAndPersist()
            self?.currentFdaStatus = status
            completion?(status)
        }
    }

    func openFullDiskAccessSettings() {
        let urls = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        ]
        for raw in urls {
            if let url = URL(string: raw), NSWorkspace.shared.open(url) { return }
        }
        NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/System Settings.app"))
    }

    @objc private func openFdaFromMenu() {
        openFullDiskAccessSettings()
        notify(title: "Grant Full Disk Access", body: "Remove any old Cosmos Sync.app entry, add ~/Applications/Cosmos.app, then Test again in Settings.")
    }

    // MARK: - Preferences

    private lazy var settingsController: SettingsWindowController = {
        SettingsWindowController(menuApp: self)
    }()

    private lazy var threadController: ThreadWindowController = {
        ThreadWindowController(menuApp: self)
    }()

    private lazy var loginController: LoginWindowController = {
        LoginWindowController()
    }()

    func presentThreadOrLogin() {
        if CosmosAuthStore.isAuthenticated() {
            threadController.reloadSession()
            threadController.presentThread()
        } else {
            loginController.present { [weak self] in
                self?.threadController.reloadSession()
                self?.threadController.presentThread()
            }
        }
    }

    func presentConnectOrLogin() {
        if CosmosAuthStore.isAuthenticated() {
            threadController.reloadSession()
            threadController.presentConnect()
        } else {
            loginController.present { [weak self] in
                self?.threadController.reloadSession()
                self?.threadController.presentConnect()
            }
        }
    }

    func presentThread() {
        presentThreadOrLogin()
    }

    func presentConnect() {
        presentConnectOrLogin()
    }

    @objc private func signOut() {
        CosmosAuthStore.clear()
        threadController.reloadSession()
        rebuildMenu()
        notify(title: "Signed out", body: "Sign in again from the menu to open Thread.")
    }

    @objc private func openPreferencesFromMenu() {
        openPreferences()
    }

    func openPreferences() {
        let focus: String? = (currentFdaStatus == .denied || currentFdaStatus == .noImessage) ? "fda" : nil
        settingsController.present(focus: focus)
    }

    func syncImessageFromPreferences() {
        syncImessage()
    }

    // MARK: - Notifications

    private func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    private func showAlertIfNeeded(title: String, message: String, style: NSAlert.Style = .informational) {
        // Reserve modals for hard failures only; routine sync uses notifications.
        guard style == .warning || style == .critical else {
            notify(title: title, body: message)
            return
        }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = style
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    // MARK: - Actions

    @objc private func installUpdate() {
        updateProgress.show()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = McpRunner.run(["update", "install", "--progress"])
            DispatchQueue.main.async {
                self.updateProgress.hide()
                if result.ok {
                    self.notify(
                        title: "Update installed",
                        body: "Quit and reopen Cosmos from the menu bar to load the new version."
                    )
                } else {
                    self.showAlertIfNeeded(
                        title: "Update failed",
                        message: McpRunner.formatOutput(result),
                        style: .warning
                    )
                }
                self.rebuildMenu()
            }
        }
    }

    @objc private func checkUpdates() {
        isSyncing = true
        rebuildMenu()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = McpRunner.run(["update", "check", "--json"])
            let parsed = self.parseUpdateJson(result.stdout) ?? self.readUpdateInfo()
            DispatchQueue.main.async {
                self.isSyncing = false
                if !result.ok {
                    self.showAlertIfNeeded(title: "Could not check for updates", message: McpRunner.formatOutput(result), style: .warning)
                } else if parsed.0 {
                    self.notify(title: "Update available", body: "v\(parsed.2) is on npm. Choose Update from the ◎ menu.")
                } else {
                    self.notify(title: "Up to date", body: "Cosmos v\(parsed.1) matches npm.")
                }
                self.rebuildMenu()
            }
        }
    }

    private func parseUpdateJson(_ text: String) -> (Bool, String, String)? {
        guard let data = text.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let current = json["current"] as? String,
              let latest = json["latest"] as? String else { return nil }
        return ((json["update_available"] as? Bool) ?? false, current, latest)
    }

    @objc private func syncImessage() {
        runSync(args: ["imessage", "sync"], title: "iMessage")
    }

    @objc private func syncAll() {
        syncImessage()
    }

    @objc private func kickDaemon() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = McpRunner.run(["daemon", "kick"])
            DispatchQueue.main.async {
                if result.ok {
                    self.notify(title: "Background sync started", body: "Running in the background. The menu icon updates when it finishes.")
                } else {
                    self.showAlertIfNeeded(title: "Background sync failed", message: McpRunner.formatOutput(result), style: .warning)
                }
            }
        }
    }

    @objc private func openThreadOnFirstLaunch() {
        if UserDefaults.standard.bool(forKey: Self.hasOpenedThreadKey) { return }
        UserDefaults.standard.set(true, forKey: Self.hasOpenedThreadKey)
        presentThread()
    }

    @objc private func openThread() {
        presentThread()
    }

    @objc private func openConnect() {
        presentConnect()
    }

    @objc private func installMenu() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = McpRunner.run(["menu", "install"])
            DispatchQueue.main.async {
                if result.ok {
                    self.notify(title: "Menu bar installed", body: "Cosmos will open at login.")
                } else {
                    self.showAlertIfNeeded(title: "Install failed", message: McpRunner.formatOutput(result), style: .warning)
                }
                self.rebuildMenu()
            }
        }
    }

    @objc private func installDaemon() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = McpRunner.run(["daemon", "install"])
            DispatchQueue.main.async {
                if result.ok {
                    self.notify(title: "Background sync installed", body: "Periodic sync is on. Grant Full Disk Access if you have not already.")
                    if self.currentFdaStatus == .denied { self.openPreferences() }
                } else {
                    self.showAlertIfNeeded(title: "Install failed", message: McpRunner.formatOutput(result), style: .warning)
                }
                self.rebuildMenu()
            }
        }
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    private func runSync(args: [String], title: String, chainAll: Bool = false) {
        isSyncing = true
        rebuildMenu()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            var lastResult = McpRunner.run(args)
            if lastResult.ok && chainAll {
                for src in ["browser", "calendar", "claude-desktop", "shell-history"] {
                    lastResult = McpRunner.run([src, "sync"])
                }
            }
            DispatchQueue.main.async {
                self.isSyncing = false
                self.rebuildMenu()
                if lastResult.ok {
                    self.notify(title: "\(title) sync finished", body: "Open Settings for per-source details.")
                } else {
                    let msg = McpRunner.formatOutput(lastResult)
                    if msg.contains("full disk access") || msg.contains("unable to open database") {
                        _ = FdaChecker.checkAndPersist()
                        self.currentFdaStatus = FdaChecker.loadPersistedStatus()
                        self.rebuildMenu()
                        self.openPreferences()
                    }
                    self.showAlertIfNeeded(title: "\(title) sync failed", message: msg, style: .warning)
                }
            }
        }
    }
}

@main
enum MenuAppMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = CosmosMenuApp()
        app.delegate = delegate
        app.run()
    }
}
