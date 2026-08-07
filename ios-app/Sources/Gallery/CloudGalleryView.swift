import AVKit
import SwiftUI
import UIKit

/// The cloud half of the Galeri tab: what lives in R2, shown the way the web
/// archive shows it — a square grid grouped by source site, not a file list.
///
/// Videos have no poster in R2 until the web client generates one, so a tile
/// asks `/api/thumb/<key>` first and falls back to an icon. Nothing is
/// downloaded to the phone; tapping opens a pager that streams over Range
/// requests, so seeking a two-hour video costs two hundred kilobytes.
struct CloudGalleryView: View {
    @EnvironmentObject private var records: DownloadRecordStore
    @Binding var selecting: Bool
    @State private var files: [CloudFile] = []
    @State private var status: String?
    @State private var loading = false
    @State private var site: String = ""
    @State private var opened: PagerStart?
    @State private var chosen: Set<String> = []

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
                HStack(spacing: 2) {
                    if !files.isEmpty {
                        Button(selecting ? "İptal" : "Seç") {
                            selecting.toggle()
                            chosen.removeAll()
                        }
                    }
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
        }
        .safeAreaInset(edge: .bottom) {
            if selecting { cloudSelectionBar }
        }
        .task { await load() }
        .fullScreenCover(item: $opened) { start in
            CloudPager(files: shown, start: start.index, onDelete: remove)
        }
        // HUD'dan gelen "yalnız buluta yüklendi" atlaması: liste yenilenince öğeyi
        // pager'da aç. load da sonunda bunu dener (sekmeye yeni geçildiğinde).
        .onChange(of: records.revealTarget) { _, target in
            if case .cloud(_)? = target { Task { await load() } }
        }
    }

    /// HUD'dan işaretlenen bulut anahtarını tam ekran açar ve hedefi temizler.
    /// Öğe hangi site sekmesindeyse görünür olsun diye önce süzgeci "Tümü"ye alır.
    private func attemptReveal() {
        guard case .cloud(let key)? = records.revealTarget else { return }
        site = ""
        guard let idx = files.firstIndex(where: { $0.key == key }) else { return }
        opened = PagerStart(index: idx)
        records.revealTarget = nil
    }

    /// Bulut seçim çubuğu: cihaz galerisiyle aynı dil. Seçilenleri buluttan
    /// siler, ardından seçim kapanır ve kaynak değiştirici tekrar açılır.
    private var cloudSelectionBar: some View {
        HStack(spacing: 10) {
            Text("\(chosen.count) seçili")
                .font(.system(size: 13, weight: .semibold))
            Spacer()
            Button(role: .destructive) {
                deleteChosen()
            } label: {
                Label("Buluttan sil", systemImage: "trash")
            }
            .disabled(chosen.isEmpty)
        }
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    private func deleteChosen() {
        let doomed = files.filter { chosen.contains($0.id) }
        files.removeAll { chosen.contains($0.id) }
        selecting = false
        chosen.removeAll()
        guard let cloud = CloudClient.fromSettings() else { return }
        Task {
            for file in doomed { try? await cloud.delete(key: file.key) }
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
                    let isChosen = chosen.contains(file.id)
                    CloudTile(file: file)
                        .overlay {
                            if selecting && isChosen { Color.black.opacity(0.35) }
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
                                if isChosen { chosen.remove(file.id) } else { chosen.insert(file.id) }
                            } else {
                                opened = PagerStart(index: index)
                            }
                        }
                        .contextMenu {
                            if !selecting {
                                Button(role: .destructive) {
                                    remove(file)
                                } label: {
                                    Label("Buluttan sil", systemImage: "trash")
                                }
                            }
                        }
                }
            }
            .padding(3)
        }
        .refreshable {
            // SwiftUI, çekme jesti biter bitmez refresh Task'ını iptal ediyor;
            // URLSession bunu -999 (cancelled) olarak fırlatınca "Buluta
            // ulaşılamadı" hatası çıkıyordu. Yüklemeyi bağımsız bir Task'a
            // alınca ağ isteği jestin ömründen etkilenmeden tamamlanır.
            await Task { await load() }.value
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
            if !site.isEmpty && !files.contains(where: { $0.site == site }) { site = "" }
            status = nil
            attemptReveal()
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
                    if file.isVideo {
                        // Sunucuda kapak yok: ilk kareyi yerelde üret, çiz ve
                        // /api/thumb'a bırak — sonrası (ve web) hazır kapağı alır.
                        CloudVideoPoster(file: file)
                    } else {
                        // Açılamayan görsel.
                        Image(systemName: "photo")
                            .font(.system(size: 22))
                            .foregroundStyle(.secondary)
                    }
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
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if file.isVideo {
                if let player {
                    VideoPlayer(player: player)
                } else {
                    ProgressView().tint(.white)
                }
            } else if let image {
                // UIScrollView tabanlı yakınlaştırma: iki parmak pinch, çift
                // dokunuşla noktaya zoom ve yakınken tek parmakla gezinme. Zoom
                // 1'ken içteki kaydırıcı yatay sürüklemeyi tüketmediği için sayfa
                // geçişi çalışır; yakınlaşınca sürüklemeyi kendi aldığından sayfa
                // kaymaz (eski scaleEffect'te sürükleme hep sayfayı değiştirip
                // medyayı ekran dışına atıyordu).
                ZoomableImage(image: image)
            } else if failed {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
            } else {
                ProgressView().tint(.white)
            }
        }
        .onChange(of: active) { _, isActive in
            if isActive { startIfNeeded() } else { stop() }
        }
        .onAppear {
            if active { startIfNeeded() }
            loadImageIfNeeded()
        }
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

    /// Zoomable görsel bir UIImage ister; AsyncImage yerine akışı doğrudan
    /// indiriyoruz (token ve bant sınırı zaten streamURL sorgusunda).
    private func loadImageIfNeeded() {
        guard !file.isVideo, image == nil, !failed,
              let cloud = CloudClient.fromSettings() else { return }
        Task {
            do {
                let (data, response) = try await URLSession.shared.data(from: cloud.streamURL(key: file.key))
                let code = (response as? HTTPURLResponse)?.statusCode ?? 200
                if (200...299).contains(code), let ui = UIImage(data: data) {
                    await MainActor.run { image = ui }
                } else {
                    await MainActor.run { failed = true }
                }
            } catch {
                await MainActor.run { failed = true }
            }
        }
    }

    private func stop() {
        player?.pause()
        player = nil
    }
}

