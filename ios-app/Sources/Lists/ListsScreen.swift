import SwiftUI

/// Link lists: made in the app, mirrored to the web archive so the PC sees the
/// same thing. Tapping an item opens it in the browser tab.
struct ListsScreen: View {
    @EnvironmentObject private var store: SiteListStore
    @EnvironmentObject private var settings: AppSettings
    @State private var newListName = ""
    @State private var askNewList = false

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
                    List {
                        ForEach(store.lists) { list in
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
                            for index in offsets { store.deleteList(store.lists[index].id) }
                        }

                        Section {
                            syncFooter
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
            .onAppear { store.scheduleSync() }
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

    private var list: LinkList? { store.lists.first { $0.id == listId } }

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
                    List {
                        ForEach(list.items) { item in
                            Button {
                                browser.openURL(item.url)
                            } label: {
                                HStack(spacing: 12) {
                                    siteDot(for: item)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title.isEmpty ? item.url : item.title)
                                            .font(.system(size: 15, weight: .medium))
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        Text(item.host)
                                            .font(.system(size: 12))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .onDelete { offsets in
                            store.removeItems(at: offsets, from: listId)
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
        let site = SiteCatalog.site(forHost: URL(string: item.url)?.host?.lowercased() ?? "")
        return Circle()
            .fill((site?.color ?? .gray).gradient)
            .frame(width: 30, height: 30)
            .overlay(
                Text(site?.initial ?? String(item.host.prefix(1)).uppercased())
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            )
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
