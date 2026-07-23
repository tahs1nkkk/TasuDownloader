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
    @State private var showAddToList = false

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
        .sheet(isPresented: $showAddToList) {
            AddToListSheet(url: browser.addressText, title: browser.pageTitle)
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
        VStack(spacing: 10) {
            Spacer()
            GlassGroup(spacing: 24) {
                HStack(alignment: .bottom, spacing: 12) {
                    if settings.fabOnLeft {
                        fab
                        addToListButton
                        Spacer(minLength: 0)
                        searchBubble
                    } else {
                        searchBubble
                        Spacer(minLength: 0)
                        addToListButton
                        fab
                    }
                }
                .padding(.horizontal, 16)
            }
            if downloader.phase != .idle {
                DownloadHUDView(phase: downloader.phase)
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.bottom, 10)
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: downloader.phase)
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
                showAddToList = true
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

    var body: some View {
        HStack(spacing: 10) {
            icon
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .liquidGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
