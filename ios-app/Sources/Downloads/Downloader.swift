import Foundation

/// Answers DIRECT_DOWNLOAD exactly like the Orion bridge did, but natively:
/// URLSession streams to a temp file (no whole-video-in-JS-memory), and the
/// finished file goes to Photos, to the PC media server, or both — the
/// destination is a setting.
@MainActor
final class Downloader: NSObject, ObservableObject {
    static let shared = Downloader()

    enum Phase: Equatable {
        case idle
        /// Sayfa indirilebilir adres vermedi; kalıcı bağlantıdan çözülüyor.
        /// Kısa bir API gidiş-dönüşü, ama sessiz geçerse FAB ölü görünür.
        case resolving
        case fetching(name: String, received: Int64, total: Int64, startedAt: Date)
        case saving(name: String)
        case uploading(name: String)
        case done(String)
        case failed(String)
    }

    @Published var phase: Phase = .idle

    /// Biten indirmenin galeride nereye düştüğü — HUD'un "tamamlandı" fişine
    /// dokununca oraya atlamak için. Her `fetchAndSave` başında `nil`'lenir, yalnız
    /// bir hedefe gerçekten yazıldığında dolar. Cihaza inen kazanır (yerel, anında
    /// açılır); yalnız buluta gidenler bulut anahtarını taşır.
    @Published private(set) var savedReveal: DownloadRecordStore.RevealTarget?

    private var dismissTask: Task<Void, Never>?

    /// The transfer currently on the wire, so a long-press on the HUD (or the
    /// stall watchdog) can abort it. Downloads run one at a time, so one slot is
    /// enough.
    private var activeFetcher: StreamFetcher?
    /// Set when the user cancels: the queue loops check it and stop instead of
    /// falling through to the next candidate or the next queued batch. Cleared
    /// once the queue drains.
    private var cancelRequested = false
    /// Last time the active transfer moved bytes — the stall watchdog reads it.
    private var lastProgressAt = Date()

    func flash(_ message: String) {
        phase = .failed(message)
        scheduleDismiss(after: 2.2)
    }

    /// True while something is actually transferring or saving — the HUD only
    /// offers "hold to cancel" then.
    var isActive: Bool {
        switch phase {
        case .fetching, .saving, .uploading: return true
        default: return false
        }
    }

    /// KÖK-İNDİRME-İPTAL: long-pressing the download HUD lands here. Kills the
    /// in-flight transfer and tells the queue loops to stop, so a hung download
    /// (Coomer/Reddit sometimes never deliver bytes) does not trap the user
    /// behind a long wait.
    func cancelCurrent() {
        guard isActive else { return }
        cancelRequested = true
        activeFetcher?.cancel()
        phase = .failed("İndirme iptal edildi")
        scheduleDismiss(after: 1.6)
    }

