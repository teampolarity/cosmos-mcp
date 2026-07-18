// Native Know View — SwiftUI memory dashboard. Replaces today know sheets.

import SwiftUI

struct NativeKnowView: View {
    @State private var loading = true
    @State private var payload: KnowsPayload?
    @State private var errorMessage = ""
    @State private var intentText = ""
    @State private var savingIntent = false
    @State private var statusMessage = ""

    var body: some View {
        ZStack {
            CosmosTheme.void.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                if loading && payload == nil {
                    Spacer()
                    ProgressView().progressViewStyle(.circular)
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else if let payload {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            headerView
                            intentSection(payload)
                            fadeSection(payload)
                            beliefsSection(payload)
                            sourcesSection(payload)
                            
                            if payload.wrongOrFadedCount > 0 {
                                Text("\(payload.wrongOrFadedCount) corrections logged. cosmos learns from every one.")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(CosmosTheme.textFaint)
                                    .padding(.top, 8)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                } else {
                    Spacer()
                    Text(errorMessage.isEmpty ? "could not load what cosmos knows." : errorMessage)
                        .font(.system(size: 14))
                        .foregroundColor(CosmosTheme.textMuted)
                        .multilineTextAlignment(.center)
                        .padding()
                        .frame(maxWidth: .infinity)
                    Spacer()
                }
            }

            if !statusMessage.isEmpty {
                VStack {
                    Spacer()
                    Text(statusMessage)
                        .font(.system(size: 9, design: .monospaced))
                        .textCase(.uppercase)
                        .foregroundColor(CosmosTheme.textFaint)
                        .padding(.bottom, 8)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear(perform: loadKnows)
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("what I know")
                .font(.system(size: 10, design: .monospaced))
                .textCase(.uppercase)
                .foregroundColor(CosmosTheme.textFaint)
                .padding(.top, 12)
            
            Text("here's what I've picked up. fix anything that feels off.")
                .font(.system(size: 13))
                .foregroundColor(CosmosTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func sectionHeader(_ title: String, subtitle: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(CosmosTheme.accent)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 10))
                    .foregroundColor(CosmosTheme.textFaint)
            }
        }
        .padding(.top, 4)
    }

    private func intentSection(_ payload: KnowsPayload) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("making room for", subtitle: "cosmos weights today toward this.")
            
            HStack(spacing: 8) {
                TextField("family time, shipping cosmos, sleeping before midnight…", text: $intentText)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                    .disabled(savingIntent)
                
                Button("save") { saveIntent() }
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .textCase(.uppercase)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .foregroundColor(CosmosTheme.accent)
                    .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                    .buttonStyle(.plain)
                    .disabled(savingIntent || intentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func fadeSection(_ payload: KnowsPayload) -> some View {
        Group {
            if !payload.fadeLabels.isEmpty || !payload.vetoes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    sectionHeader("what you taught it to fade", subtitle: "unique to cosmos. your vetoes train suppression.")
                    
                    VStack(spacing: 6) {
                        ForEach(payload.fadeLabels, id: \.self) { label in
                            HStack {
                                Text(label)
                                    .font(.system(size: 13))
                                    .foregroundColor(CosmosTheme.text)
                                Spacer()
                                Button("forget") { forgetTasteLabel(label) }
                                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                    .textCase(.uppercase)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .foregroundColor(CosmosTheme.textMuted)
                                    .cosmosCapsule(fill: Color.clear, stroke: CosmosTheme.border)
                                    .buttonStyle(.plain)
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 12)
                            .cosmosRoundedRect(10, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                        }
                        
                        ForEach(payload.vetoes.prefix(6)) { v in
                            if !payload.fadeLabels.contains(v.label) {
                                HStack {
                                    Text(v.action == "wrong" ? "wrong" : "faded")
                                        .font(.system(size: 8, design: .monospaced))
                                        .textCase(.uppercase)
                                        .foregroundColor(CosmosTheme.textFaint)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 3)
                                        .cosmosCapsule(fill: Color.clear, stroke: CosmosTheme.border)
                                    
                                    Text(v.label)
                                        .font(.system(size: 13))
                                        .foregroundColor(CosmosTheme.textSecondary)
                                    Spacer()
                                }
                                .padding(.vertical, 6)
                                .padding(.horizontal, 12)
                                .cosmosRoundedRect(10, fill: CosmosTheme.surfaceRaised.opacity(0.5), stroke: CosmosTheme.border.opacity(0.5))
                            }
                        }
                    }
                }
            }
        }
    }

    private func beliefsSection(_ payload: KnowsPayload) -> some View {
        Group {
            if !payload.beliefs.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    sectionHeader("what it believes", subtitle: "tap forget if this is wrong.")
                    
                    VStack(spacing: 8) {
                        ForEach(payload.beliefs) { b in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(b.type)
                                        .font(.system(size: 8, design: .monospaced))
                                        .textCase(.uppercase)
                                        .foregroundColor(CosmosTheme.textFaint)
                                    Spacer()
                                    Button("forget") { forgetBelief(b.id) }
                                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                        .textCase(.uppercase)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .foregroundColor(CosmosTheme.err)
                                        .cosmosCapsule(fill: Color.clear, stroke: CosmosTheme.err.opacity(0.3))
                                        .buttonStyle(.plain)
                                }
                                
                                Text(b.label)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(CosmosTheme.text)
                                    .fixedSize(horizontal: false, vertical: true)
                                
                                if !b.excerpt.isEmpty && b.excerpt != b.label {
                                    Text(b.excerpt)
                                        .font(.system(size: 11))
                                        .foregroundColor(CosmosTheme.textSecondary)
                                        .italic()
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(12)
                            .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                        }
                    }
                }
            }
        }
    }