// MARK: - Yakınlaştırılabilir görsel

/// SwiftUI'nin `scaleEffect`'i ne iki-parmak pinch ne de yakınken gezinme
/// veriyor, üstüne TabView'ın sayfa kaydırmasıyla çakışıyordu. UIScrollView
/// pinch / çift-dokunuş / pan'ı yerli olarak yapar; yakınken yatay sürüklemeyi
/// kendisi tükettiği için dıştaki sayfa gezgini araya girmez, zoom 1'ken ise
/// içerik ekrana sığdığından sürüklemeyi bırakıp sayfa geçişine izin verir.
struct ZoomableImage: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> ZoomScrollView {
        let scroll = ZoomScrollView()
        scroll.imageView.image = image
        let doubleTap = UITapGestureRecognizer(target: scroll,
                                               action: #selector(ZoomScrollView.handleDoubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(doubleTap)
        return scroll
    }

    func updateUIView(_ scroll: ZoomScrollView, context: Context) {
        if scroll.imageView.image !== image {
            scroll.imageView.image = image
            scroll.resetZoom()
        }
    }
}

/// Kendi delegesi olan sade yakınlaştırma kaydırıcısı.
final class ZoomScrollView: UIScrollView, UIScrollViewDelegate {
    let imageView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 4
        bouncesZoom = true
        // Zoom 1'ken içerik tam ekrana sığdığından sürüklemeyi tüketmesin ki
        // dıştaki TabView sayfa geçişini alabilsin.
        bounces = false
        showsVerticalScrollIndicator = false
        showsHorizontalScrollIndicator = false
        backgroundColor = .clear
        contentInsetAdjustmentBehavior = .never
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true
        addSubview(imageView)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) kullanılmıyor") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Yakın değilken görseli ekrana sığdır; yakınken kaydırıcı kendi
        // düzenini korur, biz yalnız ortalarız.
        if zoomScale == minimumZoomScale {
            imageView.frame = CGRect(origin: .zero, size: bounds.size)
            contentSize = bounds.size
        }
        centerImage()
    }

    private func centerImage() {
        var frame = imageView.frame
        frame.origin.x = frame.width < bounds.width ? (bounds.width - frame.width) / 2 : 0
        frame.origin.y = frame.height < bounds.height ? (bounds.height - frame.height) / 2 : 0
        imageView.frame = frame
    }

    func resetZoom() {
        setZoomScale(minimumZoomScale, animated: false)
        setNeedsLayout()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidZoom(_ scrollView: UIScrollView) { centerImage() }

    @objc func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        if zoomScale > minimumZoomScale {
            setZoomScale(minimumZoomScale, animated: true)
        } else {
            let point = gesture.location(in: imageView)
            let scale: CGFloat = 2.5
            let width = bounds.size.width / scale
            let height = bounds.size.height / scale
            let rect = CGRect(x: point.x - width / 2, y: point.y - height / 2,
                              width: width, height: height)
            zoom(to: rect, animated: true)
        }
    }
}
