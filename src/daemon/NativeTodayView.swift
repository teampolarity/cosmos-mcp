// Native Today — suppression-first home. Same API as the web surface.

import SwiftUI

struct NativeTodayView: View {
    var onOpenSettings: () -> Void = {}

    @State private var showConnect = false
    @State private var loading = true
    @State private var payload: TodayPayload?
    @State private var errorMessage = ""
    @State private var statusMessage = ""
    @State private var morningEnabled = false
    @State private var onboarding: ThreadOnboardingStatus?
    @State private var onboardingAnswer = ""
    @State private var showOnboarding = false

    var body: some View {
        ZStack {
            CosmosTheme.void.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                content
            }

            if showOnboarding, let ob = onboarding, !ob.complete {
                onboardingOverlay(ob)
            }

            if showConnect {
                ConnectSheetView(
                    onClose: { showConnect = false },
                    onOpenSettings: {
                        showConnect = false
                        onOpenSettings()
                    },
                    onLoadThread: { loadToday() }
                )
            }
        }
        .onAppear {
            loadOnboarding()
            loadToday()
        }
        .onReceive(NotificationCenter.default.publisher(for: .cosmosShowConnect)) { _ in
            showConnect = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .cosmosRefreshThread)) { _ in
            loadToday()
        }
    }

    private var topBar: some View {
        HStack {
            Text("cosmos")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(CosmosTheme.text)
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
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var content: some View {
        if loading && payload == nil {
            Spacer()
            ProgressView()
                .progressViewStyle(.circular)
            Spacer()
        } else if let payload {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    hero(payload)
                    if let frog = payload.frog {
                        itemCard(frog)
                    }
                    ForEach(payload.supports) { item in
                        itemCard(item)
                    }
                    if !payload.statsLine.isEmpty {
                        Text(payload.statsLine)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(CosmosTheme.textFaint)
                    }
                    morningToggle
                    if payload.surfaced == 0 {
                        doneBlock(payload)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        } else {
            Spacer()
            Text(errorMessage.isEmpty ? "could not load today." : errorMessage)
                .font(.system(size: 14))
                .foregroundColor(CosmosTheme.textMuted)
                .multilineTextAlignment(.center)
                .padding()
            Spacer()
        }

        if !statusMessage.isEmpty {
            Text(statusMessage)
                .font(.system(size: 9, design: .monospaced))
                .textCase(.uppercase)
                .foregroundColor(CosmosTheme.textFaint)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 8)
        }
    }

    private func hero(_ payload: TodayPayload) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("today")
                .font(.system(size: 10, design: .monospaced))
                .textCase(.uppercase)
                .foregroundColor(CosmosTheme.textFaint)
            Text(payload.headline)
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(CosmosTheme.text)
                .fixedSize(horizontal: false, vertical: true)
            if let summary = payload.summary {
                Text(summary)
                    .font(.system(size: 10, design: .monospaced))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.accent.opacity(0.82))
            }
            if let declared = payload.declared, !declared.isEmpty {
                Text("making room for: \(declared)")
                    .font(.system(size: 14))
                    .foregroundColor(CosmosTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func itemCard(_ item: TodayItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if item.isFrog {
                Text("frog")
                    .font(.system(size: 9, design: .monospaced))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.accent)
            }
            Text(item.label)
                .font(.system(size: item.isFrog ? 18 : 16, weight: .medium))
                .foregroundColor(CosmosTheme.text)
                .fixedSize(horizontal: false, vertical: true)
            if !item.why.isEmpty {
                Text(item.why)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(item.isFrog ? CosmosTheme.textSecondary : CosmosTheme.textFaint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Button("done") { submit(item, action: "done") }
                    .font(.system(size: 12, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .foregroundColor(CosmosTheme.accent)
                    .cosmosCapsule(
                        fill: CosmosTheme.accentDim,
                        stroke: CosmosTheme.accent.opacity(0.35)
                    )
                    .buttonStyle(.plain)
                Menu {
                    Button("wrong") { submit(item, action: "wrong") }
                    Button("not important") { submit(item, action: "not_important") }
                } label: {
                    Text("⋯")
                        .font(.system(size: 18))
                        .frame(width: 44, height: 44)
                        .foregroundColor(CosmosTheme.textFaint)
                        .cosmosCapsule(fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                }
                .menuStyle(.borderlessButton)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cosmosRoundedRect(
            20,
            fill: item.isFrog
                ? CosmosTheme.surfaceRaised.opacity(0.95)
                : CosmosTheme.surfaceRaised,
            stroke: item.isFrog ? CosmosTheme.accent.opacity(0.36) : CosmosTheme.border
        )
    }

    private var morningToggle: some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: $morningEnabled) {
                Text("morning text (7–9am)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(CosmosTheme.textFaint)
            }
            .toggleStyle(.checkbox)
            .onChange(of: morningEnabled) { enabled in
                CosmosAPIClient.setTodayMorningPref(enabled: enabled) { result in
                    switch result {
                    case .success(let next):
                        payload = next
                        morningEnabled = next.morningText
                        flashStatus(enabled ? "morning text on" : "morning text off")
                    case .failure(let err):
                        morningEnabled = !enabled
                        flashStatus(err.message)
                    }
                }
            }
            Text(morningEnabled ? nextMorningLabel() : "off until you toggle it on")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(CosmosTheme.textFaint)
        }
        .padding(.top, 4)
    }

    private func doneBlock(_ payload: TodayPayload) -> some View {
        VStack(spacing: 12) {
            Text(payload.readCount > 0 ? "done for today." : "nothing needs you today.")
                .font(.system(size: 16))
                .foregroundColor(CosmosTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    private func loadToday() {
        loading = true
        errorMessage = ""
        CosmosAPIClient.fetchToday { result in
            loading = false
            switch result {
            case .success(let next):
                payload = next
                morningEnabled = next.morningText
            case .failure(let err):
                errorMessage = err.message
                payload = nil
            }
        }
    }

    private func submit(_ item: TodayItem, action: String) {
        CosmosAPIClient.submitTodayFeedback(item: item, action: action) { result in
            switch result {
            case .success(let next):
                payload = next
                morningEnabled = next.morningText
                switch action {
                case "done": flashStatus("marked done")
                case "wrong": flashStatus("got it — less like this tomorrow")
                default: flashStatus("will surface less like this")
                }
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

    private func nextMorningLabel() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 7 { return "next text: today, 7–9am" }
        if hour < 9 { return "next text: this morning" }
        return "next text: tomorrow, 7–9am"
    }

    private func loadOnboarding() {
        CosmosAPIClient.fetchOnboarding { result in
            if case .success(let ob) = result {
                onboarding = ob
                showOnboarding = !ob.complete
            }
        }
    }

    private func submitOnboarding(skip: Bool) {
        let answer = onboardingAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
        if !skip && answer.isEmpty { return }
        CosmosAPIClient.submitOnboarding(answer: skip ? nil : answer, skip: skip) { result in
            switch result {
            case .success(let ob):
                onboarding = ob
                if ob.complete {
                    showOnboarding = false
                    loadToday()
                }
            case .failure(let err):
                flashStatus(err.message)
            }
        }
    }

    private func onboardingOverlay(_ ob: ThreadOnboardingStatus) -> some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text("quick setup")
                    .font(.system(size: 10, design: .monospaced))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.textFaint)
                Text(ob.question)
                    .font(.system(size: 15))
                    .foregroundColor(CosmosTheme.text)
                TextEditor(text: $onboardingAnswer)
                    .frame(height: 80)
                    .padding(8)
                    .cosmosRoundedRect(8, fill: CosmosTheme.surface)
                HStack {
                    Button("skip — learn from what I dismiss") { submitOnboarding(skip: true) }
                        .buttonStyle(.plain)
                        .foregroundColor(CosmosTheme.textMuted)
                    Spacer()
                    Button("continue") { submitOnboarding(skip: false) }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundColor(.black)
                        .cosmosCapsule(fill: CosmosTheme.accent)
                        .buttonStyle(.plain)
                }
            }
            .padding(20)
            .frame(maxWidth: 360)
            .cosmosRoundedRect(16, fill: CosmosTheme.surfaceRaised)
        }
    }
}
