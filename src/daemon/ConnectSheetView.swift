// Shared Connect sheet — MCP key handoff, URL handler, sync status.

import SwiftUI

struct ConnectSheetView: View {
    var onClose: () -> Void = {}
    var onOpenSettings: () -> Void = {}

    @State private var syncHint = ""
    @State private var momentCount = 0
    @State private var loading = true
    @State private var handlerMessage = ""

    private var fda: FdaStatus { FdaChecker.loadPersistedStatus() }
    private var mcpReady: Bool { McpKeyStore.isProvisioned }
    private var handlerReady: Bool { McpKeyStore.handlerInstalled }

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

                statusRow("Sign in", CosmosAuthStore.isAuthenticated() ? "signed in" : "required", ok: CosmosAuthStore.isAuthenticated())
                statusRow("Full Disk Access", fdaLabel, ok: fda == .granted)
                statusRow("MCP key", mcpReady ? "provisioned" : "not set", ok: mcpReady)
                statusRow("URL handler", handlerReady ? "installed" : "optional", ok: handlerReady)

                if !syncHint.isEmpty {
                    Text(syncHint)
                        .font(.system(size: 12))
                        .foregroundColor(CosmosTheme.textMuted)
                }
                if momentCount > 0 {
                    Text("\(momentCount) cards in Thread")
                        .font(.system(size: 12))
                        .foregroundColor(CosmosTheme.textSecondary)
                }
                if !handlerMessage.isEmpty {
                    Text(handlerMessage)
                        .font(.system(size: 11))
                        .foregroundColor(CosmosTheme.textSecondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    actionButton("Open Connectors (mint MCP key)", primary: true) {
                        if let url = URL(string: "https://cosmos.polarity-lab.com/connectors") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                    if !handlerReady {
                        actionButton("Install cosmos-mcp:// handler", primary: false) {
                            installHandler()
                        }
                    }
                    actionButton("Open Settings", primary: false) {
                        onClose()
                        onOpenSettings()
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 380)
            .background(CosmosTheme.surfaceRaised)
            .cornerRadius(16)
        }
        .onAppear(perform: refreshCloudStatus)
    }

    private var fdaLabel: String {
        switch fda {
        case .granted: return "granted"
        case .denied: return "needs access"
        case .noImessage: return "no Messages db"
        case .unknown: return "checking…"
        }
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

    private func installHandler() {
        handlerMessage = "Installing…"
        DispatchQueue.global(qos: .userInitiated).async {
            let result = McpRunner.run(["install-handler"])
            DispatchQueue.main.async {
                handlerMessage = result.ok
                    ? "Handler installed. Use Open in cosmos-mcp from Connectors."
                    : McpRunner.formatOutput(result)
            }
        }
    }

    private func refreshCloudStatus() {
        loading = true
        CosmosAPIClient.fetchSyncStatus { result in
            loading = false
            if case .success(let hint) = result { syncHint = hint }
        }
        CosmosAPIClient.fetchMoments { result in
            if case .success(let (list, _)) = result { momentCount = list.count }
        }
    }
}
