import Foundation

struct LinkItem: Codable, Identifiable, Equatable {
    var id = UUID()
    var url: String
    var title: String
    var addedAt = Date()
    /// Profil/kullanıcı bağlantılarında `<site>~<kullanıcı>` biçiminde sabit
    /// kimlik: satırda avatarı bulutta bu anahtarla arar (`.avatar/…`). Post gibi
    /// sahibi belirsiz bağlantılarda ve eski kayıtlarda nil — o zaman renkli nokta
    /// gösterilir. Senkronla olduğu gibi taşınır (web JSON'una zararsız eklenir).
    var avatarKey: String?

    var host: String {
        URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") ?? url
    }
}

struct LinkList: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var items: [LinkItem] = []
    var updatedAt = Date()
}

/// User-made link lists, mirrored to the web archive.
///
/// Sync is deliberately dumb: the whole snapshot goes up, the whole snapshot
/// comes down, and when both sides touched the same list the newer `updatedAt`
/// wins outright. One person, two screens — a CRDT would be theatre. Deleted
/// lists leave a tombstone so a stale device cannot resurrect them.
@MainActor
final class SiteListStore: ObservableObject {
    static let shared = SiteListStore()

    struct Tombstone: Codable, Equatable {
        let id: UUID
        let deletedAt: Date
    }

    struct Snapshot: Codable {
        var lists: [LinkList]
        var tombstones: [Tombstone]
    }

    @Published private(set) var lists: [LinkList] = []
    @Published private(set) var syncState = "Eşitlenmedi"
    @Published private(set) var syncing = false

