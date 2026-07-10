// Authenticated Cosmos cloud API for native Thread.

import Foundation

struct FrictionFace {
    let inferred: String?
    let felt: String?
    let collision: Bool

    static func parse(_ json: [String: Any]?) -> FrictionFace? {
        guard let json else { return nil }
        return FrictionFace(
            inferred: json["inferred"] as? String,
            felt: json["felt"] as? String,
            collision: json["collision"] as? Bool ?? false
        )
    }
}

/// Alignment drift over recent votes — the payoff that makes voting matter.
struct CompassDrift {
    let total: Int
    let toward: Int
    let away: Int
    let streak: Int
    let streakDirection: String
    let marks: [String]      // chronological, oldest -> newest
    let summary: String

    static func parse(_ json: [String: Any]?) -> CompassDrift? {
        guard let json else { return nil }
        let total = json["total"] as? Int ?? 0
        if total <= 0 { return nil }
        return CompassDrift(
            total: total,
            toward: json["toward"] as? Int ?? 0,
            away: json["away"] as? Int ?? 0,
            streak: json["streak"] as? Int ?? 0,
            streakDirection: json["streak_direction"] as? String ?? "toward",
            marks: (json["marks"] as? [String]) ?? [],
            summary: json["summary"] as? String ?? ""
        )
    }
}

/// The convergence readout — are lived weeks closing on the compass over time?
struct Convergence {
    let weeksTracked: Int
    let toward: Int
    let away: Int
    let streak: Int
    let direction: String   // closing | widening | holding
    let summary: String

    static func parse(_ json: [String: Any]?) -> Convergence? {
        guard let json else { return nil }
        let summary = json["summary"] as? String ?? ""
        if summary.isEmpty { return nil }
        return Convergence(
            weeksTracked: json["weeks_tracked"] as? Int ?? 0,
            toward: json["toward"] as? Int ?? 0,
            away: json["away"] as? Int ?? 0,
            streak: json["streak"] as? Int ?? 0,
            direction: json["direction"] as? String ?? "holding",
            summary: summary
        )
    }
}

struct FacetConvergence: Identifiable {
    let facet: String
    let summary: String
    let streakDir: String   // toward | away | nil
    let direction: String   // closing | widening | holding
    var id: String { facet }

    var isAway: Bool { streakDir == "away" || direction == "widening" }

    static func parseList(_ arr: [[String: Any]]?) -> [FacetConvergence] {
        guard let arr else { return [] }
        return arr.compactMap { j in
            let summary = j["summary"] as? String ?? ""
            guard !summary.isEmpty else { return nil }
            return FacetConvergence(
                facet: j["facet"] as? String ?? "",
                summary: summary,
                streakDir: j["streak_dir"] as? String ?? "",
                direction: j["direction"] as? String ?? "holding"
            )
        }
    }
}

struct ThreadMoment: Identifiable {
    let id: String
    let kind: String
    let chip: String
    let heading: String
    let body: String
    let threadType: String
    let cardRole: String
    let votePrompt: String
    let advanceHint: String
    let userVote: String?
    let voteFeedback: String?
    let alignment: String?
    let frictionFace: FrictionFace?
    let compassDrift: CompassDrift?
    let convergence: Convergence?
    let facetConvergence: [FacetConvergence]
    let readPrompt: String?
    let readChecked: Bool
    let readVerdict: String?     // confirm | correct | nil
    let readFeedback: String?
    let readSharpness: String?
    let compassHint: String?
    let commitPrompt: String?
    let commitmentText: String?
    let commitmentRecall: String?
    let sheet: MomentSheet

    var label: String {
        if kind == "anchor" || cardRole == "compass" { return "compass" }
        if kind == "weave" || cardRole == "week" { return "this week" }
        if kind == "caught_up" { return "caught up" }
        return chip.isEmpty ? (heading.isEmpty ? "moment" : heading) : chip
    }

    /// v1: week card only — relationship mirror deferred.
    var canVote: Bool { kind == "weave" }

