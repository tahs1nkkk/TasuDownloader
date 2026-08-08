import CoreGraphics
import Foundation

/// Yüzen indirme butonunun durduğu yer.
///
/// Sekiz sabit kenar/köşe ve bir de "serbest". Serbestte butonu parmakla
/// sürüklersin ve bıraktığın nokta ekran ölçüsüne değil orana göre saklanır —
/// telefon yan çevrildiğinde ya da klavye açıldığında buton aynı bölgede kalır.
enum FabAnchor: String, CaseIterable, Identifiable {
    case topLeft, topCenter, topRight
    case midLeft, midRight
    case bottomLeft, bottomCenter, bottomRight
    case custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .topLeft: return "Sol üst"
        case .topCenter: return "Üst orta"
        case .topRight: return "Sağ üst"
        case .midLeft: return "Sol"
        case .midRight: return "Sağ"
        case .bottomLeft: return "Sol alt"
        case .bottomCenter: return "Alt orta"
        case .bottomRight: return "Sağ alt"
        case .custom: return "Serbest"
        }
    }

    /// Ekranın oranlı koordinatları (0…1). Serbest konumun kayıtlı kendi
    /// noktası var, o yüzden burada karşılığı yok.
    var unitPoint: CGPoint? {
        switch self {
        case .topLeft: return CGPoint(x: 0.12, y: 0.13)
        case .topCenter: return CGPoint(x: 0.50, y: 0.13)
        case .topRight: return CGPoint(x: 0.88, y: 0.13)
        case .midLeft: return CGPoint(x: 0.12, y: 0.50)
        case .midRight: return CGPoint(x: 0.88, y: 0.50)
        case .bottomLeft: return CGPoint(x: 0.12, y: 0.88)
        case .bottomCenter: return CGPoint(x: 0.50, y: 0.88)
        case .bottomRight: return CGPoint(x: 0.88, y: 0.88)
        case .custom: return nil
        }
    }
}

/// Where a finished download ends up.
enum DownloadDestination: String, CaseIterable, Identifiable {
    case photos
    case cloud
    case both

    var id: String { rawValue }
    var label: String {
        switch self {
        case .photos: return "Fotoğraflar"
        case .cloud: return "Bulut"
        case .both: return "İkisi"
        }
    }
}

