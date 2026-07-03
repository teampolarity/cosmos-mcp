// Shared Connect sheet — MCP key handoff, URL handler, sync status.

import SwiftUI

struct ConnectSheetView: View {
    var onClose: () -> Void = {}
    var onOpenSettings: () -> Void = {}
    var onLoadThread: () -> Void = {}

    @State private var syncHint = ""
    @State private var momentCount = 0
    @State private var handlerMessage = ""
    @State private var signedIn = false
    @State private var mcpReady = false
    @State private var handlerReady = false
    @State private var fdaStatus: FdaStatus = .unknown

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onClose() }

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Connect")
                        .font(.system(size: 16, weight: .semibold))
                    Spacer()
                    Button("Done") { onClose() }
                        .buttonStyle(.plain)
                        .foregroundColor(CosmosTheme.textMuted)
                }

                Text("Thread needs sign-in + iMessage sync. MCP key is only for Cursor and Claude.")
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.textFaint)

                statusRow("Sign in", signedIn ? "signed in" : "required", ok: signedIn)
                statusRow("Full Disk Access", fdaLabel, ok: fdaStatus == .granted)
                statusRow("iMessage sync", imessageHint, ok: fdaStatus == .granted && syncHint.contains("connected"))
                statusRow("MCP key (Cursor)", mcpReady ? "provisioned" : "optional", ok: mcpReady)
                statusRow("URL handler", handlerReady ? "installed" : "optional", ok: handlerReady)

                if !syncHint.isEmpty {
                    Text(syncHint)
                        .font(.system(size: 12))
                        .foregroundColor(CosmosTheme.textMuted)
                }
                if momentCount > 0 {
                    Text("\(momentCount) cards ready in Thread")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(CosmosTheme.accent)
                }
                if !handlerMessage.isEmpty {
                    Text(handlerMessage)
                        .font(.system(size: 11))
                        .foregroundColor(CosmosTheme.textSecondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    if momentCount > 0 {
                        actionButton("Load Thread", primary: true) {
                            onLoadThread()
                            onClose()
                        }
                    }
                    if !mcpReady {
                        actionButton("Open Connectors (mint MCP key)", primary: momentCount == 0) {
                            if let url = URL(string: "https://cosmos.polarity-lab.com/connectors") {
                                NSWorkspace.shared.open(url)
                            }
                        }
                    }
                    if !handlerReady && !mcpReady {
                        actionButton("Install cosmos-mcp:// handler", primary: false) {
                            installHandler()
                        }
                    }
                    if fdaStatus == .denied {
                        actionButton("Grant Full Disk Access", primary: true) {
                            onClose()
                            onOpenSettings()
                        }
                    } else {
                        actionButton("Open Settings", primary: false) {
                            onClose()
                            onOpenSettings()
                        }
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 400)
            .background(CosmosTheme.surfaceRaised)
            .cornerRadius(16)
        }
        .onAppear(perform: refreshLocalStatus)
    }

    private var fdaLabel: String {
        switch fdaStatus {
        case .granted: return "granted"
        case .denied: return "needs access"
        case .noImessage: return "no Messages db"
        case .unknown: return "checking…"
        }
    }

    private var imessageHint: String {
        if fdaStatus != .granted { return "needs FDA" }
        if syncHint.contains("connected") { return "connected" }
        return "sync from Settings"
    }

    private func statusRow(_ label: String, _ value: String, ok: Bool) -> some View {
        HStack {
            Circle()
                .fill(ok ? CosmosTheme.ok : (value.contains("optional") ? CosmosTheme.textFaint : CosmosTheme.warn))
                .frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 12, weight: .medium))
            Spacer()
            Text(value)
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
        }
    }

    private func actionButton(_ title: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(primary ? CosmosTheme.accent : CosmosTheme.surfaceRaised)
                .foregroundColor(primary ? .black : CosmosTheme.text)
                .overlay(RoundedRectangle(cornerRadius: 980).stroke(primary ? Color.clear : CosmosTheme.border))
                .cornerRadius(980)
        }
        .buttonStyle(.plain)
    }

    private func refreshLocalStatus() {
        signedIn = CosmosAuthStore.isAuthenticated()
        fdaStatus = FdaChecker.loadPersistedStatus()
        mcpReady = McpKeyStore.isProvisioned
        handlerReady = McpKeyStore.handlerInstalled
        CosmosAPIClient.fetchSyncStatus { result in
            if case .success(let hint) = result { syncHint = hint }
        }
        CosmosAPIClient.fetchMoments(refresh: false) { result in
            if case .success(let (list, _, _)) = result { momentCount = list.count }
        }
    }

    private func installHandler() {
        handlerMessage = "Installing…"
        DispatchQueue.global(qos: .userInitiated).async {
            let result = McpRunner.run(["install-handler"])
            DispatchQueue.main.async {
                handlerReady = McpKeyStore.handlerInstalled
                handlerMessage = result.ok
                    ? "Handler installed. Tap Open in cosmos-mcp from Connectors."
                    : McpRunner.formatOutput(result)
            }
        }
    }
}