    var canReply: Bool { kind == "anchor" }

    static func parseList(_ raw: [[String: Any]]) -> [ThreadMoment] {
        raw.compactMap { parse($0) }
            .filter { $0.kind == "anchor" || $0.kind == "weave" }
    }

    static func parse(_ json: [String: Any]) -> ThreadMoment? {
        guard let id = json["id"] as? String else { return nil }
        let sheetJson = json["sheet"] as? [String: Any] ?? [:]
        let meta = sheetJson["meta"] as? [String: Any] ?? [:]
        return ThreadMoment(
            id: id,
            kind: json["kind"] as? String ?? "moment",
            chip: json["chip"] as? String ?? "",
            heading: json["heading"] as? String ?? "",
            body: json["body"] as? String ?? "",
            threadType: json["thread_type"] as? String ?? "",
            cardRole: json["card_role"] as? String ?? "",
            votePrompt: json["vote_prompt"] as? String ?? "",
            advanceHint: json["advance_hint"] as? String ?? "",
            userVote: json["user_vote"] as? String,
            voteFeedback: json["vote_feedback"] as? String,
            alignment: meta["alignment"] as? String,
            frictionFace: FrictionFace.parse(json["friction_face"] as? [String: Any]),
            compassDrift: CompassDrift.parse(json["compass_drift"] as? [String: Any]),
            convergence: Convergence.parse(json["convergence"] as? [String: Any]),
            facetConvergence: FacetConvergence.parseList(json["facet_convergence"] as? [[String: Any]]),
            readPrompt: json["read_prompt"] as? String,
            readChecked: json["read_checked"] as? Bool ?? false,
            readVerdict: (json["read_check"] as? [String: Any])?["verdict"] as? String,
            readFeedback: json["read_feedback"] as? String,
            readSharpness: json["read_sharpness"] as? String,
            compassHint: json["compass_hint"] as? String,
            commitPrompt: json["commit_prompt"] as? String,
            commitmentText: (json["commitment"] as? [String: Any])?["text"] as? String,
            commitmentRecall: json["commitment_recall"] as? String,
            sheet: MomentSheet.parse(sheetJson)
        )
    }
}

struct MomentReceipt: Identifiable {
    let id = UUID()
    let label: String
    let proofType: String
    let proofStrength: String
    let claimSupport: String
    let supports: String
    let text: String
}

struct MomentSheet {
    let whatWeSaw: String
    let read: String
    let lens: String
    let receipts: [MomentReceipt]
    let traceNodeId: String?

    static func parse(_ json: [String: Any]) -> MomentSheet {
        let meta = json["meta"] as? [String: Any] ?? [:]
        let receiptRows = json["receipts"] as? [[String: Any]] ?? []
        let receipts = receiptRows.map { r -> MomentReceipt in
            let kind = r["kind"] as? String ?? "text"
            let kindLabel = kind == "imessage" ? "iMessage" : kind
            let parts = [kindLabel, r["when"] as? String, r["from"] as? String].compactMap { $0 }.filter { !$0.isEmpty }
            return MomentReceipt(
                label: parts.joined(separator: " · "),
                proofType: r["proof_type"] as? String ?? "",
                proofStrength: r["proof_strength"] as? String ?? "",
                claimSupport: r["claim_support"] as? String ?? "",
                supports: r["supports"] as? String ?? "",
                text: r["text"] as? String ?? ""
            )
        }
        return MomentSheet(
            whatWeSaw: json["what_we_saw"] as? String ?? "",
            read: json["read"] as? String ?? "",
            lens: json["lens"] as? String ?? "",
            receipts: receipts,
            traceNodeId: meta["trace_node_id"] as? String
        )
    }
}

struct ProvenanceStep: Identifiable {
    let id = UUID()
    let label: String
    let excerpt: String
}

struct ThreadOnboardingStatus {
    let complete: Bool
    let question: String
    let progress: Int
    let total: Int
}

