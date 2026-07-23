import Combine
import UIKit
import WebKit

/// Owns the single WKWebView, injects the generated JS payload and answers the
/// bridge's messages — the native counterpart of the extension's background
/// script plus the Orion bridge, rolled into one.
@MainActor
final class BrowserController: NSObject, ObservableObject {
    static let shared = BrowserController(settings: .shared, records: .shared)

    /// Which half of the browser tab is on screen. The web view is never torn
    /// down — home is drawn over it — so going home and coming back costs
    /// nothing and loses no scroll position.
    @Published var showingHome = true
    @Published var lastVisited = ""

    @Published var addressText = ""
    @Published var currentHost = ""
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var pageTitle = ""

    /// Select mode, mirrored from the page: the JS layer owns the frames and
    /// posts PICKER_STATE on every change; the floating button reads these to
    /// become a confirm button with a count badge.
    @Published var pickerActive = false
    @Published var pickerCount = 0

    /// A real child window (Google/Apple OAuth open one). Kept as a separate
    /// web view so the opener relationship — and the postMessage handshake the
    /// login flow depends on — stays intact.
    @Published var popupWebView: WKWebView?

    /// Set by other tabs ("open this link in the browser"); RootView watches it
    /// and switches tabs.
    @Published var wantsBrowserTab = false

    let settings: AppSettings
    let records: DownloadRecordStore
    private(set) var webView: WKWebView?
    private var cancellables = Set<AnyCancellable>()
    private let edgeGesture = EdgeHomeGesture()

    /// The catalog entry for the page on screen, when there is one. Lets the
    /// floating button wear the site's colour.
    var currentSite: SupportedSite? { SiteCatalog.site(forHost: currentHost) }

    // WKWebView's default user agent lacks the Safari token, which makes
    // Instagram and Google refuse logins. Present as mobile Safari instead.
    private static let safariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

    init(settings: AppSettings, records: DownloadRecordStore) {
        self.settings = settings
        self.records = records
        super.init()
        NotificationCenter.default.publisher(for: AppSettings.changedNotification)
            .sink { [weak self] _ in
                Task { @MainActor in self?.broadcastSettings() }
            }
            .store(in: &cancellables)
    }

    var isRedditPage: Bool {
        currentHost == "reddit.com" || currentHost.hasSuffix(".reddit.com")
    }

    // MARK: - Web view

    func attachWebView() -> WKWebView {
        if let webView { return webView }

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let controller = configuration.userContentController
        controller.addScriptMessageHandler(self, contentWorld: .defaultClient, name: "rgNative")

        // Worlds mirror the extension: handlers isolated from the page,
        // the RedGifs clipboard hook in the page's own world.
        addScript(controller, resource: "rg-core", injection: .atDocumentStart, world: .defaultClient)
        addScript(controller, resource: "rg-handlers", injection: .atDocumentEnd, world: .defaultClient)
        addScript(controller, resource: "rg-page-hook", injection: .atDocumentStart, world: .page)

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.customUserAgent = Self.safariUA
        view.allowsBackForwardNavigationGestures = true
        view.navigationDelegate = self
        view.uiDelegate = self
        if #available(iOS 16.4, *) { view.isInspectable = true }
        webView = view

        // WebKit owns the left-edge swipe while there is history to walk back
        // through. This one only arms itself once there is not, so a single
        // habit — swipe from the edge — walks back to the first page of the
        // site and then out to the home screen.
        edgeGesture.onTrigger = { [weak self] in self?.goHome() }
        let recognizer = UIScreenEdgePanGestureRecognizer(target: edgeGesture, action: #selector(EdgeHomeGesture.handle(_:)))
        recognizer.edges = .left
        recognizer.delegate = edgeGesture
        view.addGestureRecognizer(recognizer)

        // No page is loaded here on purpose: the home screen is the landing
        // page, and the first tile tap decides what this view shows.
        return view
    }

    private func addScript(_ controller: WKUserContentController, resource: String, injection: WKUserScriptInjectionTime, world: WKContentWorld) {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("Missing bundled script \(resource).js — run scripts/build-ios-app-js.js")
            return
        }
        controller.addUserScript(WKUserScript(source: source, injectionTime: injection, forMainFrameOnly: false, in: world))
    }

