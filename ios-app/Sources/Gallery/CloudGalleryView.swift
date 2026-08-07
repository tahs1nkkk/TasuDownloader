import AVKit
import SwiftUI

/// The cloud half of the Galeri tab: what lives in R2, shown the way the web
/// archive shows it — a square grid grouped by source site, not a file list.
///
/// Videos have no poster in R2 until the web client generates one, so a tile
/// asks `/api/thumb/<key>` first and falls back to an icon. Nothing is
/// downloaded to the phone; tapping opens a pager that streams over Range
/// requests, so seeking a two-hour video costs two hundred kilobytes.
struct CloudGalleryView: View {
    @State private var files: [CloudFile] = []
    @State private var status: String?
    @State private var loading = false
    @State private var site: String = ""
    @State private var opened: PagerStart?

    /// fullScreenCover(item:) wants something Identifiable; the start index
    /// alone is not, and passing the file loses "which list am I paging".
    private struct PagerStart: Identifiable {
        let index: Int
        var id: Int { index }
    }

    private var sites: [String] {
        var seen: [String] = []
        for file in files where !seen.contains(file.site) { seen.append(file.site) }
        return seen
    }

    private var shown: [CloudFile] {
        site.isEmpty ? files : files.filter { $0.site == site }
    }

    var body: some View {
        Group {
            if let status {
                ContentUnavailableView(
                    "Buluta ulaşılamadı",
                    systemImage: "icloud.slash",
                    description: Text(status)
                )
            } else if files.isEmpty && !loading {
                ContentUnavailableView(
                    "Bulut boş",
                    systemImage: "icloud",
                    description: Text("İndirme hedefini Bulut yapınca ya da galeriden yükleyince dosyalar burada listelenir.")
                )
            } else {
                VStack(spacing: 0) {
                    if sites.count > 1 { siteBar }
                    grid
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if loading {
                    ProgressView()
                } else {
                    Button {
                        Task { await load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task { await load() }
        .fullScreenCover(item: $opened) { start in
            CloudPager(files: shown, start: start.index, onDelete: remove)
        }
    }

    /// Site sekmeleri — web arşivindekiyle aynı sıra ve aynı isimler.
    private var siteBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(label: "Tümü", value: "", count: files.count)
                ForEach(sites, id: \.self) { name in
                    chip(label: name == "Other" ? "Diğer" : name,
                         value: name,
                         count: files.filter { $0.site == name }.count)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private func chip(label: String, value: String, count: Int) -> some View {
        let on = site == value
        return Button {
            site = value
        } label: {
            HStack(spacing: 5) {
                Text(label).font(.system(size: 13, weight: .semibold))
                Text("\(count)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(on ? .black.opacity(0.55) : .secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(on ? AnyShapeStyle(.tint) : AnyShapeStyle(.quaternary),
                        in: Capsule())
            .foregroundStyle(on ? Color.black : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 3)], spacing: 3) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, file in
                    CloudTile(file: file)
                        .onTapGesture { opened = PagerStart(index: index) }
                        .contextMenu {
                            Button(role: .destructive) {
                                remove(file)
                            } label: {
                                Label("Buluttan sil", systemImage: "trash")
                            }
                        }
                }
            }
            .padding(3)
        }
        .refreshable { await load() }
    }

    private func load() async {
        guard let cloud = CloudClient.fromSettings() else {
            status = "Ayarlar → Bulut ve Eşitleme altında sunucu adresi ve anahtar gerekli."
            return
        }
        loading = true
        defer { loading = false }
        do {
            files = try await cloud.list()
            if !site.isEmpty && !files.contains(where: { $0.site == site }) { site = "" }
            status = nil
        } catch {
            status = error.localizedDescription
        }
    }

    /// Silme ızgarayı baştan yüklemez: dosya listeden düşer, kaydırma yerinde
    /// kalır. Sunucu hata verirse bir sonraki yenilemede geri gelir.
    private func remove(_ file: CloudFile) {
        files.removeAll { $0.key == file.key }
        guard let cloud = CloudClient.fromSettings() else { return }
        Task { try? await cloud.delete(key: file.key) }
    }
}

/// One square in the cloud grid.
private struct CloudTile: View {
    let file: CloudFile

    private var source: URL? {
        guard let cloud = CloudClient.fromSettings() else { return nil }
        return file.isVideo ? cloud.thumbURL(key: file.key) : cloud.streamURL(key: file.key)
    }

    var body: some View {
        // Kare önce kurulur, kapak sonra üstüne bindirilir. Görsel doğrudan
        // yığının içindeyken ızgaranın satır yüksekliğini resmin kendi oranı
        // belirliyordu: dikey bir fotoğraf satırı uzatıyor, yataylar yanında
        // boşluk bırakıyordu. Esnek bir `Color.clear`'ı kareye çekip taşanı
        // kırpınca her önizleme aynı ölçüde.
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .background(Color(.secondarySystemBackground))
            .overlay { cover }
            .overlay(alignment: .bottomTrailing) { playBadge }
            .clipped()
            .contentShape(Rectangle())
    }

    @ViewBuilder private var cover: some View {
        if let source {
            AsyncImage(url: source, transaction: Transaction(animation: .easeOut(duration: 0.18))) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    // Kapağı henüz üretilmemiş video ya da açılamayan görsel.
                    Image(systemName: file.isVideo ? "film" : "photo")
                        .font(.system(size: 22))
                        .foregroundStyle(.secondary)
                default:
                    ProgressView().controlSize(.small)
                }
            }
        }
    }

    @ViewBuilder private var playBadge: some View {
        if file.isVideo {
            Image(systemName: "play.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .padding(6)
                .background(.black.opacity(0.45), in: Circle())
                .padding(5)
                .shadow(radius: 4)
        }
    }
}

/// Full-screen viewer with swipe navigation — the whole point of #8: bir
/// medyadan diğerine geçmek için kapatıp yeniden açmak gerekmiyor.
struct CloudPager: View {
    let files: [CloudFile]
    let start: Int
    let onDelete: (CloudFile) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var index: Int = 0
    @State private var confirming = false

    private var current: CloudFile? {
        files.indices.contains(index) ? files[index] : nil
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                TabView(selection: $index) {
                    ForEach(Array(files.enumerated()), id: \.element.id) { position, file in
                        CloudPage(file: file, active: position == index)
                            .tag(position)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .ignoresSafeArea(edges: .bottom)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(current?.name ?? "")
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text("\(current?.siteLabel ?? "") · \(index + 1)/\(files.count)")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button(role: .destructive) { confirming = true } label: {
                        Image(systemName: "trash")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Kapat") { dismiss() }
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .onAppear { index = min(max(0, start), max(0, files.count - 1)) }
        .confirmationDialog("Bu dosya buluttan silinsin mi?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Sil", role: .destructive) {
                guard let file = current else { return }
                onDelete(file)
                dismiss()
            }
            Button("Vazgeç", role: .cancel) {}
        }
    }
}

/// One page of the pager. `active` keeps every off-screen video from opening a
/// connection at once — only the visible one gets an AVPlayer.
private struct CloudPage: View {
    let file: CloudFile
    let active: Bool

    @State private var player: AVPlayer?
    @State private var zoom: CGFloat = 1

    var body: some View {
        Group {
            if file.isVideo {
                if let player {
                    VideoPlayer(player: player)
                } else {
                    ProgressView().tint(.white)
                }
            } else if let cloud = CloudClient.fromSettings() {
                AsyncImage(url: cloud.streamURL(key: file.key)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                            .scaleEffect(zoom)
                            // Çift dokunuş yakınlaştırır: tek parmakla yatay
                            // kaydırma sayfa geçişine ayrıldığı için pinch yerine
                            // bu daha az çakışıyor.
                            .onTapGesture(count: 2) {
                                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                                    zoom = zoom > 1 ? 1 : 2.5
                                }
                            }
                    case .failure:
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
                    default:
                        ProgressView().tint(.white)
                    }
                }
            }
        }
        .onChange(of: active) { _, isActive in
            if isActive { startIfNeeded() } else { stop() }
        }
        .onAppear { if active { startIfNeeded() } }
        .onDisappear { stop() }
    }

    private func startIfNeeded() {
        guard file.isVideo, player == nil, let cloud = CloudClient.fromSettings() else {
            player?.play()
            return
        }
        let created = AVPlayer(url: cloud.streamURL(key: file.key))
        player = created
        created.play()
    }

    private func stop() {
        player?.pause()
        player = nil
        zoom = 1
    }
}
