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
https://github.com/tahs1nkkk/RedgifsRipsnipBot/releases/download/latest/TasuDownloader.ipa
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

- **Tarayıcı** sekmesi: adres çubuğu + hızlı site menüsü. Sitelerin üstünde
  eklentiden bildiğin indirme butonları; ekranın sağ altında ayrıca her sayfada
  çalışan yüzen indirme butonu. Tek dokunuş → ilerleme kartı → "Fotoğraflara
  kaydedildi". Paylaşım sayfası yok.
- **Reddit'te** sol altta saydam arama butonu: bir dokunuş 2.5 saniyeliğine
  belirginleştirir, bu süre içinde ikinci dokunuş arama menüsünü açar; süre
  dolarsa tekrar saydamlaşır. Seçilen sağlayıcılar (Reddit / Old / Google /
  Bing) varsayılan tarayıcıda ayrı sekmeler olarak açılır.
- **Galeri** sekmesi: bu uygulamanın indirdikleri, Fotoğraflar'dan orijinal
  kalitede. Fotoğraflar'da Gizli klasörüne taşınan öğe galeriden de kaybolur;
  Fotoğraflar'dan silinen de. Basılı tutarak yalnızca listeden çıkarılabilir.
- **Ayarlar** sekmesi: indirme katmanını tümden aç/kapat, site site butonlar,
  buton boyutu, açılış sayfası.

## Sınırlar

- **webm** dosyalarını Fotoğraflar kabul etmez; indirme açık bir hata ile
  düşer. (RedGifs/Reddit mp4 verdiği için pratikte nadirdir.)
- Instagram/Coomer girişleri uygulamanın tarayıcısında bir kez yapılmalıdır;
  çerezler saklanır.
- İlk derleme CI'da 1-2 iterasyon isteyebilir — bu depo Windows'ta, derleyici
  ise runner'da. Actions hatasını yapıştırman yeterli.
- Uygulama içi tarayıcı tek sekmelidir; `target=_blank` aynı görünümde açılır.