    private func sourcesSection(_ payload: KnowsPayload) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("what it reads")
            
            VStack(alignment: .leading, spacing: 6) {
                sourceRowItem("messages", value: payload.sources.imessageTurns > 0 ? "\(payload.sources.imessageTurns) turns indexed" : "not connected yet")
                sourceRowItem("calendar", value: payload.sources.calendarEvents > 0 ? "\(payload.sources.calendarEvents) events" : "not connected yet")
                sourceRowItem("graph", value: payload.sources.graphNodes > 0 ? "\(payload.sources.graphNodes) nodes" : "empty")
            }
            .padding(12)
            .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
        }
    }

    private func sourceRowItem(_ name: String, value: String) -> some View {
        HStack {
            Text(name)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(CosmosTheme.textSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 12))
                .foregroundColor(CosmosTheme.textMuted)
        }
        .padding(.vertical, 3)
    }

    private func loadKnows() {
        loading = true
        errorMessage = ""
        CosmosAPIClient.fetchKnows { result in
            loading = false
            switch result {
            case .success(let p):
                payload = p
                intentText = p.intent ?? ""
            case .failure(let err):
                errorMessage = err.message
            }
        }
    }

    private func saveIntent() {
        guard !savingIntent else { return }
        savingIntent = true
        let text = intentText.trimmingCharacters(in: .whitespacesAndNewlines)
        CosmosAPIClient.updateKnows(action: "set_intent", body: ["intent": text]) { result in
            savingIntent = false
            switch result {
            case .success(let p):
                payload = p
                intentText = p.intent ?? ""
                flashStatus("intent saved")
            case .failure(let err):
                flashStatus(err.message)
            }
        }
    }

    private func forgetTasteLabel(_ label: String) {
        CosmosAPIClient.updateKnows(action: "forget_taste_label", body: ["label": label]) { result in
            switch result {
            case .success(let p):
                payload = p
                flashStatus("forgot label")
            case .failure(let err):
                flashStatus(err.message)
            }
        }
    }

    private func forgetBelief(_ id: Int) {
        CosmosAPIClient.updateKnows(action: "forget_belief", body: ["node_id": id]) { result in
            switch result {
            case .success(let p):
                payload = p
                flashStatus("forgot belief")
            case .failure(let err):
                flashStatus(err.message)
            }
        }
    }

    private func flashStatus(_ text: String) {
        statusMessage = text
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            if statusMessage == text { statusMessage = "" }
        }
    }
}
