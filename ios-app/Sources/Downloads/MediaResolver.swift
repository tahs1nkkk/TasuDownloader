import Foundation

/// Sayfadan indirilebilir bir adres çıkmadığında, elde kalan kalıcı bağlantıdan
/// gerçek medya adresini çözen son çare katmanı.
///
/// Eklentide bu işi `background.js` yapıyor (`resolveMediaViaRedgifs`). RedGifs'in
/// tam ekran ve akış videoları blob/HLS olarak oynatıldığı için sayfada
/// indirilebilir bir mp4 bulunmaz; geriye yalnız `/watch/<slug>` kalıcı bağlantısı
/// kalır ve gerçek dosya ancak RedGifs API'sinden alınır. Uygulamada bu adım hiç
/// yoktu: `Downloader` yalnız hazır http adreslerini indirdiği için sayfa doğru
/// kalıcı bağlantıyı verse bile "İndirilecek URL bulunamadı" çıkıyordu — RedGifs
/// ana sayfası/tam ekran/niş sayfaları ve Reddit'e gömülü RedGifs'lerin tamamı.
///
/// Kapsam bilerek dar: yalnız kalıcı bağlantıdan *kuralla* çözülebilen siteler.
/// Oturum isteyen ya da imzalı adres üreten siteler buraya girmez.
actor MediaResolver {
    static let shared = MediaResolver()

    /// Geçici jeton kısa ömürlüdür; her indirmede yeniden almak yerine saklanır.
    private var token: String?
    private var tokenAt: Date?
    private static let tokenTTL: TimeInterval = 600

    /// Kaynak sayfadan indirilebilir adresleri en iyi kaliteden başlayarak döndürür.
    /// Çözemezse boş dizi döner ve çağıran kendi hatasını verir.
    /// `cookieHeader`, WebView çerezlerinden hazırlanmış `Cookie` başlığıdır —
    /// aktöre `HTTPCookie` (sınıf, Sendable değil) geçirmemek için düz metin.
    func resolve(sourceUrl: String, userAgent: String, cookieHeader: String) async -> [String] {
        guard let host = URL(string: sourceUrl)?.host?.lowercased() else { return [] }
        if host == "redgifs.com" || host.hasSuffix(".redgifs.com") {
            return await redgifs(sourceUrl: sourceUrl, userAgent: userAgent)
        }
        if host == "scrolller.com" || host.hasSuffix(".scrolller.com") {
            return await scrolller(pageUrl: sourceUrl, userAgent: userAgent, cookieHeader: cookieHeader)
        }
        if host == "reddit.com" || host.hasSuffix(".reddit.com") {
            return await reddit(permalink: sourceUrl, userAgent: userAgent, cookieHeader: cookieHeader)
        }
        return []
    }

    /// Sayfa isteklerinde WebView'in kimliği ve oturumu kullanılır: Scrolller
    /// içerik sayfaları yetişkin içerik çerezine bakar, çerezsiz istek ara sayfa
    /// döndürüp hiçbir medya vermez.
    private func pageRequest(_ url: URL, userAgent: String, cookieHeader: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if !cookieHeader.isEmpty { request.setValue(cookieHeader, forHTTPHeaderField: "Cookie") }
        return request
    }

    // MARK: - RedGifs

    /// `https://www.redgifs.com/watch/<slug>` ya da `/ifr/<slug>` → `<slug>`.
    /// Eklentideki `redgifsSlugFromUrl` ile aynı kural.
    static func redgifsSlug(from raw: String) -> String? {
        guard let url = URL(string: raw), let host = url.host?.lowercased(),
              host == "redgifs.com" || host.hasSuffix(".redgifs.com") else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count >= 2, ["watch", "ifr"].contains(parts[0].lowercased()) else { return nil }
        let slug = parts[1].trimmingCharacters(in: .whitespaces)
        return slug.isEmpty ? nil : slug
    }

    private func redgifs(sourceUrl: String, userAgent: String) async -> [String] {
        guard let slug = Self.redgifsSlug(from: sourceUrl),
              let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let endpoint = URL(string: "https://api.redgifs.com/v2/gifs/\(encoded)") else { return [] }

        var request = URLRequest(url: endpoint)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let token = await temporaryToken(userAgent: userAgent) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else { return [] }
        return Self.redgifsMediaURLs(from: data)
    }

    /// `/v2/gifs/<slug>` gövdesinden adresler. Poster/thumbnail bilerek atlanır:
    /// video istenirken kapak görselinin inmesi sessiz bir yanlış sonuç olurdu.
    static func redgifsMediaURLs(from data: Data) -> [String] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let gif = root["gif"] as? [String: Any],
              let urls = gif["urls"] as? [String: Any] else { return [] }
        var out: [String] = []
        for key in ["hd", "sd"] {
            guard let value = urls[key] as? String,
                  value.lowercased().hasPrefix("http"), !out.contains(value) else { continue }
            out.append(value)
        }
        return out
    }

    /// RedGifs API'si kimliksiz istekleri reddeder; açık uçtan geçici jeton alınır.
    private func temporaryToken(userAgent: String) async -> String? {
        if let token, let tokenAt, Date().timeIntervalSince(tokenAt) < Self.tokenTTL {
            return token
        }
        guard let endpoint = URL(string: "https://api.redgifs.com/v2/auth/temporary") else { return nil }
        var request = URLRequest(url: endpoint)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }

        let fresh = (root["token"] as? String) ?? (root["access_token"] as? String)
        guard let fresh, !fresh.isEmpty else { return nil }
        token = fresh
        tokenAt = Date()
        return fresh
    }

    // MARK: - Scrolller

    /// Scrolller videolarının çoğu `blob:` ile oynatılır; kareden seçilen video
    /// için elde yalnız içerik sayfasının adresi kalır. Eklentideki
    /// `resolveMediaViaScrolller` bu sayfayı çekip meta etiketlerinden gerçek
    /// dosyayı buluyor — uygulamada bu adım yoktu, "çoklu seçimde videolar
    /// inmiyor" bundandı. Görseller etkilenmiyordu: onların adresi zaten DOM'da.
    private func scrolller(pageUrl: String, userAgent: String, cookieHeader: String) async -> [String] {
        guard let url = URL(string: pageUrl) else { return [] }
        guard let (data, response) = try? await URLSession.shared.data(
                for: pageRequest(url, userAgent: userAgent, cookieHeader: cookieHeader)
              ),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              let raw = String(data: data, encoding: .utf8) else { return [] }
        return Self.scrolllerMediaURLs(fromHTML: raw)
    }

    /// HTML'den adres çıkarma — ayrı tutuldu ki ağ olmadan da akıl yürütülebilsin.
    static func scrolllerMediaURLs(fromHTML raw: String) -> [String] {
        // Adresler sayfaya JSON içinde kaçışlı gömülüyor; düzleştirilmeden
        // ne meta etiketi ne de genel tarama tutar.
        let html = raw
            .replacingOccurrences(of: "\\u002f", with: "/", options: [.caseInsensitive])
            .replacingOccurrences(of: "\\/", with: "/")
            .replacingOccurrences(of: "&amp;", with: "&", options: [.caseInsensitive])

        var primaryVideos: [String] = []
        var primaryImages: [String] = []
        for tag in Self.matches(in: html, pattern: "<meta\\b[^>]*>") {
            let key = Self.capture(in: tag, pattern: "(?:property|name)=[\"']([^\"']+)[\"']")?.lowercased() ?? ""
            guard let content = Self.capture(in: tag, pattern: "content=[\"']([^\"']+)[\"']"),
                  content.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil
            else { continue }
            if key.range(of: "og:video|twitter:player:stream", options: .regularExpression) != nil {
                primaryVideos.append(content)
            } else if key.range(of: "og:image|twitter:image", options: .regularExpression) != nil {
                primaryImages.append(content)
            }
        }

        let allUrls = Self.matches(
            in: html,
            pattern: "https?://[^\\s\"'<>]+?\\.(?:mp4|webm|m4v|mov|gif|webp|png|jpe?g)(?:\\?[^\\s\"'<>]*)?"
        )

        let isGif: (String) -> Bool = { $0.range(of: "\\.gif([?#]|$)", options: [.regularExpression, .caseInsensitive]) != nil }
        let gifPost = primaryImages.contains(where: isGif)
            || Self.contains(html, "[\"'](?:isGif|is_gif)[\"']\\s*:\\s*true")
            || Self.contains(html, "[\"'](?:mediaType|media_type)[\"']\\s*:\\s*[\"']gif[\"']")
        let videoPost = !primaryVideos.isEmpty
            || Self.contains(html, "[\"'](?:isVideo|is_video)[\"']\\s*:\\s*true")
            || Self.contains(html, "[\"'](?:mediaType|media_type)[\"']\\s*:\\s*[\"']video[\"']")
            || Self.contains(html, "<video\\b")

        // Video gönderisinde kapak görselini "birincil" saymak, videoyu isterken
        // sessizce jpg indirmek demekti — o yüzden bilerek boş bırakılıyor.
        let primary: [String]
        if !primaryVideos.isEmpty { primary = primaryVideos }
        else if gifPost { primary = primaryImages.filter(isGif) }
        else if videoPost { primary = [] }
        else { primary = primaryImages }

        var seen = Set<String>()
        let unique = (primary + allUrls).filter { seen.insert($0).inserted }
        let primarySet = Set(primary)

        // Sıralama eklentiyle birebir: önce birincil, sonra gönderi türüne göre
        // gif/mp4, sonra Scrolller'ın kendi CDN'i, en son sayfadaki sıra.
        return unique.enumerated()
            .sorted { a, b in
                let pa = primarySet.contains(a.element), pb = primarySet.contains(b.element)
                if pa != pb { return pa }
                if gifPost {
                    let ga = isGif(a.element), gb = isGif(b.element)
                    if ga != gb { return ga }
                } else {
                    let ma = a.element.range(of: "\\.mp4([?#]|$)", options: [.regularExpression, .caseInsensitive]) != nil
                    let mb = b.element.range(of: "\\.mp4([?#]|$)", options: [.regularExpression, .caseInsensitive]) != nil
                    if ma != mb { return ma }
                }
                // Scrolller'ın video CDN'i `photon.scrolller.com`. Eskiden
                // "proton" yazıyordu; hiçbir adrese uymadığından bu basamak
                // sessizce ölü kalıyor, sıralama sayfa sırasına düşüyordu.
                let ca = Self.contains(a.element, "://photon\\.scrolller\\.com/")
                let cb = Self.contains(b.element, "://photon\\.scrolller\\.com/")
                if ca != cb { return ca }
                return a.offset < b.offset
            }
            .map(\.element)
    }

    // MARK: - Reddit

    /// Reddit, yüklenen GIF'i mp4'e çevirip DASH ile oynatır; `<video>`'nun
    /// adresi `blob:` olduğu için sayfadan indirilebilir bir şey çıkmaz. Gönderi
    /// kalıcı bağlantısının sonuna `.json` eklemek, aynı gönderinin medya
    /// alanlarını açık şekilde verir.
    private func reddit(permalink: String, userAgent: String, cookieHeader: String) async -> [String] {
        guard let url = URL(string: permalink), url.path.contains("/comments/"),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return [] }
        // ".../başlık/" → ".../başlık/.json" değil, ".../başlık.json" isteniyor.
        var path = parts.path
        while path.hasSuffix("/") { path.removeLast() }
        parts.path = path + ".json"
        parts.query = "raw_json=1"
        parts.fragment = nil
        guard let endpoint = parts.url else { return [] }

        guard let (data, response) = try? await URLSession.shared.data(
                for: pageRequest(endpoint, userAgent: userAgent, cookieHeader: cookieHeader)
              ),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else { return [] }
        return Self.redditMediaURLs(from: data)
    }

    static func redditMediaURLs(from data: Data) -> [String] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [Any],
              let listing = root.first as? [String: Any],
              let listingData = listing["data"] as? [String: Any],
              let children = listingData["children"] as? [[String: Any]],
              let post = children.first?["data"] as? [String: Any] else { return [] }

        var out: [String] = []
        let add: (Any?) -> Void = { value in
            guard let text = value as? String,
                  text.lowercased().hasPrefix("http"), !out.contains(text) else { return }
            out.append(text)
        }

        let preview = post["preview"] as? [String: Any]
        // Önce tam dosyalar: GIF gönderisinin mp4 karşılığı ve önizleme
        // türevleri sesli/sessiz ayrımı olmayan tek parça dosyalardır.
        add((preview?["reddit_video_preview"] as? [String: Any])?["fallback_url"])
        if let image = (preview?["images"] as? [[String: Any]])?.first,
           let variants = image["variants"] as? [String: Any] {
            for key in ["mp4", "gif"] {
                add(((variants[key] as? [String: Any])?["source"] as? [String: Any])?["url"])
            }
        }
        // Gerçek video gönderileri en sona: `fallback_url` DASH'in yalnız görüntü
        // parçasıdır, sesi ayrı dosyada gelir. Hiç indirmemektense sessiz inmesi
        // yeğ — GIF'lerde zaten ses yok, sıralama da onları öne alıyor.
        for key in ["secure_media", "media"] {
            add(((post[key] as? [String: Any])?["reddit_video"] as? [String: Any])?["fallback_url"])
        }
        // i.redd.it/xxx.gif gibi doğrudan dosyaya çıkan gönderiler.
        if let direct = post["url_overridden_by_dest"] as? String,
           direct.range(of: "\\.(mp4|gif|gifv|webm|jpe?g|png|webp)([?#]|$)",
                        options: [.regularExpression, .caseInsensitive]) != nil {
            add(direct)
        }
        return out
    }

    // MARK: - Regex yardımcıları

    private static func matches(in text: String, pattern: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap {
            Range($0.range, in: text).map { String(text[$0]) }
        }
    }

    private static func capture(in text: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[range])
    }

    private static func contains(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
