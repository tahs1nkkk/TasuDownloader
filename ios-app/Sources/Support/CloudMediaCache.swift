import CryptoKit
import Foundation

/// Bulut medyasının telefondaki kopyası — Ayarlar'dan açılıp kapanır, tek
/// düğmeyle sıfırlanır.
///
/// Nerede durduğu bilerek `Caches` değil: sistem `Caches`'i yer darlığında
/// haber vermeden siler, oysa buranın tek amacı ağ yokken de elde olmak.
/// Bunun karşılığı olarak klasör yedeklemenin dışında tutuluyor — buluttaki
/// dosyanın iCloud yedeğine ikinci kez girmesinin anlamı yok.
///
/// Dosya adı anahtarın SHA-256'sı: bulut anahtarı `<arşiv>/<site>/<dosya>`
/// biçiminde eğik çizgi taşıyor ve doğrudan dosya adı olamıyor. Uzantı
/// korunuyor, çünkü AVPlayer yerel dosyanın türünü uzantıdan anlıyor.
final class CloudMediaCache {
    static let shared = CloudMediaCache()

    /// Aynı anahtarın hem medyası hem kapağı saklanabilsin diye iki ayrı ad alanı.
    enum Kind: String {
        case media
        case thumb
    }

    private let root: URL
    private let listingURL: URL
    private let fs = FileManager.default

    private init() {
        let base = fs.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        root = base.appendingPathComponent("CloudCache", isDirectory: true)
        listingURL = root.appendingPathComponent("listing.json")
        prepare()
    }

    private func prepare() {
        guard !fs.fileExists(atPath: root.path) else { return }
        try? fs.createDirectory(at: root, withIntermediateDirectories: true)
        var url = root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    var isOn: Bool { AppSettings.shared.cacheCloudMedia }

    // MARK: - Konum

    private func name(for key: String, kind: Kind) -> String {
        let digest = SHA256.hash(data: Data("\(kind.rawValue):\(key)".utf8))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        let ext = (key as NSString).pathExtension.lowercased()
        // Kapaklar her zaman JPEG; medyada uzantı yoksa AVPlayer'ın tahminine
        // bırakmak yerine `bin` yazılmıyor — uzantısız dosya akıştan oynatılır.
        if kind == .thumb { return "\(hex).jpg" }
        return ext.isEmpty ? hex : "\(hex).\(ext)"
    }

    func fileURL(for key: String, kind: Kind = .media) -> URL {
        root.appendingPathComponent(name(for: key, kind: kind))
    }

    /// Yerelde varsa dosyanın adresi, yoksa nil. Uzantısız medya kabul edilmiyor:
    /// AVPlayer türü uzantıdan çıkardığı için oynatılamayan bir yerel kopya,
    /// akıştan oynatmaktan kötü.
    func localURL(for key: String, kind: Kind = .media) -> URL? {
        let url = fileURL(for: key, kind: kind)
        guard fs.fileExists(atPath: url.path) else { return nil }
        if kind == .media && url.pathExtension.isEmpty { return nil }
        return url
    }

    func has(_ key: String, kind: Kind = .media) -> Bool { localURL(for: key, kind: kind) != nil }

    func data(for key: String, kind: Kind = .media) -> Data? {
        guard let url = localURL(for: key, kind: kind) else { return nil }
        return try? Data(contentsOf: url)
    }

    // MARK: - Yazma

    /// Önbellek kapalıyken hiçbir şey yazılmaz — ayarı kapatmak "bundan sonra
    /// biriktirme" demek, sıfırlama ayrı düğme.
    @discardableResult
    func store(_ data: Data, for key: String, kind: Kind = .media) -> URL? {
        guard isOn, !data.isEmpty else { return nil }
        prepare()
        let url = fileURL(for: key, kind: kind)
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    /// Ağdan çekip saklar. Zaten yerelde varsa istek hiç yapılmaz.
    @discardableResult
    func fetchAndStore(key: String, from remote: URL, kind: Kind = .media) async -> URL? {
        if let existing = localURL(for: key, kind: kind) { return existing }
        guard isOn else { return nil }
        guard let (data, response) = try? await URLSession.shared.data(from: remote),
              (200...299).contains((response as? HTTPURLResponse)?.statusCode ?? 0) else { return nil }
        return store(data, for: key, kind: kind)
    }

    // MARK: - Liste

    /// Son başarılı dosya listesi. Ağ yokken ızgara bunu okur; yoksa bulut
    /// sekmesi çevrimdışıyken bomboş kalırdı.
    func saveListing(_ files: [CloudFile]) {
        guard isOn else { return }
        prepare()
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(files) else { return }
        try? data.write(to: listingURL, options: .atomic)
    }

    func listing() -> [CloudFile]? {
        guard let data = try? Data(contentsOf: listingURL) else { return nil }
        return try? JSONDecoder().decode([CloudFile].self, from: data)
    }

    // MARK: - Bakım

    /// Diskteki toplam boyut (bayt). Ayarlar düğmesinin etiketinde gösteriliyor.
    func size() -> Int64 {
        guard let items = try? fs.contentsOfDirectory(at: root,
                                                      includingPropertiesForKeys: [.fileSizeKey],
                                                      options: [.skipsHiddenFiles]) else { return 0 }
        return items.reduce(Int64(0)) { total, url in
            let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            return total + Int64(bytes)
        }
    }

    /// Her şeyi siler — liste anlık görüntüsü dahil. Ayar açık kalır: sıfırlamak
    /// "biriktirmeyi bırak" demek değil.
    func clear() {
        try? fs.removeItem(at: root)
        prepare()
    }

    /// Buluttan silinen dosyanın yerel kopyası da düşsün diye.
    func drop(key: String) {
        try? fs.removeItem(at: fileURL(for: key, kind: .media))
        try? fs.removeItem(at: fileURL(for: key, kind: .thumb))
    }

    static func humanSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        return formatter.string(fromByteCount: bytes)
    }
}