    func load(_ text: String) {
        var raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }
        if !raw.lowercased().hasPrefix("http://") && !raw.lowercased().hasPrefix("https://") {
            raw = "https://\(raw)"
        }
        guard let url = URL(string: raw) else { return }
        _ = attachWebView()
        webView?.load(URLRequest(url: url))
    }

    func goBack() { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload() { webView?.reload() }

    /// Opening a tile is the one place the address bar is not involved, so it
    /// is also where the browser half takes over the screen.
    func openSite(_ site: SupportedSite) {
        showingHome = false
        wantsBrowserTab = true
        load(site.url)
    }

    /// Lists and other tabs land here: open the link and front the browser.
    func openURL(_ url: String) {
        showingHome = false
        wantsBrowserTab = true
        load(url)
    }

    func goHome() {
        if pickerActive { pickerCommand("cancel") }
        showingHome = true
    }

    func closePopup() {
        popupWebView = nil
    }

    private func syncNavigationState() {
        guard let webView else { return }
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        edgeGesture.armed = !webView.canGoBack
        if let url = webView.url {
            addressText = url.absoluteString
            currentHost = url.host?.lowercased() ?? ""
            lastVisited = currentSite?.name ?? (url.host ?? url.absoluteString)
        }
        pageTitle = webView.title ?? ""
    }

    // MARK: - Bridge

    func broadcastSettings() {
        guard let webView else { return }
        let js = "window.__rgNativeSettingsChanged && window.__rgNativeSettingsChanged(\(settings.settingsPayloadJSON()));"
        webView.evaluateJavaScript(js, in: nil, in: .defaultClient, completionHandler: nil)
    }

    /// Short tap on the floating button. Outside select mode it downloads the
    /// centre-most media; inside, it downloads the selection.
    func fabTapped() {
        if pickerActive {
            pickerCommand("confirm")
            return
        }
        guard let webView else { return }
        let js = "window.__rgFabDownload ? window.__rgFabDownload() : 'none';"
        webView.evaluateJavaScript(js, in: nil, in: .defaultClient) { result in
            if case .success(let value) = result, let outcome = value as? String, outcome == "none" {
                Downloader.shared.flash("İndirilecek medya bulunamadı")
            }
        }
    }

    /// Long press: enter select mode, or cancel it if it is already up.
    func fabLongPressed() {
        pickerCommand(pickerActive ? "cancel" : "start")
    }

    private func pickerCommand(_ op: String) {
        guard let webView else { return }
        let js = "window.__rgFabPicker ? window.__rgFabPicker('\(op)') : 'none';"
        webView.evaluateJavaScript(js, in: nil, in: .defaultClient) { [weak self] result in
            guard case .success(let value) = result, let outcome = value as? String else { return }
            Task { @MainActor in
                guard let self else { return }
                switch op {
                case "start":
                    if outcome == "started" {
                        self.pickerActive = true
                        self.pickerCount = 0
                    } else {
                        Downloader.shared.flash("Seçilecek medya bulunamadı")
                    }
                case "confirm":
                    self.pickerActive = false
                    self.pickerCount = 0
                    let count = Int(outcome) ?? 0
                    if count == 0 {
                        Downloader.shared.flash("Seçim yapılmadı")
                    }
                default:
                    self.pickerActive = false
                    self.pickerCount = 0
                }
            }
        }
    }

    private func currentCookies() async -> [HTTPCookie] {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else { return [] }
        return await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
    }

    private func route(kind: String, body: [String: Any], pageURL: URL?) async -> Any {
        switch kind {
        case "storageGet":
            // Only the settings key exists natively; extras ride along inside it.
            return [AppSettings.settingsKey: settings.settingsPayload()]
        case "storageSet":
            if let items = body["items"] as? [String: Any],
               let stored = items[AppSettings.settingsKey] as? [String: Any] {
                settings.mergeExtraSettings(stored)
            }
            return [:] as [String: Any]
        case "storageRemove":
            return [:] as [String: Any]
        case "message":
            guard let message = body["message"] as? [String: Any],
                  let type = message["type"] as? String else {
                return ["ok": false, "error": "APP00: boş mesaj"]
            }
            switch type {
            case "OPEN_TAB":
                if let urlString = message["url"] as? String { load(urlString) }
                return ["ok": true]
            case "PICKER_STATE":
                pickerActive = message["active"] as? Bool ?? false
                pickerCount = message["count"] as? Int ?? 0
                return ["ok": true]
            case "START_RIPSNIP":
                return ["ok": false, "error": "IOS03: Ripsnip iOS'ta desteklenmiyor"]
            case "DIRECT_DOWNLOAD":
                let cookies = await currentCookies()
                return await Downloader.shared.handleDirectDownload(
                    message, pageURL: pageURL, cookies: cookies, userAgent: Self.safariUA, records: records
                )
            default:
                return ["ok": false, "error": "APP01: bilinmeyen mesaj \(type)"]
            }
        default:
            return ["ok": false, "error": "APP02: bilinmeyen istek"]
        }
    }
}

