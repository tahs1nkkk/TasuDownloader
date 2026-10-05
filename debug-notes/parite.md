# Parite haritası — hangi kod hangi kodun karşılığı (2026-09-05)

Bu depoda aynı iş birden fazla yerde yazılı. Bir kısmı derleme sırasında
kopyalanıyor (o taraf kendiliğinden eşit kalıyor), bir kısmı ise **elle** eşit
tutuluyor — Swift'te bir kural, JavaScript'te aynı kuralın ikinci yazımı.

İkinci grup bu projenin en pahalı hata kaynağı. Kırıldığında derleyici susuyor,
test susuyor, çağrı grafiği susuyor: iki taraf da tek başına doğru, sadece
birbirinden farklı. Bu belge o çiftleri tek yerde tutuyor.

Kural: aşağıdaki bir satıra dokunduysan, **aynı satırdaki diğer hücrelere de
bak.**

---

## 1. Kopyalanan kod — dokunma, kaynağı düzelt

`shared/` altındaki dosyalar artık tek kaynak; ayrıntılar `shared/README.md` içinde.
`shared/core/sites.js`, platform desteği ve site kapsamı için ortak katalogdur.

- `npm run build:shared` → Edge'in mevcut klasörüne çalışma dosyalarını üretir;
  Edge/Orion manifestlerinin site bölümlerini aynı katalogdan günceller.
- `scripts/build-ios-app-js.js` → betikleri doğrudan `shared/` kaynağından alır,
  native köprüyle paketler. Ana ekran listesi de aynı katalogdan üretilir.
- `scripts/build-orion-ios.js` → yine doğrudan `shared/` kaynağını kullanır;
  katalogdan üretilen manifestteki bağımlılıkları pakete koyar.
- `npm test` → üretilen Edge dosyalarının kaynakla eşitliğini, yükleme sırasını,
  native JS paketini ve Orion MV2/MV3 içeriklerini kontrol eder.

**Kural:** `shared/` kaynağını düzenle, çıktıları yeniden üret. Edge içindeki
üretilmiş kopyaları elle değiştirme. OnlyFans yalnız Edge'de etkin; Android henüz
planlı.

Scrolller HTML ayrıştırması ve dosya adındaki kalite eklerini temizleme artık
`shared/core/media-rules.js` içinde tek yazım. iOS, `SharedCore.swift` üzerinden
paketlenmiş kodu JavaScriptCore ile çalıştırıyor; ağ isteği URLSession'da kalıyor.
Site adı da ortak katalogdan geliyor. Node ve macOS için aynı yerel test verileri
`tests/fixtures/shared-core.json` dosyasında. Aşağıdaki çiftler hâlâ ayrı yazımlar.

---

## 2. Elle eşitlenen çiftler

| İş | iOS (Swift) | Uzantı (JS) | Web (JS) |
|---|---|---|---|
| Bağlantı karşılaştırma | `SiteListStore.canonical` | `background.js` → `canonicalLinkUrl` | — |
| Avatar kimliği | `AvatarIdentity.key(forURL:)` — `Lists/LinkLabel.swift:170` | — | `public/js/core.js` → `avatarId` |
| RedGifs çözümü | `MediaResolver`: `redgifsSlug` + `temporaryToken` + `redgifsMediaURLs` | `background.js`: `redgifsSlugFromUrl` + `redgifsTemporaryToken` + `mediaUrlsFromJson` + `resolveMediaViaRedgifs` | — |
| İndirme sırası (hangi adres önce denenir) | `Downloader.swift` → `runRound` ve öncesindeki çözüm adımı | `background.js` → `DIRECT_DOWNLOAD` işleyicisi | — |
| Hız basamakları | `SettingsScreen.bwSteps` | — | `public/js/app.js` → `BW_STEPS` |
| Liste anlık görüntüsü | `SiteListStore.Snapshot` + `merge` | `common/cloud.js` → `getLists`/`putLists` | — |

### Dikkat edilecek üç ayrıntı

**Avatar kimliği tek harf bile kaymamalı.** Telefon blob'u `<site>~<kullanıcı>`
adıyla yazıyor, web aynı adı hesaplayıp istiyor. Kural farklı çıkarsa web,
telefonun yüklediği resmi *bulamaz* — hata da vermez, sessizce site işaretinde
kalır. Instagram'ın `reserved` yol listesi, Reddit'in `r-<sub>` öneki ve
`sanitize`'ın baştaki noktaları atması dahil her basamak iki tarafta aynı.

