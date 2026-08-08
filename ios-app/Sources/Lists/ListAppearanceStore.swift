import SwiftUI

/// Bir listenin görünümü: kapak, vurgu rengi, kategori.
///
/// Alan adları ve değer biçimleri web arşiviyle birebir aynı
/// (`cloud/web/src/meta.js` → `sanitizeMeta`). Sunucu tanımadığı değeri sessizce
/// düşürdüğü için burada da aynı kalıplara uyuluyor.
struct ListAppearance: Equatable {
    /// `grad:#aabbcc,#ddeeff` | `media:<r2 anahtarı>` | `https://…` | boş
    var banner = ""
    /// `#rrggbb` ya da boş (boş = sitenin kendi rengi)
    var accent = ""
    /// `listCats` kimliği ya da boş (boş = otomatik, yani bağlantıların sitesi)
    var cat = ""

    var isEmpty: Bool { banner.isEmpty && accent.isEmpty && cat.isEmpty }
}

/// Kapak seçicisindeki hazır renk geçişi. Kimlik doğrudan kaydedilecek değerin
/// kendisi (`grad:#a,#b`) — seçili olanı bulmak için ayrıca eşleme tutmuyoruz.
struct BannerGradient: Identifiable, Equatable {
    let start: String
    let end: String

    var id: String { "grad:\(start),\(end)" }
    var colors: [Color] { [Color(hex: start) ?? .gray, Color(hex: end) ?? .gray] }
}

/// Kullanıcının kendi açtığı liste kategorisi ("Favoriler" gibi).
struct ListCategory: Identifiable, Equatable {
    let id: String
    var name: String
    var color: String

    var swatch: Color { Color(hex: color) ?? .accentColor }
}

/// Liste kartlarının görünümünü tutan ortak bellek — web arşiviyle paylaşımlı.
///
/// Kaynak `/api/meta`: sitenin liste kartlarını çizerken okuduğu belgenin ta
/// kendisi. İki taraf aynı belgeyi okuyup yazdığı için PC'de seçilen kapak
/// telefonda, telefonda seçilen kategori PC'de görünür — ayrı bir "telefon
/// teması" tutmak ikisini kaçınılmaz olarak ayrıştırırdı.
///
/// Belge tek parça: `drives`, `cats`, `items` bizim alanlarımız değil ama aynı
/// JSON'da duruyor. Ham sözlük olduğu gibi saklanıp geri yazılıyor; yoksa
/// telefondan yapılan her kayıt medya kategorilerini silerdi.
///
/// Bulut ayarlı değilse sessizce boş kalır: kartlar sitenin kendi renkleriyle
/// çizilir, düzenleme penceresi yalnız "kaydedilemedi" der.
@MainActor
final class ListAppearanceStore: ObservableObject {
    static let shared = ListAppearanceStore()

    @Published private(set) var entries: [String: ListAppearance] = [:]
    @Published private(set) var categories: [ListCategory] = []
    /// Son yazma hatası (kullanıcıya düzenleme penceresinde gösterilir).
    @Published private(set) var lastError = ""

    /// Belgenin dokunmadığımız alanları burada duruyor.
    private var document: [String: Any] = [:]
    /// Liste kayıtlarının ham hâli. Sunucu her listede bizim tanımadığımız alanlar
    /// da tutuyor (`drive`: listenin hangi arşive ait olduğu, `collapsed`: PC'de
    /// katlanmış mı). Bunlar saklanmazsa telefondan yapılan tek bir kapak
    /// değişikliği listeyi sessizce ana arşive geri taşırdı.
    private var rawLists: [String: [String: Any]] = [:]
    private var loaded = false
    private var busy = false

    /// Liste kimliği belgede metin anahtar; `JSONEncoder` UUID'yi büyük harfle
    /// yazdığı için sunucuya giden ad da bu — web tarafı aynı metni görüyor.
    static func key(_ id: UUID) -> String { id.uuidString }

    func appearance(for id: UUID) -> ListAppearance {
        entries[Self.key(id)] ?? ListAppearance()
    }

    func category(_ id: String) -> ListCategory? {
        categories.first { $0.id == id }
    }

    // MARK: - Okuma

