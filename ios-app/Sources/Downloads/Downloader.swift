import Foundation

/// Answers DIRECT_DOWNLOAD exactly like the Orion bridge did, but natively:
/// URLSession streams to a temp file (no whole-video-in-JS-memory), and the
/// finished file goes straight into Photos — no share sheet, no second tap.
@MainActor
final class Downloader: NSObject, ObservableObject {
    static let shared = Downloader()

    enum Phase: Equatable {
        case idle
        case fetching(name: String, received: Int64, total: Int64, startedAt: Date)
        case saving(name: String)
        case done(String)
        case failed(String)
    }

    @Published var phase: Phase = .idle
    private var dismissTask: Task<Void, Never>?

    func flash(_ message: String) {
        phase = .failed(message)
        scheduleDismiss(after: 2.2)
    }

    private func scheduleDismiss(after seconds: Double) {
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.phase = .idle
        }
    }

    // MARK: - DIRECT_DOWNLOAD

    func handleDirectDownload(
        _ message: [String: Any],
        pageURL: URL?,
        cookies: [HTTPCookie],
        userAgent: String,
        records: DownloadRecordStore
    ) async -> [String: Any] {
        let rawUrls = (message["urls"] as? [Any] ?? []).compactMap { $0 as? String }
        var seen = Set<String>()
        let urls = rawUrls.filter { $0.lowercased().hasPrefix("http") && seen.insert($0).inserted }
        guard !urls.isEmpty else {
            flash("İndirilecek URL bulunamadı")
            return ["ok": false, "error": "IOS01: indirilecek URL yok"]
        }

        let wantImage = message["imageMode"] as? Bool ?? false
        let downloadAll = message["downloadAll"] as? Bool ?? false
        let fallbackOnNoTransfer = message["fallbackOnNoTransfer"] as? Bool ?? false
        let transferTimeoutMs = message["transferTimeoutMs"] as? Double ?? 2500
        let namingUrl = message["namingUrl"] as? String
        let sourceUrl = (message["fallbackSourceUrl"] as? String) ?? pageURL?.absoluteString ?? ""
        let site = MediaNaming.site(for: sourceUrl.isEmpty ? (urls.first ?? "") : sourceUrl)

        var errors: [String] = []

        if downloadAll {
            var saved = 0
            for url in urls {
                do {
                    try await fetchAndSave(
                        url, namingUrl: url, site: site, sourceUrl: sourceUrl, wantImage: wantImage,
                        pageURL: pageURL, cookies: cookies, userAgent: userAgent,
                        idleTimeout: 120, records: records
                    )
                    saved += 1
                } catch {
                    errors.append("\(url): \(error.localizedDescription)")
                }
            }
            if saved > 0 {
                phase = .done("\(saved) dosya kaydedildi")
                scheduleDismiss(after: 2.0)
                return ["ok": true, "mode": "queued", "count": saved]
            }
            return failAll(urls: urls, errors: errors)
        }

        // Single-item mode: candidates are ordered best-first; stop at the
        // first one that delivers bytes of the right kind. A short idle
        // timeout applies only while a fallback is still queued behind.
        for (index, url) in urls.enumerated() {
            let hasFallback = index < urls.count - 1
            let idleTimeout = hasFallback && fallbackOnNoTransfer ? max(0.5, transferTimeoutMs / 1000) : 120
            do {
                try await fetchAndSave(
                    url, namingUrl: namingUrl ?? url, site: site, sourceUrl: sourceUrl, wantImage: wantImage,
                    pageURL: pageURL, cookies: cookies, userAgent: userAgent,
                    idleTimeout: idleTimeout, records: records
                )
                return ["ok": true, "mode": wantImage ? "image" : "media", "url": url]
            } catch {
                errors.append("\(url): \(error.localizedDescription)")
            }
        }
        return failAll(urls: urls, errors: errors)
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
        let result = try await fetcher.fetch(request: request) { [weak self] received, total in
            Task { @MainActor in
                guard let self, case .fetching(let name, _, _, let started) = self.phase else { return }
                self.phase = .fetching(name: name, received: received, total: total, startedAt: started)
            }
        }
        defer { try? FileManager.default.removeItem(at: result.fileURL) }

        let finalName = MediaNaming.applyMime(result.mimeType, to: filename)
        if wantImage && !MediaNaming.isImage(mime: result.mimeType, filename: finalName) {
            throw DownloadError.notAnImage
        }
        let isVideo = MediaNaming.isVideo(mime: result.mimeType, filename: finalName)
        if finalName.lowercased().hasSuffix(".webm") {
            // Photos rejects webm outright; failing early gives a clear error
            // instead of an opaque PHPhotosError.
            throw DownloadError.webmUnsupported
        }

        phase = .saving(name: finalName)
        // Photos keeps the resource's file name; rename the temp file so the
        // asset is not called "download-3F2A.tmp".
        let named = result.fileURL.deletingLastPathComponent().appendingPathComponent(finalName)
        try? FileManager.default.removeItem(at: named)
        try FileManager.default.moveItem(at: result.fileURL, to: named)
        defer { try? FileManager.default.removeItem(at: named) }

        let assetId = try await PhotoSaver.save(fileURL: named, filename: finalName, isVideo: isVideo)
        records.add(assetId: assetId, filename: finalName, site: site, sourceURL: sourceUrl, isVideo: isVideo)

        phase = .done("Fotoğraflara kaydedildi")
        scheduleDismiss(after: 1.8)
    }
}

enum DownloadError: LocalizedError {
    case badURL
    case httpStatus(Int)
    case emptyBody
    case notAnImage
    case webmUnsupported

    var errorDescription: String? {
        switch self {
        case .badURL: return "geçersiz URL"
        case .httpStatus(let code): return "HTTP \(code)"
        case .emptyBody: return "boş yanıt"
        case .notAnImage: return "görsel değil"
        case .webmUnsupported: return "webm Fotoğraflar'a kaydedilemiyor"
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

    func fetch(request: URLRequest, onProgress: @escaping (Int64, Int64) -> Void) async throws -> Result {
        self.onProgress = onProgress
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        defer { session.finishTasksAndInvalidate() }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            session.dataTask(with: request).resume()
        }
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