// MARK: - Edge swipe

/// Left-edge swipe that means "leave the site". Deliberately a plain NSObject
/// rather than part of the controller: `gestureRecognizerShouldBegin` has to
/// answer synchronously while UIKit is deciding whether to start the gesture,
/// which a main-actor-isolated method cannot promise to do.
final class EdgeHomeGesture: NSObject, UIGestureRecognizerDelegate {
    /// Mirrors `!webView.canGoBack`, written from the main actor after every
    /// navigation. False means WebKit's own back-swipe has somewhere to go and
    /// this one must stay out of its way.
    var armed = false
    var onTrigger: (@MainActor () -> Void)?

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool { armed }

    @objc func handle(_ recognizer: UIScreenEdgePanGestureRecognizer) {
        guard recognizer.state == .ended else { return }
        let travel = recognizer.translation(in: recognizer.view)
        // A short flick or a mostly-vertical drag is someone scrolling near the
        // edge, not someone asking to leave.
        guard travel.x > 60, abs(travel.y) < 90 else { return }
        let action = onTrigger
        Task { @MainActor in action?() }
    }
}

// MARK: - WKScriptMessageHandlerWithReply

extension BrowserController: WKScriptMessageHandlerWithReply {
    nonisolated func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else {
            replyHandler(nil, "APP03: çözülemeyen mesaj gövdesi")
            return
        }
        Task { @MainActor in
            let pageURL = self.webView?.url
            let result = await self.route(kind: kind, body: body, pageURL: pageURL)
            replyHandler(result, nil)
        }
    }
}

// MARK: - WKNavigationDelegate / WKUIDelegate

extension BrowserController: WKNavigationDelegate, WKUIDelegate {
    // Links that leave the web entirely (mailto:, itms-apps:, intent:) used to
    // dead-end as a white page; hand them to the system instead.
    nonisolated func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           !["http", "https", "about", "blob", "data", "file"].contains(scheme) {
            Task { @MainActor in
                _ = await UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    nonisolated func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        Task { @MainActor in
            guard webView == self.webView else { return }
            self.isLoading = true
            self.syncNavigationState()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        Task { @MainActor in
            guard webView == self.webView else { return }
            // A real navigation tears the select-mode DOM down with the page.
            self.pickerActive = false
            self.pickerCount = 0
            self.syncNavigationState()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            guard webView == self.webView else { return }
            self.isLoading = false
            self.syncNavigationState()
            self.broadcastSettings()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in
            guard webView == self.webView else { return }
            self.isLoading = false
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in
            guard webView == self.webView else { return }
            self.isLoading = false
        }
    }

    // window.open gets a real child web view. This is what fixes "log in with
    // Google" — the popup must exist for the opener handshake to complete, and
    // it MUST be built from the configuration WebKit hands us or WebKit
    // crashes. WKUIDelegate calls arrive on the main thread, so hopping onto
    // the main actor synchronously here is legitimate.
    nonisolated func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        MainActor.assumeIsolated {
            if let existing = self.popupWebView {
                // A popup opening another window: reuse the surface we have.
                if let url = navigationAction.request.url {
                    existing.load(URLRequest(url: url))
                }
                return nil
            }
            let child = WKWebView(frame: .zero, configuration: configuration)
            child.customUserAgent = Self.safariUA
            child.navigationDelegate = self
            child.uiDelegate = self
            if #available(iOS 16.4, *) { child.isInspectable = true }
            self.popupWebView = child
            return child
        }
    }

    // The OAuth flow closes its own window when it is done.
    nonisolated func webViewDidClose(_ webView: WKWebView) {
        MainActor.assumeIsolated {
            if webView == self.popupWebView {
                self.popupWebView = nil
            }
        }
    }
}
