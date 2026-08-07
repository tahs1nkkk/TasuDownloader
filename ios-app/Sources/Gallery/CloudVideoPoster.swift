import AVFoundation
import SwiftUI
import UIKit

/// Bulut ızgarasında videoların kapağı R2'de `.thumb/…` altında durur, ama onu
/// bir kez birinin üretmesi gerekir. Web arşivi bunu tarayıcıda yapıyor; yalnız
/// telefondan bakan biri için kapak hiç oluşmuyordu ve her video "film şeridi"
/// simgesiyle kalıyordu. Burada aynı işi iOS yapar: ilk kareyi yerel üretip hem
/// hücreye çizer hem de `/api/thumb`'a bırakır, böylece web ve sonraki açılışlar
/// da hazır kapağı alır.
///
/// Yalnız sunucu kapağı 404 verince (CloudTile'ın `.failure` dalı) devreye girer.
/// Üretilen kare oturum boyunca bellekte tutulur ki kaydırırken tekrar tekrar
/// üretilmesin.

/// Oturum içi kapak önbelleği. `NSCache` kendi başına iş parçacığı güvenlidir.
///
/// Başarılı kareler önbellekte tutulur — hücre kaydırılıp geri gelince yeniden
/// üretilmez, doğrudan önbellekten gelir. Başarısızlıklar (bozuk dosya, iOS'un
/// çözemediği kodek — ör. webm) ayrı bir kümede işaretlenir ki her görünüşte
/// boşuna yeniden denenmesin. Bir üretim yarıda kaydırılırsa `.task` iptal edilir
/// ve önbellek boş kalır; geri dönüşte yeni bir deneme yapılır — bu yüzden
/// "denendi" değil yalnız "başarısız oldu" işaretliyoruz.
final class CloudPosterCache {
    static let shared = CloudPosterCache()
    private let store = NSCache<NSString, UIImage>()
    private var failed = Set<String>()
    private let lock = NSLock()

    func image(for key: String) -> UIImage? { store.object(forKey: key as NSString) }

    func set(_ image: UIImage, for key: String) { store.setObject(image, forKey: key as NSString) }

    func isFailed(_ key: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return failed.contains(key)
    }

    func markFailed(_ key: String) {
        lock.lock(); defer { lock.unlock() }
        failed.insert(key)
    }
}

/// Bir video akışından ilk kareyi çeker. Uzaktaki dosyanın tamamı inmez —
/// `AVAssetImageGenerator` yalnız moov atomunu ve gereken kareyi ister.
enum VideoPosterMaker {
    static func poster(from url: URL) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 480, height: 480)
        // Tam sıfırıncı kare çoğu videoda siyah; biraz ileri sarıp en yakın anahtar
        // kareyi almak için geniş tolerans veriyoruz (ucuz).
        generator.requestedTimeToleranceBefore = CMTime(seconds: 1, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 1, preferredTimescale: 600)
        let time = CMTime(seconds: 0.6, preferredTimescale: 600)
        do {
            let cgImage = try await generator.image(at: time).image
            return UIImage(cgImage: cgImage)
        } catch {
            return nil
        }
    }
}

/// Sunucu kapağı yoksa gösterilen kare: yerelde üretir, çizer, `/api/thumb`'a
/// bırakır. Üretemezse (bozuk dosya, desteklenmeyen kodek) film şeridi kalır.
struct CloudVideoPoster: View {
    let file: CloudFile
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "film")
                    .font(.system(size: 22))
                    .foregroundStyle(.secondary)
            }
        }
        .task(id: file.key) { await generateIfNeeded() }
    }

    @MainActor
    private func generateIfNeeded() async {
        if let cached = CloudPosterCache.shared.image(for: file.key) {
            image = cached
            return
        }
        // Daha önce üretilemediği bilinen kareyi (webm gibi) yeniden deneme.
        guard !CloudPosterCache.shared.isFailed(file.key) else { return }
        guard let cloud = CloudClient.fromSettings() else { return }
        guard let poster = await VideoPosterMaker.poster(from: cloud.streamURL(key: file.key)) else {
            CloudPosterCache.shared.markFailed(file.key)
            return
        }
        CloudPosterCache.shared.set(poster, for: file.key)
        image = poster
        // Sunucuya bırak ki web ve sonraki açılışlar videoyu hiç indirmeden kapağı
        // alsın. En iyi çaba: başarısız olsa da yerel kare zaten göründü.
        if let data = poster.jpegData(compressionQuality: 0.72) {
            await cloud.uploadThumb(key: file.key, jpeg: data)
        }
    }
}