    /// İlk çağrıda indirir, sonrakilerde sessizce geçer. `force` ile tazelenir
    /// (kullanıcı eşitle düğmesine bastığında).
    func refresh(force: Bool = false) async {
        guard force || !loaded else { return }
        guard let cloud = CloudClient.fromSettings() else { return }
        guard !busy else { return }
        busy = true
        defer { busy = false }
        // Boş yanıt "belge bu" değil, "okunamadı" demektir; sunucu deposuna
        // ulaşamadığında da boş bir belgeyi `degraded` etiketiyle veriyor. İkisini
        // de benimsemiyoruz: sonraki kayıt gerçek arşivleri ve etiketleri silerdi.
        guard let document = try? await cloud.meta(),
              !document.isEmpty,
              !document.keys.contains("degraded") else { return }
        adopt(document)
        loaded = true
    }

    private func adopt(_ document: [String: Any]) {
        self.document = document

        var entries: [String: ListAppearance] = [:]
        var raw: [String: [String: Any]] = [:]
        for (key, value) in (document["lists"] as? [String: Any]) ?? [:] {
            guard let fields = value as? [String: Any] else { continue }
            raw[key] = fields
            var appearance = ListAppearance()
            appearance.banner = fields["banner"] as? String ?? ""
            appearance.accent = fields["accent"] as? String ?? ""
            appearance.cat = fields["cat"] as? String ?? ""
            if !appearance.isEmpty { entries[key] = appearance }
        }
        self.entries = entries
        self.rawLists = raw

        var categories: [ListCategory] = []
        for value in (document["listCats"] as? [[String: Any]]) ?? [] {
            guard let id = value["id"] as? String, !id.isEmpty else { continue }
            categories.append(ListCategory(id: id,
                                           name: value["name"] as? String ?? id,
                                           color: value["color"] as? String ?? "#38bdf8"))
        }
        self.categories = categories
    }

    // MARK: - Yazma

    /// Görünümü yerelde hemen uygular, sonra belgeyi geri yazar. Boş görünüm
    /// kaydı tamamen siler — sunucu zaten boş nesneyi atıyor.
    func save(_ appearance: ListAppearance, for id: UUID) async {
        // Belgenin tamamı elimizde olmadan yazmak, tanımadığımız alanları silmek
        // demek. Okuma değişiklikten önce: `adopt` yerel düzenlemeyi ezmesin.
        await refresh()
        let key = Self.key(id)
        if appearance.isEmpty { entries.removeValue(forKey: key) } else { entries[key] = appearance }
        await flush()
    }

    /// Liste silinince görünümü de gitsin — yoksa belge, karşılığı olmayan
    /// kayıtlarla şişer.
    func forget(_ id: UUID) async {
        await refresh()
        let key = Self.key(id)
        let hadAppearance = entries.removeValue(forKey: key) != nil
        let hadRaw = rawLists.removeValue(forKey: key) != nil
        guard hadAppearance || hadRaw else { return }
        await flush()
    }

    /// Yeni kategori yerelde açılır; belgeye ilk kayıtla birlikte gider.
    @discardableResult
    func addCategory(named name: String) -> ListCategory {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let palette = Self.palette
        let category = ListCategory(id: Self.newId(),
                                    name: clean.isEmpty ? "Kategori" : String(clean.prefix(60)),
                                    color: palette[categories.count % palette.count])
        categories.append(category)
        return category
    }

