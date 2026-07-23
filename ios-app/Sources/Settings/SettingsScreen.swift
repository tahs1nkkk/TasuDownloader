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
                    Toggle("Solda dursun", isOn: $settings.fabOnLeft)
                } header: {
                    Text("Yüzen indirme butonu")
                } footer: {
                    Text("Kısa dokunuş ekranın ortasındaki medyayı indirir. Basılı tutunca seçim modu açılır: ekran kararır, medyalara dokunarak seçersin (neon çerçeve), butona tekrar basınca seçilenler iner. Bu boyut yalnızca bu butonu etkiler.")
                }

                Section {
                    TextField("https://makine.tailnet.ts.net", text: $settings.cloudBaseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    TextField("https://tasu-arsiv.pages.dev", text: $settings.syncBaseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Gizli anahtar", text: $settings.sharedToken)
                    if settings.cloudConfigured {
                        Picker("İndirilenler nereye", selection: $settings.downloadDestination) {
                            ForEach(DownloadDestination.allCases) { destination in
                                Text(destination.label).tag(destination)
                            }
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
                    .disabled(testing || (!settings.cloudConfigured && !settings.syncConfigured))
                    if let connectionReport {
                        Text(connectionReport)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Bulut ve Eşitleme")
                } footer: {
                    Text("İlk satır PC'deki medya sunucusu (Tailscale Funnel adresi), ikincisi web arşiv sitesi. Tek gizli anahtar ikisini de açar; anahtar Keychain'de saklanır. Kurulum: depodaki cloud/README.md. Hedef \"Bulut\" iken indirilenler cihazda yer kaplamaz; webm de buluta inebilir.")
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
        }
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

    private func testConnection() {
        testing = true
        connectionReport = nil
        Task {
            var parts: [String] = []
            if let cloud = CloudClient.fromSettings() {
                do {
                    let health = try await cloud.health()
                    var line = "Medya sunucusu: ✓ (\(health.files) dosya"
                    if let free = health.freeBytes {
                        line += ", \(String(format: "%.0f", Double(free) / 1_073_741_824)) GB boş"
                    }
                    line += ")"
                    parts.append(line)
                } catch {
                    parts.append("Medya sunucusu: ✗ \(error.localizedDescription)")
                }
            }
            if settings.syncConfigured,
               let base = URL(string: settings.syncBaseURL.trimmingCharacters(in: .whitespaces)) {
                var request = URLRequest(url: base.appendingPathComponent("api/health"))
                request.setValue("Bearer \(settings.sharedToken)", forHTTPHeaderField: "Authorization")
                do {
                    let (_, response) = try await URLSession.shared.data(for: request)
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    parts.append(code == 200 ? "Web arşivi: ✓" : "Web arşivi: ✗ HTTP \(code)")
                } catch {
                    parts.append("Web arşivi: ✗ \(error.localizedDescription)")
                }
            }
            connectionReport = parts.isEmpty ? "Önce adres ve anahtar gir." : parts.joined(separator: "\n")
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
