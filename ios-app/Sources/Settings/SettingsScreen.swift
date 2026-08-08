import SwiftUI

/// Every row here changes something you can see. The switches that used to sit
/// in this screen — master on/off, per-site button toggles, "show the floating
/// button" — are gone: an app whose only job is downloading has no honest use
/// for a switch that stops it downloading, and the site buttons are hidden
/// machinery now rather than UI.
struct SettingsScreen: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var browser: BrowserController
    @ObservedObject private var favicons = FaviconLoader.shared
    @State private var connectionReport: String?
    @State private var testing = false
    /// Önbellek boyutu düğmenin etiketinde duruyor; disk okuması olduğu için
    /// her çizimde değil, ekran açılışında ve sıfırlamadan sonra ölçülüyor.
    @State private var cacheSize: Int64 = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Boyut")
                        Spacer()
                        Text("\(Int(settings.fabSize)) px").foregroundStyle(.secondary)
                    }
                    Slider(value: $settings.fabSize, in: 44...78, step: 2)
                    fabPreview
                    placementGrid
                } header: {
                    Text("Yüzen indirme butonu")
                } footer: {
                    Text("Kısa dokunuş ekranın ortasındaki medyayı indirir. Basılı tutunca seçim modu açılır: ekran kararır, medyalara dokunarak seçersin (neon çerçeve), butona tekrar basınca seçilenler iner. Konumu ızgaradan seç ya da butonu sayfada sürükleyip bırak — sürüklediğinde konum kendiliğinden \"Serbest\"e geçer.")
                }

                Section {
                    TextField("https://tasu-arsiv.workers.dev", text: $settings.archiveURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        // Bir URL alanı; parola yöneticisine "kullanıcı adı" gibi
                        // görünmesin ki alttaki anahtarla eşleşip "giriş kaydet"
                        // önerisi çıkmasın.
                        .textContentType(.URL)
                    SecureField("Gizli anahtar", text: $settings.sharedToken)
                        // iOS bunu parola alanı sayınca her açılışta "Güçlü Parola /
                        // Kaydet" balonu çıkıyordu. .oneTimeCode ile alan bir giriş
                        // formunun parçası sayılmaz; QuickType parola önerisi ve
                        // kaydetme istemi kapanır (ortada gerçek bir OTP olmadığı
                        // için OTP önerisi de belirmez).
                        .textContentType(.oneTimeCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if settings.cloudConfigured {
                        Picker("İndirilenler nereye", selection: $settings.downloadDestination) {
                            ForEach(DownloadDestination.allCases) { destination in
                                Text(destination.label).tag(destination)
                            }
                        }
                        Picker("İndirme hızı", selection: $settings.bwDown) {
                            ForEach(Self.bwSteps, id: \.self) { Text(Self.bwLabel($0)).tag($0) }
                        }
                        Picker("Yükleme hızı", selection: $settings.bwUp) {
                            ForEach(Self.bwSteps, id: \.self) { Text(Self.bwLabel($0)).tag($0) }
                        }
                    }
                    Button {
                        testConnection()
                    } label: {
                        if testing {
                            HStack { Text("Sınanıyor…"); Spacer(); ProgressView() }
                        } else {
                            Text("Bağlantıyı sına")
                        }
                    }
                    .disabled(testing || !settings.cloudConfigured)
                    if let connectionReport {
                        Text(connectionReport)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Bulut ve Eşitleme")
                } footer: {
                    Text("Cloudflare Worker adresin — listeler ve medya (R2) buradan gelir. Tek gizli anahtar (ARCHIVE_TOKEN) uygulamayı açar; anahtar Keychain'de saklanır. Kurulum: depodaki cloud/README.md. Hedef \"Bulut\" iken indirilenler cihazda yer kaplamaz; webm de buluta inebilir. Hız sınırını sunucu uyguluyor: bağlantı başına, mobil veride kotayı korumak için.")
                }

                Section {
                    Toggle("Yükleyince cihazdan sil", isOn: $settings.deleteAfterUpload)
                    if settings.cloudConfigured {
                        Toggle("Bulut medyasını önbellekte tut", isOn: $settings.cacheCloudMedia)
                        Button(role: .destructive) {
                            CloudMediaCache.shared.clear()
                            cacheSize = CloudMediaCache.shared.size()
                        } label: {
                            HStack {
                                Text("Önbelleği sıfırla")
                                Spacer()
                                Text(CloudMediaCache.humanSize(cacheSize))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(cacheSize == 0)
                    }
                } header: {
                    Text("Galeri")
                } footer: {
                    Text("Buluta yükleme bittiğinde dosya cihazdan da silinir — silmeyi Fotoğraflar kendi onay penceresiyle sorar ve yalnız yüklemesi başarılı olanlar silinir. Önbellek açıkken açtığın bulut medyası telefonda saklanır; Galeri → Bulut'ta \"Seç → Tümü → Önbelleğe al\" ile tamamını indirip ağ yokken de açabilirsin.")
                }

                Section {
                    Toggle("Kullanıcı arama butonu", isOn: $settings.searchOverlayEnabled)
                } header: {
                    Text("Reddit")
                } footer: {
                    Text("Reddit sayfalarında karşı köşede beliren saydam arama balonu. Bir dokunuş belirginleştirir, ikinci dokunuş arama menüsünü açar.")
                }

                Section {
                    ForEach(SiteCatalog.sites) { site in
                        Button {
                            browser.openSite(site)
                        } label: {
                            HStack(spacing: 12) {
                                siteBadge(site)
                                Text(site.name).foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("Site simgelerini yenile") { favicons.clearCache() }
                } header: {
                    Text("Desteklenen siteler")
                } footer: {
                    Text("Bu liste derleme sırasında üretilir; yeni bir site eklendiğinde ana sayfaya kendiliğinden gelir.")
                }

                Section {
                    Button("Ana sayfaya dön") { browser.goHome() }
                    Button("Sayfayı yenile") { browser.reload() }
                    Link("Fotoğraflar iznini yönet", destination: URL(string: UIApplication.openSettingsURLString)!)
                } header: {
                    Text("Diğer")
                } footer: {
                    Text("Bir siteyi açtıktan sonra adres çubuğu gizlenir; ana sayfaya Tarayıcı sekmesine tekrar dokunarak ya da soldan sağa kaydırarak dönersin. Fotoğraflar'da Gizli klasörüne taşınanlar galeride de görünmez.")
                }
            }
            .navigationTitle("Ayarlar")
            .task { cacheSize = CloudMediaCache.shared.size() }
        }
    }

    /// Web tarafındaki kaydırıcıyla aynı basamaklar (app.js → BW_STEPS); 0
    /// sınırsız demek.
    private static let bwSteps = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500]

    private static func bwLabel(_ mbps: Int) -> String {
        mbps == 0 ? "Sınırsız" : "\(mbps) Mbps"
    }

    /// Konum seçimi, ekranın kendisine benzeyen 3×3 bir ızgara. Ortadaki hücre
    /// "Serbest": sürükleyip bıraktığın nokta orada saklanır, dokununca oraya
    /// geri döner. Dokuz kutu, dokuz olası yer — hangisinin ne olduğunu
    /// açıklamaya gerek kalmıyor.
    private var placementGrid: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                placementCell(.topLeft); placementCell(.topCenter); placementCell(.topRight)
            }
            HStack(spacing: 6) {
                placementCell(.midLeft); placementCell(.custom); placementCell(.midRight)
            }
            HStack(spacing: 6) {
                placementCell(.bottomLeft); placementCell(.bottomCenter); placementCell(.bottomRight)
            }
            Text(settings.fabAnchor.label)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func placementCell(_ anchor: FabAnchor) -> some View {
        let on = settings.fabAnchor == anchor
        return Button {
            settings.fabAnchor = anchor
        } label: {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(on ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.quaternary))
                .frame(height: 34)
                .overlay {
                    if anchor == .custom {
                        Image(systemName: "hand.draw")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(on ? Color.white : Color.secondary)
                    } else {
                        Circle()
                            .fill(on ? Color.white : Color.secondary.opacity(0.55))
                            .frame(width: 9, height: 9)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(anchor.label)
    }

    /// Shows the slider's effect at true size, so the number does not have to
    /// be imagined against a page that is on another tab.
    private var fabPreview: some View {
        HStack {
            Spacer()
            Image(systemName: "arrow.down.to.line")
                .font(.system(size: settings.fabSize * 0.36, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: settings.fabSize, height: settings.fabSize)
                .liquidGlass(in: Circle(), tint: .accentColor, interactive: false)
            Spacer()
        }
        .padding(.vertical, 6)
        .animation(.easeOut(duration: 0.12), value: settings.fabSize)
    }

    /// One Worker, one check: listing the media proves the URL, the token, and
    /// R2 all work at once. The list request also carries the list-sync path, so
    /// a green result here means both halves of the app are reachable.
    private func testConnection() {
        testing = true
        connectionReport = nil
        Task {
            guard let cloud = CloudClient.fromSettings() else {
                connectionReport = "Önce adres ve anahtar gir."
                testing = false
                return
            }
            do {
                let files = try await cloud.list()
                connectionReport = "Bağlantı: ✓ (\(files.count) medya dosyası)"
            } catch {
                connectionReport = "Bağlantı: ✗ \(error.localizedDescription)"
            }
            testing = false
        }
    }

    private func siteBadge(_ site: SupportedSite) -> some View {
        Group {
            if let icon = favicons.icon(for: site) {
                Image(uiImage: icon).resizable().scaledToFill()
            } else {
                site.color.overlay(
                    Text(site.initial)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                )
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .onAppear { favicons.load(site) }
    }
}
