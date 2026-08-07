import Foundation
import SwiftUI

/// Kaydedilmiş bir bağlantının okunur adı.
///
/// Web arşivindeki `linkLabel` (cloud/web/public/js/core.js) ile birebir aynı
/// kurallar: yan yana on tane "instagram.com/p/DAbC…" satırı hangisinin ne
/// olduğunu söylemiyordu. Adres profil ise kullanıcı adı, gönderi ise
/// "kullanıcı | tür" yazılır. İki taraf aynı kuralı uyguladığı için telefonda
/// gördüğün ad ile PC'de gördüğün ad ayrışmıyor.
enum LinkLabel {
    private static let kindTR: [String: String] = [
        "post": "post", "reels": "reels", "story": "story",
        "video": "video", "gallery": "galeri"
    ]

    private static func label(_ user: String, _ kind: String) -> String {
        let tr = kindTR[kind] ?? kind
        if !user.isEmpty && !kind.isEmpty { return "\(user) | \(tr)" }
        if !user.isEmpty { return user }
        return kind.isEmpty ? "" : tr
    }

    /// Adresten çıkarılabilen ad; çıkarılamıyorsa boş.
    private static func fromURL(_ raw: String) -> String {
        guard let parsed = URL(string: raw), let rawHost = parsed.host else { return "" }
        let host = rawHost.lowercased().replacingOccurrences(of: "^www\\.",
                                                            with: "",
                                                            options: .regularExpression)
        let parts = parsed.path.split(separator: "/").map { $0.removingPercentEncoding ?? String($0) }
        let a = parts.count > 0 ? parts[0] : ""
        let b = parts.count > 1 ? parts[1] : ""
        let c = parts.count > 2 ? parts[2] : ""

        if host.hasSuffix("instagram.com") {
            if a == "stories" { return label(b.isEmpty ? "" : "@\(b)", "story") }
            if a == "p" || a == "tv" { return label("", "post") }
            if a == "reel" || a == "reels" { return label("", "reels") }
            if a.isEmpty || ["explore", "direct", "accounts"].contains(a) { return "" }
            // instagram.com/<kullanıcı>/p/<kod> biçiminde ikisi birden var.
            if b == "p" || b == "tv" { return label("@\(a)", "post") }
            if b == "reel" || b == "reels" { return label("@\(a)", "reels") }
            return "@\(a)"
        }

        if host.hasSuffix("reddit.com") || host.hasSuffix("redd.it") {
            if a == "user" || a == "u" {
                return b.isEmpty ? "" : label("u/\(b)", c == "comments" ? "post" : "")
            }
            if a == "r" && !b.isEmpty {
                return c == "comments" ? label("r/\(b)", "post") : "r/\(b)"
            }
            return ""
        }

        if host.hasSuffix("redgifs.com") {
            if a == "users" && !b.isEmpty { return c == "watch" ? label("@\(b)", "video") : "@\(b)" }
            if a == "watch" && !b.isEmpty { return label("", "video") }
            return ""
        }

        if host.hasSuffix("scrolller.com") {
            if a == "r" && !b.isEmpty { return "r/\(b)" }
            if a == "u" && !b.isEmpty { return "@\(b)" }
            return ""
        }

        if host.contains("coomer.") || host.contains("kemono.") {
            // /<servis>/user/<kullanıcı>[/post/<id>]
            if b == "user" && !c.isEmpty {
                let isPost = parts.count > 3 && parts[3] == "post"
                return isPost ? label("@\(c)", "post") : "@\(c)"
            }
            return ""
        }

        return ""
    }

    /// Sırayla: adresten çıkarılan ad → kaydedilen başlık → yolun son parçası →
    /// ham adres.
    static func of(url: String, title: String = "") -> String {
        let named = fromURL(url)
        if !named.isEmpty { return named }
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty && clean != url { return clean }
        guard let parsed = URL(string: url) else { return url }
        if let last = parsed.path.split(separator: "/").last {
            return String(last).removingPercentEncoding ?? String(last)
        }
        return (parsed.host ?? url).replacingOccurrences(of: "^www\\.",
                                                        with: "",
                                                        options: .regularExpression)
    }

    /// Başlık ikinci satır olarak gösterilecekse: adla aynı şeyi tekrarlamasın.
    static func note(url: String, title: String) -> String? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean != url, clean != of(url: url, title: title) else { return nil }
        return clean
    }
}

/// Bir bağlantının hangi uygulamadan geldiği. Süzgeçler bu anahtara bakıyor;
/// katalogda olmayan bir adres kendi ana makine adıyla anılır — "diğer" diye
/// her şeyi yutan bir kutu, aradığın şeyi bulmayı zorlaştırırdı.
enum LinkSite {
    static func key(for item: LinkItem) -> String {
        let host = URL(string: item.url)?.host?.lowercased() ?? ""
        return SiteCatalog.site(forHost: host)?.id ?? item.host
    }

    static func name(_ key: String) -> String {
        SiteCatalog.sites.first { $0.id == key }?.name ?? key
    }

    static func color(_ key: String) -> Color {
        SiteCatalog.sites.first { $0.id == key }?.color ?? .gray
    }

    static func initial(_ key: String) -> String {
        String(name(key).prefix(1)).uppercased()
    }
}
