# TasuDownloader — iOS uygulaması

Orion eklentisinin native hali: içinde tarayıcısı olan bir SwiftUI uygulaması.
Site handler'ları (RedGifs / Reddit / Scrolller / Coomer / Instagram) yine
`edge-extension/`'dan derleme anında kopyalanır — asla çatallanmaz.

Eklentiye göre kazançlar:

| | Orion eklentisi | TasuDownloader uygulaması |
|---|---|---|
| Kayıt | fetch → paylaşım sayfası → "Kaydet" | **doğrudan Fotoğraflar'a, tek dokunuş** |
| Büyük dosyalar | JS belleğine yüklenir | URLSession diske akıtır |
| Galeri | yok | Fotoğraflar aynası; **Gizli klasördekiler burada da gizli** |
| Reddit kullanıcı arama | sayfa içi panel | native overlay: saydam → dokun → 2.5 sn görünür → ikinci dokunuş menü → sonuçlar **varsayılan tarayıcıda sekmeler halinde** |
| Ayarlar | eklenti popup'ı | uygulamanın Ayarlar sekmesi (aç/kapat dahil) |
| Bedel | yok | **7 günde bir imza yenileme** (SideStore otomatikleştirir) |

iOS hiçbir uygulamanın başka bir uygulamanın üstüne çizim yapmasına izin
vermez; "overlay" bu yüzden uygulamanın kendi tarayıcısının içindedir.

## Mimari

```
ios-app/
  native-bridge.js       chrome.* → webkit.messageHandlers.rgNative köprüsü
  Sources/               SwiftUI: Browser / Gallery / Settings
  project.yml            XcodeGen spec'i (Xcode projesi CI'da üretilir)
  Resources/Assets.xcassets/  uygulama simgesi (1024², alfa kanalsız)
  Resources/generated/   scripts/build-ios-app-js.js çıktısı (git'e girmez)
```

`scripts/build-ios-app-js.js` üç enjeksiyon paketi üretir:

- `rg-core.js` — köprü + `common/settings.js` + mobil CSS (documentStart, izole dünya)
- `rg-handlers.js` — host korumalı site handler'ları (documentEnd, izole dünya)
- `rg-page-hook.js` — RedGifs pano kancası (documentStart, sayfa dünyası)

Handler'lar `chrome.runtime.sendMessage` çağırdığını sanır; köprü bunu
uygulamaya iletir, uygulama URLSession ile indirir ve `PHPhotoLibrary` ile
sessizce Fotoğraflar'a yazar. İlk kullanımda tek bir izin sorusu çıkar, sonrası
sessizdir.

## Derleme (Mac gerekmez)

Her push'ta `.github/workflows/build-ios-app.yml` imzasız
`TasuDownloader.ipa` üretir (public depo → macOS dakikaları sınırsız ücretsiz).
Artifact indirmek GitHub girişi ister, release varlığı istemez; workflow bu
yüzden sabit URL'li "latest" release'ini de günceller:

```
https://github.com/tahs1nkkk/TasuDownloader/releases/download/latest/TasuDownloader.ipa
```

## Telefona kurulum (ücretsiz Apple ID)

İmzasız `.ipa`'yı telefon üstünde imzalayan bir yükleyici gerekir.

**Sideloadly** (kullandığımız yol): Windows'a [sideloadly.io](https://sideloadly.io)
kur → `.ipa`'yı **PC'ye** indir → iPhone'u USB ile bağla → `.ipa`'yı pencereye
sürükle → Apple ID → Start. Telefonda Ayarlar → Genel → VPN ve Cihaz Yönetimi →
geliştiriciye güven. iOS 16+ ayrıca Ayarlar → Gizlilik ve Güvenlik →
**Geliştirici Modu**'nun açık olmasını ister (tek seferlik, telefonu yeniden
başlatır).

Windows'ta Sideloadly, iTunes ve iCloud'un **Microsoft Store dışı** sürümlerini
ister (`AppleMobileDeviceSupport` sürücüsü için).

**AltStore Classic denendi, çalışmadı:** Apple ID'de Gelişmiş Veri Koruması
açıkken AltServer `-27952 / "Update iCloud for Windows to the latest version"`
ile giriş yapamıyor — Store dışı iCloud'un son sürümü 2020'den kalma 7.21 ve
ADP'yi desteklemiyor. Sideloadly v0.60 ADP desteğini eklediği için ADP'yi
kapatmaya gerek kalmıyor.

Ücretsiz Apple ID sınırları: imza **7 günde bir** yenilenmeli, aynı anda en
fazla 3 sideload uygulama.

## Kullanım

