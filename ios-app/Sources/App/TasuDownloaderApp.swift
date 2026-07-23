import SwiftUI

@main
struct TasuDownloaderApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(AppSettings.shared)
                .environmentObject(DownloadRecordStore.shared)
                .environmentObject(BrowserController.shared)
        }
    }
}