struct TodayItem: Identifiable {
    let id: String
    let label: String
    let why: String
    let source: String
    let sourceLabel: String
    let role: String

    var isFrog: Bool { role == "frog" }

    static func parse(_ json: [String: Any]) -> TodayItem? {
        guard let label = json["label"] as? String, !label.isEmpty else { return nil }
        let id = json["id"] as? String ?? label
        return TodayItem(
            id: id,
            label: label,
            why: json["why"] as? String ?? json["source_label"] as? String ?? "",
            source: json["source"] as? String ?? "",
            sourceLabel: json["source_label"] as? String ?? "",
            role: json["role"] as? String ?? "support"
        )
    }
}

struct TodayPayload {
    let declared: String?
    let frog: TodayItem?
    let supports: [TodayItem]
    let readCount: Int
    let surfaced: Int
    let suppressed: Int
    let morningText: Bool
    let intentOnly: Bool
    let sparse: Bool
    let done: Bool

    var headline: String {
        if frog != nil { return "one thing needs you." }
        if surfaced > 0 { return "a few things need you." }
        return "nothing needs you right now."
    }

    var summary: String? {
        if suppressed > 0 { return "\(suppressed) can wait." }
        if intentOnly { return "cosmos will read quietly as you connect sources." }
        if readCount > surfaced, surfaced > 0 {
            return "\(readCount - surfaced) more can wait."
        }
        return nil
    }

    var statsLine: String {
        if readCount > surfaced {
            return "\(readCount) read, \(surfaced) surfaced."
        }
        if suppressed > 0 { return "\(surfaced) surfaced today." }
        if intentOnly { return "cosmos will read quietly as you connect sources." }
        return ""
    }

    static func parse(_ json: [String: Any]) -> TodayPayload {
        let stats = json["stats"] as? [String: Any] ?? [:]
        let prefs = json["prefs"] as? [String: Any] ?? [:]
        let frogJson = json["frog"] as? [String: Any]
        let supportRows = json["supports"] as? [[String: Any]] ?? []
        return TodayPayload(
            declared: json["declared"] as? String,
            frog: frogJson.flatMap(TodayItem.parse),
            supports: supportRows.compactMap(TodayItem.parse),
            readCount: stats["read_count"] as? Int ?? 0,
            surfaced: stats["surfaced"] as? Int ?? 0,
            suppressed: stats["suppressed"] as? Int ?? 0,
            morningText: prefs["morning_text"] as? Bool ?? false,
            intentOnly: json["intent_only"] as? Bool ?? false,
            sparse: json["sparse"] as? Bool ?? false,
            done: json["done"] as? Bool ?? false
        )
    }
}

enum CosmosAPIClient {
    static let baseURL = URL(string: "https://cosmos.polarity-lab.com")!

    struct APIError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static func token() -> String? { CosmosAuthStore.loadToken() }

