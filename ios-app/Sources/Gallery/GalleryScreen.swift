import AVKit
import Photos
import SwiftUI

/// Two galleries under one tab: the device grid (a PhotoKit mirror of what the
/// app saved into Photos) and the cloud list (whatever lives on the PC media
/// server). PHFetchOptions excludes hidden assets by default, so anything moved
/// to the Hidden album in Photos silently drops out of the device grid too.
struct GalleryScreen: View {
    @EnvironmentObject private var records: DownloadRecordStore
    @EnvironmentObject private var settings: AppSettings

    enum Source: String, CaseIterable, Identifiable {
        case device = "Cihaz"
        case cloud = "Bulut"
        var id: String { rawValue }
    }

    @State private var source: Source = .device
    /// Cihaz ya da bulut alt-görünümü seçim moduna girince true; kaynak
    /// değiştiriciyi kilitler.
    @State private var selecting = false

    var body: some View {
        NavigationStack {
            Group {
                if settings.cloudConfigured {
                    VStack(spacing: 0) {
                        Picker("Kaynak", selection: $source) {
                            ForEach(Source.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        // Seçim modundayken kaynak değiştirilemez: seçime hangi
                        // yandan (cihaz/bulut) başlandıysa orada kalınır, öbür
                        // segment solgunlaşır. Silme ya da iptalden sonra açılır.
                        .disabled(selecting)
                        .opacity(selecting ? 0.4 : 1)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)

                        if source == .device {
                            DeviceGalleryView(selecting: $selecting)
                        } else {
                            CloudGalleryView(selecting: $selecting)
                        }
                    }
                } else {
                    DeviceGalleryView(selecting: $selecting)
                }
            }
            .navigationTitle("Galeri")
        }
        // İndirme HUD'undan gelen atlama: dosya cihaza indiyse Cihaz, yalnız buluta
        // gittiyse Bulut sekmesini öne al. Alt-galeri öğeyi açıp hedefi temizler.
        // Sekmeye yeni geçildiğinde onChange kaçırabileceği için appear'da da bakılır.
        .onAppear { applyRevealSource() }
        .onChange(of: records.revealTarget) { _, _ in applyRevealSource() }
    }

    private func applyRevealSource() {
        switch records.revealTarget {
        case .device(_)?: source = .device
        case .cloud(_)?: source = .cloud
        default: break
        }
    }
}

// MARK: - Device (Photos mirror)

struct GalleryItem: Identifiable {
    let record: DownloadRecord
    let asset: PHAsset
    var id: UUID { record.id }
}

struct DeviceGalleryView: View {
    @EnvironmentObject private var records: DownloadRecordStore
    @EnvironmentObject private var settings: AppSettings
    @Binding var selecting: Bool
    @State private var authorization: PHAuthorizationStatus = .notDetermined
    @State private var assetsById: [String: PHAsset] = [:]
    @State private var selected: GalleryItem?
    @State private var chosen: Set<UUID> = []
    @State private var uploadProgress: String?

    private var items: [GalleryItem] {
        records.records.compactMap { record in
            guard let asset = assetsById[record.assetId] else { return nil }
            return GalleryItem(record: record, asset: asset)
        }
    }

