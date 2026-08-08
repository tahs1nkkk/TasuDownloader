import SwiftUI

/// Link lists: made in the app, mirrored to the web archive so the PC sees the
/// same thing. Tapping a card opens the list; the pencil opens its appearance.
///
/// Kartların dili web arşiviyle aynı (`cloud/web/public/js/lists.js`): kapak
/// şeridi, üstüne binen ad, "N adet" rozeti, kategoriye/siteye göre gruplama.
/// Görünüm ayarları da aynı belgede (`/api/meta`) durduğu için iki taraf tek bir
/// düzeni paylaşıyor. Telefona özgü tek ekleme, kapağın üstündeki profil
/// resimleri: listede kimlerin olduğu adı okumadan görünüyor.
struct ListsScreen: View {
    /// `sheet(item:)` Identifiable bekliyor; UUID kendi başına öyle değil ve
    /// Foundation'ın tipine sonradan uygunluk eklemek ileride çakışır.
    private struct EditTarget: Identifiable { let id: UUID }

    @EnvironmentObject private var store: SiteListStore
    @EnvironmentObject private var settings: AppSettings
    @ObservedObject private var looks = ListAppearanceStore.shared
    @State private var newListName = ""
    @State private var askNewList = false
    @State private var editing: EditTarget?
    /// Boşken hepsi. Süzgeç listeyi değil, listenin içindekileri tarıyor:
    /// "Instagram" seçilince yalnız Instagram bağlantısı taşıyan listeler kalır.
    @State private var siteFilter = ""

    private let columns = [GridItem(.adaptive(minimum: 158), spacing: 14)]

    /// Bütün listelerdeki bağlantıların kaynakları, ilk görülme sırasıyla.
    private var sites: [String] {
        var seen: [String] = []
        for list in store.lists {
            for item in list.items {
                let key = LinkSite.key(for: item)
                if !seen.contains(key) { seen.append(key) }
            }
        }
        return seen
    }

    private var shown: [LinkList] {
        guard !siteFilter.isEmpty else { return store.lists }
        return store.lists.filter { list in
            list.items.contains { LinkSite.key(for: $0) == siteFilter }
        }
    }

    private func count(_ key: String) -> Int {
        store.lists.reduce(0) { total, list in
            total + list.items.filter { LinkSite.key(for: $0) == key }.count
        }
    }

    /// Gruplar: kullanıcı bir kategori atadıysa o, yoksa bağlantıların sitesi.
    /// Özel kategoriler üstte, sonra kalabalık gruplar — web ile aynı sıra.
    private struct ListGroup: Identifiable {
        let id: String
        let name: String
        let tint: Color
        var lists: [LinkList]
    }

