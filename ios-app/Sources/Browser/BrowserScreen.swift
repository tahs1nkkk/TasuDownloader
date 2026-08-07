import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let controller: BrowserController

    func makeUIView(context: Context) -> WKWebView { controller.attachWebView() }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Hosts an already-built WKWebView — the popup window WebKit asked us to
/// create in `createWebViewWith`.
struct PopupWebViewContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct BrowserScreen: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var browser: BrowserController
    @ObservedObject private var downloader = Downloader.shared
    @FocusState private var addressFocused: Bool
    @State private var pendingLink: PendingLink?
    /// Sürükleme sırasındaki geçici kayma; parmak kalkınca ayara yazılıp sıfırlanır.
    @State private var fabDrag: CGSize = .zero

    /// The focused media's real permalink + title, resolved from the page just
    /// before the sheet opens (KÖK-LİSTE). Identifiable so `.sheet(item:)` opens
    /// only once the async lookup has filled it in.
    struct PendingLink: Identifiable {
        let id = UUID()
        let url: String
        let title: String
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Kept in the hierarchy even while home is showing: tearing the web
            // view down would mean re-loading and losing the scroll position
            // every time someone glances at the home screen.
            WebViewContainer(controller: browser)
                .ignoresSafeArea(.keyboard)
                .opacity(browser.showingHome ? 0 : 1)

            if browser.showingHome {
                homeLayer.transition(.opacity)
            } else {
                overlays
            }

            if let popup = browser.popupWebView {
                popupLayer(popup)
            }
        }
        .animation(.easeInOut(duration: 0.22), value: browser.showingHome)
        .animation(.easeInOut(duration: 0.22), value: browser.popupWebView == nil)
        .sheet(item: $pendingLink) { link in
            AddToListSheet(url: link.url, title: link.title)
        }
    }

    // MARK: - Home

    private var homeLayer: some View {
        ZStack {
            HomeBackground()
            VStack(spacing: 14) {
                addressBar
                HomeScreen()
            }
            .padding(.top, 8)
        }
    }

    /// Only ever visible here. Once a site is open the page owns the whole
    /// screen — a URL field is not what anyone is looking at a video for.
    private var addressBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)

            TextField("adres veya arama", text: $browser.addressText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .submitLabel(.go)
                .focused($addressFocused)
                .onSubmit {
                    addressFocused = false
                    browser.showingHome = false
                    browser.load(browser.addressText)
                }

            if !browser.addressText.isEmpty {
                Button {
                    browser.addressText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .font(.system(size: 16))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlassCapsule(interactive: false)
        .padding(.horizontal, 20)
    }

    // MARK: - Popup (window.open — OAuth logins)

    private func popupLayer(_ popup: WKWebView) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Giriş penceresi")
                    .font(.system(size: 14, weight: .semibold))
                Spacer()
                Button("Kapat") { browser.closePopup() }
                    .font(.system(size: 14, weight: .semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.regularMaterial)

            PopupWebViewContainer(webView: popup)
        }
        .background(Color(.systemBackground))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Browsing

    private var overlays: some View {
        ZStack(alignment: .bottom) {
            // Arama balonu ve indirme bildirimi tabanda kalır; yüzen buton artık
            // kendi katmanında, ayarlanan yerde duruyor. Balon her zaman butonun
            // karşı yarısına kaçıyor ki ikisi çakışmasın.
            VStack(spacing: 10) {
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: 12) {
                    if settings.fabOnLeftHalf {
                        Spacer(minLength: 0)
                        searchBubble
                    } else {
                        searchBubble
                        Spacer(minLength: 0)
                    }
                }
                .padding(.horizontal, 16)
                if downloader.phase != .idle {
                    DownloadHUDView(phase: downloader.phase) {
                        downloader.cancelCurrent()
                    }
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.bottom, 10)

            fabLayer
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: downloader.phase)
    }

    /// Yüzen buton ve yanındaki "listeye ekle" düğmesi tek bir küme olarak
    /// taşınır: ayrı ayrı konumlansalardı, ayarlanan köşeye göre üst üste
    /// binebilirlerdi. Küme sabit genişlikte, böylece seçim modunda ikinci
    /// düğme gizlenince buton yerinden oynamıyor.
    private var fabLayer: some View {
        GeometryReader { geo in
            let point = settings.fabPoint
            let onLeft = point.x < 0.5
            let width = settings.fabSize + 12 + 42
            let height = max(settings.fabSize, 42)

            GlassGroup(spacing: 20) {
                HStack(spacing: 12) {
                    if onLeft {
                        fab
                        addToListButton
                        Spacer(minLength: 0)
                    } else {
                        Spacer(minLength: 0)
                        addToListButton
                        fab
                    }
                }
            }
            .frame(width: width, height: height)
            .position(x: place(point.x, span: geo.size.width, box: width),
                      y: place(point.y, span: geo.size.height, box: height))
            .offset(fabDrag)
            .gesture(fabDragGesture(in: geo.size))
            .animation(.spring(response: 0.32, dampingFraction: 0.84), value: settings.fabAnchor)
        }
        .ignoresSafeArea(.keyboard)
    }

    /// Oranı piksele çevirir ve kümeyi ekranın içinde tutar.
    private func place(_ unit: CGFloat, span: CGFloat, box: CGFloat) -> CGFloat {
        let half = box / 2
        guard span > box + 16 else { return span / 2 }
        return min(max(unit * span, half + 8), span - half - 8)
    }

    /// Sürükleyip bırakmak konumu "Serbest"e alır. 18 piksellik eşik, butona
    /// dokunmayı ya da basılı tutmayı yanlışlıkla taşımaya çevirmiyor.
    private func fabDragGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in fabDrag = value.translation }
            .onEnded { value in
                let point = settings.fabPoint
                let x = (point.x * size.width + value.translation.width) / max(size.width, 1)
                let y = (point.y * size.height + value.translation.height) / max(size.height, 1)
                fabDrag = .zero
                settings.moveFab(toUnitX: x, unitY: y)
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            }
    }

    @ViewBuilder private var searchBubble: some View {
        if settings.searchOverlayEnabled && browser.isRedditPage {
            SearchOverlayView()
        } else {
            // Holds the row's height so the floating button does not hop when
            // the bubble comes and goes between Reddit pages.
            Color.clear.frame(width: 1, height: 1)
        }
    }

    /// Saves the open page into a link list. Hidden during select mode to keep
    /// the row clean while frames are up.
    @ViewBuilder private var addToListButton: some View {
        if !browser.pickerActive {
            Button {
                Task {
                    let link = await browser.focusedLink()
                    pendingLink = PendingLink(url: link.url, title: link.title)
                }
            } label: {
                Image(systemName: "text.badge.plus")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .liquidGlass(in: Circle(), tint: .indigo, interactive: true)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Bu sayfayı listeye ekle")
        }
    }

    private var fab: some View {
        let size = settings.fabSize
        return Image(systemName: browser.pickerActive ? "checkmark" : "arrow.down.to.line")
            .font(.system(size: size * 0.36, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .liquidGlass(
                in: Circle(),
                tint: browser.pickerActive ? .white.opacity(0.35) : (browser.currentSite?.color ?? .accentColor),
                interactive: true
            )
            .overlay(alignment: .topTrailing) {
                if browser.pickerActive && browser.pickerCount > 0 {
                    Text("\(browser.pickerCount)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.white))
                        .offset(x: 6, y: -6)
                }
            }
            .contentShape(Circle())
            // Short tap: centre media, or — in select mode — download the
            // selection. Holding enters select mode; holding again cancels it.
            .onTapGesture {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                browser.fabTapped()
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                browser.fabLongPressed()
            }
            .accessibilityLabel(browser.pickerActive ? "Seçilenleri indir" : "Ekrandaki medyayı indir")
            .accessibilityHint("Basılı tutmak seçim modunu açar ve kapatır")
    }
}

/// A soft wash behind the home screen. Glass needs something to refract; a flat
/// system background makes iOS 26's material look like plain grey.
struct HomeBackground: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
            GeometryReader { geometry in
                let width = geometry.size.width
                ForEach(Array(SiteCatalog.sites.enumerated()), id: \.element.id) { index, site in
                    Circle()
                        .fill(site.color.opacity(0.28))
                        .frame(width: width * 0.62)
                        .blur(radius: 70)
                        .offset(
                            x: (index.isMultiple(of: 2) ? -0.28 : 0.34) * width,
                            y: CGFloat(index) * geometry.size.height * 0.22 - geometry.size.height * 0.1
                        )
                }
            }
        }
        .ignoresSafeArea()
    }
}