    /// Bellekteki hâli belgeye işleyip PUT eder. Bulut yoksa yalnız yerelde
    /// kalır — kartlar yine doğru görünür, sonraki açılışta varsayılana döner.
    private func flush() async {
        guard let cloud = CloudClient.fromSettings() else {
            lastError = "Bulut ayarlanmamış (Ayarlar → Bulut)"
            return
        }
        // Belgeyi hiç okuyamadıysak yazmıyoruz: elimizdeki yarım belgeyi geri
        // yazmak sunucudaki arşivleri, kategorileri ve öğe etiketlerini silerdi.
        // (Okuma denemesi çağıranlarda, değişiklik yapılmadan önce yapılıyor —
        // burada tazelemek kullanıcının az önceki seçimini üzerine yazardı.)
        guard loaded else {
            lastError = "Arşiv okunamadı; görünüm kaydedilmedi"
            return
        }
        var lists: [String: Any] = [:]
        for key in Set(rawLists.keys).union(entries.keys) {
            // Bizim üç alanımız her seferde baştan yazılıyor (kaldırılan kapak da
            // böyle siliniyor); geri kalan ne varsa olduğu gibi duruyor.
            var fields = rawLists[key] ?? [:]
            fields.removeValue(forKey: "banner")
            fields.removeValue(forKey: "accent")
            fields.removeValue(forKey: "cat")
            if let appearance = entries[key] {
                if !appearance.banner.isEmpty { fields["banner"] = appearance.banner }
                if !appearance.accent.isEmpty { fields["accent"] = appearance.accent }
                if !appearance.cat.isEmpty { fields["cat"] = appearance.cat }
            }
            if !fields.isEmpty { lists[key] = fields }
        }
        document["lists"] = lists
        document["listCats"] = categories.map { ["id": $0.id, "name": $0.name, "color": $0.color] }
        if document["v"] == nil { document["v"] = 1 }

        do {
            let clean = try await cloud.putMeta(document)
            // Sunucu belgeyi budayarak geri veriyor: kabul edilen hâli alalım ki
            // ekranda duran şey ile kayıtlı olan ayrışmasın.
            if !clean.isEmpty { adopt(clean) }
            lastError = ""
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Yardımcılar

    /// Web'in `PALETTE`'i (cloud/web/public/js/core.js) — iki taraf aynı renkler.
    static let palette = [
        "#f59e0b", "#ec4899", "#8b5cf6", "#38bdf8", "#34d399",
        "#f4525f", "#facc15", "#22d3ee", "#a78bfa", "#fb7185"
    ]

    /// Web'in kapak seçicisindeki hazır geçişler.
    static let gradients: [BannerGradient] = [
        BannerGradient(start: "#fbbf24", end: "#ec4899"), BannerGradient(start: "#38bdf8", end: "#8b5cf6"),
        BannerGradient(start: "#34d399", end: "#0ea5e9"), BannerGradient(start: "#f4525f", end: "#f59e0b"),
        BannerGradient(start: "#a78bfa", end: "#ec4899"), BannerGradient(start: "#1f2937", end: "#4b5563")
    ]

    /// Sunucunun kimlik kalıbına uyar: `^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$`.
    private static func newId() -> String {
        let stamp = String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
        let salt = String(Int.random(in: 0..<1_679_616), radix: 36)
        return "lc\(stamp)\(salt)"
    }
}

/// Kapak değerinin (`banner`) çizilebilir hâli. Web'deki `bannerCSS` ile aynı
/// karar ağacı: geçiş rengi, arşivdeki bir görsel, dış adres, ya da sitenin
/// kendi rengi.
enum ListBanner {
    case gradient([Color])
    case remote(URL, [Color])

    static func of(_ appearance: ListAppearance, site: String) -> ListBanner {
        let fallback = LinkSite.gradient(site)
        let banner = appearance.banner

        if banner.hasPrefix("grad:") {
            let parts = banner.dropFirst(5).split(separator: ",")
            if parts.count == 2,
               let first = Color(hex: String(parts[0])),
               let second = Color(hex: String(parts[1])) {
                return .gradient([first, second])
            }
            return .gradient(fallback)
        }
        if banner.hasPrefix("media:") {
            let key = String(banner.dropFirst(6))
            if !key.isEmpty, let url = CloudClient.fromSettings()?.thumbURL(key: key) {
                return .remote(url, fallback)
            }
            return .gradient(fallback)
        }
        if banner.hasPrefix("https://"), let url = URL(string: banner) {
            return .remote(url, fallback)
        }
        return .gradient(fallback)
    }
}

/// Kartın üstündeki kapak şeridi: geçiş rengi ya da görsel, altında yazının
/// okunması için karartma.
struct ListBannerView: View {
    let banner: ListBanner
    var height: CGFloat = 92

    var body: some View {
        Group {
            switch banner {
            case .gradient(let colors):
                gradient(colors)
            case .remote(let url, let colors):
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        gradient(colors)
                    }
                }
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay(
            LinearGradient(colors: [.clear, .black.opacity(0.72)],
                           startPoint: .center,
                           endPoint: .bottom)
        )
    }

    private func gradient(_ colors: [Color]) -> some View {
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
