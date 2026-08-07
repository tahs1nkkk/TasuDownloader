import SwiftUI

/// Link lists: made in the app, mirrored to the web archive so the PC sees the
/// same thing. Tapping an item opens it in the browser tab.
struct ListsScreen: View {
    @EnvironmentObject private var store: SiteListStore
    @EnvironmentObject private var settings: AppSettings
    @State private var newListName = ""
    @State private var askNewList = false
    /// Boşken hepsi. Süzgeç listeyi değil, listenin içindekileri tarıyor:
    /// "Instagram" seçilince yalnız Instagram bağlantısı taşıyan listeler kalır.
    @State private var siteFilter = ""

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
                        List {
                            ForEach(shown) { list in
                                NavigationLink(value: list.id) {
                                    HStack(spacing: 12) {
                                        Image(systemName: "bookmark.fill")
                                            .foregroundStyle(.indigo)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(list.name).font(.system(size: 16, weight: .semibold))
                                            Text("\(list.items.count) bağlantı")
                                                .font(.system(size: 12))
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                            .onDelete { offsets in
                                for index in offsets { store.deleteList(shown[index].id) }
                            }

                            Section {
                                syncFooter
                            }
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
                            Task { await store.syncNow() }
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
            .onAppear {
                store.scheduleSync()
                // Süzgeçteki site son senkronla ortadan kalkmış olabilir;
                // boş bir ekranla baş başa bırakmayalım.
                if !siteFilter.isEmpty && !sites.contains(siteFilter) { siteFilter = "" }
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

struct ListDetailScreen: View {
    let listId: UUID
    @EnvironmentObject private var store: SiteListStore
    @EnvironmentObject private var browser: BrowserController
    @Environment(\.dismiss) private var dismiss
    @State private var renameText = ""
    @State private var askRename = false
    @State private var siteFilter = ""

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
                        if sites.count > 1 {
                            SiteFilterBar(sites: sites,
                                          selection: $siteFilter,
                                          total: list.items.count,
                                          count: { key in list.items.filter { LinkSite.key(for: $0) == key }.count })
                        }
                        List {
                            ForEach(shown) { item in
                                Button {
                                    browser.openURL(item.url)
                                } label: {
                                    HStack(spacing: 12) {
                                        siteDot(for: item)
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
                                let doomed = Set(offsets.map { shown[$0].id })
                                let real = IndexSet(list.items.indices.filter { doomed.contains(list.items[$0].id) })
                                store.removeItems(at: real, from: listId)
                            }
                        }
                    }
                }
            } else {
                // Deleted underneath us (another device, most likely).
                Color.clear.onAppear { dismiss() }
            }
        }
        .navigationTitle(list?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        renameText = list?.name ?? ""
                        askRename = true
                    } label: {
                        Label("Yeniden adlandır", systemImage: "pencil")
                    }
                    Button(role: .destructive) {
                        store.deleteList(listId)
                        dismiss()
                    } label: {
                        Label("Listeyi sil", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Yeniden adlandır", isPresented: $askRename) {
            TextField("Liste adı", text: $renameText)
            Button("Kaydet") { store.renameList(listId, to: renameText.trimmingCharacters(in: .whitespaces)) }
            Button("Vazgeç", role: .cancel) {}
        }
    }

    private func siteDot(for item: LinkItem) -> some View {
        let key = LinkSite.key(for: item)
        return Circle()
            .fill(LinkSite.color(key).gradient)
            .frame(width: 30, height: 30)
            .overlay(
                Text(LinkSite.initial(key))
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            )
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
    @EnvironmentObject private var store: SiteListStore
    @Environment(\.dismiss) private var dismiss
    @State private var newListName = ""

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
                            Button {
                                store.add(url: url, title: title, to: list.id)
                                dismiss()
                            } label: {
                                HStack {
                                    Label(list.name, systemImage: "bookmark")
                                    Spacer()
                                    Text("\(list.items.count)")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Yeni liste") {
                    HStack {
                        TextField("Liste adı", text: $newListName)
                        Button("Oluştur ve ekle") {
                            let list = store.createList(named: newListName.trimmingCharacters(in: .whitespaces))
                            store.add(url: url, title: title, to: list.id)
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
        }
        .presentationDetents([.medium, .large])
    }
}