    private func scheduleDismiss(after seconds: Double) {
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.phase = .idle
        }
    }

    // MARK: - Serial queue

    // The select mode fires several DIRECT_DOWNLOADs in quick succession, each
    // arriving as its own bridge message. Running them concurrently would race
    // the progress HUD and hammer the site; a strict FIFO keeps one transfer on
    // the wire at a time. All on the main actor, so this needs no locking.
    private var busy = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    private func withSerialQueue<T>(_ operation: () async -> T) async -> T {
        while busy {
            await withCheckedContinuation { waiters.append($0) }
        }
        busy = true
        defer {
            busy = false
            if !waiters.isEmpty {
                waiters.removeFirst().resume()
            } else {
                // Queue drained: clear the cancel flag so an unrelated download
                // started later is not refused.
                cancelRequested = false
            }
        }
        return await operation()
    }

    // MARK: - DIRECT_DOWNLOAD

    func handleDirectDownload(
        _ message: [String: Any],
        pageURL: URL?,
        cookies: [HTTPCookie],
        userAgent: String,
        records: DownloadRecordStore
    ) async -> [String: Any] {
        await withSerialQueue {
            await self.processDirectDownload(
                message, pageURL: pageURL, cookies: cookies, userAgent: userAgent, records: records
            )
        }
    }

    private func processDirectDownload(
        _ message: [String: Any],
        pageURL: URL?,
        cookies: [HTTPCookie],
        userAgent: String,
        records: DownloadRecordStore
    ) async -> [String: Any] {
        if cancelRequested {
            return ["ok": false, "error": "IOS04: indirme iptal edildi"]
        }

        let rawUrls = (message["urls"] as? [Any] ?? []).compactMap { $0 as? String }
        var seen = Set<String>()
        var urls = rawUrls.filter { $0.lowercased().hasPrefix("http") && seen.insert($0).inserted }

        // Her handler kalıcı bağlantıyı aynı adla göndermiyor: Scrolller kendi
        // içerik sayfasını `scrolllerSourceUrl` diye yolluyor. Yalnız
        // `fallbackSourceUrl`'e bakmak, o sayfayı hiç görmemek demekti.
        //
        // Sayfanın AÇIKÇA verdiği bağlantı ile adres çubuğundaki sayfa ayrı
        // tutuluyor: ilki o medyanın kendi kalıcı bağlantısı, ikincisi yalnız
        // "şu an buradayım" demek. Akışta ikincisini çözmek, seçilen videonun
        // yerine akış sayfasının kapak görselini indirmek olurdu.
        //
        // Scrolller ayrıca tutuluyor: `scrolllerSourceUrl` seçilen medyanın KENDİ
        // içerik sayfası, `fallbackSourceUrl` ise yalnız adres çubuğu (bkz.
        // native-bridge.js `grab`). Aşağıdaki "önce çöz" adımı bu ayrıma dayanıyor.
        let scrolllerSource = (message["scrolllerSourceUrl"] as? String) ?? ""
        let explicitSource = [
            message["fallbackSourceUrl"] as? String,
            scrolllerSource
        ].compactMap { $0 }.first { !$0.isEmpty } ?? ""
        let sourceUrl = explicitSource.isEmpty ? (pageURL?.absoluteString ?? "") : explicitSource

        let cookieHeader = HTTPCookie.requestHeaderFields(with: cookies)["Cookie"] ?? ""

        let wantImage = message["imageMode"] as? Bool ?? false
        let downloadAll = message["downloadAll"] as? Bool ?? false

        // Sayfa indirilebilir adres veremediğinde elde yalnız kalıcı bağlantı
        // kalır (RedGifs tam ekran/akış blob ile oynatılır, Reddit gömülüsü de
        // boş liste + watch adresi gönderir). Eklentide bu son adımı arka plan
        // betiği yapıyor; burada da yapılmazsa doğru bağlantı elde olmasına
        // rağmen "URL bulunamadı" denip vazgeçiliyordu.
        //
        // Scrolller'da içerik sayfası DOM'dan yetkili, o yüzden ÖNCE çözülüp
        // sonuçları DOM adreslerinin önüne konuyor — eklentinin arka planı da
        // (`resolveMediaViaScrolller` + `[...scrolllerUrls, ...message.urls]`)
        // tam olarak bunu yapıyor. Uygulama ise yalnız liste bomboşken
        // çözüyordu; kare bir önizleme ya da ölçeklenmiş türev verdiğinde o
        // tutmayan adresle yetinip pes ediyordu — "akışta video inmiyor" ile
        // "tam ekranda görsel inmiyor" ikilisi buydu.
        //
        // Yalnız Scrolller: `fallbackSourceUrl` adres çubuğundan geliyor, onu
        // öne almak Reddit galerisinde seçilen karenin yerine gönderinin ilk
        // görselini indirmek olurdu. Toplu indirmede de yapılmıyor — orada her
        // adres ayrı bir dosya, çözülen adresleri eklemek aynı medyayı ikilerdi.
        var resolvedFromSource = false
        if !scrolllerSource.isEmpty, !downloadAll {
            phase = .resolving
            let resolved = await MediaResolver.shared
                .resolve(sourceUrl: scrolllerSource, userAgent: userAgent, cookieHeader: cookieHeader)
                .filter { seen.insert($0).inserted }
            urls = resolved + urls
            // Denendi sayılıyor (sonuç boş çıksa bile): aşağıdaki ikinci tur
            // aynı sayfayı bir kez daha çekmesin.
            resolvedFromSource = true
        } else if urls.isEmpty, !sourceUrl.isEmpty {
            // Elde hiç adres yok; geriye yalnız adres çubuğundaki sayfa kalıyor.
            phase = .resolving
            urls = await MediaResolver.shared
                .resolve(sourceUrl: sourceUrl, userAgent: userAgent, cookieHeader: cookieHeader)
                .filter { seen.insert($0).inserted }
            resolvedFromSource = true
        }

        guard !urls.isEmpty else {
            flash("İndirilecek URL bulunamadı")
            return ["ok": false, "error": "IOS01: indirilecek URL yok"]
        }

        let fallbackOnNoTransfer = message["fallbackOnNoTransfer"] as? Bool ?? false
        let transferTimeoutMs = message["transferTimeoutMs"] as? Double ?? 2500
        let namingUrl = message["namingUrl"] as? String
        let site = MediaNaming.site(for: sourceUrl.isEmpty ? (urls.first ?? "") : sourceUrl)

        var errors: [String] = []
        var tried: [String] = []
        var round = urls
        var roundWantImage = wantImage
        // Kaynak sayfa daha okunmadıysa ikinci bir tur hakkı var — ama yalnız
        // sayfanın kendi verdiği kalıcı bağlantıyla.
        var mayResolve = !resolvedFromSource && !explicitSource.isEmpty

        while true {
            tried.append(contentsOf: round)
            let outcome = await runRound(
                urls: round, all: downloadAll, wantImage: roundWantImage,
                namingUrl: namingUrl, site: site, sourceUrl: sourceUrl,
                fallbackOnNoTransfer: fallbackOnNoTransfer, transferTimeoutMs: transferTimeoutMs,
                pageURL: pageURL, cookies: cookies, userAgent: userAgent, records: records
            )
            errors.append(contentsOf: outcome.errors)

            if outcome.saved > 0 {
                if downloadAll {
                    phase = .done("\(outcome.saved) dosya kaydedildi")
                    // Galeriye atlanabiliyorsa fiş daha uzun kalsın: dokunmaya vakit olsun.
                    scheduleDismiss(after: savedReveal != nil ? 6 : 2.0)
                    return ["ok": true, "mode": "queued", "count": outcome.saved]
                }
                return ["ok": true, "mode": roundWantImage ? "image" : "media", "url": outcome.lastURL]
            }
            if cancelRequested {
                return ["ok": false, "error": "IOS04: indirme iptal edildi"]
            }

            // Sayfanın verdiği adresler hiçbir dosya getirmediyse kalıcı
            // bağlantı hâlâ elde. Scrolller'da DOM tahmini iki yönde de
            // yanılabiliyordu — akışta videonun adresi `blob:`e komşu bir
            // önizleme, tam ekranda görselinki süresi geçmiş bir CDN adresi —
            // ve tek turda vazgeçildiği için biri inip diğeri inmiyordu. İkinci
            // turda türü sayfanın kendisi söylüyor, o yüzden `wantImage` vetosu
            // da kalkıyor: kaynak sayfa DOM tahmininden daha güvenilir.
            guard mayResolve else { break }
            mayResolve = false
            phase = .resolving
            let fresh = await MediaResolver.shared
                .resolve(sourceUrl: sourceUrl, userAgent: userAgent, cookieHeader: cookieHeader)
                .filter { seen.insert($0).inserted }
            if fresh.isEmpty { break }
            round = fresh
            roundWantImage = false
        }
        return failAll(urls: tried, errors: errors)
    }

    /// Tek tur indirme. `all` doğruysa listedeki her adres ayrı dosya olarak
    /// kaydedilir; değilse adaylar en iyiden başlayarak denenir ve ilk başarıda
    /// durulur (kısa boşta-kalma süresi yalnız arkada bekleyen aday varken).
    private func runRound(
        urls: [String],
        all: Bool,
        wantImage: Bool,
        namingUrl: String?,
        site: String,
        sourceUrl: String,
        fallbackOnNoTransfer: Bool,
        transferTimeoutMs: Double,
        pageURL: URL?,
        cookies: [HTTPCookie],
        userAgent: String,
        records: DownloadRecordStore
    ) async -> (saved: Int, lastURL: String, errors: [String]) {
        var saved = 0
        var lastURL = ""
        var errors: [String] = []
        for (index, url) in urls.enumerated() {
            if cancelRequested { break }
            let hasFallback = index < urls.count - 1
            let idleTimeout = !all && hasFallback && fallbackOnNoTransfer
                ? max(0.5, transferTimeoutMs / 1000)
                : 120
            do {
                try await fetchAndSave(
                    url, namingUrl: all ? url : (namingUrl ?? url), site: site, sourceUrl: sourceUrl,
                    wantImage: wantImage, pageURL: pageURL, cookies: cookies, userAgent: userAgent,
                    idleTimeout: idleTimeout, records: records
                )
                saved += 1
                lastURL = url
                if !all { break }
            } catch {
                // A user cancel must not fall through to the next candidate —
                // that would look like the cancel did nothing.
                if cancelRequested { break }
                errors.append("\(url): \(error.localizedDescription)")
            }
        }
        return (saved, lastURL, errors)
    }

    private func failAll(urls: [String], errors: [String]) -> [String: Any] {
        let detail = "IOS02 hiçbir aday indirilemedi (\(errors.count)/\(urls.count))"
        phase = .failed(errors.last ?? detail)
        scheduleDismiss(after: 3.5)
        return ["ok": false, "error": "\(detail): \(errors.joined(separator: " | "))"]
    }

    private func fetchAndSave(
        _ urlString: String,
        namingUrl: String,
        site: String,
        sourceUrl: String,
        wantImage: Bool,
        pageURL: URL?,
        cookies: [HTTPCookie],
        userAgent: String,
        idleTimeout: TimeInterval,
        records: DownloadRecordStore
    ) async throws {
        guard let url = URL(string: urlString) else { throw DownloadError.badURL }
        let filename = MediaNaming.fileName(for: namingUrl, site: site)
        // Bu aday için geçmiş bir başarının hedefi taşınmasın: her denemede sıfırla.
        savedReveal = nil
        phase = .fetching(name: filename, received: 0, total: 0, startedAt: Date())

        var request = URLRequest(url: url)
        request.timeoutInterval = idleTimeout
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        if let pageURL { request.setValue(pageURL.absoluteString, forHTTPHeaderField: "Referer") }
        let matching = cookies.filter { cookie in
            let host = url.host?.lowercased() ?? ""
            let domain = cookie.domain.lowercased()
            let trimmed = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
            return host == trimmed || host.hasSuffix(".\(trimmed)")
        }
        if !matching.isEmpty, let header = HTTPCookie.requestHeaderFields(with: matching)["Cookie"] {
            request.setValue(header, forHTTPHeaderField: "Cookie")
        }

        let fetcher = StreamFetcher()
        activeFetcher = fetcher
        lastProgressAt = Date()

        // Some hosts (Coomer especially) accept the connection and then never
        // send a byte. URLSession's own timeout does not always fire on a
        // half-open socket, so watch the progress clock ourselves and abort
        // after a minute of silence instead of hanging the queue forever.
        let watchdog = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                guard let self, !Task.isCancelled else { return }
                if Date().timeIntervalSince(self.lastProgressAt) > 60 {
                    fetcher.cancel()
                    return
                }
            }
        }
        defer {
            watchdog.cancel()
            if activeFetcher === fetcher { activeFetcher = nil }
        }

        let result = try await fetcher.fetch(request: request) { [weak self] received, total in
            Task { @MainActor in
                guard let self else { return }
                self.lastProgressAt = Date()
                guard case .fetching(let name, _, _, let started) = self.phase else { return }
                self.phase = .fetching(name: name, received: received, total: total, startedAt: started)
            }
        }
        defer { try? FileManager.default.removeItem(at: result.fileURL) }

        // Scrolller & friends serve WebP; the user wants plain JPG on disk.
        // Convert before naming so applyMime lands a .jpg name and Photos gets JPEG.
        var sourceFileURL = result.fileURL
        var mimeType = result.mimeType
        if MediaNaming.isImage(mime: result.mimeType, filename: filename),
           ImageConverter.isWebP(mime: result.mimeType, fileURL: result.fileURL),
           let jpg = ImageConverter.webpToJPEG(result.fileURL) {
            sourceFileURL = jpg
            mimeType = "image/jpeg"
        }
        defer {
            if sourceFileURL != result.fileURL { try? FileManager.default.removeItem(at: sourceFileURL) }
        }

        let finalName = MediaNaming.applyMime(mimeType, to: filename)
        if wantImage && !MediaNaming.isImage(mime: mimeType, filename: finalName) {
            throw DownloadError.notAnImage
        }
        let isVideo = MediaNaming.isVideo(mime: mimeType, filename: finalName)
        let isWebm = finalName.lowercased().hasSuffix(".webm")
        let destination = AppSettings.shared.effectiveDestination

        // Photos rejects webm outright. The cloud takes anything, so webm only
        // fails when Photos is the sole target — failing early gives a clear
        // error instead of an opaque PHPhotosError.
        if isWebm && destination == .photos {
            throw DownloadError.webmUnsupported
        }

        // Photos keeps the resource's file name; rename the temp file so the
        // asset is not called "download-3F2A.tmp".
        let named = sourceFileURL.deletingLastPathComponent().appendingPathComponent(finalName)
        try? FileManager.default.removeItem(at: named)
        try FileManager.default.moveItem(at: sourceFileURL, to: named)
        defer { try? FileManager.default.removeItem(at: named) }

        var wrote: [String] = []
        var problems: [String] = []

        if destination != .photos, let cloud = CloudClient.fromSettings() {
            phase = .uploading(name: finalName)
            do {
                // Site etiketi buradan gider: arşivde dosya doğru sekmenin altına
                // düşsün diye. Kaynağı bilinmiyorsa sunucu "Other" kullanır.
                let key = try await cloud.upload(fileURL: named, preferredName: finalName, site: site)
                wrote.append("Bulut")
                // Yalnız buluta gidiyorsa (cihazda kopya yok) HUD dokunuşu bulut
                // galerisini açsın; hem cihaz hem bulut ise aşağıdaki cihaz kaydı
                // bu değeri ezer, çünkü yerel öğe anında açılır.
                if destination == .cloud {
                    savedReveal = .cloud(key: key)
                }
            } catch {
                problems.append("bulut: \(error.localizedDescription)")
            }
        }

        if destination != .cloud && !isWebm {
            phase = .saving(name: finalName)
            do {
                let assetId = try await PhotoSaver.save(fileURL: named, filename: finalName, isVideo: isVideo)
                let recordId = records.add(assetId: assetId, filename: finalName, site: site, sourceURL: sourceUrl, isVideo: isVideo)
                savedReveal = .device(recordId)
                wrote.append("Fotoğraflar")
            } catch {
                problems.append("Fotoğraflar: \(error.localizedDescription)")
            }
        }

        guard !wrote.isEmpty else {
            throw DownloadError.nothingSaved(problems.joined(separator: " | "))
        }
        var summary = "Kaydedildi: \(wrote.joined(separator: " + "))"
        if !problems.isEmpty { summary += " (⚠ \(problems.joined(separator: ", ")))" }
        phase = .done(summary)
        // Galeriye atlanabiliyorsa fiş daha uzun kalsın: dokunmaya vakit olsun.
        scheduleDismiss(after: savedReveal != nil ? 6 : 1.8)
    }
}

