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

    var body: some View {
        NavigationStack {
            Group {
                if settings.cloudConfigured {
                    VStack(spacing: 0) {
                        Picker("Kaynak", selection: $source) {
                            ForEach(Source.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)

                        if source == .device {
                            DeviceGalleryView()
                        } else {
                            CloudGalleryView()
                        }
                    }
                } else {
                    DeviceGalleryView()
                }
            }
            .navigationTitle("Galeri")
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
    @State private var authorization: PHAuthorizationStatus = .notDetermined
    @State private var assetsById: [String: PHAsset] = [:]
    @State private var selected: GalleryItem?
    @State private var selecting = false
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
                ToolbarItem(placement: .topBarLeading) {
                    if !items.isEmpty {
                        Button(selecting ? "Vazgeç" : "Seç") {
                            selecting.toggle()
                            chosen.removeAll()
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: refresh) { Image(systemName: "arrow.clockwise") }
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
                if selecting && isChosen {
                    // The same language as the in-page select mode: a glowing
                    // white frame, not a tiny checkbox.
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(.white, lineWidth: 2.5)
                        .shadow(color: .white.opacity(0.9), radius: 6)
                        .padding(1)
                }
            }
            .overlay(alignment: .topTrailing) {
                if selecting {
                    Image(systemName: isChosen ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(isChosen ? Color.white : .white.opacity(0.7))
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
        try await client.upload(fileURL: temp, preferredName: item.record.filename)
    }
}

// MARK: - Cloud (PC media server)

struct CloudGalleryView: View {
    @State private var files: [CloudFile] = []
    @State private var status: String?
    @State private var loading = false
    @State private var playing: CloudFile?

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
                List {
                    ForEach(files) { file in
                        Button {
                            playing = file
                        } label: {
                            row(file)
                        }
                    }
                    .onDelete { offsets in
                        deleteFiles(at: offsets)
                    }
                }
                .refreshable { await load() }
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
        .fullScreenCover(item: $playing) { file in
            CloudViewer(file: file)
        }
    }

    private func row(_ file: CloudFile) -> some View {
        HStack(spacing: 12) {
            Image(systemName: file.isVideo ? "play.rectangle.fill" : "photo.fill")
                .font(.system(size: 20))
                .foregroundStyle(file.isVideo ? .indigo : .teal)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(file.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text("\(Self.bytes(file.size)) · \(file.date.formatted(date: .abbreviated, time: .shortened))")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
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
            status = nil
        } catch {
            status = error.localizedDescription
        }
    }

    private func deleteFiles(at offsets: IndexSet) {
        guard let cloud = CloudClient.fromSettings() else { return }
        let doomed = offsets.map { files[$0] }
        files.remove(atOffsets: offsets)
        Task {
            for file in doomed {
                try? await cloud.delete(name: file.name)
            }
            await load()
        }
    }

    private static func bytes(_ value: Int64) -> String {
        if value >= 1_073_741_824 { return String(format: "%.2f GB", Double(value) / 1_073_741_824) }
        if value >= 1_048_576 { return String(format: "%.1f MB", Double(value) / 1_048_576) }
        return "\(max(1, value / 1024)) KB"
    }
}

/// Streams straight off the PC — Range requests make seeking work; nothing is
/// downloaded to the phone first.
struct CloudViewer: View {
    let file: CloudFile
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if file.isVideo {
                    if let player {
                        VideoPlayer(player: player)
                            .onAppear { player.play() }
                    } else {
                        ProgressView().tint(.white)
                    }
                } else if let cloud = CloudClient.fromSettings() {
                    AsyncImage(url: cloud.streamURL(name: file.name)) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFit()
                        case .failure: Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
                        default: ProgressView().tint(.white)
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(file.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Kapat") { dismiss() }
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .onAppear {
            if file.isVideo, let cloud = CloudClient.fromSettings() {
                player = AVPlayer(url: cloud.streamURL(name: file.name))
            }
        }
        .onDisappear { player?.pause() }
    }
}

// MARK: - Shared thumb + viewer

struct AssetThumbView: View {
    let asset: PHAsset
    let isVideo: Bool
    @State private var image: UIImage?

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: proxy.size.width, height: proxy.size.width)
                        .clipped()
                } else {
                    Rectangle().fill(Color(.secondarySystemBackground))
                }
                if isVideo {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(6)
                        .shadow(radius: 3)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
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