    /// Build API URLs with query strings — never use appendingPathComponent for ?query.
    private static func makeURL(path: String, query: [String: String] = [:]) -> URL? {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return nil }
        components.path = path.hasPrefix("/") ? path : "/\(path)"
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url
    }

    private static func request(
        path: String,
        query: [String: String] = [:],
        method: String = "GET",
        body: [String: Any]? = nil,
        timeout: TimeInterval = 30,
        completion: @escaping (Result<[String: Any], APIError>) -> Void
    ) {
        guard let token = token() else {
            completion(.failure(APIError(message: "not signed in")))
            return
        }
        guard let url = makeURL(path: path, query: query) else {
            completion(.failure(APIError(message: "invalid url")))
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = timeout
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Cosmos/\(McpRunner.packageVersion) (Macintosh; macOS)", forHTTPHeaderField: "User-Agent")
        if let body { req.httpBody = try? JSONSerialization.data(withJSONObject: body) }

        URLSession.shared.dataTask(with: req) { data, response, error in
            if let error {
                DispatchQueue.main.async { completion(.failure(APIError(message: error.localizedDescription))) }
                return
            }
            guard let http = response as? HTTPURLResponse else {
                DispatchQueue.main.async { completion(.failure(APIError(message: "network error"))) }
                return
            }
            let json = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any] ?? [:]
            guard (200...299).contains(http.statusCode) else {
                let msg = (json["error"] as? String) ?? "request failed (\(http.statusCode))"
                DispatchQueue.main.async { completion(.failure(APIError(message: msg))) }
                return
            }
            DispatchQueue.main.async { completion(.success(json)) }
        }.resume()
    }

    static func fetchMoments(refresh: Bool = false, completion: @escaping (Result<([ThreadMoment], Bool, Bool), APIError>) -> Void) {
        var query: [String: String] = [:]
        if refresh {
            query["refresh"] = "1"
            query["t"] = String(Int(Date().timeIntervalSince1970 * 1000))
        }
        request(path: "/api/me/moments", query: query, timeout: refresh ? 120 : 45) { result in
            switch result {
            case .success(let json):
                if json["schema_ready"] as? Bool == false {
                    completion(.failure(APIError(message: "thread is updating — try again in a minute")))
                    return
                }
                let rows = json["moments"] as? [[String: Any]] ?? []
                let recompiled = json["recompiled"] as? Bool ?? false
                let compiling = json["compiling"] as? Bool ?? false
                completion(.success((ThreadMoment.parseList(rows), recompiled, compiling)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func vote(momentId: String, felt: String, completion: @escaping (Result<[ThreadMoment], APIError>) -> Void) {
        let encoded = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        request(path: "/api/me/moments/\(encoded)/vote", method: "POST", body: ["felt": felt]) { result in
            switch result {
            case .success(let json):
                let rows = json["moments"] as? [[String: Any]] ?? []
                completion(.success(ThreadMoment.parseList(rows)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func readCheck(momentId: String, verdict: String, correction: String? = nil, completion: @escaping (Result<[ThreadMoment], APIError>) -> Void) {
        let encoded = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        var payload: [String: Any] = ["verdict": verdict]
        if let correction = correction, !correction.isEmpty { payload["correction"] = correction }
        request(path: "/api/me/moments/\(encoded)/read", method: "POST", body: payload) { result in
            switch result {
            case .success(let json):
                let rows = json["moments"] as? [[String: Any]] ?? []
                completion(.success(ThreadMoment.parseList(rows)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func commit(momentId: String, text: String, completion: @escaping (Result<[ThreadMoment], APIError>) -> Void) {
        let encoded = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        request(path: "/api/me/moments/\(encoded)/commit", method: "POST", body: ["text": text]) { result in
            switch result {
            case .success(let json):
                let rows = json["moments"] as? [[String: Any]] ?? []
                completion(.success(ThreadMoment.parseList(rows)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func proposeCompass(completion: @escaping (Result<String, APIError>) -> Void) {
        request(path: "/api/me/anchor/propose", method: "POST", body: [:], timeout: 60) { result in
            switch result {
            case .success(let json):
                let proposal = (json["proposal"] as? String) ?? ""
                if proposal.isEmpty {
                    completion(.failure(APIError(message: "not_enough_signal")))
                } else {
                    completion(.success(proposal))
                }
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func reply(momentId: String, body: String, completion: @escaping (Result<Void, APIError>) -> Void) {
        let encoded = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        request(path: "/api/me/moments/\(encoded)/reply", method: "POST", body: ["body": body]) { result in
            switch result {
            case .success: completion(.success(()))
            case .failure(let err): completion(.failure(err))
            }
        }
    }

    static func fetchOnboarding(completion: @escaping (Result<ThreadOnboardingStatus, APIError>) -> Void) {
        request(path: "/api/me/thread/onboarding") { result in
            switch result {
            case .success(let json):
                completion(.success(ThreadOnboardingStatus(
                    complete: json["complete"] as? Bool ?? true,
                    question: json["question"] as? String ?? "",
                    progress: json["progress"] as? Int ?? 0,
                    total: json["total"] as? Int ?? 0
                )))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func submitOnboarding(answer: String?, skip: Bool, completion: @escaping (Result<ThreadOnboardingStatus, APIError>) -> Void) {
        let body: [String: Any] = skip ? ["skip": true] : ["answer": answer ?? ""]
        request(path: "/api/me/thread/onboarding", method: "POST", body: body) { result in
            switch result {
            case .success(let json):
                if json["ok"] as? Bool == false {
                    let msg = json["error"] as? String ?? "onboarding failed"
                    completion(.failure(APIError(message: msg)))
                    return
                }
                completion(.success(ThreadOnboardingStatus(
                    complete: json["complete"] as? Bool ?? true,
                    question: json["question"] as? String ?? "",
                    progress: json["progress"] as? Int ?? 0,
                    total: json["total"] as? Int ?? 0
                )))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func fetchToday(completion: @escaping (Result<TodayPayload, APIError>) -> Void) {
        request(path: "/api/me/today") { result in
            switch result {
            case .success(let json):
                completion(.success(TodayPayload.parse(json)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func submitTodayFeedback(
        item: TodayItem,
        action: String,
        completion: @escaping (Result<TodayPayload, APIError>) -> Void
    ) {
        request(path: "/api/me/today", method: "POST", body: [
            "item_id": item.id,
            "action": action,
            "label": item.label,
            "source": item.source,
        ]) { result in
            switch result {
            case .success(let json):
                let todayJson = json["today"] as? [String: Any] ?? json
                completion(.success(TodayPayload.parse(todayJson)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func setTodayMorningPref(
        enabled: Bool,
        completion: @escaping (Result<TodayPayload, APIError>) -> Void
    ) {
        request(path: "/api/me/today", method: "POST", body: [
            "action": "set_morning",
            "morning_text": enabled,
        ]) { result in
            switch result {
            case .success(let json):
                let todayJson = json["today"] as? [String: Any] ?? json
                completion(.success(TodayPayload.parse(todayJson)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func fetchProvenance(nodeId: String, completion: @escaping (Result<[ProvenanceStep], APIError>) -> Void) {
        request(path: "/api/me/provenance/trace", query: [
            "node_id": nodeId,
            "max_depth": "5",
        ]) { result in
            switch result {
            case .success(let json):
                let stepsRaw = json["steps"] as? [[String: Any]] ?? []
                let steps = stepsRaw.dropFirst().map { step -> ProvenanceStep in
                    ProvenanceStep(
                        label: provenanceLabel(step),
                        excerpt: step["excerpt"] as? String ?? ""
                    )
                }
                completion(.success(Array(steps)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func fetchSyncStatus(completion: @escaping (Result<String, APIError>) -> Void) {
        request(path: "/api/me/sync-status") { result in
            switch result {
            case .success(let json):
                if let local = json["local"] as? [String: Any],
                   let im = local["imessage"] as? [String: Any],
                   im["connected"] as? Bool == true {
                    let ago = im["last_ago"] as? String ?? ""
                    let turns = im["turn_count"] as? Int ?? 0
                    completion(.success("iMessage connected · \(turns) turns · last sync \(ago)"))
                    return
                }
                let hint = json["hint"] as? String ?? json["status"] as? String ?? "sync status unknown"
                completion(.success(hint))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    private static func provenanceLabel(_ step: [String: Any]) -> String {
        let kind = step["kind"] as? String ?? ""
        if kind == "source_page" {
            let src = step["source"] as? String ?? "connector"
            let title = step["title"] as? String ?? step["source_id"] as? String ?? "synced page"
            return "\(src) · \(title)"
        }
        if kind == "node" {
            let type = (step["type"] as? String ?? "note").replacingOccurrences(of: "_", with: " ")
            return "\(type): \(step["label"] as? String ?? "graph node")"
        }
        let src = step["source"] as? String ?? kind
        let at = step["at"] as? String ?? ""
        return [src, at].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}
