import Foundation

/// One file in the cloud (Cloudflare R2, served by the Worker).
///
/// The key is the full R2 path — `<arşiv>/<site>/<dosya>` — and it is what every
/// endpoint takes. `name` is only the leaf, for showing to a human. Old servers
/// answered with a bare name and no drive/site; the decoder below still accepts
/// that shape so a half-updated Worker does not empty the gallery.
struct CloudFile: Identifiable, Decodable, Equatable {
    let key: String
    let name: String
    let drive: String
    let site: String
    let size: Int64
    let mtime: Double
    let kind: String

    var id: String { key }
    var isVideo: Bool { kind == "video" }
    var date: Date { Date(timeIntervalSince1970: mtime / 1000) }
    /// "Other" is the server's bucket for "kaynağı bilinmiyor".
    var siteLabel: String { site == "Other" ? "Diğer" : site }

    private enum CodingKeys: String, CodingKey {
        case key, name, drive, site, size, mtime, kind
    }

    init(from decoder: Decoder) throws {
        let box = try decoder.container(keyedBy: CodingKeys.self)
        let name = try box.decode(String.self, forKey: .name)
        self.name = name
        self.key = (try? box.decode(String.self, forKey: .key)) ?? name
        self.drive = (try? box.decode(String.self, forKey: .drive)) ?? CloudClient.defaultDrive
        self.site = (try? box.decode(String.self, forKey: .site)) ?? CloudClient.defaultSite
        self.size = try box.decode(Int64.self, forKey: .size)
        self.mtime = try box.decode(Double.self, forKey: .mtime)
        self.kind = try box.decode(String.self, forKey: .kind)
    }
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

/// Talks to the Cloudflare Worker's R2-backed media endpoints (/api/media).
/// Every call re-reads the settings, so pasting the Worker URL and a token into
/// the settings screen is all it takes — no restart, no rebuild.
struct CloudClient {
    static let defaultDrive = "main"
    static let defaultSite = "Other"

    let base: URL
    let token: String
    /// Mbps; 0 = sınırsız. Sunucu bu değere göre baytları yavaşlatır (pace.js).
    var bwDown: Int = 0
    var bwUp: Int = 0

    /// Nil while the settings are incomplete; callers treat that as
    /// "cloud does not exist", not as an error.
    static func fromSettings() -> CloudClient? {
        let settings = AppSettings.shared
        guard settings.cloudConfigured,
              let base = URL(string: settings.archiveURL.trimmingCharacters(in: .whitespaces)) else { return nil }
        return CloudClient(base: base,
                           token: settings.sharedToken,
                           bwDown: settings.effectiveBwDown,
                           bwUp: settings.effectiveBwUp)
    }

    private func request(_ path: String, method: String = "GET", query: [URLQueryItem] = []) -> URLRequest {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        // Yükleme kendi tavanını taşır, gerisi indirme tavanını. Sınır yokken
        // başlık hiç gönderilmiyor: sunucu yokluğu "sınırsız" okuyor.
        let mbps = (method == "PUT" || method == "POST") ? bwUp : bwDown
        if mbps > 0 { request.setValue(String(mbps), forHTTPHeaderField: "X-Tasu-Bw") }
        return request
    }

    /// `AsyncImage` ve `AVPlayer` başlık gönderemez; onlar için sınır da
    /// jetonla aynı yoldan, sorgu dizesiyle gider.
    private func mediaQuery() -> String {
        let escaped = token.addingPercentEncoding(withAllowedCharacters: .urlQueryValueAllowed) ?? token
        return bwDown > 0 ? "token=\(escaped)&bw=\(bwDown)" : "token=\(escaped)"
    }

    private func check(_ response: URLResponse) throws {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(code) else { throw CloudError.badResponse(code) }
    }

    /// Slashes inside the key have to survive percent-encoding as `/`, so the
    /// path is built segment by segment.
    private static func encode(key: String) -> String {
        key.split(separator: "/").map { segment in
            segment.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String(segment)
        }.joined(separator: "/")
    }

    func list(drive: String = CloudClient.defaultDrive) async throws -> [CloudFile] {
        let request = request("api/media", query: [URLQueryItem(name: "drive", value: drive)])
        let (data, response) = try await URLSession.shared.data(for: request)
        try check(response)
        return try JSONDecoder().decode([CloudFile].self, from: data)
    }

    /// Streams the file up; the server dodges name collisions itself and
    /// answers with the key it actually stored.
    ///
    /// `site` is what puts the file under the right tab on the web — the phone
    /// is the only side that knows which site a download came from, so it has to
    /// say. Baytlar olduğu gibi gider: ne yeniden boyutlandırma ne sıkıştırma.
    @discardableResult
    func upload(fileURL: URL,
                preferredName: String,
                site: String = CloudClient.defaultSite,
                drive: String = CloudClient.defaultDrive) async throws -> String {
        var request = request("api/media/\(Self.encode(key: preferredName))", method: "PUT", query: [
            URLQueryItem(name: "drive", value: drive),
            URLQueryItem(name: "site", value: site)
        ])
        request.timeoutInterval = 3600
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL)
        try check(response)
        struct Reply: Decodable { let key: String?; let name: String? }
        let reply = try? JSONDecoder().decode(Reply.self, from: data)
        return reply?.key ?? reply?.name ?? preferredName
    }

    func delete(key: String) async throws {
        let (_, response) = try await URLSession.shared.data(for: request("api/media/\(Self.encode(key: key))", method: "DELETE"))
        try check(response)
    }

    /// AVPlayer and AsyncImage cannot send an Authorization header, so streaming
    /// carries the token as a query parameter — the server accepts both forms.
    func streamURL(key: String) -> URL {
        var components = URLComponents(url: base.appendingPathComponent("api/media/\(Self.encode(key: key))"),
                                       resolvingAgainstBaseURL: false)!
        components.percentEncodedQuery = mediaQuery()
        return components.url!
    }

    /// Video posters live next to the media in R2 (`.thumb/…`). 404 while the
    /// web client has not generated one yet — callers fall back to an icon.
    func thumbURL(key: String) -> URL {
        var components = URLComponents(url: base.appendingPathComponent("api/thumb/\(Self.encode(key: key))"),
                                       resolvingAgainstBaseURL: false)!
        components.percentEncodedQuery = mediaQuery()
        return components.url!
    }

    /// Entry point for the in-app archive: `/auth/app` accepts the Bearer token,
    /// hands back a session cookie and forwards to the page named in `next`.
    /// `?app=1` is what makes the web client switch to its iOS skin.
    ///
    /// `startAt` boş bırakılırsa arşiv kendi giriş ekranıyla açılır — telefonda
    /// arşive girer girmez medya ızgarasına düşmek, önce hangi arşiv/kategori
    /// olduğunu seçmek isteyen birini adım geriye zorluyordu.
    func appEntryRequest(startAt view: String = "") -> URLRequest {
        let next = view.isEmpty ? "/?app=1" : "/?app=1&go=\(view)"
        var components = URLComponents(url: base.appendingPathComponent("auth/app"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "next", value: next)]
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        return request
    }
}

private extension CharacterSet {
    /// `+` and `/` are legal in a query but mean something else once a form
    /// parser sees them; the session token is base64 and contains both.
    static let urlQueryValueAllowed: CharacterSet = {
        var set = CharacterSet.urlQueryAllowed
        set.remove(charactersIn: "+&=?/")
        return set
    }()
}
