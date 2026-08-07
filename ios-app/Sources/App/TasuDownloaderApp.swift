import SwiftUI

@main
struct TasuDownloaderApp: App {
    /// Arşiv görselleri her açılışta yeniden inmesin diye disk önbelleği
    /// büyütülür. Worker medya ve kapakları `immutable` olarak işaretliyor ve
    /// R2 anahtarları hiç değişmiyor, dolayısıyla bir kez inen kare sonsuza dek
    /// geçerli: `AsyncImage` → `URLSession.shared` → `URLCache.shared` zinciri
    /// ağa hiç çıkmadan cevaplayabilir. Varsayılan 10 MB'lık disk kotası birkaç
    /// düzine kapaktan sonra doluyordu; 1 GB, birkaç bin küçük resim demek.
    init() {
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024,
                                   diskCapacity: 1024 * 1024 * 1024,
                                   diskPath: "tasu-media")
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(AppSettings.shared)
                .environmentObject(DownloadRecordStore.shared)
                .environmentObject(BrowserController.shared)
                .environmentObject(SiteListStore.shared)
        }
    }
}