**Hız basamakları aynı sayılar, farklı yerleşim.** Swift `[0, 1, 2, …, 500]` —
sınırsız *başta* ve `0`. Web `[1, 2, …, 500, BW_FREE]` — sınırsız *sonda*. Tel
üzerinde ikisi de `0` gönderiyor, yani uyumlular; ama listeye yeni bir basamak
eklerken iki tarafta farklı uca eklemek gerekiyor.

**`duplicate` cevap alanı bir sözleşme.** `background.js` → `addWebLink`
`{ ok, listName, duplicate, added }` dönüyor; `common/weblink.js` bu alana bakıp
"Listeye eklendi" mi "Bu bağlantı zaten listede" mi diyeceğine karar veriyor.
Alanı yeniden adlandırırsan toast sessizce yanlış şeyi söyler.

---

## 3. `DIRECT_DOWNLOAD` — üç alıcılı, string anahtarlı sözleşme

Site betikleri tek bir mesaj gönderiyor; onu **üç ayrı yer** okuyor:

1. `edge-extension/background.js` — masaüstü Edge
2. `ios-app/native-bridge.js` → Swift `Downloads/Downloader.swift`
3. `orion-ios/ios-bridge.js` — iOS'taki Orion uzantısı

Alanlar, türler ve varsayılanlar artık `shared/core/download-contract.js` içinde.
Edge/Orion alıcıları ve native köprü aynı doğrulamayı kullanıyor. Native Swift
tarafında `DownloadRequest.swift` bu şemadan üretiliyor; eksik/eski alanların
varsayılanları yine aynı ortak koddan geliyor. Yanlış türler ve desteklenmeyen
sözleşme sürümleri indirme başlamadan reddediliyor. Bilinmeyen ek alanlar ileri
uyumluluk için korunuyor; alan adı değişiklikleri yine test gerektirir.

| Anahtar | Ne demek | background.js | Swift | orion-ios |
|---|---|---|---|---|
| `urls` | Aday adresler, DOM'dan | ✅ | ✅ | ✅ |
| `imageMode` | Görsel mi isteniyor | ✅ | ✅ | ✅ |
| `downloadAll` | Toplu indirme | ✅ | ✅ | ✅ |
| `fallbackSourceUrl` | **Yalnız adres çubuğu** (`location.href`) | ✅ | ✅ | ✅ |
| `scrolllerSourceUrl` | Seçilen medyanın **kendi** içerik sayfası | ✅ | ✅ | ✅ |
| `namingUrl` | Dosya adının türetileceği adres | ✅ | ✅ | ✅ |
| `fallbackOnNoTransfer` | İlk bayt gelmezse yedeğe geç | ✅ | ✅ | ✅ |
| `transferTimeoutMs` | O bekleyişin süresi | ✅ | ✅ | ✅ |

### `fallbackSourceUrl` ile `scrolllerSourceUrl` aynı şey DEĞİL

En kolay yapılan hata bu. `fallbackSourceUrl`, `native-bridge.js` içindeki
`grab()`'in gönderdiği `location.href` — yani sadece o an açık olan sayfa.
`scrolllerSourceUrl` ise **seçilen medyanın** içerik sayfası.

Bu ayrım tesadüf değil, bir düzeltmenin şartı: "önce kaynak sayfayı çöz" adımı
`scrolllerSourceUrl` varken çalışıyor. `fallbackSourceUrl`'e genişletilirse
Reddit'te çok görselli bir gönderide 3. görsele basınca 1. görsel iner (çözücü
sayfadaki tüm görselleri döndürür, tur ilk başarıda durur) ve şu an eksiksiz
çalışan RedGifs akışı da aynı yoldan bozulur.

---

## 4. Bilinen boşluklar

**Çözüm adımının koşulu iki türlü.** `scrolllerSourceUrl` varken içerik
sayfasını çözme adımı `background.js`'te toplu indirmede de çalışıyor; Swift ve
`orion-ios` yalnız tek indirmede çalıştırıyor. Sebep gerçek: masaüstünde
`bestPerMedia` + `reachableOnePerImage` yinelenenleri eliyor, diğer ikisinde
böyle bir süzgeç yok — orada çözülen adresleri eklemek aynı medyayı ikilerdi.
Bu adımı değiştirirken üç tarafın süzgeci de düşünülmeli.

