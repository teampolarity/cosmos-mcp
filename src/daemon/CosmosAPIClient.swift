// Authenticated Cosmos cloud API for native Thread.

import Foundation

struct ThreadMoment: Identifiable {
    let id: String
    let kind: String
    let chip: String
    let heading: String
    let body: String
    let threadType: String
    let sheet: MomentSheet

    var label: String {
        if kind == "weave" { return chip.isEmpty ? "this week" : chip }
        if kind == "caught_up" { return "caught up" }
        return chip.isEmpty ? (heading.isEmpty ? "moment" : heading) : chip
    }

    var canReply: Bool { kind != "weave" && kind != "caught_up" }

    static func parseList(_ raw: [[String: Any]]) -> [ThreadMoment] {
        raw.compactMap { parse($0) }
    }

    static func parse(_ json: [String: Any]) -> ThreadMoment? {
        guard let id = json["id"] as? String else { return nil }
        let sheetJson = json["sheet"] as? [String: Any] ?? [:]
        return ThreadMoment(
            id: id,
            kind: json["kind"] as? String ?? "moment",
            chip: json["chip"] as? String ?? "",
            heading: json["heading"] as? String ?? "",
            body: json["body"] as? String ?? "",
            threadType: json["thread_type"] as? String ?? "",
            sheet: MomentSheet.parse(sheetJson)
        )
    }
}

struct MomentReceipt: Identifiable {
    let id = UUID()
    let label: String
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

enum CosmosAPIClient {
    static let baseURL = URL(string: "https://cosmos.polarity-lab.com")!

    struct APIError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static func token() -> String? { CosmosAuthStore.loadToken() }

    private static func request(
        path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        timeout: TimeInterval = 30,
        completion: @escaping (Result<[String: Any], APIError>) -> Void
    ) {
        guard let token = token() else {
            completion(.failure(APIError(message: "not signed in")))
            return
        }
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
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

    static func fetchMoments(refresh: Bool = false, completion: @escaping (Result<([ThreadMoment], Bool), APIError>) -> Void) {
        var path = "/api/me/moments"
        if refresh {
            path += "?refresh=1&t=\(Int(Date().timeIntervalSince1970 * 1000))"
        }
        request(path: path, timeout: refresh ? 90 : 30) { result in
            switch result {
            case .success(let json):
                if json["schema_ready"] as? Bool == false {
                    completion(.failure(APIError(message: "thread is updating — try refresh in a minute")))
                    return
                }
                let rows = json["moments"] as? [[String: Any]] ?? []
                let recompiled = json["recompiled"] as? Bool ?? false
                completion(.success((ThreadMoment.parseList(rows), recompiled)))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func reply(momentId: String, body: String, completion: @escaping (Result<Void, APIError>) -> Void) {
        request(path: "/api/me/moments/\(momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId)/reply", method: "POST", body: ["body": body]) { result in
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

    static func submitOnboarding(answer: String?, skip: Bool, completion: @escaping (Result<Void, APIError>) -> Void) {
        let body: [String: Any] = skip ? ["skip": true] : ["answer": answer ?? ""]
        request(path: "/api/me/thread/onboarding", method: "POST", body: body) { result in
            switch result {
            case .success: completion(.success(()))
            case .failure(let err): completion(.failure(err))
            }
        }
    }

    static func fetchProvenance(nodeId: String, completion: @escaping (Result<[ProvenanceStep], APIError>) -> Void) {
        let path = "/api/me/provenance/trace?node_id=\(nodeId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? nodeId)&max_depth=5"
        request(path: path) { result in
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
                let hint = json["hint"] as? String ?? json["status"] as? String ?? "unknown"
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
