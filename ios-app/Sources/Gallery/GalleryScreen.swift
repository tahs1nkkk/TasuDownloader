import AVKit
import Photos
import SwiftUI

/// The in-app gallery is a mirror of Photos, not a second copy: it renders the
/// assets this app created through PhotoKit. PHFetchOptions excludes hidden
/// assets by default, so anything moved to the Hidden album in Photos silently
/// drops out of this grid too, and deleting in Photos removes it here as well.
struct GalleryScreen: View {
    @EnvironmentObject private var records: DownloadRecordStore
    @State private var authorization: PHAuthorizationStatus = .notDetermined
    @State private var assetsById: [String: PHAsset] = [:]
    @State private var selected: GalleryItem?

    private var items: [GalleryItem] {
        records.records.compactMap { record in
            guard let asset = assetsById[record.assetId] else { return nil }
            return GalleryItem(record: record, asset: asset)
        }
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Galeri")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: refresh) { Image(systemName: "arrow.clockwise") }
                    }
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
                        AssetThumbView(asset: item.asset, isVideo: item.record.isVideo)
                            .onTapGesture { selected = item }
                            .contextMenu {
                                Button(role: .destructive) {
                                    records.remove(item.record)
                                } label: {
                                    Label("Listeden çıkar", systemImage: "trash")
                                }
                            }
                    }
                }
                .padding(3)
            }
        }
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
}

struct GalleryItem: Identifiable {
    let record: DownloadRecord
    let asset: PHAsset
    var id: UUID { record.id }
}

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