**Dosya adı kalite ekleri eşitlendi.** Edge, Orion ve Swift artık aynı
`stripVariantSuffix` kuralını kullanıyor. MIME/uzantı desteği ve işletim sistemine
kaydetme işlemleri platforma özel; tüm dosya adlandırma kodu ortaklaştırılmış değil.

**Reddit çözücüsü yalnız iOS'ta var.** `MediaResolver.reddit(permalink:)` +
`redditMediaURLs` Reddit'in `<permalink>.json` ucunu okuyor. Uzantı tarafında
karşılığı yok — orada medya doğrudan DOM'dan alınıyor (`content-reddit.js`).
Bu bilinçli bir asimetri, hata değil; ama "iki tarafta da düzelttim" derken
akılda tutulmalı.

**Liste eşitlemesi asimetrik.** Telefon yerel kopya tutuyor ve `merge` ile
birleştiriyor: aynı listeye iki taraf dokunduysa `updatedAt` yenisi kazanıyor,
silmeler `tombstone` bırakıyor. Uzantının yerel kopyası yok; her seferinde
buluttan okuyup üstüne yazıyor. İkisi aynı anda yazarsa uzantının yazımı
telefonun birleştirmesini ezebilir. Pratikte nadir, ama liste kaybı raporu
gelirse ilk bakılacak yer burası.

Edge 0.27.0 hızlı galeri silmeleri artık güncel snapshot'ı tekrar okur, liste
değişikliklerine `updatedAt` ve liste silmelerine `{id, deletedAt}` yazar.
Bu düzeltme tam atomik eşitleme değildir. Tam liste/kategori/paylaşım yönetimi
artık mobil Arşiv sekmesiyle aynı web istemcisine açılır; özellik haritası
`edge-mobile-support.md` içindedir.

---

## 5. Worker API — üç istemcili tek yüzey

Uçlar `cloud/web/src/worker.js` içinde tanımlı:
`/api/media`, `/api/thumb/…`, `/api/avatar/…`, `/api/meta`, `/api/share`,
`/api/lists`, `/api/health`, `/api/config`,
`/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/app`.

Kim neyi kullanıyor:

- **Swift `CloudClient`** — media (list/upload/delete/stream), thumb, avatar,
  meta, `auth/app`. Uygulamanın arşiv sekmesi `auth/app` üzerinden giriyor.
- **Uzantı `common/cloud.js`** — media/lists API, bağlantı kontrolü ve kapak
  adresleri. `common/archive-access.js`, `/auth/app` için sekmeye özel geçici
  Authorization kuralı ekler. Tam arşiv açıldığında avatar/meta/share gibi
  özellikleri mevcut web istemcisi kullanır; bunların Edge kopyası oluşturulmaz.
- **Web `public/js/*`** — hepsi, çerez oturumuyla.

Bir ucun cevap şeklini değiştirirsen üçünü de gözden geçir. `CloudFile`
alanlarının (`key`, `name`, `drive`, `site`, `size`, `mtime`, `kind`) Swift
tarafında eski sunucuları da kabul eden bir çözücüsü var — yeni alan eklemek
güvenli, var olanı yeniden adlandırmak değil.

---

## 6. Bu belge neden var

Depo `app.graphify.com`'a bağlı ve orada bir kod bilgi grafiği duruyor. O grafik
çağrı/import kenarlarını çıkarıyor — "bu fonksiyonu kim çağırıyor" sorusunu iyi
cevaplıyor. Ama yukarıdaki kenarların hiçbirini göremiyor:

- string anahtarlı mesaj sözleşmesi (sözdizimsel bağ yok),
- diller arası paralel yazımlar ("bu ikisi aynı olmalı" bir kenar değil),
- sıralama farkları (iki taraf aynı fonksiyonları farklı sırayla çağırıyor),
- ölü string karşılaştırmaları (`proton.` yazılmış `photon.` hostu gibi),
- çalışma zamanı DOM davranışı (gölge kök izolasyonu, `pointer-events`).

Bu projede maliyeti en yüksek hatalar tam olarak bu beş kategoriden çıktı. Grafik
onları bulamayacağı için burada yazılı duruyorlar.
