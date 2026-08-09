# Parite haritası — hangi kod hangi kodun karşılığı (2026-08-09)

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

`edge-extension/` altındaki site betikleri tek kaynak. İki derleme betiği onları
olduğu gibi başka yerlere taşıyor:

- `scripts/build-ios-app-js.js` → iOS uygulaması
  Aldığı dosyalar: `content-folders.js`, `content-redgifs.js`,
  `content-reddit.js`, `content-scrolller-v2.js`, `content-coomer.js`,
  `content-instagram.js`, `common/settings.js`, `page-hook-redgifs.js`.
  `ios-app/native-bridge.js` ile birleştirip `rg-core.js` / `rg-handlers.js` /
  `rg-page-hook.js` üretiyor, her birine `node --check` uyguluyor.

- `scripts/build-orion-ios.js` → Orion (iOS tarayıcı uzantısı)
  Aynı site betiklerini değiştirmeden kopyalıyor. **Hangi dosyaların
  kopyalanacağını manifest belirliyor:** betik `orion-ios/manifest.mv3.json` ve
  `manifest.mv2.json` içindeki `content_scripts` / `web_accessible_resources`
  listelerini okuyor. Yeni bir ortak modül (`common/…`) eklerken iki manifeste
  birden yazılmazsa dosya pakete hiç girmez ve hata da vermez — Orion'da
  `globalThis.RG_…` sessizce `undefined` olur.

**Sonuç:** bir site betiğinde yapılan düzeltme üç ürüne birden gider. Kopyayı
düzenleme; `edge-extension/` içindeki asıl dosyayı düzelt.

---

## 2. Elle eşitlenen çiftler

| İş | iOS (Swift) | Uzantı (JS) | Web (JS) |
|---|---|---|---|
| Bağlantı karşılaştırma | `SiteListStore.canonical` | `background.js` → `canonicalLinkUrl` | — |
| Avatar kimliği | `AvatarIdentity.key(forURL:)` — `Lists/LinkLabel.swift:170` | — | `public/js/core.js` → `avatarId` |
| Scrolller içerik sayfası çözümü | `MediaResolver.scrolllerMediaURLs(fromHTML:)` | `common/scrolller-resolve.js` → `RG_SCROLLLER.resolveMediaViaScrolller` (background.js **ve** orion-ios paylaşıyor) | — |
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

Anahtarlar string olduğu için hiçbir araç bu bağı göremez: gönderen tarafta
`scrolllerSourceUrl:`, alan tarafta `message["scrolllerSourceUrl"]`. Yanlış
yazım derleme hatası değil, sessiz `nil`.

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

**Orion dosya adında tür ekini kırpmıyor.** `background.js` → `filenameFor` ve
Swift `MediaNaming.stripVariantSuffix` sondaki `-large`, `_1920x1080`, `-1080p`
gibi türev etiketlerini atıyor; `orion-ios/ios-bridge.js` → `fileNameFor`
atmıyor. Sonuç aynı medyanın Orion'da `slug-1080p.mp4`, diğer ikisinde
`slug.mp4` adıyla kaydedilmesi. Zararsız ama parite bozuk.

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

---

## 5. Worker API — üç istemcili tek yüzey

Uçlar `cloud/web/src/worker.js` içinde tanımlı:
`/api/media`, `/api/thumb/…`, `/api/avatar/…`, `/api/meta`, `/api/share`,
`/api/lists`, `/api/health`, `/api/config`,
`/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/app`.

Kim neyi kullanıyor:

- **Swift `CloudClient`** — media (list/upload/delete/stream), thumb, avatar,
  meta, `auth/app`. Uygulamanın arşiv sekmesi `auth/app` üzerinden giriyor.
- **Uzantı `common/cloud.js`** — yalnız `api/media` ve `api/lists`. Avatar,
  thumb ve meta uçlarına hiç dokunmuyor.
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