    private var tombstones: [Tombstone] = []
    private var debounce: Task<Void, Never>?

    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("link-lists.json")
    }

    init() {
        load()
    }

    // MARK: - Mutations

    func createList(named name: String) -> LinkList {
        let list = LinkList(name: name.isEmpty ? "Yeni liste" : name)
        lists.insert(list, at: 0)
        saveAndSync()
        return list
    }

    func renameList(_ id: UUID, to name: String) {
        guard let index = lists.firstIndex(where: { $0.id == id }), !name.isEmpty else { return }
        lists[index].name = name
        lists[index].updatedAt = Date()
        saveAndSync()
    }

    func deleteList(_ id: UUID) {
        let removed = lists.first { $0.id == id }?.items ?? []
        lists.removeAll { $0.id == id }
        tombstones.append(Tombstone(id: id, deletedAt: Date()))
        saveAndSync()
        cleanupAvatars(for: removed)
    }

    /// Karşılaştırma için sadeleştirilmiş adres. Aynı sayfa `www.`'li/`www.`'siz,
    /// sonunda eğik çizgiyle ya da `#bölüm` etiketiyle gelebiliyor; bunlar aynı
    /// bağlantı sayılmazsa "aynı link eklenemesin" kuralı ilk kopyada delinir.
    /// Saklanan adres olduğu gibi kalır — sadeleştirme yalnız kıyas için.
    static func canonical(_ raw: String) -> String {
        guard var parts = URLComponents(string: raw.trimmingCharacters(in: .whitespaces)) else {
            return raw.trimmingCharacters(in: .whitespaces).lowercased()
        }
        parts.fragment = nil
        parts.scheme = parts.scheme?.lowercased()
        if let host = parts.host?.lowercased() {
            parts.host = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        }
        while parts.path.count > 1 && parts.path.hasSuffix("/") { parts.path.removeLast() }
        return (parts.url?.absoluteString ?? raw).lowercased()
    }

    /// Listeye bağlantı ekler. Aynı listede aynı bağlantı zaten varsa **hiçbir
    /// şey yapmaz** ve `false` döner: eskiden eklemek başlığı tazeleyip öğeyi
    /// başa alıyordu, bu da kullanıcıya "eklendi" gibi görünüp listeyi sessizce
    /// yeniden sıralıyordu. Çağıran, `false`'ta kullanıcıya durumu söylemeli.
    @discardableResult
    func add(url: String, title: String, to listId: UUID) -> Bool {
        guard let index = lists.firstIndex(where: { $0.id == listId }) else { return false }
        guard !contains(url: url, in: listId) else { return false }
        var item = LinkItem(url: url, title: title)
        item.avatarKey = AvatarIdentity.key(forURL: url)
        lists[index].items.insert(item, at: 0)
        lists[index].updatedAt = Date()
        saveAndSync()
        return true
    }

    /// Bu adres o listede var mı — ekleme ekranı "Ekli" rozetini buna bakarak
    /// gösterir, böylece kullanıcı dokunmadan önce görür.
    func contains(url: String, in listId: UUID) -> Bool {
        guard let list = lists.first(where: { $0.id == listId }) else { return false }
        let target = Self.canonical(url)
        return list.items.contains { Self.canonical($0.url) == target }
    }

    func removeItems(at offsets: IndexSet, from listId: UUID) {
        guard let index = lists.firstIndex(where: { $0.id == listId }) else { return }
        let removed = offsets.map { lists[index].items[$0] }
        lists[index].items.remove(atOffsets: offsets)
        lists[index].updatedAt = Date()
        saveAndSync()
        cleanupAvatars(for: removed)
    }

    /// Kimliğe göre toplu silme. Süzgeç açıkken ekrandaki sıra listenin gerçek
    /// sırasıyla ayrıştığı için seçim modu konumla değil kimlikle çalışıyor.
    func removeItems(ids: Set<UUID>, from listId: UUID) {
        guard !ids.isEmpty, let index = lists.firstIndex(where: { $0.id == listId }) else { return }
        let offsets = IndexSet(lists[index].items.indices.filter { ids.contains(lists[index].items[$0].id) })
        removeItems(at: offsets, from: listId)
    }

    /// Seçili bağlantıları başka bir listeye taşır. Hedefte aynı adres zaten
    /// varsa eskisi düşer: taşıma, kopyalama değil.
    func move(ids: Set<UUID>, from source: UUID, to target: UUID) {
        guard source != target, !ids.isEmpty,
              let from = lists.firstIndex(where: { $0.id == source }),
              let to = lists.firstIndex(where: { $0.id == target }) else { return }
        let moving = lists[from].items.filter { ids.contains($0.id) }
        guard !moving.isEmpty else { return }
        lists[from].items.removeAll { ids.contains($0.id) }
        let urls = Set(moving.map { Self.canonical($0.url) })
        lists[to].items.removeAll { urls.contains(Self.canonical($0.url)) }
        lists[to].items.insert(contentsOf: moving, at: 0)
        let now = Date()
        lists[from].updatedAt = now
        lists[to].updatedAt = now
        saveAndSync()
    }

    /// Silinen öğelerin avatarını buluttan kaldırır — ama aynı profil başka bir
    /// listede hâlâ duruyorsa (avatar kimliği paylaşımlı) blob'a dokunmaz.
    private func cleanupAvatars(for removed: [LinkItem]) {
        let removedKeys = Set(removed.compactMap { $0.avatarKey })
        guard !removedKeys.isEmpty else { return }
        let stillUsed = Set(lists.flatMap { $0.items }.compactMap { $0.avatarKey })
        let orphans = removedKeys.subtracting(stillUsed)
        guard !orphans.isEmpty else { return }
        Task { await AvatarStore.shared.remove(orphans) }
    }

    // MARK: - Persistence

    private static func coder() -> (JSONEncoder, JSONDecoder) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (encoder, decoder)
    }

    private func load() {
        let (_, decoder) = Self.coder()
        guard let data = try? Data(contentsOf: fileURL),
              let snapshot = try? decoder.decode(Snapshot.self, from: data) else { return }
        lists = snapshot.lists
        tombstones = snapshot.tombstones
    }

    private func save() {
        let (encoder, _) = Self.coder()
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let data = try? encoder.encode(Snapshot(lists: lists, tombstones: tombstones)) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    private func saveAndSync() {
        save()
        scheduleSync()
    }

    // MARK: - Sync

    /// Debounced so a burst of edits becomes one round-trip.
    func scheduleSync() {
        guard AppSettings.shared.syncConfigured else { return }
        debounce?.cancel()
        debounce = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        let settings = AppSettings.shared
        guard settings.syncConfigured,
              let base = URL(string: settings.archiveURL.trimmingCharacters(in: .whitespaces)) else {
            syncState = "Eşitleme ayarlanmamış"
            return
        }
        guard !syncing else { return }
        syncing = true
        defer { syncing = false }

        let (encoder, decoder) = Self.coder()
        do {
            var get = URLRequest(url: base.appendingPathComponent("api/lists"))
            get.setValue("Bearer \(settings.sharedToken)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: get)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard code == 200 || code == 404 else { throw CloudError.badResponse(code) }
            if code == 200, let remote = try? decoder.decode(Snapshot.self, from: data) {
                merge(remote)
            }
            save()

            var put = URLRequest(url: base.appendingPathComponent("api/lists"))
            put.httpMethod = "PUT"
            put.setValue("Bearer \(settings.sharedToken)", forHTTPHeaderField: "Authorization")
            put.setValue("application/json", forHTTPHeaderField: "Content-Type")
            put.httpBody = try encoder.encode(Snapshot(lists: lists, tombstones: tombstones))
            let (_, putResponse) = try await URLSession.shared.data(for: put)
            let putCode = (putResponse as? HTTPURLResponse)?.statusCode ?? 0
            guard (200...299).contains(putCode) else { throw CloudError.badResponse(putCode) }

            syncState = "Eşitlendi: \(Date().formatted(date: .omitted, time: .shortened))"
        } catch {
            syncState = "Eşitleme hatası: \(error.localizedDescription)"
        }
    }

    private func merge(_ remote: Snapshot) {
        var byId: [UUID: LinkList] = [:]
        for list in remote.lists { byId[list.id] = list }
        for list in lists {
            if let other = byId[list.id] {
                byId[list.id] = other.updatedAt > list.updatedAt ? other : list
            } else {
                byId[list.id] = list
            }
        }

        var newestTombstone: [UUID: Tombstone] = [:]
        for stone in remote.tombstones + tombstones {
            if let existing = newestTombstone[stone.id], existing.deletedAt >= stone.deletedAt { continue }
            newestTombstone[stone.id] = stone
        }
        for (id, stone) in newestTombstone {
            if let list = byId[id], list.updatedAt <= stone.deletedAt {
                byId.removeValue(forKey: id)
            }
        }

        lists = byId.values.sorted { $0.updatedAt > $1.updatedAt }
        // Tombstones for lists nobody remembers anymore are dead weight.
        let cutoff = Date().addingTimeInterval(-90 * 86_400)
        tombstones = newestTombstone.values.filter { $0.deletedAt > cutoff }
    }
}
