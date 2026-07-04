// Native Settings — replaces embedded WKWebView settings panel.

import SwiftUI

struct NativeSettingsView: View {
    var onOpenThread: () -> Void = {}
    var onOpenFdaSettings: () -> Void = {}
    var onRecheckFda: () -> Void = {}
    var onMenuRebuild: () -> Void = {}
    @State private var showConnect = false
    @State private var tab = 0
    @State private var fdaStatus: FdaStatus = FdaChecker.loadPersistedStatus()
    @State private var syncConfig = SyncConfig.load()
    @State private var lastImessage = AppState.relativeTime(AppState.lastImessageSyncDate())
    @State private var health = AppState.overallHealth(fda: FdaChecker.loadPersistedStatus())
    @State private var syncing = false
    @State private var statusMessage = ""
    @State private var version = "v\(McpRunner.packageVersion)"

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    Text("Overview").tag(0)
                    Text("Schedule").tag(1)
                    Text("Advanced").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(16)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if tab == 0 { overviewTab }
                        if tab == 1 { scheduleTab }
                        if tab == 2 { advancedTab }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(CosmosTheme.void)

            if showConnect {
                ConnectSheetView(
                    onClose: { showConnect = false },
                    onOpenSettings: { showConnect = false },
                    onLoadThread: {
                        showConnect = false
                        onOpenThread()
                        NotificationCenter.default.post(name: .cosmosRefreshThread, object: nil)
                    }
                )
            }
        }
        .onAppear(perform: refreshLocalState)
    }

    private var overviewTab: some View {
        Group {
            sectionTitle("Full Disk Access")
            fdaCard
            sectionTitle("Sync")
            Text("Last iMessage sync: \(lastImessage)")
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
            Text("Status: \(health.replacingOccurrences(of: "_", with: " "))")
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
            HStack(spacing: 8) {
                cosmosButton("Sync iMessage now", primary: true) { runSync(["imessage", "sync"]) }
                cosmosButton("Run background job", primary: false) { runSync(["daemon", "kick"]) }
            }
            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.textSecondary)
            }
            sectionTitle("Thread")
            Text("MCP key: \(McpKeyStore.isProvisioned ? "provisioned" : "not set — use Connect")")
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
            HStack(spacing: 8) {
                cosmosButton("Open Thread", primary: true) { onOpenThread() }
                cosmosButton("Connect", primary: false) { showConnect = true }
            }
        }
    }

    private var scheduleTab: some View {
        Group {
            sectionTitle("Background interval")
            Picker("Hours", selection: $syncConfig.interval_hours) {
                ForEach(SyncConfig.intervalOptions, id: \.self) { h in
                    Text("\(h)h").tag(h)
                }
            }
            .labelsHidden()
            .onChange(of: syncConfig.interval_hours) { _ in syncConfig.save() }

            sectionTitle("Sources")
            toggleRow("iMessage", keyPath: \.imessage)
            toggleRow("Browser history", keyPath: \.browser, disabled: true)
            toggleRow("Calendar", keyPath: \.calendar, disabled: true)

            cosmosButton(AppState.backgroundSyncInstalled ? "Background sync installed" : "Install background sync", primary: true) {
                runSync(["daemon", "install"])
            }
            .disabled(AppState.backgroundSyncInstalled)
        }
    }

    private var advancedTab: some View {
        Group {
            sectionTitle("Updates")
            Text(version)
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
            cosmosButton("Check for updates", primary: false) {
                runSync(["update", "check", "--json"])
            }
            sectionTitle("Connectors")
            cosmosButton("Open connectors in browser", primary: false) {
                if let url = URL(string: "https://cosmos.polarity-lab.com/connectors") {
                    NSWorkspace.shared.open(url)
                }
            }
        }
    }

    private var fdaCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(fdaColor)
                    .frame(width: 8, height: 8)
                Text(fdaTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(CosmosTheme.text)
            }
            Text(fdaDesc)
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
            HStack(spacing: 8) {
                cosmosButton("Recheck", primary: false) {
                    DispatchQueue.global(qos: .userInitiated).async {
                        let s = FdaChecker.checkAndPersist()
                        DispatchQueue.main.async {
                            fdaStatus = s
                            health = AppState.overallHealth(fda: s)
                            onRecheckFda()
                            onMenuRebuild()
                        }
                    }
                }
                if fdaStatus == .denied {
                    cosmosButton("Grant access", primary: true) { onOpenFdaSettings() }
                }
            }
        }
        .padding(14)
        .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
    }

    private var fdaColor: Color {
        switch fdaStatus {
        case .granted: return CosmosTheme.ok
        case .denied: return CosmosTheme.err
        case .noImessage: return CosmosTheme.warn
        case .unknown: return CosmosTheme.textFaint
        }
    }

    private var fdaTitle: String {
        switch fdaStatus {
        case .granted: return "Full Disk Access granted"
        case .denied: return "Needs Full Disk Access"
        case .noImessage: return "No iMessage database"
        case .unknown: return "Checking access…"
        }
    }

    private var fdaDesc: String {
        switch fdaStatus {
        case .granted: return "Cosmos can read Messages for sync."
        case .denied: return "Add ~/Applications/Cosmos.app in System Settings → Privacy → Full Disk Access."
        case .noImessage: return "Messages database not found on this Mac."
        case .unknown: return "Grant access if iMessage sync is blocked."
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(CosmosTheme.textFaint)
            .padding(.top, 8)
    }

    private func toggleRow(_ title: String, keyPath: WritableKeyPath<SyncSources, Bool>, disabled: Bool = false) -> some View {
        Toggle(title, isOn: Binding(
            get: { syncConfig.sources[keyPath: keyPath] },
            set: {
                guard !disabled else { return }
                syncConfig.sources[keyPath: keyPath] = $0
                syncConfig.save()
            }
        ))
        .disabled(disabled)
        .foregroundColor(disabled ? CosmosTheme.textFaint : CosmosTheme.text)
    }

    private func cosmosButton(_ title: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundColor(primary ? .black : CosmosTheme.text)
                .cosmosCapsule(
                    fill: primary ? CosmosTheme.accent : CosmosTheme.surfaceRaised,
                    stroke: primary ? nil : CosmosTheme.border
                )
        }
        .buttonStyle(.plain)
    }

    private func refreshLocalState() {
        fdaStatus = FdaChecker.loadPersistedStatus()
        health = AppState.overallHealth(fda: fdaStatus)
        lastImessage = AppState.relativeTime(AppState.lastImessageSyncDate())
        syncConfig = SyncConfig.load()
    }

    private func runSync(_ args: [String]) {
        syncing = true
        statusMessage = "Running…"
        DispatchQueue.global(qos: .userInitiated).async {
            let result = McpRunner.run(args)
            DispatchQueue.main.async {
                syncing = false
                statusMessage = result.ok ? "Done." : McpRunner.formatOutput(result)
                refreshLocalState()
                onMenuRebuild()
            }
        }
    }
}