    private var groups: [ListGroup] {
        var byKey: [String: ListGroup] = [:]
        var order: [String] = []
        for list in shown {
            let appearance = looks.appearance(for: list.id)
            let custom = appearance.cat.isEmpty ? nil : looks.category(appearance.cat)
            let site = LinkSite.of(list: list)
            let key = custom.map { "c:\($0.id)" } ?? "s:\(site)"
            if byKey[key] == nil {
                order.append(key)
                byKey[key] = ListGroup(id: key,
                                       name: custom?.name ?? (site.isEmpty ? "Diğer" : LinkSite.name(site)),
                                       tint: custom?.swatch ?? LinkSite.color(site),
                                       lists: [])
            }
            byKey[key]?.lists.append(list)
        }
        return order.compactMap { byKey[$0] }.sorted { a, b in
            let customA = a.id.hasPrefix("c:")
            let customB = b.id.hasPrefix("c:")
            if customA != customB { return customA }
            return a.lists.count > b.lists.count
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.lists.isEmpty {
                    ContentUnavailableView(
                        "Henüz liste yok",
                        systemImage: "bookmark",
                        description: Text("Sağ üstten liste oluştur; tarayıcıda bir sayfadayken + butonuyla buraya eklersin.")
                    )
                } else {
                    VStack(spacing: 0) {
                        if sites.count > 1 {
                            SiteFilterBar(sites: sites,
                                          selection: $siteFilter,
                                          total: store.lists.reduce(0) { $0 + $1.items.count },
                                          count: count)
                        }
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 22) {
                                ForEach(groups) { group in
                                    VStack(alignment: .leading, spacing: 12) {
                                        groupHeader(group)
                                        LazyVGrid(columns: columns, spacing: 14) {
                                            ForEach(group.lists) { list in
                                                card(list)
                                            }
                                        }
                                    }
                                }
                                syncFooter
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .padding(.top, 4)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                        }
                    }
                }
            }
            .navigationTitle("Listeler")
            .navigationDestination(for: UUID.self) { id in
                ListDetailScreen(listId: id)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { askNewList = true } label: { Image(systemName: "plus") }
                }
                if settings.syncConfigured {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            Task {
                                await store.syncNow()
                                await looks.refresh(force: true)
                            }
                        } label: {
                            if store.syncing {
                                ProgressView()
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                            }
                        }
                    }
                }
            }
            .alert("Yeni liste", isPresented: $askNewList) {
                TextField("Liste adı", text: $newListName)
                Button("Oluştur") {
                    _ = store.createList(named: newListName.trimmingCharacters(in: .whitespaces))
                    newListName = ""
                }
                Button("Vazgeç", role: .cancel) { newListName = "" }
            }
            .sheet(item: $editing) { target in
                ListEditSheet(listId: target.id).environmentObject(store)
            }
            .task { await looks.refresh() }
            .onAppear {
                store.scheduleSync()
                // Süzgeçteki site son senkronla ortadan kalkmış olabilir;
                // boş bir ekranla baş başa bırakmayalım.
                if !siteFilter.isEmpty && !sites.contains(siteFilter) { siteFilter = "" }
            }
        }
    }

    private func groupHeader(_ group: ListGroup) -> some View {
        HStack(spacing: 8) {
            Circle().fill(group.tint).frame(width: 9, height: 9)
            Text(group.name)
                .font(.system(size: 15, weight: .bold))
                .lineLimit(1)
            Rectangle()
                .fill(LinearGradient(colors: [.secondary.opacity(0.35), .clear],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(height: 1)
            Text("\(group.lists.count) liste")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.quaternary, in: Capsule())
        }
    }

    private func card(_ list: LinkList) -> some View {
        ListCard(list: list, appearance: looks.appearance(for: list.id))
            .overlay(alignment: .topTrailing) {
                // Kalemin kendisi bağlantının üstünde duruyor: SwiftUI en üstteki
                // katmana dokunuşu önce veriyor, bu yüzden düzenleme kartı açmıyor.
                Button {
                    editing = EditTarget(id: list.id)
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(.black.opacity(0.42), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(.white.opacity(0.22), lineWidth: 0.8)
                        )
                }
                .buttonStyle(.plain)
                .padding(8)
            }
            .contextMenu {
                Button {
                    editing = EditTarget(id: list.id)
                } label: {
                    Label("Görünümü düzenle", systemImage: "paintbrush")
                }
                Button(role: .destructive) {
                    store.deleteList(list.id)
                    Task { await looks.forget(list.id) }
                } label: {
                    Label("Listeyi sil", systemImage: "trash")
                }
            }
    }

    @ViewBuilder private var syncFooter: some View {
        if settings.syncConfigured {
            Label(store.syncState, systemImage: "icloud")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        } else {
            Label("Web arşiviyle eşitlemek için Ayarlar → Bulut ve Eşitleme", systemImage: "icloud.slash")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }
}

/// Tek liste kartı: kapak + içindeki profillerin resimleri + ad + sayı.
private struct ListCard: View {
    let list: LinkList
    let appearance: ListAppearance

    private var site: String { LinkSite.of(list: list) }
    private var accent: Color {
        Color(hex: appearance.accent) ?? (site.isEmpty ? .accentColor : LinkSite.color(site))
    }

    /// Kapağın üstünde gösterilecek profiller: aynı kişi iki kez çıkmasın diye
    /// avatar kimliğine göre tekilleştiriliyor.
    private var faces: [LinkItem] {
        var seen = Set<String>()
        var out: [LinkItem] = []
        for item in list.items {
            guard let key = AvatarIdentity.key(forURL: item.url) else { continue }
            guard seen.insert(key).inserted else { continue }
            out.append(item)
            if out.count == 4 { break }
        }
        return out
    }

    var body: some View {
        NavigationLink(value: list.id) {
            VStack(spacing: 0) {
                ZStack(alignment: .bottomLeading) {
                    ListBannerView(banner: ListBanner.of(appearance, site: site), height: 88)
                    if !faces.isEmpty {
                        HStack(spacing: -9) {
                            ForEach(faces) { item in
                                ItemAvatar(item: item, size: 26)
                                    .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 1.5))
                            }
                            if list.items.count > faces.count {
                                Text("+\(list.items.count - faces.count)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 26, height: 26)
                                    .background(.black.opacity(0.55), in: Circle())
                                    .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 1.5))
                                    .padding(.leading, 2)
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.bottom, 8)
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(list.name)
                        .font(.system(size: 14.5, weight: .bold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Circle().fill(accent).frame(width: 7, height: 7)
                        Text(site.isEmpty ? "Boş" : LinkSite.name(site))
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text("\(list.items.count) adet")
                            .font(.system(size: 10.5, weight: .bold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2.5)
                            .background(.quaternary, in: Capsule())
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(.thinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(accent.opacity(0.32), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.18), radius: 10, y: 5)
        }
        .buttonStyle(.plain)
    }
}

struct ListDetailScreen: View {
    let listId: UUID
    @EnvironmentObject private var store: SiteListStore
    @EnvironmentObject private var browser: BrowserController
    @ObservedObject private var looks = ListAppearanceStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var renameText = ""
    @State private var askRename = false
    @State private var askAppearance = false
    @State private var askMove = false
    @State private var siteFilter = ""
    @State private var selection = Set<UUID>()
    @State private var editMode: EditMode = .inactive

    private var list: LinkList? { store.lists.first { $0.id == listId } }

    private var sites: [String] {
        var seen: [String] = []
        for item in list?.items ?? [] {
            let key = LinkSite.key(for: item)
            if !seen.contains(key) { seen.append(key) }
        }
        return seen
    }

    private var shown: [LinkItem] {
        let items = list?.items ?? []
        guard !siteFilter.isEmpty else { return items }
        return items.filter { LinkSite.key(for: $0) == siteFilter }
    }

    var body: some View {
        Group {
            if let list {
                if list.items.isEmpty {
                    ContentUnavailableView(
                        "Liste boş",
                        systemImage: "link",
                        description: Text("Tarayıcıda bir sayfadayken + butonuna dokun, bu listeyi seç.")
                    )
                } else {
                    VStack(spacing: 0) {
                        ListBannerView(banner: ListBanner.of(looks.appearance(for: listId),
                                                             site: LinkSite.of(list: list)),
                                       height: 62)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(alignment: .bottomLeading) {
                                Text("\(list.items.count) bağlantı")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.bottom, 8)
                            }
                            .padding(.horizontal, 14)
                            .padding(.top, 6)

                        if sites.count > 1 {
                            SiteFilterBar(sites: sites,
                                          selection: $siteFilter,
                                          total: list.items.count,
                                          count: { key in list.items.filter { LinkSite.key(for: $0) == key }.count })
                        }
                        List(selection: $selection) {
                            ForEach(shown) { item in
                                Button {
                                    browser.openURL(item.url)
                                } label: {
                                    HStack(spacing: 12) {
                                        ItemAvatar(item: item)
                                        VStack(alignment: .leading, spacing: 2) {
                                            // Ad adresten geliyor: profilse kullanıcı adı,
                                            // gönderiyse "kullanıcı | tür". Eklentinin
                                            // kaydettiği başlık varsa alt satıra düşüyor.
                                            Text(LinkLabel.of(url: item.url, title: item.title))
                                                .font(.system(size: 15, weight: .medium))
                                                .foregroundStyle(.primary)
                                                .lineLimit(1)
                                            Text(LinkLabel.note(url: item.url, title: item.title) ?? item.host)
                                                .font(.system(size: 12))
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                    }
                                }
                            }
                            .onDelete { offsets in
                                // Süzgeç açıkken ekrandaki sıra ile listenin gerçek
                                // sırası ayrışır; silme kimliğe göre yapılmalı.
                                store.removeItems(ids: Set(offsets.map { shown[$0].id }), from: listId)
                            }
                        }
                    }
                }
            } else {
                // Deleted underneath us (another device, most likely).
                Color.clear.onAppear { dismiss() }
            }
        }
        .environment(\.editMode, $editMode)
        .navigationTitle(list?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !(list?.items.isEmpty ?? true) {
                // `EditButton` ortamdaki editMode'u arıyor; onu araç çubuğuna
                // güvenilir biçimde ulaştırmak yerine düğmeyi kendimiz sürüyoruz.
                ToolbarItem(placement: .topBarTrailing) {
                    Button(editMode == .active ? "Bitti" : "Seç") {
                        let next: EditMode = editMode == .active ? .inactive : .active
                        withAnimation { editMode = next }
                        if next == .inactive { selection.removeAll() }
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        renameText = list?.name ?? ""
                        askRename = true
                    } label: {
                        Label("Yeniden adlandır", systemImage: "pencil")
                    }
                    Button {
                        askAppearance = true
                    } label: {
                        Label("Görünümü düzenle", systemImage: "paintbrush")
                    }
                    Button(role: .destructive) {
                        store.deleteList(listId)
                        Task { await looks.forget(listId) }
                        dismiss()
                    } label: {
                        Label("Listeyi sil", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
            if editMode == .active && !selection.isEmpty {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button {
                        askMove = true
                    } label: {
                        Label("Taşı", systemImage: "arrow.right.doc.on.clipboard")
                    }
                    Spacer()
                    Button(role: .destructive) {
                        store.removeItems(ids: selection, from: listId)
                        selection.removeAll()
                    } label: {
                        Label("Sil (\(selection.count))", systemImage: "trash")
                    }
                }
            }
        }
        .alert("Yeniden adlandır", isPresented: $askRename) {
            TextField("Liste adı", text: $renameText)
            Button("Kaydet") { store.renameList(listId, to: renameText.trimmingCharacters(in: .whitespaces)) }
            Button("Vazgeç", role: .cancel) {}
        }
        .sheet(isPresented: $askAppearance) {
            ListEditSheet(listId: listId).environmentObject(store)
        }
        .sheet(isPresented: $askMove) {
            MoveToListSheet(source: listId) { target in
                store.move(ids: selection, from: listId, to: target)
                selection.removeAll()
                editMode = .inactive
            }
            .environmentObject(store)
        }
        .task { await looks.refresh() }
    }
}

/// Seçili bağlantıların gideceği listeyi soran pencere. Kaynak liste dışarıda
/// bırakılıyor: kendine taşımak sessiz bir hiçbir şey olurdu.
private struct MoveToListSheet: View {
    let source: UUID
    let onPick: (UUID) -> Void
    @EnvironmentObject private var store: SiteListStore
    @Environment(\.dismiss) private var dismiss
    @State private var newListName = ""

    var body: some View {
        NavigationStack {
            Form {
                let others = store.lists.filter { $0.id != source }
                if !others.isEmpty {
                    Section("Hedef liste") {
                        ForEach(others) { list in
                            Button {
                                onPick(list.id)
                                dismiss()
                            } label: {
                                HStack {
                                    Label(list.name, systemImage: "bookmark")
                                    Spacer()
                                    Text("\(list.items.count)").foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section("Yeni liste") {
                    HStack {
                        TextField("Liste adı", text: $newListName)
                        Button("Oluştur ve taşı") {
                            let list = store.createList(named: newListName.trimmingCharacters(in: .whitespaces))
                            onPick(list.id)
                            dismiss()
                        }
                        .disabled(newListName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle("Taşı")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Listenin görünümü: ad, kapak, vurgu rengi, kategori. Web'deki "özelleştir"
/// penceresinin (cloud/web/public/js/lists.js → `customize`) telefon karşılığı;
/// aynı belgeye yazdığı için iki taraf birbirinin seçimini görüyor.
struct ListEditSheet: View {
    let listId: UUID
    @EnvironmentObject private var store: SiteListStore
    @ObservedObject private var looks = ListAppearanceStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var draft = ListAppearance()
    /// 0 = renk, 1 = arşivdeki bir görsel. Web'deki sekmelerin aynısı ve aynı
    /// sebeple: görsel sekmesine geçilmeden tek bir istek bile gitmiyor.
    @State private var mode = 0
    @State private var images: [CloudFile] = []
    @State private var loadingImages = false
    @State private var askCategory = false
    @State private var categoryName = ""
    @State private var saving = false
    @State private var loaded = false

    private var list: LinkList? { store.lists.first { $0.id == listId } }
    private var site: String { list.map { LinkSite.of(list: $0) } ?? "" }

    private let thumbColumns = [GridItem(.adaptive(minimum: 72), spacing: 8)]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ListBannerView(banner: ListBanner.of(draft, site: site), height: 74)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(alignment: .bottomLeading) {
                            Text(name.isEmpty ? (list?.name ?? "") : name)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .padding(.horizontal, 12)
                                .padding(.bottom, 8)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                }

                Section("Liste adı") {
                    TextField("Liste adı", text: $name)
                }

                Section("Kapak") {
                    Picker("Kapak", selection: $mode) {
                        Text("Renk").tag(0)
                        Text("Görsel").tag(1)
                    }
                    .pickerStyle(.segmented)

                    if mode == 0 {
                        gradientPicker
                    } else {
                        imagePicker
                    }
                }

                Section("Vurgu rengi") {
                    accentPicker
                }

                Section("Kategori") {
                    Picker("Kategori", selection: $draft.cat) {
                        Text("Otomatik (site)").tag("")
                        ForEach(looks.categories) { category in
                            Text(category.name).tag(category.id)
                        }
                    }
                    Button {
                        categoryName = ""
                        askCategory = true
                    } label: {
                        Label("Yeni kategori…", systemImage: "folder.badge.plus")
                    }
                }

                Section {
                    Button("Varsayılana döndür") { draft = ListAppearance() }
                    Button(role: .destructive) {
                        store.deleteList(listId)
                        Task { await looks.forget(listId) }
                        dismiss()
                    } label: {
                        Text("Listeyi sil")
                    }
                } footer: {
                    if !looks.lastError.isEmpty {
                        Text("Görünüm buluta yazılamadı: \(looks.lastError)")
                            .foregroundStyle(.red)
                    } else {
                        Text("Kapak ve renk web arşiviyle ortak: burada seçtiğin PC'de de görünür.")
                    }
                }
            }
            .navigationTitle("Listeyi düzenle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Vazgeç") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Kaydet") { Task { await commit() } }
                    }
                }
            }
            .alert("Yeni kategori", isPresented: $askCategory) {
                TextField("Kategori adı", text: $categoryName)
                Button("Oluştur") {
                    let category = looks.addCategory(named: categoryName)
                    draft.cat = category.id
                }
                Button("Vazgeç", role: .cancel) {}
            }
            .task {
                await looks.refresh()
                guard !loaded else { return }
                loaded = true
                name = list?.name ?? ""
                draft = looks.appearance(for: listId)
                mode = draft.banner.hasPrefix("media:") || draft.banner.hasPrefix("https://") ? 1 : 0
            }
            .onChange(of: mode) { _, value in
                if value == 1 { Task { await loadImages() } }
            }
        }
    }

    private var gradientPicker: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: 10)], spacing: 10) {
            swatch(selected: draft.banner.isEmpty) {
                LinearGradient(colors: LinkSite.gradient(site),
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            } tap: {
                draft.banner = ""
            }
            ForEach(ListAppearanceStore.gradients) { pair in
                swatch(selected: draft.banner == pair.id) {
                    LinearGradient(colors: pair.colors,
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                } tap: {
                    draft.banner = pair.id
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var imagePicker: some View {
        if loadingImages {
            HStack { ProgressView(); Text("Arşiv okunuyor…").foregroundStyle(.secondary) }
        } else if images.isEmpty {
            Text("Arşivde görsel yok.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        } else {
            LazyVGrid(columns: thumbColumns, spacing: 8) {
                ForEach(images) { file in
                    let value = "media:\(file.key)"
                    Button {
                        draft.banner = value
                    } label: {
                        AsyncImage(url: CloudClient.fromSettings()?.thumbURL(key: file.key)) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                Color.gray.opacity(0.2)
                            }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(draft.banner == value ? Color.accentColor : .clear, lineWidth: 2.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var accentPicker: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 10)], spacing: 10) {
            Button {
                draft.accent = ""
            } label: {
                Circle()
                    .fill(.quaternary)
                    .frame(width: 30, height: 30)
                    .overlay(Image(systemName: "slash.circle").font(.system(size: 13)).foregroundStyle(.secondary))
                    .overlay(Circle().stroke(draft.accent.isEmpty ? Color.accentColor : .clear, lineWidth: 2.5))
            }
            .buttonStyle(.plain)
            ForEach(ListAppearanceStore.palette, id: \.self) { hex in
                Button {
                    draft.accent = hex
                } label: {
                    Circle()
                        .fill(Color(hex: hex) ?? .gray)
                        .frame(width: 30, height: 30)
                        .overlay(Circle().stroke(draft.accent == hex ? Color.primary : .clear, lineWidth: 2.5))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    private func swatch<Fill: View>(selected: Bool,
                                    @ViewBuilder fill: () -> Fill,
                                    tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            fill()
                .frame(height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(selected ? Color.accentColor : .clear, lineWidth: 2.5)
                )
        }
        .buttonStyle(.plain)
    }

    /// Kapak seçicisi için arşivdeki görseller — ızgaranın okuduğu küçük
    /// kareler (`/api/thumb`), tam boy dosyalar değil.
    private func loadImages() async {
        guard images.isEmpty, !loadingImages, let cloud = CloudClient.fromSettings() else { return }
        loadingImages = true
        defer { loadingImages = false }
        let files = (try? await cloud.list()) ?? []
        images = files.filter { $0.kind == "image" }.prefix(120).map { $0 }
    }

    private func commit() async {
        saving = true
        let clean = name.trimmingCharacters(in: .whitespaces)
        if !clean.isEmpty, clean != list?.name { store.renameList(listId, to: clean) }
        await looks.save(draft, for: listId)
        saving = false
        dismiss()
    }
}

/// Öğe satırının solundaki yuvarlak: profil resmi varsa onu, yoksa kaynağın
/// renkli noktasını (baş harfiyle) gösterir. Resim buluttan (ya da ilk kez
/// kaynağından) `AvatarStore` üzerinden gelir; geldiğinde satır kendini yeniler.
private struct ItemAvatar: View {
    let item: LinkItem
    var size: CGFloat = 30
    @ObservedObject private var avatars = AvatarStore.shared

    private var image: UIImage? {
        // Kimliği adresten türet — `AvatarStore` de böyle anahtarlıyor. Öğedeki
        // `avatarKey` yalnız temizlik/eşitleme için; bu alan boş olan eski
        // kayıtlar da (kimlik adresten çıkıyorsa) resmini göstersin.
        guard let key = AvatarIdentity.key(forURL: item.url) else { return nil }
        return avatars.image(for: key)
    }

    var body: some View {
        let key = LinkSite.key(for: item)
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Circle()
                    .fill(LinkSite.color(key).gradient)
                    .overlay(
                        Text(LinkSite.initial(key))
                            .font(.system(size: size * 0.43, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    )
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .onAppear {
            // Görünürken bulutta ara; yoksa oturum istemeyen sitelerde (Reddit,
            // Coomer) kaynağından çöz. Instagram gibi olanlar ancak ekleme anında
            // yakalanan ipucuyla dolar — burada sessizce noktada kalır.
            AvatarStore.shared.ensure(url: item.url, allowResolve: true)
        }
    }
}

/// Kaynak sitesine göre süzen şerit — bulut galerisindeki site sekmeleriyle
/// aynı dil, aynı yerleşim. Tek site varsa hiç gösterilmiyor: seçeneksiz bir
/// süzgeç yalnızca yer kaplar.
private struct SiteFilterBar: View {
    let sites: [String]
    @Binding var selection: String
    let total: Int
    let count: (String) -> Int

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(label: "Tümü", value: "", count: total, tint: .accentColor)
                ForEach(sites, id: \.self) { key in
                    chip(label: LinkSite.name(key), value: key, count: count(key), tint: LinkSite.color(key))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private func chip(label: String, value: String, count: Int, tint: Color) -> some View {
        let on = selection == value
        return Button {
            selection = value
        } label: {
            HStack(spacing: 5) {
                Text(label).font(.system(size: 13, weight: .semibold))
                Text("\(count)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(on ? .white.opacity(0.75) : .secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(on ? AnyShapeStyle(tint) : AnyShapeStyle(.quaternary), in: Capsule())
            .foregroundStyle(on ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

/// Sheet shown from the browser: pick a list (or make one) for the open page.
struct AddToListSheet: View {
    let url: String
    let title: String
    /// Tarayıcının o an yakaladığı profil resmi adresi (varsa). Eklerken bununla
    /// avatar gizlice buluta yüklenir; nil ise uygulama kendi çözücüsünü dener.
    var avatarHint: String? = nil
    @EnvironmentObject private var store: SiteListStore
    @ObservedObject private var looks = ListAppearanceStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var newListName = ""

    /// Öğe eklendikten sonra avatarı hazırla: sayfa ipucu varsa onu kullan,
    /// yoksa oturum istemeyen sitelerde kaynağından çöz.
    private func captureAvatar() {
        AvatarStore.shared.ensure(url: url, pageHint: avatarHint, allowResolve: true)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(title.isEmpty ? url : title)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(2)
                } header: {
                    Text("Eklenecek sayfa")
                }

                if !store.lists.isEmpty {
                    Section("Listeye ekle") {
                        ForEach(store.lists) { list in
                            // Bu sayfa o listede zaten varsa satır pasif ve "Ekli"
                            // rozetli: aynı bağlantı ikinci kez eklenemiyor, üstelik
                            // kullanıcı dokunmadan önce nedenini görüyor.
                            let already = store.contains(url: url, in: list.id)
                            Button {
                                store.add(url: url, title: title, to: list.id)
                                captureAvatar()
                                dismiss()
                            } label: {
                                HStack(spacing: 10) {
                                    // Kartlardaki kapağın küçük hâli: doğru listeye
                                    // eklediğini ada bakmadan da anlayasın diye.
                                    ListBannerView(banner: ListBanner.of(looks.appearance(for: list.id),
                                                                         site: LinkSite.of(list: list)),
                                                   height: 26)
                                        .frame(width: 34)
                                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                                    Text(list.name)
                                    Spacer()
                                    if already {
                                        Label("Ekli", systemImage: "checkmark.circle.fill")
                                            .labelStyle(.titleAndIcon)
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(.secondary)
                                    } else {
                                        Text("\(list.items.count)")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(already)
                        }
                    }
                }

                Section("Yeni liste") {
                    HStack {
                        TextField("Liste adı", text: $newListName)
                        Button("Oluştur ve ekle") {
                            let list = store.createList(named: newListName.trimmingCharacters(in: .whitespaces))
                            store.add(url: url, title: title, to: list.id)
                            captureAvatar()
                            dismiss()
                        }
                        .disabled(newListName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle("Listeye ekle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
            .task { await looks.refresh() }
        }
        .presentationDetents([.medium, .large])
    }
}