- **Tarayıcı** sekmesi ana sayfayla açılır: desteklenen her site için büyük bir
  kare. Simgeler sitenin kendi `apple-touch-icon`/favicon'undan çekilir, diske
  önbelleklenir, gelmezse sitenin renginden üretilir. Liste `sites.json`'dan
  gelir; o da `scripts/build-ios-app-js.js` içindeki `SITES` dizisinden üretilir,
  yani handler eklenen site kutuya da kendiliğinden düşer.
- Bir kareye dokununca **adres çubuğu kaybolur**, sayfa tüm ekranı alır. Ana
  sayfaya dönüş: **Tarayıcı sekmesine tekrar dokun** ya da **sol kenardan sağa
  kaydır** (kaydırma önce sayfa geçmişinde geri gider, geçmiş bitince ana
  sayfaya çıkar). Web görünümü yıkılmaz; "kaldığın yere dön" satırı seni aynı
  kaydırma konumuna geri koyar.
- Sitelerin üstündeki eklenti butonları **görünmez** — silinmediler, çünkü bir
  küçük resmin arkasındaki gerçek dosya URL'sini yalnızca onlar biliyor. Yüzen
  buton medyayı ekrandaki konumundan bulur, üstündeki butonu kendi tıklar.
- **Yüzen buton**: kısa dokunuş ekranın ortasındaki medyayı indirir. **Basılı
  tutunca seçim modu** açılır: ekran kararır, her medyaya dokunarak seçersin —
  seçilenler neon beyaz çerçeveyle parlar, kaydırıp seçmeye devam edebilirsin.
  Kendiliğinden kapanmaz; butona **tekrar basınca** seçilenlerin hepsi sırayla
  iner (buton onay işaretine döner, üzerinde sayaç rozeti). Basılı tutmak
  iptal eder.
- **Reddit'te** sol altta saydam arama butonu: bir dokunuş 2.5 saniyeliğine
  belirginleştirir, bu süre içinde ikinci dokunuş arama menüsünü açar; süre
  dolarsa tekrar saydamlaşır. Seçilen sağlayıcılar (Reddit / Old / Google /
  Bing) varsayılan tarayıcıda ayrı sekmeler olarak açılır.
- **Google/Discord girişleri** artık çalışır: `window.open` gerçek bir alt
  pencere açar ("Giriş penceresi"), OAuth bitince kendini kapatır. Eskiden bu
  akış beyaz ekranda kalıyordu.
- **Listeler** sekmesi: bağlantı listeleri. Tarayıcıda bir sayfadayken alt
  sağdaki + butonu sayfayı listeye ekler; öğeye dokununca uygulama içinde
  açılır. Ayarlar'da arşiv sitesi tanımlıysa listeler Supabase üzerinden web
  arşivine eşitlenir (bkz. `cloud/README.md`).
- **Galeri** sekmesi: Cihaz | Bulut. Cihaz tarafı Fotoğraflar aynasıdır; "Seç"
  ile çoklu seçim yapıp **Listeden kaldır / Fotoğraflar'dan sil / Buluta
  yükle** uygulanır (silmeyi iOS kendi onay kutusuyla sorar). Bulut tarafı
  PC'deki medya sunucusunu listeler; video/görsel doğrudan PC'den akar,
  kaydırarak silinir.
- **Ayarlar** sekmesi: yüzen butonun boyutu ve sol/sağ konumu, bulut/eşitleme
  adresleri + tek gizli anahtar + bağlantı sınaması, indirme hedefi
  (Fotoğraflar / Bulut / İkisi), Reddit arama balonu, site listesi. "İndirme
  katmanını kapat" ya da site site buton anahtarları yok — uygulamanın tek işi
  indirmek, ve sayfa butonları artık UI değil, gizli birer çözümleyici.

Arayüz iOS 26'nın **Liquid Glass** API'lerini kullanır (`glassEffect`,
`GlassEffectContainer`). Dağıtım hedefi 17.0 olduğu için hepsi
`if #available(iOS 26.0, *)` arkasında; eski sürümde `.ultraThinMaterial`
tabanlı taklit devreye girer. Tek yer: `Sources/Support/LiquidGlass.swift`.

## Sınırlar

- **webm** dosyalarını Fotoğraflar kabul etmez; hedef yalnız Fotoğraflar'sa
  indirme açık bir hata ile düşer. Hedefte Bulut varsa webm oraya normal iner.
  (RedGifs/Reddit mp4 verdiği için pratikte nadirdir.)
- Instagram/Coomer girişleri uygulamanın tarayıcısında bir kez yapılmalıdır;
  çerezler saklanır.
- İlk derleme CI'da 1-2 iterasyon isteyebilir — bu depo Windows'ta, derleyici
  ise runner'da. Actions hatasını yapıştırman yeterli.
- Uygulama içi tarayıcı tek sekmelidir; `target=_blank` aynı görünümde açılır.
