import Foundation

/// One file on the PC media server.
struct CloudFile: Identifiable, Decodable, Equatable {
    let name: String
    let size: Int64
    let mtime: Double
    let kind: String

    var id: String { name }
    var isVideo: Bool { kind == "video" }
    var date: Date { Date(timeIntervalSince1970: mtime / 1000) }
}

enum CloudError: LocalizedError {
    case notConfigured
    case badResponse(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Bulut ayarlanmamış (Ayarlar → Bulut)"
        case .badResponse(let code): return "Sunucu \(code) döndürdü"
        }
    }
}

/// Talks to cloud/server/server.js on the PC over its Tailscale Funnel URL.
/// Every call re-reads the settings, so pasting a URL and a token into the
/// settings screen is all it takes — no restart, no rebuild.
struct CloudClient {
    let base: URL
    let token: String

    /// Nil while the settings are incomplete; callers treat that as
    /// "cloud does not exist", not as an error.
    static func fromSettings() -> CloudClient? {
        let settings = AppSettings.shared
        guard settings.cloudConfigured,
              let base = URL(string: settings.cloudBaseURL.trimmingCharacters(in: .whitespaces)) else { return nil }
        return CloudClient(base: base, token: settings.sharedToken)
    }

    private func request(_ path: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func check(_ response: URLResponse) throws {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(code) else { throw CloudError.badResponse(code) }
    }

    struct Health: Decodable {
        let ok: Bool
        let files: Int
        let freeBytes: Int64?
    }

    func health() async throws -> Health {
        let (data, response) = try await URLSession.shared.data(for: request("health"))
        try check(response)
        return try JSONDecoder().decode(Health.self, from: data)
    }

    func list() async throws -> [CloudFile] {
        let (data, response) = try await URLSession.shared.data(for: request("files"))
        try check(response)
        return try JSONDecoder().decode([CloudFile].self, from: data)
    }

    /// Streams the file up; the server dodges name collisions itself and
    /// answers with the name it actually stored.
    @discardableResult
    func upload(fileURL: URL, preferredName: String) async throws -> String {
        let encoded = preferredName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? preferredName
        var request = request("files/\(encoded)", method: "PUT")
        request.timeoutInterval = 3600
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL)
        try check(response)
        struct Reply: Decodable { let name: String }
        return (try? JSONDecoder().decode(Reply.self, from: data).name) ?? preferredName
    }

    func delete(name: String) async throws {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let (_, response) = try await URLSession.shared.data(for: request("files/\(encoded)", method: "DELETE"))
        try check(response)
    }

    /// AVPlayer and AsyncImage cannot send an Authorization header, so streaming
    /// carries the token as a query parameter — the server accepts both forms.
    func streamURL(name: String) -> URL {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        var components = URLComponents(url: base.appendingPathComponent("files/\(encoded)"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        return components.url!
    }
}