enum DownloadError: LocalizedError {
    case badURL
    case httpStatus(Int)
    case emptyBody
    case notAnImage
    case webmUnsupported
    case nothingSaved(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "geçersiz URL"
        case .httpStatus(let code): return "HTTP \(code)"
        case .emptyBody: return "boş yanıt"
        case .notAnImage: return "görsel değil"
        case .webmUnsupported: return "webm Fotoğraflar'a kaydedilemiyor (Bulut hedefi webm alır)"
        case .nothingSaved(let detail): return "hiçbir hedefe yazılamadı — \(detail)"
        }
    }
}

/// Streams a response body to a temp file with progress callbacks. One
/// instance per fetch; the URLSession delegate dance stays contained here.
final class StreamFetcher: NSObject, URLSessionDataDelegate {
    struct Result {
        let fileURL: URL
        let mimeType: String
    }

    private var continuation: CheckedContinuation<Result, Error>?
    private var handle: FileHandle?
    private var fileURL: URL?
    private var mimeType = ""
    private var received: Int64 = 0
    private var expected: Int64 = 0
    private var lastReport = Date.distantPast
    private var onProgress: ((Int64, Int64) -> Void)?
    private var session: URLSession?
    private var task: URLSessionDataTask?

    func fetch(request: URLRequest, onProgress: @escaping (Int64, Int64) -> Void) async throws -> Result {
        self.onProgress = onProgress
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        defer { session.finishTasksAndInvalidate() }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let task = session.dataTask(with: request)
            self.task = task
            task.resume()
        }
    }

    /// Aborts the transfer. The delegate's didCompleteWithError then resumes the
    /// continuation with NSURLErrorCancelled, so the caller unwinds normally.
    func cancel() {
        task?.cancel()
    }

    private func finish(_ outcome: Swift.Result<Result, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        try? handle?.close()
        handle = nil
        switch outcome {
        case .success(let value): continuation.resume(returning: value)
        case .failure(let error):
            if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
            continuation.resume(throwing: error)
        }
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            finish(.failure(DownloadError.httpStatus(http.statusCode)))
            completionHandler(.cancel)
            return
        }
        mimeType = response.mimeType ?? ""
        expected = response.expectedContentLength
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("rg-\(UUID().uuidString).bin")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        fileURL = url
        handle = try? FileHandle(forWritingTo: url)
        guard handle != nil else {
            finish(.failure(CocoaError(.fileWriteUnknown)))
            completionHandler(.cancel)
            return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        handle?.write(data)
        received += Int64(data.count)
        // Repainting on every chunk costs more than the readout is worth.
        let now = Date()
        if now.timeIntervalSince(lastReport) > 0.12 {
            lastReport = now
            onProgress?(received, max(0, expected))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            finish(.failure(error))
            return
        }
        guard let fileURL, received > 0 else {
            finish(.failure(DownloadError.emptyBody))
            return
        }
        onProgress?(received, max(0, expected))
        finish(.success(Result(fileURL: fileURL, mimeType: mimeType)))
    }
}
