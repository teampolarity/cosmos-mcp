// Native Thread — deck, receipts sheet, compose (replaces WKWebView Thread).

import SwiftUI

struct NativeThreadView: View {
    var onOpenSettings: () -> Void = {}

    @State private var showConnect = false
    @State private var index = 0
    @State private var loading = true
    @State private var refreshing = false
    @State private var errorMessage = ""
    @State private var statusMessage = ""
    @State private var replyText = ""
    @State private var sheetMoment: ThreadMoment?
    @State private var provenance: [ProvenanceStep] = []
    @State private var provenanceLoading = false
    @State private var moments: [ThreadMoment] = []
    @State private var onboarding: ThreadOnboardingStatus?
    @State private var onboardingAnswer = ""
    @State private var showOnboarding = false

    private var active: ThreadMoment? {
        guard !moments.isEmpty, index >= 0, index < moments.count else { return nil }
        return moments[index]
    }

    var body: some View {
        ZStack {
            CosmosTheme.void.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                content
                composeBar
            }

            if showOnboarding, let ob = onboarding, !ob.complete {
                onboardingOverlay(ob)
            }

            if let moment = sheetMoment {
                receiptsSheet(moment)
            }

            if showConnect {
                ConnectSheetView(
                    onClose: { showConnect = false },
                    onOpenSettings: {
                        showConnect = false
                        onOpenSettings()
                    }
                )
            }
        }
        .onAppear {
            loadOnboarding()
            loadMoments(refresh: false)
        }
        .onReceive(NotificationCenter.default.publisher(for: .cosmosShowConnect)) { _ in
            showConnect = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .cosmosRefreshThread)) { _ in
            loadMoments(refresh: true)
        }
    }

    private var topBar: some View {
        VStack(spacing: 8) {
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
                    .background(CosmosTheme.accentDim)
                    .foregroundColor(CosmosTheme.accent)
                    .overlay(RoundedRectangle(cornerRadius: 980).stroke(CosmosTheme.accent.opacity(0.35)))
                    .cornerRadius(980)
                    .buttonStyle(.plain)
            }

            if moments.count > 1 {
                HStack(spacing: 8) {
                    pagerButton("←", disabled: index == 0) { index -= 1 }
                    VStack(spacing: 2) {
                        Text(active?.label.uppercased() ?? "")
                    .font(.system(size: 9, weight: .regular))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.textMuted)
                            .lineLimit(1)
                        Text("\(index + 1) / \(moments.count)")
                            .font(.system(size: 9))
                            .foregroundColor(CosmosTheme.textFaint)
                    }
                    .frame(maxWidth: .infinity)
                    pagerButton("→", disabled: index >= moments.count - 1) { index += 1 }
                    Button("↻") { loadMoments(refresh: true) }
                        .font(.system(size: 14))
                        .frame(width: 36, height: 36)
                        .background(CosmosTheme.surfaceRaised)
                        .overlay(Circle().stroke(CosmosTheme.border))
                        .buttonStyle(.plain)
                        .disabled(refreshing)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var content: some View {
        if loading && moments.isEmpty {
            Spacer()
            ProgressView().progressViewStyle(.circular)
            Spacer()
        } else if moments.isEmpty {
            Spacer()
            VStack(spacing: 12) {
                Text(errorMessage.isEmpty ? "Still listening. Link iMessage or refresh when there is more signal." : errorMessage)
                    .font(.system(size: 14))
                    .foregroundColor(CosmosTheme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                Button("Connect iMessage") { showConnect = true }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(CosmosTheme.accent)
                    .foregroundColor(.black)
                    .cornerRadius(980)
            }
            Spacer()
        } else if let moment = active {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(moment.body)
                        .font(.system(size: 15))
                        .foregroundColor(CosmosTheme.text)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button("See receipts · \(moment.sheet.receipts.count)") {
                        openSheet(moment)
                    }
                    .font(.system(size: 9, weight: .regular))
                    .textCase(.uppercase)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(CosmosTheme.surfaceRaised)
                    .overlay(RoundedRectangle(cornerRadius: 980).stroke(CosmosTheme.border))
                    .foregroundColor(CosmosTheme.textSecondary)
                    .buttonStyle(.plain)
                }
                .padding(16)
                .background(CosmosTheme.surfaceRaised)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(CosmosTheme.border))
                .padding(12)
            }
        }
    }

    private var composeBar: some View {
        HStack(spacing: 8) {
            TextField(active?.canReply == true ? "reply…" : "reply on a person card…", text: $replyText)
                .textFieldStyle(.plain)
                .padding(10)
                .background(CosmosTheme.surfaceRaised)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(CosmosTheme.border))
                .disabled(active?.canReply != true)
            Button("↑") { sendReply() }
                .font(.system(size: 16, weight: .bold))
                .frame(width: 40, height: 40)
                .background(CosmosTheme.accentDim)
                .foregroundColor(CosmosTheme.accent)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(CosmosTheme.accent.opacity(0.35)))
                .buttonStyle(.plain)
                .disabled(active?.canReply != true || replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(12)
    }

    private func pagerButton(_ label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .frame(width: 36, height: 36)
                .background(CosmosTheme.surfaceRaised)
                .overlay(Circle().stroke(CosmosTheme.border))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.3 : 1)
    }

    private func receiptsSheet(_ moment: ThreadMoment) -> some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { sheetMoment = nil }

            VStack(spacing: 0) {
                HStack {
                    Text("Receipts")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Button("Done") { sheetMoment = nil }
                        .buttonStyle(.plain)
                }
                .padding(16)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !moment.sheet.whatWeSaw.isEmpty {
                            sheetSection("What we saw", moment.sheet.whatWeSaw)
                        }
                        ForEach(moment.sheet.receipts) { r in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(r.label.uppercased())
                                    .font(.system(size: 9))
                                    .foregroundColor(CosmosTheme.textFaint)
                                if !r.supports.isEmpty {
                                    Text(r.supports)
                                        .font(.system(size: 11))
                                        .foregroundColor(CosmosTheme.textMuted)
                                }
                                Text(r.text)
                                    .font(.system(size: 13))
                                    .foregroundColor(CosmosTheme.text)
                            }
                            .padding(12)
                            .background(CosmosTheme.surface)
                            .cornerRadius(10)
                        }
                        if !moment.sheet.read.isEmpty {
                            sheetSection("Why the card says that", moment.sheet.read)
                        }
                        if provenanceLoading {
                            Text("Tracing connector sources…")
                                .font(.system(size: 12))
                                .foregroundColor(CosmosTheme.textMuted)
                        }
                        ForEach(provenance) { step in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(step.label)
                                    .font(.system(size: 11, weight: .medium))
                                if !step.excerpt.isEmpty {
                                    Text(step.excerpt)
                                        .font(.system(size: 12))
                                        .foregroundColor(CosmosTheme.textSecondary)
                                }
                            }
                            .padding(12)
                            .background(CosmosTheme.surface)
                            .cornerRadius(10)
                        }
                    }
                    .padding(16)
                }
            }
            .frame(maxWidth: 420, maxHeight: 520)
            .background(CosmosTheme.surfaceRaised)
            .cornerRadius(16)
            .padding(24)
        }
    }

    private func sheetSection(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
            Text(body)
                .font(.system(size: 13))
                .foregroundColor(CosmosTheme.textSecondary)
        }
    }

    private func onboardingOverlay(_ ob: ThreadOnboardingStatus) -> some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                if ob.total > 0 {
                    Text("\(min(ob.progress + 1, ob.total)) / \(ob.total)")
                        .font(.system(size: 11))
                        .foregroundColor(CosmosTheme.textFaint)
                }
                Text(ob.question)
                    .font(.system(size: 15))
                    .foregroundColor(CosmosTheme.text)
                TextEditor(text: $onboardingAnswer)
                    .frame(height: 80)
                    .padding(8)
                    .background(CosmosTheme.surface)
                    .cornerRadius(8)
                HStack {
                    Button("Skip") { submitOnboarding(skip: true) }
                    Spacer()
                    Button("Continue") { submitOnboarding(skip: false) }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(CosmosTheme.accent)
                        .foregroundColor(.black)
                        .cornerRadius(980)
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .frame(maxWidth: 380)
            .background(CosmosTheme.surfaceRaised)
            .cornerRadius(16)
        }
    }

    private func loadMoments(refresh: Bool) {
        refreshing = refresh
        loading = moments.isEmpty
        errorMessage = ""
        CosmosAPIClient.fetchMoments(refresh: refresh) { result in
            loading = false
            refreshing = false
            switch result {
            case .success(let (list, _)):
                moments = list
                if index >= list.count { index = 0 }
                if list.isEmpty { errorMessage = "" }
            case .failure(let err):
                errorMessage = err.message
            }
        }
    }

    private func loadOnboarding() {
        CosmosAPIClient.fetchOnboarding { result in
            if case .success(let ob) = result, !ob.complete {
                onboarding = ob
                showOnboarding = true
            }
        }
    }

    private func submitOnboarding(skip: Bool) {
        CosmosAPIClient.submitOnboarding(answer: onboardingAnswer, skip: skip) { _ in
            showOnboarding = false
            onboarding = nil
        }
    }

    private func openSheet(_ moment: ThreadMoment) {
        sheetMoment = moment
        provenance = []
        guard let nodeId = moment.sheet.traceNodeId else { return }
        provenanceLoading = true
        CosmosAPIClient.fetchProvenance(nodeId: nodeId) { result in
            provenanceLoading = false
            if case .success(let steps) = result { provenance = steps }
        }
    }

    private func sendReply() {
        guard let moment = active, moment.canReply else { return }
        let text = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        CosmosAPIClient.reply(momentId: moment.id, body: text) { result in
            switch result {
            case .success:
                replyText = ""
                statusMessage = "sent"
            case .failure(let err):
                statusMessage = err.message
            }
        }
    }
}
