import SwiftUI

struct RootView: View {
    @EnvironmentObject private var browser: BrowserController
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: Tab = .browser

    enum Tab: Hashable {
        case browser
        case lists
        case gallery
        case settings
    }

    var body: some View {
        TabView(selection: selection) {
            BrowserScreen()
                .tag(Tab.browser)
                .tabItem { Label("Tarayıcı", systemImage: "globe") }
            ListsScreen()
                .tag(Tab.lists)
                .tabItem { Label("Listeler", systemImage: "bookmark") }
            GalleryScreen()
                .tag(Tab.gallery)
                .tabItem { Label("Galeri", systemImage: "photo.on.rectangle") }
            SettingsScreen()
                .tag(Tab.settings)
                .tabItem { Label("Ayarlar", systemImage: "gearshape") }
        }
        // "Open in browser" from the lists tab: front the browser tab.
        .onChange(of: browser.wantsBrowserTab) { _, wants in
            if wants {
                tab = .browser
                browser.wantsBrowserTab = false
            }
        }
        // Coming back to the foreground is the natural moment to pull what the
        // PC side may have edited overnight.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { SiteListStore.shared.scheduleSync() }
        }
    }

    /// SwiftUI calls this setter even when the tap lands on the tab that is
    /// already selected, which is what makes "tap Tarayıcı again to go home"
    /// possible without stealing a corner of the page for a home button.
    private var selection: Binding<Tab> {
        Binding(
            get: { tab },
            set: { next in
                if next == .browser && tab == .browser { browser.goHome() }
                tab = next
            }
        )
    }
}
