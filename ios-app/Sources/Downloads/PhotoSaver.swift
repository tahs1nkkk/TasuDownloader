import Photos

enum PhotoSaverError: LocalizedError {
    case accessDenied
    case noAssetCreated

    var errorDescription: String? {
        switch self {
        case .accessDenied: return "Fotoğraflar erişimi verilmedi (Ayarlar → RipSnip)"
        case .noAssetCreated: return "Fotoğraflar öğeyi kabul etmedi"
        }
    }
}

/// Writes a finished file straight into the Photos library — the native
/// replacement for the extension's share-sheet hop. One permission prompt on
/// first use, silent afterwards.
enum PhotoSaver {
    static func save(fileURL: URL, filename: String, isVideo: Bool) async throws -> String {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw PhotoSaverError.accessDenied
        }

        var localIdentifier: String?
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = filename
            request.addResource(with: isVideo ? .video : .photo, fileURL: fileURL, options: options)
            localIdentifier = request.placeholderForCreatedAsset?.localIdentifier
        }
        guard let localIdentifier else { throw PhotoSaverError.noAssetCreated }
        return localIdentifier
    }
}
