import SwiftUI
import UIKit

/// Liste öğelerinin profil resimlerini tutan tek ortak bellek.
///
/// Akış üç adımlı, hepsi "en iyi çaba":
///  1) Bulutta `.avatar/<kimlik>.jpg` var mı? (Başka cihaz yüklemiş olabilir.)
///  2) Yoksa ve izin verildiyse kaynağı çöz — tarayıcıdan yakalanan `pageHint`
///     (Instagram/RedGifs/Scrolller gibi oturum isteyenler) ya da oturum
///     istemeyen siteler için doğrudan kural (Reddit `about.json`, Coomer/Kemono
///     `/icons/`).
///  3) İndir, ~256 piksele küçült, belleğe koy ve buluta bırak.
///
/// Kimlik `<site>~<kullanıcı>` olduğundan aynı profil birden çok listede tek
/// kareyi paylaşır; `remove` yalnız hiçbir liste artık o profili tutmuyorken çağrılır.
@MainActor
final class AvatarStore: ObservableObject {
    static let shared = AvatarStore()

    /// Kimliğe göre hazır kareler. Değişince satırlar yeniden çizilir.
    @Published private(set) var images: [String: UIImage] = [:]

    /// Aynı kimliği iki kez indirmeyi ve boşuna denemeyi önler.
    private var inFlight = Set<String>()
    private var failed = Set<String>()

    func image(for id: String) -> UIImage? { images[id] }

    /// Bir öğenin avatarını hazırlar (yoksa). `pageHint` verildiğinde önceki
    /// başarısızlık silinir: tarayıcıdan taze bir avatar adresi geldiyse yeniden
    /// denemeye değer. `allowResolve` kapalıyken yalnız buluta bakılır.
    func ensure(url: String, pageHint: String? = nil, allowResolve: Bool = false) {
        guard let id = AvatarIdentity.key(forURL: url) else { return }
        if pageHint != nil { failed.remove(id) }
        if images[id] != nil || inFlight.contains(id) || failed.contains(id) { return }
        guard let cloud = CloudClient.fromSettings() else { return }
        inFlight.insert(id)
        Task { await load(id: id, sourceURL: url, pageHint: pageHint, allowResolve: allowResolve, cloud: cloud) }
    }

    /// Profil hiçbir listede kalmayınca çağrılır: bellekten ve buluttan siler.
    func remove(_ ids: Set<String>) async {
        let cloud = CloudClient.fromSettings()
        for id in ids {
            images.removeValue(forKey: id)
            failed.remove(id)
            await cloud?.deleteAvatar(id: id)
        }
    }

    // MARK: - Yükleme

    private func load(id: String, sourceURL: String, pageHint: String?, allowResolve: Bool, cloud: CloudClient) async {
        defer { inFlight.remove(id) }

        // 1) Bulutta hazır mı?
        if let image = await Self.fetchImage(from: cloud.avatarURL(id: id)) {
            images[id] = image
            return
        }

        // 2) Kaynağı çöz: önce sayfa ipucu, sonra site kuralı.
        var source: URL?
        if let hint = pageHint?.trimmingCharacters(in: .whitespacesAndNewlines),
           !hint.isEmpty, let parsed = URL(string: hint) {
            source = parsed
        } else if allowResolve {
            source = await Self.resolveSource(forURL: sourceURL)
        }
        guard let source else { failed.insert(id); return }

        // 3) İndir, küçült, belleğe + buluta.
        guard let raw = await Self.fetchImage(from: source),
              let small = Self.downscale(raw, maxSide: 256) else {
            failed.insert(id)
            return
        }
        images[id] = small
        if let jpeg = small.jpegData(compressionQuality: 0.82) {
            await cloud.uploadAvatar(id: id, jpeg: jpeg)
        }
    }

    // MARK: - Yardımcılar

    private static func fetchImage(from url: URL) async -> UIImage? {
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else { return nil }
        return UIImage(data: data)
    }

    /// En uzun kenarı `maxSide`'a indirger; küçük olanı olduğu gibi bırakır.
    private static func downscale(_ image: UIImage, maxSide: CGFloat) -> UIImage? {
        let w = image.size.width, h = image.size.height
        guard w > 0, h > 0 else { return nil }
        let scale = min(1, maxSide / max(w, h))
        let target = CGSize(width: w * scale, height: h * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// Oturum gerektirmeyen sitelerde avatar adresini kuralla çözer. Diğerleri
    /// (Instagram/RedGifs/Scrolller) nil döner — onlar `pageHint`'e muhtaç.
    private static func resolveSource(forURL raw: String) async -> URL? {
        guard let url = URL(string: raw), let rawHost = url.host?.lowercased() else { return nil }
        let host = rawHost.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
        let parts = url.path.split(separator: "/").map { $0.removingPercentEncoding ?? String($0) }
        let a = parts.count > 0 ? parts[0] : ""
        let b = parts.count > 1 ? parts[1] : ""
        let c = parts.count > 2 ? parts[2] : ""

        if host.hasSuffix("reddit.com") {
            if (a == "user" || a == "u"), !b.isEmpty {
                return await redditIcon(about: "https://www.reddit.com/user/\(b)/about.json")
            }
            if a == "r", !b.isEmpty {
                return await redditIcon(about: "https://www.reddit.com/r/\(b)/about.json")
            }
        }
        if host.contains("coomer.") || host.contains("kemono.") {
            // /<servis>/user/<id> → img.<host>/icons/<servis>/<id>
            if b == "user", !a.isEmpty, !c.isEmpty {
                return URL(string: "https://img.\(host)/icons/\(a)/\(c)")
            }
        }
        return nil
    }

    /// Reddit'in açık JSON ucundan ikon adresini alır — hesap ya da topluluk.
    /// Adresler HTML kaçışlı (`&amp;`) gelebildiği için sadeleştirilir.
    private static func redditIcon(about: String) async -> URL? {
        guard let endpoint = URL(string: about) else { return nil }
        var request = URLRequest(url: endpoint)
        request.setValue("Mozilla/5.0 (iPhone) TasuDownloader", forHTTPHeaderField: "User-Agent")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let inner = root["data"] as? [String: Any] else { return nil }
        for field in ["community_icon", "snoovatar_img", "icon_img"] {
            if let value = inner[field] as? String, !value.isEmpty {
                let clean = value.replacingOccurrences(of: "&amp;", with: "&")
                if let parsed = URL(string: clean) { return parsed }
            }
        }
        return nil
    }
}