struct DownloadHUDView: View {
    let phase: Downloader.Phase
    /// KÖK-İNDİRME-İPTAL: long-pressing the toast aborts the transfer. Optional
    /// so previews and any other caller can drop the HUD in without a handler.
    var onCancel: (() -> Void)? = nil

    /// Only a live transfer can be cancelled; the done/failed toasts are just
    /// receipts on their way out.
    private var cancellable: Bool {
        switch phase {
        case .fetching, .saving, .uploading: return true
        default: return false
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            icon
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.secondary) }
                if cancellable {
                    Text("Basılı tutup iptal et")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            if cancellable {
                Image(systemName: "xmark.circle")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onLongPressGesture(minimumDuration: 0.45) {
            guard cancellable else { return }
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            onCancel?()
        }
        .accessibilityHint(cancellable ? "Basılı tutmak indirmeyi iptal eder" : "")
    }

    @ViewBuilder private var icon: some View {
        switch phase {
        case .fetching, .saving, .uploading: ProgressView()
        case .done: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        case .idle: EmptyView()
        }
    }

    private var title: String {
        switch phase {
        case .fetching(let name, _, _, _): return name
        case .saving(let name): return name
        case .uploading(let name): return name
        case .done(let message): return message
        case .failed(let message): return message
        case .idle: return ""
        }
    }

    private var detail: String? {
        switch phase {
        case .fetching(_, let received, let total, let startedAt):
            // Coomer often omits content-length; moving bytes and a rate are
            // the honest signal that a slow transfer is alive, not stuck.
            var text = "İndiriliyor… \(Self.bytes(received))"
            if total > 0 {
                let percent = Int((Double(received) / Double(total) * 100).rounded())
                text += " / \(Self.bytes(total)) (%\(min(100, percent)))"
            }
            let elapsed = Date().timeIntervalSince(startedAt)
            if elapsed > 0.4 && received > 0 {
                text += " · \(Self.bytes(Int64(Double(received) / elapsed)))/sn"
            }
            return text
        case .saving: return "Fotoğraflara kaydediliyor…"
        case .uploading: return "Buluta yükleniyor…"
        default: return nil
        }
    }

    private static func bytes(_ value: Int64) -> String {
        if value >= 1_048_576 { return String(format: "%.1f MB", Double(value) / 1_048_576) }
        return "\(max(1, value / 1024)) KB"
    }
}
