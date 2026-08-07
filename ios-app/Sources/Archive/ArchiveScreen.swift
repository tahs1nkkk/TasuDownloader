import SwiftUI
import UIKit
import WebKit

/// Tasu Arşiv'in tamamı, uygulamanın içinde.
///
/// Galeri sekmesindeki bulut ızgarası hızlı bakış için; burası ise sitenin
/// kendisi: listeler, kategoriler, arşivler, paylaşım linkleri. Giriş
/// `/auth/app` üzerinden Bearer anahtarıyla yapılır, Google ekranı görünmez —
/// Worker oturum çerezini basıp doğrudan sayfaya yönlendirir.
struct ArchiveScreen: View {
    @StateObject private var model = ArchiveWebModel()
    // Ayarlar bir singleton ama burada gözlemlenmeli: kullanıcı Worker adresi ile
    // anahtarı Ayarlar'da girip arşive dönünce ekran kendiliğinden yenilensin,
    // yoksa "bulut ayarlanmamış" ekranı takılı kalıyordu.
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var browser: BrowserController

    var body: some View {
        NavigationStack {
            Group {
                if !settings.cloudConfigured {
                    ContentUnavailableView {
                        Label("Bulut ayarlanmamış", systemImage: "icloud.slash")
                    } description: {
                        Text("Arşivi burada açmak için Worker adresi ile paylaşılan anahtarı gir.")
                    } actions: {
                        Button("Ayarlara git") { browser.wantsSettingsTab = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ZStack(alignment: .bottom) {
                        ArchiveWebView(model: model)
                            .ignoresSafeArea(edges: .bottom)
                        if let note = model.note {
                            Text(note)
                                .font(.system(size: 13, weight: .medium))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .background(.ultraThinMaterial, in: Capsule())
                                .padding(.bottom, 12)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .animation(.easeOut(duration: 0.2), value: model.note)
                }
            }
            .navigationTitle("Arşiv")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if model.loading {
                        ProgressView()
                    } else {
                        Button { model.reload() } label: { Image(systemName: "arrow.clockwise") }
                    }
                }
            }
        }
    }
}

/// Holds the web view itself so the toolbar can reload it, and carries the
/// short status line the download bridge writes.
@MainActor
final class ArchiveWebModel: ObservableObject {
    @Published var loading = true
    @Published var note: String?

    fileprivate weak var web: WKWebView?

    func reload() {
        guard let web else { return }
        // Oturum çerezi düşmüş olabilir; yenileme her zaman giriş adresinden
        // başlasın ki 401 ile boş sayfaya düşmeyelim.
        if let request = CloudClient.fromSettings()?.appEntryRequest() {
            web.load(request)
        } else {
            web.reload()
        }
    }

    /// Sayfanın kendi kaydırıcısını başa sarar (bkz. app.js → tasuScrollTop).
    func scrollToTop() {
        web?.evaluateJavaScript("window.tasuScrollTop && window.tasuScrollTop()")
    }

    func flash(_ text: String) {
        note = text
        Task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if note == text { note = nil }
        }
    }
}

private struct ArchiveWebView: UIViewRepresentable {
    let model: ArchiveWebModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Oturum çerezi kalıcı depoda dursun: uygulamayı her açışta yeniden
        // giriş yapmak gerekmesin.
        config.websiteDataStore = .default()
        // Web istemcisi bunu görünce iOS iskinine geçiyor.
        config.applicationNameForUserAgent = "TasuArchiveApp"

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        // WKScrollView dışarıdan verilen temsilciyi kendi iç temsilcisine
        // iletiyor, dolayısıyla bunu almak kaydırma davranışını bozmuyor. Tek
        // ihtiyacımız durum çubuğu dokunuşunu duymak.
        web.scrollView.delegate = context.coordinator
        web.scrollView.scrollsToTop = true
        // Sayfanın kendi kenar butonları soldan/sağdan geçiş için; sistemin
        // kenar kaydırması onlarla çakışırdı.
        web.allowsBackForwardNavigationGestures = false
        web.scrollView.contentInsetAdjustmentBehavior = .always
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        model.web = web

        if let request = CloudClient.fromSettings()?.appEntryRequest() {
            web.load(request)
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, UIScrollViewDelegate {
        private let model: ArchiveWebModel
        /// Where each download is being written plus the name the server asked
        /// for — the temp path carries a UUID, so the name cannot be recovered
        /// from it afterwards.
        private var pending: [ObjectIdentifier: (file: URL, name: String)] = [:]

        init(model: ArchiveWebModel) {
            self.model = model
        }

        /// Dynamic Island'a (durum çubuğuna) dokunuş. WebView'ın kendi kaydırıcısı
        /// zaten hep tepede olduğu için sistemin başa dönüşü görünürde hiçbir şey
        /// yapmıyordu; asıl kaydırıcıyı sayfaya söyleyerek sarıyoruz.
        func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool {
            Task { @MainActor in model.scrollToTop() }
            return true
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in model.loading = true }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in model.loading = false }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                model.loading = false
                model.flash("Sayfa yüklenemedi: \(error.localizedDescription)")
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                model.loading = false
                model.flash("Arşive ulaşılamadı: \(error.localizedDescription)")
            }
        }

        /// `<a download>` in the viewer has to become a real download, and
        /// anything pointing off the Worker opens in Safari instead of hijacking
        /// the archive view.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
                return
            }
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let host = CloudClient.fromSettings()?.base.host
            let external = navigationAction.navigationType == .linkActivated
                && url.host != nil
                && url.host != host
            if external {
                Task { @MainActor in UIApplication.shared.open(url) }
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationResponse: WKNavigationResponse,
                     decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        /// target="_blank" would otherwise silently do nothing.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
            return nil
        }

        // MARK: WKDownloadDelegate

        func download(_ download: WKDownload,
                      decideDestinationUsing response: URLResponse,
                      suggestedFilename: String,
                      completionHandler: @escaping (URL?) -> Void) {
            let name = suggestedFilename.isEmpty ? "tasu-\(Int(Date().timeIntervalSince1970))" : suggestedFilename
            let target = FileManager.default.temporaryDirectory
                .appendingPathComponent("archive-\(UUID().uuidString)-\(name)")
            pending[ObjectIdentifier(download)] = (target, name)
            Task { @MainActor in model.flash("İndiriliyor: \(name)") }
            completionHandler(target)
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let job = pending.removeValue(forKey: ObjectIdentifier(download)) else { return }
            // Arşivden indirilen dosya telefonun galerisine düşsün — WebView'ın
            // kendi indirme klasörü kullanıcı için görünmez bir yer.
            Task { @MainActor in
                let ext = job.file.pathExtension.lowercased()
                let isVideo = ["mp4", "mov", "m4v", "webm"].contains(ext)
                do {
                    _ = try await PhotoSaver.save(fileURL: job.file, filename: job.name, isVideo: isVideo)
                    model.flash("Galeriye kaydedildi: \(job.name)")
                } catch {
                    model.flash("Kaydedilemedi: \(error.localizedDescription)")
                }
                try? FileManager.default.removeItem(at: job.file)
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            if let job = pending.removeValue(forKey: ObjectIdentifier(download)) {
                try? FileManager.default.removeItem(at: job.file)
            }
            Task { @MainActor in model.flash("İndirme başarısız: \(error.localizedDescription)") }
        }
    }
}
