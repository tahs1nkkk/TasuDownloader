// Generated from shared/core/download-contract.js; run npm run build:shared. Do not edit.
import Foundation

struct DownloadRequest: Decodable {
    let type: String
    let contractVersion: Int
    let urls: [String]
    let imageMode: Bool
    let downloadAll: Bool
    let fallbackSourceUrl: String
    let scrolllerSourceUrl: String
    let namingUrl: String?
    let folderName: String
    let downloadPath: String
    let subFolder: String
    let site: String
    let source: String
    let expectedSlug: String
    let skipReachability: Bool
    let preserveAlternatives: Bool
    let allowRipsnipFallback: Bool
    let preferRipsnipWhenOpen: Bool
    let fallbackOnNoTransfer: Bool
    let transferTimeoutMs: Double

    static func parse(_ message: [String: Any], core: SharedCore = .shared) throws -> DownloadRequest {
        try core.decode(DownloadRequest.self, operation: "download", input: message)
    }
}