    var body: some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 2) {
                        if !items.isEmpty {
                            Button(selecting ? "İptal" : "Seç") {
                                selecting.toggle()
                                chosen.removeAll()
                            }
                        }
                        Button(action: refresh) { Image(systemName: "arrow.clockwise") }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if selecting {
                    selectionBar
                }
            }
            .task { requestAccess() }
            .fullScreenCover(item: $selected) { item in
                AssetViewer(item: item)
            }
            // HUD'dan gelen "cihaza indi" atlaması: kayıt yüklendiğinde öğeyi aç.
            // refresh de sonunda bunu dener; böylece izin/yükleme henüz bitmemişse
            // veriler gelince açılır.
            .onChange(of: records.revealTarget) { _, target in
                if case .device(_)? = target { refresh() }
            }
    }

    /// HUD'dan işaretlenen cihaz kaydını tam ekran açar ve hedefi temizler
    /// (aynı öğe ikinci kez açılmasın). Kayıt henüz Fotoğraflar'da bulunmuyorsa
    /// sessizce bekler — bir sonraki refresh yeniden dener.
    private func attemptReveal() {
        guard case .device(let id)? = records.revealTarget else { return }
        guard let item = items.first(where: { $0.id == id }) else { return }
        selected = item
        records.revealTarget = nil
    }

    @ViewBuilder private var content: some View {
        if authorization == .denied || authorization == .restricted {
            ContentUnavailableView(
                "Fotoğraflar erişimi yok",
                systemImage: "lock.fill",
                description: Text("Galeri, indirilenleri Fotoğraflar kitaplığından okur. Ayarlar → TasuDownloader → Fotoğraflar'dan izin ver.")
            )
        } else if items.isEmpty {
            ContentUnavailableView(
                "Henüz bir şey yok",
                systemImage: "photo.on.rectangle",
                description: Text("İndirilenler burada görünür. Fotoğraflar'da Gizli klasörüne taşınanlar burada da gizlenir.")
            )
        } else {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 3)], spacing: 3) {
                    ForEach(items) { item in
                        tile(item)
                    }
                }
                .padding(3)
            }
        }
    }

    private func tile(_ item: GalleryItem) -> some View {
        let isChosen = chosen.contains(item.id)
        return AssetThumbView(asset: item.asset, isVideo: item.record.isVideo)
            .overlay {
                // Seçilen medya açılmadan hafif kararır; sağ altına tik gelir.
                if selecting && isChosen {
                    Color.black.opacity(0.35)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if selecting && isChosen {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(.white, Color.accentColor)
                        .shadow(radius: 3)
                        .padding(6)
                }
            }
            .onTapGesture {
                if selecting {
                    if isChosen { chosen.remove(item.id) } else { chosen.insert(item.id) }
                } else {
                    selected = item
                }
            }
            .contextMenu {
                if !selecting {
                    Button {
                        selecting = true
                        chosen = [item.id]
                    } label: {
                        Label("Seç", systemImage: "checkmark.circle")
                    }
                    Button(role: .destructive) {
                        records.remove(item.record)
                    } label: {
                        Label("Listeden çıkar", systemImage: "minus.circle")
                    }
                    Button(role: .destructive) {
                        deleteFromPhotos([item])
                    } label: {
                        Label("Fotoğraflar'dan sil", systemImage: "trash")
                    }
                }
            }
    }

    private var selectionBar: some View {
        VStack(spacing: 8) {
            if let uploadProgress {
                Text(uploadProgress)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Text("\(chosen.count) seçili")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if settings.cloudConfigured {
                    Button {
                        uploadChosen()
                    } label: {
                        Label("Buluta yükle", systemImage: "icloud.and.arrow.up")
                    }
                    .disabled(chosen.isEmpty || uploadProgress != nil)
                }
                Button(role: .destructive) {
                    removeChosenFromList()
                } label: {
                    Label("Kaldır", systemImage: "minus.circle")
                }
                .disabled(chosen.isEmpty)
                Button(role: .destructive) {
                    deleteFromPhotos(items.filter { chosen.contains($0.id) })
                } label: {
                    Label("Sil", systemImage: "trash")
                }
                .disabled(chosen.isEmpty)
            }
            .font(.system(size: 13, weight: .semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    private func requestAccess() {
        Task { @MainActor in
            let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            authorization = status
            refresh()
        }
    }

    private func refresh() {
        guard authorization == .authorized || authorization == .limited else { return }
        let ids = records.records.map(\.assetId)
        guard !ids.isEmpty else {
            assetsById = [:]
            return
        }
        // Default fetch options: hidden assets are NOT included — exactly the
        // requested behaviour, no extra work needed.
        let result = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        var map: [String: PHAsset] = [:]
        result.enumerateObjects { asset, _, _ in
            map[asset.localIdentifier] = asset
        }
        assetsById = map
        attemptReveal()
    }

    private func removeChosenFromList() {
        for record in records.records.filter({ chosen.contains($0.id) }) {
            records.remove(record)
        }
        selecting = false
        chosen.removeAll()
    }

    /// PHPhotoLibrary shows its own "Allow deletion?" dialog, so the system —
    /// not this app — is the confirmation step.
    private func deleteFromPhotos(_ toDelete: [GalleryItem]) {
        let assets = toDelete.map(\.asset)
        guard !assets.isEmpty else { return }
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.deleteAssets(assets as NSArray)
        } completionHandler: { success, _ in
            DispatchQueue.main.async {
                if success {
                    for item in toDelete { records.remove(item.record) }
                    selecting = false
                    chosen.removeAll()
                    refresh()
                }
            }
        }
    }

    /// Pushes the original resources (no recompression) up to the PC, one at a
    /// time — the honest order for a home upload link.
    private func uploadChosen() {
        guard let cloud = CloudClient.fromSettings() else { return }
        let picked = items.filter { chosen.contains($0.id) }
        uploadProgress = "0/\(picked.count) yükleniyor…"
        Task {
            var done = 0
            var failed = 0
            for item in picked {
                do {
                    try await CloudUploader.upload(item: item, client: cloud)
                    done += 1
                } catch {
                    failed += 1
                }
                uploadProgress = "\(done + failed)/\(picked.count) yükleniyor…"
            }
            uploadProgress = nil
            selecting = false
            chosen.removeAll()
            Downloader.shared.phase = failed == 0
                ? .done("\(done) dosya buluta yüklendi")
                : .failed("\(done) yüklendi, \(failed) başarısız")
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if case .done = Downloader.shared.phase { Downloader.shared.phase = .idle }
            if case .failed = Downloader.shared.phase { Downloader.shared.phase = .idle }
        }
    }
}

/// Writes a PHAsset's original resource to a temp file and streams it up.
enum CloudUploader {
    static func upload(item: GalleryItem, client: CloudClient) async throws {
        let resources = PHAssetResource.assetResources(for: item.asset)
        guard let primary = resources.first(where: { $0.type == .video || $0.type == .photo }) ?? resources.first else {
            throw CloudError.badResponse(0)
        }
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent("up-\(UUID().uuidString)-\(item.record.filename)")
        defer { try? FileManager.default.removeItem(at: temp) }

        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: primary, toFile: temp, options: options) { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
        // Kayıttaki site etiketi arşivdeki sekmeyi belirler; galeriden yüklerken
        // de aynı bilgiyi taşırız, yoksa her şey "Diğer" altında toplanır.
        try await client.upload(fileURL: temp, preferredName: item.record.filename, site: item.record.site)
    }
}

// Bulut sekmesi artık ayrı dosyada: Gallery/CloudGalleryView.swift
// (ızgara + site sekmeleri + kaydırmalı tam ekran gezgin).

// MARK: - Shared thumb + viewer

struct AssetThumbView: View {
    let asset: PHAsset
    let isVideo: Bool
    @State private var image: UIImage?

    var body: some View {
        // Kare önce kurulur, kapak üstüne bindirilir (bulut ızgarasıyla aynı
        // desen). Eski GeometryReader düzeni hücreyi kareden biraz uzun
        // bırakabiliyor; dokunma alanı görselin altına taşınca bir alttaki kare
        // seçiliyordu. Color.clear'ı kareye çekip contentShape'i kareye
        // sabitleyince dokunma çerçevesi tam kare oluyor.
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .background(Color(.secondarySystemBackground))
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                }
            }
            .overlay(alignment: .bottomLeading) {
                if isVideo {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(6)
                        .shadow(radius: 3)
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .task(id: asset.localIdentifier) { loadThumb() }
    }

    private func loadThumb() {
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: 300, height: 300),
            contentMode: .aspectFill,
            options: options
        ) { result, _ in
            // PHImageManager may call back off the main thread.
            DispatchQueue.main.async {
                if let result { image = result }
            }
        }
    }
}

/// Full-quality viewer: images at original resolution, videos through
/// AVPlayer straight from the library — no re-download, no recompression.
struct AssetViewer: View {
    let item: GalleryItem
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if item.record.isVideo {
                    if let player {
                        VideoPlayer(player: player)
                            .onAppear { player.play() }
                    } else {
                        ProgressView().tint(.white)
                    }
                } else if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                } else {
                    ProgressView().tint(.white)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(item.record.filename).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                        Text("\(item.record.site) · \(item.record.savedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Kapat") { dismiss() }
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .task { loadFull() }
        .onDisappear { player?.pause() }
    }

    private func loadFull() {
        if item.record.isVideo {
            let options = PHVideoRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = false
            PHImageManager.default().requestPlayerItem(forVideo: item.asset, options: options) { playerItem, _ in
                DispatchQueue.main.async {
                    if let playerItem { player = AVPlayer(playerItem: playerItem) }
                }
            }
        } else {
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = false
            PHImageManager.default().requestImage(
                for: item.asset,
                targetSize: PHImageManagerMaximumSize,
                contentMode: .aspectFit,
                options: options
            ) { result, _ in
                DispatchQueue.main.async {
                    if let result { image = result }
                }
            }
        }
    }
}
