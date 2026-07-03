// Native HTTP client for Cosmos auth — bypasses WKWebView for magic-code login.

import Foundation

enum CosmosAuthClient {
    static let baseURL = URL(string: "https://cosmos.polarity-lab.com")!

    struct ClientError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func requestCode(email: String, completion: @escaping (Result<Void, ClientError>) -> Void) {
        post(path: "/api/auth/request-code", body: ["email": email, "product": "cosmos"]) { result in
            switch result {
            case .success(let json):
                if json["ok"] as? Bool == true {
                    completion(.success(()))
                } else {
                    completion(.failure(ClientError(message: (json["error"] as? String) ?? "could not send code")))
                }
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func verifyCode(email: String, code: String, completion: @escaping (Result<CosmosSession, ClientError>) -> Void) {
        post(path: "/api/auth/verify-code", body: ["email": email, "code": code]) { result in
            switch result {
            case .success(let json):
                guard let token = json["token"] as? String, !token.isEmpty else {
                    let msg = (json["error"] as? String) ?? "invalid code"
                    completion(.failure(ClientError(message: msg)))
                    return
                }
                let session = CosmosSession(
                    token: token,
                    email: email,
                    username: (json["username"] as? String) ?? email,
                    hasAppAccess: (json["has_app_access"] as? Bool) ?? false
                )
                completion(.success(session))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func signInWithApple(identityToken: String, completion: @escaping (Result<CosmosSession, ClientError>) -> Void) {
        post(path: "/api/auth/apple", body: ["identityToken": identityToken]) { result in
            switch result {
            case .success(let json):
                guard let token = json["token"] as? String, !token.isEmpty else {
                    completion(.failure(ClientError(message: (json["error"] as? String) ?? "apple sign-in failed")))
                    return
                }
                let session = CosmosSession(
                    token: token,
                    email: (json["email"] as? String) ?? "",
                    username: (json["username"] as? String) ?? "",
                    hasAppAccess: true
                )
                completion(.success(session))
            case .failure(let err):
                completion(.failure(err))
            }
        }
    }

    static func validateSession(token: String, completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/me"))
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("Cosmos/\(McpRunner.packageVersion) (Macintosh; macOS)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 20
        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async { completion(false) }
                return
            }
            let ok = (json["has_app_access"] as? Bool) ?? true
            DispatchQueue.main.async { completion(ok) }
        }.resume()
    }

    private static func post(
        path: String,
        body: [String: Any],
        completion: @escaping (Result<[String: Any], ClientError>) -> Void
    ) {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Cosmos/\(McpRunner.packageVersion) (Macintosh; macOS)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 30
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                DispatchQueue.main.async {
                    completion(.failure(ClientError(message: error.localizedDescription)))
                }
                return
            }
            guard let http = response as? HTTPURLResponse else {
                DispatchQueue.main.async {
                    completion(.failure(ClientError(message: "network error")))
                }
                return
            }
            let ct = http.value(forHTTPHeaderField: "Content-Type") ?? ""
            guard ct.contains("application/json"), let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async {
                    completion(.failure(ClientError(message: "could not reach cosmos — check your connection and try again")))
                }
                return
            }
            guard (200...299).contains(http.statusCode) else {
                DispatchQueue.main.async {
                    completion(.failure(ClientError(message: (json["error"] as? String) ?? "request failed")))
                }
                return
            }
            DispatchQueue.main.async { completion(.success(json)) }
        }.resume()
    }
}