/// App-side settings store. The payload the in-app browser reads mirrors the
/// extension's `tasuDownloaderSettings` JSON (see edge-extension/common/settings.js),
/// so the injected handlers see the exact shape they always have.
///
/// What is *not* here is deliberate. This is a downloader, so there is no
/// switch for "turn downloading off" and none for "hide the download buttons":
/// the page-injected buttons are always hidden (the app drives them from the
/// floating button instead) and every handler capability is always on. A
/// setting that only ever has one sane value is a setting that lies about
/// having two.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()
    static let changedNotification = Notification.Name("rgSettingsChanged")
    static let settingsKey = "tasuDownloaderSettings"

    /// The floating button's diameter. Applies to that button and nothing else
    /// — the handlers' own buttons are invisible, so sizing them is meaningless.
    @Published var fabSize: Double { didSet { persist() } }
    /// Butonun yeri. Sağ alt varsayılan; solaklar ve büyük ekranda baş parmağın
    /// yetişmediği köşeler için sekiz seçenek daha var, üstüne de serbest.
    @Published var fabAnchor: FabAnchor { didSet { persist() } }
    /// Serbest konumun oranlı koordinatları (0…1).
    @Published var fabCustomX: Double { didSet { persist() } }
    @Published var fabCustomY: Double { didSet { persist() } }
    /// The Reddit user-search bubble. Off for anyone who does not use it, since
    /// it does occupy a corner of every Reddit page.
    @Published var searchOverlayEnabled: Bool { didSet { persist() } }

    // Reddit search state, persisted like the extension's panel.
    @Published var searchUsername: String { didSet { persist() } }
    @Published var searchSubreddit: String { didSet { persist() } }
    @Published var searchProviders: Set<String> { didSet { persist() } }

    // MARK: Cloud & sync

    /// The Cloudflare Worker. Archive site, list sync, and R2-backed media all
    /// live here, e.g. https://tasu-arsiv.<hesap>.workers.dev. Empty means no
    /// cloud: downloads go to Photos regardless of `downloadDestination`.
    @Published var archiveURL: String { didSet { persist() } }
    /// One secret (ARCHIVE_TOKEN) unlocks the app's calls. Lives in the Keychain.
    @Published var sharedToken: String { didSet { KeychainBox.set(sharedToken, for: "sharedToken"); notify() } }
    @Published var downloadDestination: DownloadDestination { didSet { persist() } }
    /// Mbps cinsinden bant genişliği tavanı; 0 ya da `bwFree` ve üstü "sınırsız"
    /// demek. Sınırı Worker uyguluyor (baytları yavaş salarak), uygulama yalnızca
    /// isteğe `X-Tasu-Bw` başlığını / `bw` parametresini iliştiriyor — istemci
    /// tarafında bir indirmeyi gerçekten kısmanın yolu yok.
    @Published var bwDown: Int { didSet { persist() } }
    @Published var bwUp: Int { didSet { persist() } }
    /// Galeriden buluta yükleme bittiğinde dosyayı cihazdan da sil. Silmeyi
    /// Fotoğraflar'ın kendi onayı yapıyor (sistem penceresi), yani açık olsa bile
    /// kullanıcıya sormadan hiçbir şey kaybolmuyor.
    @Published var deleteAfterUpload: Bool { didSet { persist() } }
    /// Bulut medyasını telefonda sakla — açılan ve "önbelleğe al" denen dosyalar
    /// yerelde kalır, böylece ağ yokken de görüntülenebilir.
    @Published var cacheCloudMedia: Bool { didSet { persist() } }

    /// Web tarafındaki `BW_FREE` ile aynı eşik (core.js).
    static let bwFree = 1000

    /// Keys handlers wrote through chrome.storage.set (folder lists and the
    /// like). Kept verbatim and merged back into every read so those flows keep
    /// working; the native-owned keys below always win.
    private(set) var extraSettings: [String: Any]

    private let defaults = UserDefaults.standard
    private var loading = true

    init() {
        fabSize = defaults.object(forKey: "fabSize") as? Double ?? 58
        // Eski sürümde tek bir "solda dursun" anahtarı vardı; onu ızgaradaki
        // karşılığına taşıyoruz ki güncelleyen kimse butonunu kaybetmesin.
        if let raw = defaults.string(forKey: "fabAnchor"), let anchor = FabAnchor(rawValue: raw) {
            fabAnchor = anchor
        } else {
            fabAnchor = (defaults.object(forKey: "fabOnLeft") as? Bool ?? false) ? .bottomLeft : .bottomRight
        }
        fabCustomX = defaults.object(forKey: "fabCustomX") as? Double ?? 0.88
        fabCustomY = defaults.object(forKey: "fabCustomY") as? Double ?? 0.88
        searchOverlayEnabled = defaults.object(forKey: "searchOverlayEnabled") as? Bool ?? true
        searchUsername = defaults.string(forKey: "searchUsername") ?? ""
        searchSubreddit = defaults.string(forKey: "searchSubreddit") ?? ""
        searchProviders = Set(defaults.stringArray(forKey: "searchProviders") ?? ["reddit", "old"])
        // Eski iki alan (cloudBaseURL/syncBaseURL) tek Worker adresine göçtü.
        archiveURL = defaults.string(forKey: "archiveURL")
            ?? defaults.string(forKey: "syncBaseURL")
            ?? defaults.string(forKey: "cloudBaseURL") ?? ""
        sharedToken = KeychainBox.get("sharedToken") ?? ""
        downloadDestination = DownloadDestination(rawValue: defaults.string(forKey: "downloadDestination") ?? "") ?? .photos
        bwDown = defaults.object(forKey: "bwDown") as? Int ?? 0
        bwUp = defaults.object(forKey: "bwUp") as? Int ?? 0
        // "Buluta taşıdıktan sonra cihazdan silinsin" istendiği için varsayılan
        // açık; yine de her silmede Fotoğraflar kendi onayını soruyor.
        deleteAfterUpload = defaults.object(forKey: "deleteAfterUpload") as? Bool ?? true
        // Önbellek varsayılan kapalı: telefonun deposunu kullanıcı istemeden
        // doldurmak, "buluta koy" demenin tam tersi olurdu.
        cacheCloudMedia = defaults.object(forKey: "cacheCloudMedia") as? Bool ?? false
        if let data = defaults.data(forKey: "extraSettings"),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            extraSettings = parsed
        } else {
            extraSettings = [:]
        }
        loading = false
    }

    /// True once the Worker is reachable in principle; the effective
    /// destination falls back to Photos while it is not.
    var cloudConfigured: Bool {
        !archiveURL.trimmingCharacters(in: .whitespaces).isEmpty && !sharedToken.isEmpty
    }

    /// Media and list sync share one Worker now, so being configured for one
    /// means being configured for both.
    var syncConfigured: Bool { cloudConfigured }

    var effectiveDestination: DownloadDestination {
        cloudConfigured ? downloadDestination : .photos
    }

    /// Butonun o anki oranlı yeri.
    var fabPoint: CGPoint {
        fabAnchor.unitPoint ?? CGPoint(x: fabCustomX, y: fabCustomY)
    }

    /// Ekranın sol yarısında mı — yanındaki düğmelerin hangi tarafa dizileceğini
    /// ve arama balonunun nereye kaçacağını bu belirliyor.
    var fabOnLeftHalf: Bool { fabPoint.x < 0.5 }

    /// Sürükleme bittiğinde çağrılır: konum kenarların biraz içinde tutulur ki
    /// buton ekran dışına itilemesin.
    func moveFab(toUnitX x: Double, unitY y: Double) {
        fabCustomX = min(max(x, 0.06), 0.94)
        fabCustomY = min(max(y, 0.06), 0.94)
        fabAnchor = .custom
    }

    /// Worker'ın `pace.js` içindeki kuralının aynısı: aralık dışındaki her değer
    /// sınırsız sayılır. İki taraf da aynı şeyi eleyince, gösterilen etiket ile
    /// gerçekte uygulanan sınır ayrışmıyor.
    static func bwClamp(_ mbps: Int) -> Int { (1..<bwFree).contains(mbps) ? mbps : 0 }
    var effectiveBwDown: Int { Self.bwClamp(bwDown) }
    var effectiveBwUp: Int { Self.bwClamp(bwUp) }

    private func persist() {
        guard !loading else { return }
        defaults.set(fabSize, forKey: "fabSize")
        defaults.set(fabAnchor.rawValue, forKey: "fabAnchor")
        defaults.set(fabCustomX, forKey: "fabCustomX")
        defaults.set(fabCustomY, forKey: "fabCustomY")
        defaults.set(searchOverlayEnabled, forKey: "searchOverlayEnabled")
        defaults.set(searchUsername, forKey: "searchUsername")
        defaults.set(searchSubreddit, forKey: "searchSubreddit")
        defaults.set(Array(searchProviders), forKey: "searchProviders")
        defaults.set(archiveURL, forKey: "archiveURL")
        defaults.set(downloadDestination.rawValue, forKey: "downloadDestination")
        defaults.set(bwDown, forKey: "bwDown")
        defaults.set(bwUp, forKey: "bwUp")
        defaults.set(deleteAfterUpload, forKey: "deleteAfterUpload")
        defaults.set(cacheCloudMedia, forKey: "cacheCloudMedia")
        notify()
    }

    private func notify() {
        guard !loading else { return }
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    func mergeExtraSettings(_ items: [String: Any]) {
        for (key, value) in items where !Self.forcedKeys.contains(key) {
            extraSettings[key] = value
        }
        if let data = try? JSONSerialization.data(withJSONObject: extraSettings) {
            defaults.set(data, forKey: "extraSettings")
        }
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    /// Everything `settingsPayload()` writes itself. A handler that persists one
    /// of these must not be able to pin the app to its own value.
    private static let forcedKeys: Set<String> = [
        "buttonVisibility", "rightShiftDownload", "ripsnipFallback", "directDownloads",
        "buttonSize", "feedButtons", "profileButtons", "iframeButton",
        "redgifsAvatarDownload", "redditImages", "hideRedditProfileAvatars",
        "scrolllerButtons", "coomerButtons", "instagramButtons"
    ]

    /// The dictionary handlers receive for `tasuDownloaderSettings`.
    ///
    /// Every capability is on: the buttons are the app's media *resolvers*, not
    /// UI, so switching one off would only blind the floating button on that
    /// site. Mobile-hostile values are forced the same way the Orion bridge
    /// forces them — hover never fires on touch, and there is no Shift key.
    func settingsPayload() -> [String: Any] {
        var payload = extraSettings
        payload["buttonVisibility"] = "always"
        payload["rightShiftDownload"] = false
        payload["ripsnipFallback"] = false
        payload["directDownloads"] = true
        // Fixed, and unrelated to fabSize: this sizes the hidden buttons, and
        // the floating button finds media by asking where they sit. Big enough
        // to measure reliably, small enough to stay inside its media's box.
        payload["buttonSize"] = 48
        payload["feedButtons"] = true
        payload["profileButtons"] = true
        payload["iframeButton"] = true
        payload["redgifsAvatarDownload"] = true
        payload["redditImages"] = true
        // Avatars are below the floating button's 120px media threshold, so a
        // resolver there can never be reached; skipping them keeps busy Reddit
        // feeds from building hundreds of dead nodes.
        payload["hideRedditProfileAvatars"] = true
        payload["scrolllerButtons"] = true
        payload["coomerButtons"] = true
        payload["instagramButtons"] = true
        return payload
    }

    func settingsPayloadJSON() -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: settingsPayload()),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }
}
