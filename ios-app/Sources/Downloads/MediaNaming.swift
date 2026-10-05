import Foundation

/// Platform filename/MIME handling. Site identity and variant trimming delegate
/// to the same bundled rules used by Edge and Orion.
enum MediaNaming {
    static let videoExtensions: Set<String> = ["mp4", "m4v", "mov", "webm"]
    static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "webp", "gif", "heic"]

    static func site(for urlString: String) -> String {
        guard let host = URL(string: urlString)?.host?.lowercased() else { return "Other" }
        return SharedCore.shared.value(String.self, operation: "siteForHost", input: host, fallback: "Other")
    }

    static func cleanFileName(_ value: String) -> String {
        var text = value.replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
        text = text.replacingOccurrences(of: "[^A-Za-z0-9._-]+", with: "-", options: .regularExpression)
        text = text.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        if text.isEmpty { text = "video" }
        return String(text.prefix(80))
    }

    /// Strips a trailing variant/resolution tag from a file stem so downloads are
    /// named `<slug>` not `<slug>-large` (RedGifs) or `<slug>_1920x1080` (Scrolller).
    /// Only trailing tokens go, and never the whole name.
    static func stripVariantSuffix(_ stem: String) -> String {
        SharedCore.shared.value(String.self, operation: "stripVariant", input: stem, fallback: stem)
    }

    static func fileExtension(of urlString: String) -> String {
        guard let url = URL(string: urlString) else { return "mp4" }
        let ext = url.pathExtension.lowercased()
        if videoExtensions.contains(ext) || imageExtensions.contains(ext) { return ext }
        return "mp4"
    }

    static func fileName(for urlString: String, site: String) -> String {
        let ext = fileExtension(of: urlString)
        var label = "redgifs-video"
        if let url = URL(string: urlString) {
            // Coomer passes the original name in the `f` query parameter.
            let supplied = site == "Coomer"
                ? URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "f" })?.value ?? ""
                : ""
            let leaf = url.pathComponents.last(where: { $0 != "/" && !$0.isEmpty }) ?? url.host ?? label
            label = cleanFileName(supplied.isEmpty ? leaf : supplied)
        }
        for known in videoExtensions.union(imageExtensions) where label.lowercased().hasSuffix(".\(known)") {
            label = String(label.dropLast(known.count + 1))
        }
        label = stripVariantSuffix(label)
        if label.isEmpty { label = "media" }
        return "\(label).\(ext)"
    }

    /// A URL like `.../file` with an image/mp4 response still needs the right
    /// extension or Photos misreads the resource type.
    static func applyMime(_ mime: String, to filename: String) -> String {
        let map: [String: String] = [
            "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
            "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
            "image/gif": "gif", "image/heic": "heic"
        ]
        guard let expected = map[mime.lowercased()] else { return filename }
        let current = (filename as NSString).pathExtension.lowercased()
        if current == expected || (expected == "jpg" && current == "jpeg") { return filename }
        let stem = (filename as NSString).deletingPathExtension
        return "\(stem).\(expected)"
    }

    static func isVideo(mime: String, filename: String) -> Bool {
        if mime.lowercased().hasPrefix("video/") { return true }
        return videoExtensions.contains((filename as NSString).pathExtension.lowercased())
    }

    static func isImage(mime: String, filename: String) -> Bool {
        if mime.lowercased().hasPrefix("image/") { return true }
        return imageExtensions.contains((filename as NSString).pathExtension.lowercased())
    }
}
