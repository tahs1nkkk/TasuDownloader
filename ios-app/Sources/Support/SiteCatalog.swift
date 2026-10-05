import SwiftUI

/// One supported site, as emitted by the build script.
struct SupportedSite: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let url: String
    let tint: String

    var color: Color { Color(hex: tint) ?? .accentColor }
    var pageURL: URL? { URL(string: url) }
    var host: String { pageURL?.host?.lowercased() ?? "" }

    /// The letter the generated tile falls back to when no favicon loads.
    var initial: String { String(name.prefix(1)).uppercased() }
}

/// The home screen's tiles.
///
/// `sites.json` is written by scripts/build-ios-app-js.js from the shared
/// catalog in shared/core/sites.js that selects handlers and host scopes. That is the
/// whole point: a site cannot become downloadable without also getting a tile,
/// because there is only one list.
enum SiteCatalog {
    static let sites: [SupportedSite] = {
        guard let url = Bundle.main.url(forResource: "sites", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([SupportedSite].self, from: data) else {
            assertionFailure("sites.json yok — scripts/build-ios-app-js.js çalıştırılmadı")
            return []
        }
        return decoded
    }()

    /// Matches a live page back to its tile, so the browser can tint itself and
    /// the address bar can show a name instead of a URL. Suffix match, because
    /// www.reddit.com and old.reddit.com are both Reddit.
    static func site(forHost host: String) -> SupportedSite? {
        let lower = host.lowercased()
        return sites.first { site in
            let base = site.host.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
            return lower == base || lower.hasSuffix(".\(base)")
        }
    }
}

extension Color {
    /// `#RRGGBB` from sites.json. Nil rather than a guess when it is malformed —
    /// a wrong-coloured tile is easier to notice than a silent black one.
    init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
