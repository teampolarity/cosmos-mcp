// Native Thread — deck, receipts sheet, compose (replaces WKWebView Thread).

import SwiftUI
import AppKit

struct NativeThreadView: View {
    var onOpenSettings: () -> Void = {}

    @State private var showConnect = false
    @State private var index = 0
    @State private var loading = true
    @State private var refreshing = false
    @State private var errorMessage = ""
    @State private var replyStatus = ""
    @State private var threadStatus = ""
    @State private var replyText = ""
    @State private var sheetMoment: ThreadMoment?
    @State private var provenance: [ProvenanceStep] = []
    @State private var provenanceLoading = false
    @State private var provenanceFailed = false
    @State private var moments: [ThreadMoment] = []
    @State private var onboarding: ThreadOnboardingStatus?
    @State private var onboardingAnswer = ""
    @State private var showOnboarding = false
    @State private var loadGeneration = 0
    @State private var didNudgeConnect = false
    @State private var compilePolls = 0
    @State private var voteStatus = ""
    @State private var voting = false
    @State private var commitText = ""
    @State private var committing = false
    @State private var commitStatus = ""
    @State private var correcting = false
    @State private var correctionText = ""
    @State private var draftingCompass = false

    private let maxCompilePolls = 12
    private let compilePollInterval: TimeInterval = 5

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
                if moments.count > 1 {
                    deckDots
                }
                bottomBar
            }

            if showOnboarding, let ob = onboarding, !ob.complete {
                onboardingOverlay(ob)
            }

            if let moment = sheetMoment {
                receiptsSheet(moment)
            }
        }
        .onAppear {
            loadOnboarding()
            loadMoments(refresh: false)
            maybeNudgeConnect()
        }
        .onReceive(NotificationCenter.default.publisher(for: .cosmosRefreshThread)) { _ in
            loadMoments(refresh: true, preserveMomentId: active?.id)
        }
    }

    private var emptyStateMessage: String {
        if !errorMessage.isEmpty { return errorMessage }
        if FdaChecker.loadPersistedStatus() != .granted {
            return "Grant Full Disk Access in Settings so iMessage can sync."
        }
        return "Cards are ready on the server. Tap Load Thread or open Connect."
    }

    private var topBar: some View {
        VStack(spacing: 8) {
            if moments.count >= 1 {
                HStack(spacing: 8) {
                    if moments.count > 1 {
                        circleIconButton("←", disabled: index == 0) { index -= 1 }
                    }
                    Text(active?.label.uppercased() ?? "")
                        .font(.system(size: 9, weight: .regular))
                        .textCase(.uppercase)
                        .foregroundColor(CosmosTheme.textMuted)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                    if moments.count > 1 {
                        circleIconButton("→", disabled: index >= moments.count - 1) { index += 1 }
                    }
                    circleIconButton("↻", disabled: refreshing) {
                        loadMoments(refresh: true, preserveMomentId: active?.id)
                    }
                }
                if !threadStatus.isEmpty && moments.isEmpty {
                    Text(threadStatus)
                        .font(.system(size: 10))
                        .foregroundColor(CosmosTheme.textMuted)
                        .frame(maxWidth: .infinity)
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
            VStack(spacing: 16) {
                ZStack {
                    Circle().fill(CosmosTheme.accentDim).frame(width: 52, height: 52)
                    Circle().stroke(CosmosTheme.accent.opacity(0.4), lineWidth: 1).frame(width: 52, height: 52)
                    Text("✦").font(.system(size: 22)).foregroundColor(CosmosTheme.accent)
                }
                VStack(spacing: 4) {
                    Text("cosmos")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(CosmosTheme.text)
                    Text("instruments for the inner life")
                        .font(.system(size: 12))
                        .foregroundColor(CosmosTheme.textFaint)
                }
                Text(emptyStateMessage)
                    .font(.system(size: 13))
                    .foregroundColor(CosmosTheme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 4)
                HStack(spacing: 10) {
                    Button("Load Thread") { loadMoments(refresh: true) }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .foregroundColor(.black)
                        .cosmosCapsule(fill: CosmosTheme.accent)
                        .disabled(refreshing)
                    Button("Connect") { showConnect = true }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .foregroundColor(CosmosTheme.text)
                        .cosmosCapsule(fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                }
            }
            Spacer()
        } else if let moment = active {
            if moment.kind == "anchor" {
                anchorCard(moment)
            } else {
                weaveCard(moment)
            }
        }
    }

    /// The compass: the north-star anchor of the ritual. Centered, hero type, quiet accent presence.
    private func anchorCard(_ moment: ThreadMoment) -> some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(CosmosTheme.accentDim)
                        .frame(width: 46, height: 46)
                    Circle()
                        .stroke(CosmosTheme.accent.opacity(0.4), lineWidth: 1)
                        .frame(width: 46, height: 46)
                    Text("✦")
                        .font(.system(size: 20))
                        .foregroundColor(CosmosTheme.accent)
                }

                Text(moment.body)
                    .font(.system(size: 24, weight: .regular))
                    .foregroundColor(CosmosTheme.text)
                    .multilineTextAlignment(.center)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity)

                if !moment.facetConvergence.isEmpty {
                    facetConvergenceRow(moment.facetConvergence)
                        .padding(.top, 2)
                } else if let convergence = moment.convergence {
                    convergenceRow(convergence)
                        .padding(.top, 2)
                }

                if let recall = moment.commitmentRecall, !recall.isEmpty {
                    Text(recall)
                        .font(.system(size: 11))
                        .foregroundColor(CosmosTheme.accent)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.3))
                }

                if let hint = moment.compassHint, !hint.isEmpty {
                    VStack(spacing: 8) {
                        Text(hint)
                            .font(.system(size: 10))
                            .foregroundColor(CosmosTheme.textFaint)
                            .multilineTextAlignment(.center)
                        Button(draftingCompass ? "reading your life…" : "let cosmos draft one →") {
                            draftCompass()
                        }
                        .buttonStyle(.plain)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(CosmosTheme.accent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.3))
                        .disabled(draftingCompass)
                    }
                    .padding(.top, 2)
                }

                if !moment.advanceHint.isEmpty {
                    Text(moment.advanceHint)
                        .font(.system(size: 11))
                        .foregroundColor(CosmosTheme.textMuted)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.vertical, 30)
            .padding(.horizontal, 26)
            .frame(maxWidth: .infinity)
            .cosmosRoundedRect(24, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.accent.opacity(0.18))
            .padding(.horizontal, 14)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The week read: a text-to-a-friend, left-aligned, with receipts + vote below.
    private func weaveCard(_ moment: ThreadMoment) -> some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                if let sharp = moment.readSharpness, !sharp.isEmpty {
                    Text(sharp)
                        .font(.system(size: 10, weight: .medium))
                        .textCase(.uppercase)
                        .foregroundColor(CosmosTheme.accent.opacity(0.85))
                }

                Text(moment.body)
                    .font(.system(size: 17))
                    .foregroundColor(CosmosTheme.text)
                    .lineSpacing(5)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let preview = leadReceiptText(moment), !preview.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("from your texts")
                            .font(.system(size: 9, weight: .regular))
                            .textCase(.uppercase)
                            .foregroundColor(CosmosTheme.textFaint)
                        Text(preview)
                            .font(.system(size: 13))
                            .foregroundColor(CosmosTheme.textSecondary)
                            .lineLimit(2)
                    }
                    .padding(.top, 4)
                }

                if let feedback = moment.readFeedback, moment.readChecked, !feedback.isEmpty {
                    Text(feedback)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(CosmosTheme.accent)
                }

                if let move = moment.commitmentText, !move.isEmpty {
                    HStack(spacing: 6) {
                        Text("↳")
                            .font(.system(size: 12))
                            .foregroundColor(CosmosTheme.accent)
                        Text("your move: \(move)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(CosmosTheme.text)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .cosmosRoundedRect(10, fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.3))
                }

                HStack(spacing: 8) {
                    if moment.sheet.receipts.count > 0 {
                        Button("See proof · \(moment.sheet.receipts.count)") {
                            openSheet(moment)
                        }
                        .font(.system(size: 9, weight: .regular))
                        .textCase(.uppercase)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .foregroundColor(CosmosTheme.textSecondary)
                        .cosmosCapsule(fill: CosmosTheme.surface, stroke: CosmosTheme.border)
                        .buttonStyle(.plain)
                    }
                    Button("Share") { shareWeekCard(moment) }
                        .font(.system(size: 9, weight: .regular))
                        .textCase(.uppercase)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .foregroundColor(CosmosTheme.accent)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                        .buttonStyle(.plain)
                }
            }
            .padding(18)
            .cosmosRoundedRect(20, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
            .padding(.horizontal, 14)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Pull a short supporting line from direct proof on the card, if any.
    private func leadReceiptText(_ moment: ThreadMoment) -> String? {
        let direct = moment.sheet.receipts.first {
            $0.claimSupport.lowercased() == "strong"
                && !$0.text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty
        }
        guard let first = direct else { return nil }
        let s = first.text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        if s.count <= 140 { return s }
        return String(s.prefix(139)) + "…"
    }

    private func leadProofHeading(_ receipt: MomentReceipt) -> String {
        receipt.claimSupport.lowercased() == "strong" ? "Best proof" : "Closest signal"
    }

    /// Render the week read into a branded identity artifact and open the macOS share sheet.
    private func shareWeekCard(_ moment: ThreadMoment) {
        let compass = moments.first { $0.kind == "anchor" }
        let footnote = compass?.convergence?.summary ?? moment.readSharpness ?? ""
        let image = makeIdentityShareImage(
            line: moment.body,
            compass: compass?.body ?? "",
            footnote: footnote
        )
        let text = "\(moment.body)\n\nvia cosmos"
        let picker = NSSharingServicePicker(items: [image, text])
        if let view = NSApp.keyWindow?.contentView {
            picker.show(relativeTo: .zero, of: view, preferredEdge: .maxY)
        }
    }

    private func makeIdentityShareImage(line: String, compass: String = "", footnote: String = "") -> NSImage {
        let size = NSSize(width: 1080, height: 1080)
        let cardPad: CGFloat = 56
        let inset: CGFloat = 96
        let accent = NSColor(calibratedRed: 0.13, green: 0.83, blue: 0.93, alpha: 1)
        let image = NSImage(size: size)
        image.lockFocus()

        NSColor.black.setFill()
        NSRect(origin: .zero, size: size).fill()

        let cardRect = NSRect(x: cardPad, y: cardPad, width: size.width - cardPad * 2, height: size.height - cardPad * 2)
        NSColor(calibratedRed: 0.067, green: 0.067, blue: 0.078, alpha: 1).setFill()
        let cardPath = NSBezierPath(roundedRect: cardRect, xRadius: 40, yRadius: 40)
        cardPath.fill()
        NSColor(white: 1, alpha: 0.08).setStroke()
        cardPath.lineWidth = 2
        cardPath.stroke()

        let innerX = cardPad + inset - cardPad

        let labelAttr: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 20, weight: .medium),
            .foregroundColor: accent,
        ]
        ("THIS WEEK" as NSString).draw(at: NSPoint(x: innerX, y: size.height - cardPad - 100), withAttributes: labelAttr)

        let starAttr: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 52),
            .foregroundColor: accent,
        ]
        let star = "✦" as NSString
        let starSize = star.size(withAttributes: starAttr)
        star.draw(at: NSPoint(x: (size.width - starSize.width) / 2, y: size.height - cardPad - 175),
                  withAttributes: starAttr)

        let para = NSMutableParagraphStyle()
        para.lineSpacing = 8
        let lineAttr: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 54, weight: .regular),
            .foregroundColor: NSColor(white: 1, alpha: 0.95),
            .paragraphStyle: para,
        ]
        let textRect = NSRect(x: innerX, y: cardPad + 280, width: cardRect.width - (inset - cardPad) * 2, height: 420)
        (line as NSString).draw(in: textRect, withAttributes: lineAttr)

        if !compass.isEmpty {
            let compassAttr: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 18, weight: .medium),
                .foregroundColor: NSColor(white: 1, alpha: 0.45),
            ]
            let compassLine = "compass · \(String(compass.prefix(72)))" as NSString
            compassLine.draw(at: NSPoint(x: innerX, y: cardPad + 200), withAttributes: compassAttr)
        }

        if !footnote.isEmpty {
            let footAttr: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 22, weight: .semibold),
                .foregroundColor: accent,
            ]
            (String(footnote.prefix(80)) as NSString).draw(at: NSPoint(x: innerX, y: cardPad + 150), withAttributes: footAttr)
        }

        let wordmark: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 32, weight: .semibold),
            .foregroundColor: NSColor(white: 1, alpha: 0.92),
        ]
        ("cosmos" as NSString).draw(at: NSPoint(x: innerX, y: cardPad + 72), withAttributes: wordmark)

        let tagAttr: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 18, weight: .regular),
            .foregroundColor: NSColor(white: 1, alpha: 0.38),
        ]
        let tag = "instruments for the inner life" as NSString
        let tagSize = tag.size(withAttributes: tagAttr)
        tag.draw(at: NSPoint(x: cardPad + cardRect.width - (inset - cardPad) - tagSize.width, y: cardPad + 72), withAttributes: tagAttr)

        image.unlockFocus()
        return image
    }

    private var deckDots: some View {
        HStack(spacing: 7) {
            ForEach(moments.indices, id: \.self) { i in
                Circle()
                    .fill(i == index ? CosmosTheme.accent : CosmosTheme.textFaint.opacity(0.4))
                    .frame(width: i == index ? 7 : 6, height: i == index ? 7 : 6)
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
    }

    /// The drift readout — dots for recent marks + a plain summary. Makes the vote matter.
    private func driftRow(_ drift: CompassDrift) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(drift.marks.indices, id: \.self) { i in
                    let toward = drift.marks[i] == "toward"
                    Circle()
                        .fill(toward ? CosmosTheme.accent : Color(red: 0.98, green: 0.44, blue: 0.52).opacity(0.85))
                        .frame(width: 8, height: 8)
                }
            }
            if !drift.summary.isEmpty {
                Text(drift.summary)
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// Per-facet longitudinal payoff — one line per thing they live by.
    private func facetConvergenceRow(_ facets: [FacetConvergence]) -> some View {
        let rose = Color(red: 0.98, green: 0.44, blue: 0.52)
        return VStack(alignment: .leading, spacing: 7) {
            ForEach(facets) { f in
                HStack(spacing: 9) {
                    Circle()
                        .fill(f.isAway ? rose : CosmosTheme.accent)
                        .frame(width: 6, height: 6)
                    Text(f.summary)
                        .font(.system(size: 12))
                        .foregroundColor(f.isAway ? rose.opacity(0.9) : CosmosTheme.textSecondary)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CosmosTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(CosmosTheme.border, lineWidth: 1)
        )
    }

    /// The longitudinal payoff — where the compass card earns its keep.
    private func convergenceRow(_ c: Convergence) -> some View {
        let rose = Color(red: 0.98, green: 0.44, blue: 0.52)
        let tone: Color = c.direction == "closing"
            ? CosmosTheme.accent
            : (c.direction == "widening" ? rose : CosmosTheme.textSecondary)
        return VStack(spacing: 6) {
            Text(c.summary)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(tone)
                .multilineTextAlignment(.center)
            if c.toward + c.away > 0 {
                Text("\(c.toward) toward · \(c.away) away · \(c.weeksTracked) weeks")
                    .font(.system(size: 9, weight: .medium))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.textFaint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .cosmosCapsule(fill: CosmosTheme.surface, stroke: tone.opacity(0.3))
    }

    private func frictionFaceRow(_ face: FrictionFace) -> some View {
        HStack(spacing: 8) {
            if let inferred = face.inferred, !inferred.isEmpty {
                Text("cosmos · \(inferred)")
                    .font(.system(size: 9, weight: .medium))
                    .textCase(.uppercase)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .foregroundColor(CosmosTheme.textMuted)
                    .cosmosCapsule(fill: CosmosTheme.surface, stroke: CosmosTheme.border)
            }
            if let felt = face.felt, !felt.isEmpty {
                Text("you · \(felt)")
                    .font(.system(size: 9, weight: .medium))
                    .textCase(.uppercase)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .foregroundColor(CosmosTheme.accent)
                    .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .cosmosRoundedRect(12, fill: CosmosTheme.surface, stroke: face.collision ? CosmosTheme.accent.opacity(0.5) : CosmosTheme.border)
    }

    @ViewBuilder
    private var bottomBar: some View {
        if let m = active, m.kind == "weave" {
            if !m.readChecked {
                readCheckDock(m)
            } else if let prompt = m.commitPrompt, !prompt.isEmpty {
                commitDock(prompt)
            } else {
                EmptyView()
            }
        } else {
            composeBar
        }
    }

    /// The read-check: cosmos stated its read (the card), you confirm or correct it.
    /// Reacting to cosmos's read — never grading people.
    private func readCheckDock(_ moment: ThreadMoment) -> some View {
        VStack(spacing: 10) {
            if !voteStatus.isEmpty {
                Text(voteStatus)
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.err)
            } else {
                Text(moment.readPrompt ?? "does this land?")
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
            if correcting {
                HStack(spacing: 8) {
                    TextField("what did it miss?", text: $correctionText, onCommit: { submitReadCheck("correct") })
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(CosmosTheme.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .cosmosCapsule(fill: CosmosTheme.surface, stroke: CosmosTheme.border)
                    Button("↑") { submitReadCheck("correct") }
                        .buttonStyle(.plain)
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .foregroundColor(CosmosTheme.accent)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                        .disabled(voting)
                }
            } else {
                HStack(spacing: 10) {
                    Button("not quite") { withAnimation { correcting = true } }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .foregroundColor(CosmosTheme.textSecondary)
                        .cosmosCapsule(fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                        .disabled(voting)
                    Button("yeah, that's it") { submitReadCheck("confirm") }
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .foregroundColor(CosmosTheme.accent)
                        .cosmosCapsule(fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.5))
                        .disabled(voting)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    /// The respond half: after voting, name one concrete move toward the compass.
    private func commitDock(_ prompt: String) -> some View {
        VStack(spacing: 8) {
            if !commitStatus.isEmpty {
                Text(commitStatus)
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.accent)
            } else {
                Text(prompt)
                    .font(.system(size: 11))
                    .foregroundColor(CosmosTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 8) {
                TextField("name one move…", text: $commitText, onCommit: { submitCommitment() })
                    .textFieldStyle(.plain)
                    .padding(10)
                    .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                    .disabled(committing)
                Button("↑") { submitCommitment() }
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 40, height: 40)
                    .foregroundColor(CosmosTheme.accent)
                    .cosmosRoundedRect(10, fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                    .buttonStyle(.plain)
                    .disabled(committing || commitText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(12)
    }

    private var composeBar: some View {
        VStack(spacing: 6) {
            if !replyStatus.isEmpty {
                Text(replyStatus)
                    .font(.system(size: 11))
                    .foregroundColor(replyStatus == "sent" ? CosmosTheme.ok : CosmosTheme.err)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }
            HStack(spacing: 8) {
                TextField(active?.canReply == true ? "what are you living by? name a couple things…" : "reply…", text: $replyText)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .cosmosRoundedRect(12, fill: CosmosTheme.surfaceRaised, stroke: CosmosTheme.border)
                    .disabled(active?.canReply != true)
                Button("↑") { sendReply() }
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 40, height: 40)
                    .foregroundColor(CosmosTheme.accent)
                    .cosmosRoundedRect(10, fill: CosmosTheme.accentDim, stroke: CosmosTheme.accent.opacity(0.35))
                    .buttonStyle(.plain)
                    .disabled(active?.canReply != true || replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(12)
    }

    /// Confirm or correct cosmos's read of the week.
    private func submitReadCheck(_ verdict: String) {
        guard let moment = active, moment.kind == "weave", !voting else { return }
        if verdict == "correct" && correctionText.trimmingCharacters(in: .whitespaces).isEmpty { return }
        voting = true
        voteStatus = ""
        let momentId = moment.id
        let correction = verdict == "correct" ? correctionText.trimmingCharacters(in: .whitespaces) : nil
        CosmosAPIClient.readCheck(momentId: momentId, verdict: verdict, correction: correction) { result in
            voting = false
            switch result {
            case .success(let list):
                moments = list
                correcting = false
                correctionText = ""
                if let newIndex = list.firstIndex(where: { $0.id == momentId }) {
                    index = newIndex
                }
            case .failure(let err):
                voteStatus = err.message
            }
        }
    }

    private func draftCompass() {
        guard !draftingCompass else { return }
        draftingCompass = true
        threadStatus = ""
        CosmosAPIClient.proposeCompass { result in
            draftingCompass = false
            switch result {
            case .success(let proposal):
                replyText = proposal
                threadStatus = "edit it if you want, then send to set your compass"
                DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                    if threadStatus.hasPrefix("edit it") { threadStatus = "" }
                }
            case .failure(let err):
                threadStatus = err.message == "not_enough_signal"
                    ? "not enough yet — write your compass in your own words"
                    : err.message
            }
        }
    }

    private func submitCommitment() {
        guard let moment = active, moment.kind == "weave", !committing else { return }
        let move = commitText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !move.isEmpty else { return }
        committing = true
        let momentId = moment.id
        CosmosAPIClient.commit(momentId: momentId, text: move) { result in
            committing = false
            switch result {
            case .success(let list):
                moments = list
                commitText = ""
                commitStatus = "logged. cosmos will hold you to it."
                if let newIndex = list.firstIndex(where: { $0.id == momentId }) {
                    index = newIndex
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    if commitStatus.hasPrefix("logged") { commitStatus = "" }
                }
            case .failure(let err):
                commitStatus = err.message
            }
        }
    }

    private func circleIconButton(_ label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Circle().fill(CosmosTheme.surfaceRaised)
                Circle().strokeBorder(CosmosTheme.border, lineWidth: 1)
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(CosmosTheme.text)
            }
            .frame(width: 36, height: 36)
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
                    Text("Proof")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Button("Done") { sheetMoment = nil }
                        .buttonStyle(.plain)
                }
                .padding(16)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !moment.sheet.whatWeSaw.isEmpty {
                            sheetSection("The read", moment.sheet.whatWeSaw)
                        }

                        if let lead = moment.sheet.receipts.first {
                            Text(leadProofHeading(lead))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(CosmosTheme.text)
                            receiptBlock(lead, isLead: lead.claimSupport.lowercased() == "strong")
                        }

                        let extra = Array(moment.sheet.receipts.dropFirst())
                        if !extra.isEmpty {
                            Text("More from your texts")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(CosmosTheme.text)
                            ForEach(extra) { r in
                                receiptBlock(r, isLead: false)
                            }
                        }

                        if !moment.sheet.read.isEmpty {
                            sheetSection("Why the card says that", moment.sheet.read)
                        }
                        if moment.sheet.traceNodeId != nil {
                            Text("From your connectors")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(CosmosTheme.text)
                            if provenanceLoading {
                                Text("Tracing connector sources…")
                                    .font(.system(size: 12))
                                    .foregroundColor(CosmosTheme.textMuted)
                            } else if provenanceFailed {
                                Text("Could not load connector receipts. Try again.")
                                    .font(.system(size: 12))
                                    .foregroundColor(CosmosTheme.textMuted)
                            } else if provenance.isEmpty {
                                Text("No connector receipts for this person yet. Link iMessage sync to deepen the trail.")
                                    .font(.system(size: 12))
                                    .foregroundColor(CosmosTheme.textMuted)
                            }
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
                            .cosmosRoundedRect(10, fill: CosmosTheme.surface)
                        }
                        if !moment.sheet.lens.isEmpty {
                            Text(moment.sheet.lens)
                                .font(.system(size: 11))
                                .foregroundColor(CosmosTheme.textFaint)
                                .padding(.top, 4)
                        }
                    }
                    .padding(16)
                }
            }
            .frame(maxWidth: 420, maxHeight: 520)
            .cosmosRoundedRect(16, fill: CosmosTheme.surfaceRaised)
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

    @ViewBuilder
    private func receiptBlock(_ r: MomentReceipt, isLead: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(r.label.uppercased())
                .font(.system(size: 9))
                .foregroundColor(isLead ? CosmosTheme.accent : CosmosTheme.textFaint)
            if let meta = proofMetaLabel(r), !meta.isEmpty {
                Text(meta)
                    .font(.system(size: 9, weight: .medium))
                    .textCase(.uppercase)
                    .foregroundColor(CosmosTheme.accent.opacity(0.88))
            }
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
        .background(isLead ? CosmosTheme.accentDim : CosmosTheme.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isLead ? CosmosTheme.accent.opacity(0.5) : CosmosTheme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func proofMetaLabel(_ receipt: MomentReceipt) -> String? {
        let type = receipt.proofType.lowercased()
        let strength = receipt.proofStrength.lowercased()
        let typeLabel: String
        switch type {
        case "build":
            typeLabel = "build evidence"
        case "relationship":
            typeLabel = "relationship evidence"
        case "logistics":
            typeLabel = "logistics evidence"
        case "other":
            typeLabel = "other evidence"
        default:
            return nil
        }
        if receipt.claimSupport.lowercased() == "strong" {
            return typeLabel
        }
        if strength == "adjacent" {
            return "\(typeLabel) · adjacent, weak"
        }
        return typeLabel
    }

    private func onboardingOverlay(_ ob: ThreadOnboardingStatus) -> some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                if ob.total > 0 {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(min(ob.progress + 1, ob.total)) / \(ob.total)")
                            .font(.system(size: 11))
                            .foregroundColor(CosmosTheme.textFaint)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule(style: .continuous)
                                    .fill(CosmosTheme.surface)
                                Capsule(style: .continuous)
                                    .fill(CosmosTheme.accent)
                                    .frame(width: geo.size.width * progressFraction(ob))
                            }
                        }
                        .frame(height: 3)
                    }
                }
                Text(ob.question)
                    .font(.system(size: 15))
                    .foregroundColor(CosmosTheme.text)
                TextEditor(text: $onboardingAnswer)
                    .frame(height: 80)
                    .padding(8)
                    .cosmosRoundedRect(8, fill: CosmosTheme.surface)
                HStack {
                    Button("Skip") { submitOnboarding(skip: true) }
                    Spacer()
                    Button("Continue") { submitOnboarding(skip: false) }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundColor(.black)
                        .cosmosCapsule(fill: CosmosTheme.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .frame(maxWidth: 380)
            .cosmosRoundedRect(16, fill: CosmosTheme.surfaceRaised)
        }
    }

    private func progressFraction(_ ob: ThreadOnboardingStatus) -> CGFloat {
        guard ob.total > 0 else { return 0 }
        return CGFloat(min(ob.progress + 1, ob.total)) / CGFloat(ob.total)
    }

    private func maybeNudgeConnect() {
        guard !didNudgeConnect else { return }
        didNudgeConnect = true
        if FdaChecker.loadPersistedStatus() == .denied {
            NotificationCenter.default.post(name: .cosmosShowConnect, object: nil)
        }
    }

    private func loadMoments(refresh: Bool, preserveMomentId: String? = nil, isPoll: Bool = false) {
        if !isPoll {
            loadGeneration += 1
            if refresh { compilePolls = 0 }
        }
        let gen = loadGeneration
        refreshing = refresh || isPoll
        loading = moments.isEmpty && !refresh && !isPoll
        if !refresh && !isPoll { errorMessage = "" }
        if refresh && !isPoll { threadStatus = "refreshing…" }
        CosmosAPIClient.fetchMoments(refresh: refresh) { result in
            guard gen == loadGeneration else { return }
            loading = false
            switch result {
            case .success(let (list, recompiled, compiling)):
                moments = list
                if let preserveId = preserveMomentId,
                   let newIndex = list.firstIndex(where: { $0.id == preserveId }) {
                    index = newIndex
                } else if refresh && !isPoll {
                    index = 0
                } else if index >= list.count {
                    index = max(0, list.count - 1)
                }
                if list.isEmpty {
                    if compiling && compilePolls < maxCompilePolls {
                        compilePolls += 1
                        refreshing = true
                        threadStatus = "compiling… (\(compilePolls)/\(maxCompilePolls))"
                        errorMessage = ""
                        DispatchQueue.main.asyncAfter(deadline: .now() + compilePollInterval) {
                            guard gen == loadGeneration else { return }
                            loadMoments(refresh: false, preserveMomentId: preserveMomentId, isPoll: true)
                        }
                    } else {
                        refreshing = false
                        if compiling {
                            errorMessage = "Thread is compiling on the server. Tap ↻ or wait a few seconds."
                        } else {
                            errorMessage = ""
                        }
                        threadStatus = compiling ? "compiling…" : ""
                    }
                } else {
                    errorMessage = ""
                    if compiling && compilePolls < maxCompilePolls && (refresh || isPoll) {
                        compilePolls += 1
                        refreshing = true
                        threadStatus = "recompiling… (\(compilePolls)/\(maxCompilePolls))"
                        DispatchQueue.main.asyncAfter(deadline: .now() + compilePollInterval) {
                            guard gen == loadGeneration else { return }
                            loadMoments(refresh: false, preserveMomentId: preserveMomentId, isPoll: true)
                        }
                    } else {
                        refreshing = false
                        compilePolls = 0
                        if refresh || recompiled {
                            let n = list.count
                            threadStatus = recompiled ? "recompiled · \(n) cards" : "up to date"
                        } else if !isPoll {
                            threadStatus = ""
                        }
                        if !threadStatus.isEmpty && threadStatus != "recompiling…" {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                if threadStatus.hasPrefix("recompiled") || threadStatus == "up to date" {
                                    threadStatus = ""
                                }
                            }
                        }
                    }
                }
            case .failure(let err):
                refreshing = false
                compilePolls = 0
                let msg = err.message
                if msg.lowercased().contains("timed out") {
                    errorMessage = "cosmos took too long, tap load thread to retry"
                } else {
                    errorMessage = msg
                }
                threadStatus = msg
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
        CosmosAPIClient.submitOnboarding(answer: onboardingAnswer, skip: skip) { result in
            switch result {
            case .success(let ob):
                onboardingAnswer = ""
                if ob.complete {
                    showOnboarding = false
                    onboarding = nil
                } else {
                    onboarding = ob
                    showOnboarding = true
                }
            case .failure:
                showOnboarding = false
                onboarding = nil
            }
        }
    }

    private func openSheet(_ moment: ThreadMoment) {
        sheetMoment = moment
        provenance = []
        provenanceFailed = false
        guard let nodeId = moment.sheet.traceNodeId else { return }
        provenanceLoading = true
        CosmosAPIClient.fetchProvenance(nodeId: nodeId) { result in
            provenanceLoading = false
            switch result {
            case .success(let steps):
                provenance = steps
            case .failure:
                provenanceFailed = true
            }
        }
    }

    private func sendReply() {
        guard let moment = active, moment.canReply else { return }
        let text = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        replyStatus = ""
        let momentId = moment.id
        CosmosAPIClient.reply(momentId: moment.id, body: text) { result in
            switch result {
            case .success:
                replyText = ""
                replyStatus = "sent"
                loadMoments(refresh: true, preserveMomentId: momentId)
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    if replyStatus == "sent" { replyStatus = "" }
                }
            case .failure(let err):
                replyStatus = err.message
            }
        }
    }
}
