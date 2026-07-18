// Cosmos Main View — Hosts the Today, Read, and Know views in a native segmented tab interface.

import SwiftUI

struct CosmosMainView: View {
    var onOpenSettings: () -> Void = {}
    
    @State private var activeTab = 0
    @State private var showConnect = false

    var body: some View {
        ZStack {
            CosmosTheme.void.ignoresSafeArea()

            VStack(spacing: 0) {
                // Unified Top Bar
                HStack(spacing: 12) {
                    Text("cosmos")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(CosmosTheme.text)
                        .padding(.leading, 64)
                    
                    Spacer()
                    
                    Picker("", selection: $activeTab) {
                        Text("Today").tag(0)
                        Text("Read").tag(1)
                        Text("Know").tag(2)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                    
                    Spacer()
                    
                    Button("Connect") { showConnect = true }
                        .font(.system(size: 9, weight: .regular))
                        .textCase(.uppercase)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .foregroundColor(CosmosTheme.accent)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                        .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.top, 24)
                .padding(.bottom, 8)
                
                Divider()
                    .background(CosmosTheme.border)
                
                // Tab Content
                Group {
                    switch activeTab {
                    case 0:
                        NativeTodayView(onOpenSettings: onOpenSettings)
                    case 1:
                        NativeThreadView(onOpenSettings: onOpenSettings)
                    case 2:
                        NativeKnowView()
                    default:
                        EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

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
        .onReceive(NotificationCenter.default.publisher(for: .cosmosShowConnect)) { _ in
            showConnect = true
        }
    }
}
