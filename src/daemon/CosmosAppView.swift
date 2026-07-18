// Cosmos App View — macOS sidebar navigation with Today, Read, Know tabs.
// Replaces CosmosMainView. Sidebar-driven like Linear/Arc for native Mac feel.

import SwiftUI

enum CosmosTab: Int, CaseIterable {
    case today = 0
    case read = 1
    case know = 2
}

struct CosmosAppView: View {
    var onOpenSettings: () -> Void = {}

    @State private var activeTab: CosmosTab = .today
    @State private var showConnect = false
    @State private var showCapture = false
    @State private var captureText = ""
    @State private var captureStatus = ""
    @State private var captureSending = false
    @State private var hoverTab: CosmosTab? = nil
    @State private var hoverCapture = false
    @State private var hoverSettings = false

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            
            Rectangle()
                .fill(CosmosTheme.border)
                .frame(width: 1)
            
            mainContent
        }
        .background(CosmosTheme.void)
        .onReceive(NotificationCenter.default.publisher(for: .cosmosShowConnect)) { _ in
            showConnect = true
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        VStack(spacing: 0) {
            // Top spacer for traffic lights
            Spacer()
                .frame(height: 52)

            // Navigation tabs
            VStack(spacing: 2) {
                sidebarButton(
                    tab: .today,
                    icon: "sun.max",
                    label: "Today",
                    shortcut: "1"
                )
                sidebarButton(
                    tab: .read,
                    icon: "book",
                    label: "Read",
                    shortcut: "2"
                )
                sidebarButton(
                    tab: .know,
                    icon: "brain.head.profile",
                    label: "Know",
                    shortcut: "3"
                )
            }
            .padding(.horizontal, 6)

            Spacer()

            // Bottom actions
            VStack(spacing: 2) {
                // Capture button
                Button(action: { showCapture.toggle() }) {
                    VStack(spacing: 3) {
                        Image(systemName: showCapture ? "xmark" : "plus")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(showCapture ? CosmosTheme.text : CosmosTheme.captureAccent)
                        Text(showCapture ? "Close" : "Capture")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(showCapture ? CosmosTheme.textFaint : CosmosTheme.captureAccent)
                    }
                    .frame(width: 52, height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(showCapture ? CosmosTheme.sidebarActive : (hoverCapture ? CosmosTheme.sidebarHover : Color.clear))
                    )
                }
                .buttonStyle(.plain)
                .onHover { hoverCapture = $0 }

                // Connect button
                Button(action: { showConnect = true }) {
                    VStack(spacing: 3) {
                        Image(systemName: "link")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(CosmosTheme.textFaint)
                        Text("Connect")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(CosmosTheme.textFaint)
                    }
                    .frame(width: 52, height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(hoverSettings ? CosmosTheme.sidebarHover : Color.clear)
                    )
                }
                .buttonStyle(.plain)
                .onHover { hoverSettings = $0 }
            }
            .padding(.horizontal, 6)
            .padding(.bottom, 12)
        }
        .frame(width: 64)
        .background(CosmosTheme.sidebar)
    }

    private func sidebarButton(tab: CosmosTab, icon: String, label: String, shortcut: String) -> some View {
        let isActive = activeTab == tab
        let isHover = hoverTab == tab

        return Button(action: { activeTab = tab }) {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: isActive ? .semibold : .regular))
                    .foregroundColor(isActive ? CosmosTheme.accent : CosmosTheme.textMuted)
                Text(label)
                    .font(.system(size: 9, weight: isActive ? .semibold : .medium))
                    .foregroundColor(isActive ? CosmosTheme.accent : CosmosTheme.textFaint)
            }
            .frame(width: 52, height: 48)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isActive ? CosmosTheme.sidebarActive : (isHover ? CosmosTheme.sidebarHover : Color.clear))
            )
        }
        .buttonStyle(.plain)
        .onHover { hoverTab = $0 ? tab : nil }
        .keyboardShortcut(KeyEquivalent(Character(shortcut)), modifiers: .command)
    }

    // MARK: - Main Content

    private var mainContent: some View {
        ZStack {
            CosmosTheme.void.ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar with cosmos branding
                topBar

                // Tab content
                Group {
                    switch activeTab {
                    case .today:
                        NativeTodayView(onOpenSettings: onOpenSettings)
                    case .read:
                        NativeThreadView(onOpenSettings: onOpenSettings)
                    case .know:
                        NativeKnowView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            // Capture overlay
            if showCapture {
                captureOverlay
            }

            // Connect sheet
            if showConnect {
                ConnectSheetView(
                    onClose: { showConnect = false },
                    onOpenSettings: onOpenSettings,
                    onLoadThread: {
                        NotificationCenter.default.post(name: .cosmosRefreshThread, object: nil)
                    }
                )
            }
        }
    }

    private var topBar: some View {
        HStack {
            Text("cosmos")
                .font(.system(size: 15, weight: .semibold, design: .default))
                .foregroundColor(CosmosTheme.text)
                .padding(.leading, 56)

            Spacer()

            Text(tabTitle)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .textCase(.uppercase)
                .foregroundColor(CosmosTheme.textFaint)
                .padding(.trailing, 16)
        }
        .frame(height: 48)
        .padding(.horizontal, 8)
    }

    private var tabTitle: String {
        switch activeTab {
        case .today: return "today"
        case .read: return "read"
        case .know: return "know"
        }
    }

    // MARK: - Capture Overlay

    private var captureOverlay: some View {
        VStack {
            Spacer()

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("capture")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .textCase(.uppercase)
                        .foregroundColor(CosmosTheme.textFaint)
                    Spacer()
                    Button(action: { showCapture = false }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(CosmosTheme.textMuted)
                    }
                    .buttonStyle(.plain)
                }

                TextEditor(text: $captureText)
                    .font(.system(size: 14))
                    .frame(minHeight: 60, maxHeight: 120)
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(CosmosTheme.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(CosmosTheme.border, lineWidth: 1)
                    )

                HStack {
                    if !captureStatus.isEmpty {
                        Text(captureStatus)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(CosmosTheme.textFaint)
                    }
                    Spacer()
                    Button(action: submitCapture) {
                        Text(captureSending ? "sending…" : "send")
                            .font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .foregroundColor(.black)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(captureSending ? CosmosTheme.textMuted : CosmosTheme.accent)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || captureSending)
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(CosmosTheme.surfaceRaised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(CosmosTheme.border, lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
            .shadow(color: Color.black.opacity(0.4), radius: 20, y: 10)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func submitCapture() {
        let text = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        captureSending = true
        captureStatus = ""

        CosmosAPIClient.submitCapture(text: text) { result in
            captureSending = false
            switch result {
            case .success(let reply):
                captureText = ""
                captureStatus = reply.isEmpty ? "captured" : reply
                NotificationCenter.default.post(name: .cosmosRefreshThread, object: nil)
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    if !captureStatus.isEmpty { captureStatus = "" }
                    showCapture = false
                }
            case .failure(let err):
                captureStatus = err.message
            }
        }
    }
}
