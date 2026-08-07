# Instagram — saha hata raporları (iOS uygulaması)

Kaynak: kullanıcının 2026-07-24'te iOS uygulamasında (Sideload) bizzat yaşadığı
hatalar/eksikler. **ŞİMDİ DÜZELTİLMEYECEK** — tüm siteler toplanınca topluca
düzeltilecek. Aşağıdaki "Ortak kök neden adayları" bölümü, tek bir düzeltmenin
birkaç raporu birden kapatabileceği yerleri işaretler.

Mimari için `debug-notes/README.md`'ye bak. İlgili dosyalar:
- `edge-extension/content-instagram.js` (paylaşımlı IG mantığı)
- `ios-app/native-bridge.js` (köprü + FAB tap/picker akışı)
- `ios-app/Sources/Browser/BrowserController.swift` (native FAB, WebView, çerezler)
- `ios-app/Sources/Settings/SettingsScreen.swift` (FAB boyut slideri, bulut paneli)
- `ios-app/Sources/Gallery/GalleryScreen.swift` (galeri)
- `ios-app/Sources/Lists/ListsScreen.swift` + `Support/SiteListStore.swift` (listeler)

---

## ⚠️ Ortak kök neden adayları (ÖNCE bunlara bak)

### KÖK-A — "Eklenti güncellendi — sekmeyi yenile" → raporlar #4, #17, #18 (ve kısmen #10, #15)
`content-instagram.js:603` `sendDownload` başında şu guard var:
`if (!chrome || !chrome.runtime || !chrome.runtime.id) → throw "Eklenti güncellendi — Instagram sekmesini yenile (F5)"`.
Ama `native-bridge.js:39` içindeki sahte `runtime` nesnesinde **`id` alanı YOK**
(sadece lastError/getURL/getManifest/onMessage/sendMessage var). Yani uygulamada
`chrome.runtime.id === undefined` → IG handler butonuna (`#rg-ig-one`/`#rg-ig-all`)
yönlenen **her** indirme (API ile tekli, "tümü", story, avatar) bu hatayı verir.
- FAB doğrudan `<img>/<video>.src` indirdiğinde (üstte handler butonu yoksa,
  `native-bridge.js` `grab()`) köprü guard'ına hiç girmez → "normal indirme"
  bazen çalışır. #17'deki **sıra bağımlılığı** (önce normal çalışıyor, çokludan
  sonra bozuluyor) bununla açıklanır: hangi akışın handler butonuna yöneldiğine
  bağlı.
- **Aday çözüm:** `native-bridge.js` `runtime` nesnesine `id: "tasu-native"` ekle
  (tek satır). Bu, aynı guard'ı kullanan TÜM sitelerin content script'lerini de
  düzeltir. Fix anında doğrula: `content-reddit/redgifs/scrolller/coomer.js` de
  aynı `chrome.runtime.id` guard'ını kullanıyor mu (kullanıyorsa hepsi düzelir).

### KÖK-B — bağlam algılama & "hep ortadaki" yanlılığı → #5, #10, #12, #13, #14, #16
İki ayrı seçim yolu var, ikisi de fazla/yanlış medya yakalıyor:
- **FAB kısa dokunuş** `centreMost()` (`native-bridge.js:263`) *tasarım gereği*
  ekran ortasındaki medyayı seçer → grid/keşfette "hep ortadaki iniyor" (#5).
- **Seçim modu adayları** `candidates()` (`native-bridge.js:215`): `onScreen()`
  (`:173`) kısmen görünür/fold-altı öğeleri de sayabiliyor (#12); avatarları
  120px filtre + `image` sınıfı yüzünden atlıyor (#13); `/direct/` (DM) ve
  repost/kaydedilenler grid'lerine özel davranışı yok (#14, #16).
- Reels feed'i (#10): reel videosu çoğu zaman `blob:` src → `candidates()` filtre
  (`:244`) `blob:`'u eler, handler butonu da o an bağlanmamışsa aday kalmaz →
  "medyayı algılayamıyor". Reels için shortcode→API çözümü şart (content-instagram
  `detectContext`/`fetchMediaInfo`), FAB'ın buna yönelmesi gerek.

### KÖK-C — çoklu seçimde video yerine önizleme görseli iniyor → #6, #15
`pickerConfirm()` (`native-bridge.js:450`) seçilenleri `m.image` bayrağına göre
video/görsel diye ayırır. Grid'deki reel/video küçük resmi bir `<img>`
(`image:true`) → **poster görsel** iner, video değil. Handler butonu o medyayı
kapsıyorsa API'den video çözer; ama grid'de buton bağlı değilse poster iner.
KÖK-A ile bağlı (buton çözümü hataya düşüyor). DM reels (#15) aynı kök + düşük
çözünürlük (poster CDN'i küçük).

---

## Raporlar (kullanıcının verdiği sırayla)

### #1 — FAB: konum, boyut slideri, özel konum  [native FAB]
- Buton Instagram'ın alt barının üstünde kalıyor, kullanılamıyor → biraz daha
  yukarıda konumlansın.
- Boyut seçme slideri optimize değil: titreşim (haptik) düzgün çalışmıyor, her
  konumda aynı hızda kaymıyor. Slider: `SettingsScreen.swift:24`
  (`Slider(value:$settings.fabSize, in:44...78, step:2)`) — stepli slider'ın
  haptik/ivme davranışı elden geçmeli.
- Buton konumu istenen yere konabilsin. Ayarda **2 seçenek**:
  1. **Sabit pozisyonlar**: sol üst, üst orta, sağ üst, sol alt, alt orta, sağ
     orta (6+ hazır köşe/kenar).
  2. **Özel pozisyon**: "Düzenle" → butonu sürükle → "Kaydet" → hep orada kalsın.
- Şu an sadece `fabOnLeft` (sol/sağ) toggle var (`SettingsScreen.swift:26`,
  `AppSettings`). Preset ızgara + özel konum kaydı yeni özellik. FAB'ı çizen view
  ve safe-area/alt-bar payı `BrowserScreen.swift`/`BrowserController.swift`.

### #2 — Girişi Google'a bağla, "Bulut ve Eşitleme" panelini kaldır  [auth]
- `SettingsScreen.swift:33-65` "Bulut ve Eşitleme" bölümü kaldırılsın.
- Uygulama açılışına Google ile giriş gelsin; giriş yapınca otomatik buluta bağlı
  olsun (adres+token elle girilmesin). Kendi maili (`you@example.com`)
  değilse uygulamaya almasın (web tarafındaki `ALLOWED_EMAIL` gate'inin eşi).
- Bağlam: web zaten Google OAuth ile korunuyor (Worker `auth.js`). Uygulamanın da
  aynı hesapla girip ARCHIVE_TOKEN'ı elle istemeden alması gerek → mimari karar
  gerektirir (uygulama OAuth mı yapar, yoksa giriş sonrası Worker'dan token mı
  çeker?). Fix anında netleştir.

### #3 — Instagram hesap geçişi / ikinci hesaba giriş çalışmıyor  [WebView oturum]
- Bir hesap girişliyken hesaplar arası geçiş yapılamıyor, başka hesaba
  girilemiyor; giriş yalnızca Meta'nın "şifremi unuttum" sayfası üzerinden
  oluyor.
- Muhtemelen WKWebView çerez/veri deposu (`websiteDataStore`,
  `BrowserController.swift:232`) veya normal IG login akışını engelleyen bir şey
  (challenge/redirect). WebView'in kalıcı `httpCookieStore`'u, user-agent'ı ve
  popup/yeni pencere davranışı incelenmeli.

### #4 — "eklenti güncellendi" + seçici davranmıyor  [KÖK-A]
- İndirme butonu "eklenti güncellendi - Instagram sayfasını yenile" diyor;
  ekrandaki foto/videoları seçici davranmıyor, rastgele indirmeye izin veriyor.
- Kök: **KÖK-A** (`chrome.runtime.id` yok). "Seçici davranmıyor / rastgele" kısmı
  ise **KÖK-B** (centreMost hep ortadaki + grid'de ayrım yok) ile örtüşür.

### #5 — Keşfette hep ortadaki iniyor; kalabalık ekranda tap kapansın  [KÖK-B + FAB]
- Keşfette indirmeye basınca hep ekranın ortasındakini algılıyor.
- İstenen: ekranda çok görsel varsa (grid) **direkt indirme çalışmasın**, FAB
  **solgun** görünsün; medya yalnızca **basılı tutup seçim moduyla** seçilebilsin.
- `centreMost` (`native-bridge.js:263`) davranışını "belirsiz grid" tespitiyle
  devre dışı bırak + FAB'a solgun/disabled durumu (native, `BrowserController`
  `PICKER_STATE`'e benzer yeni bir "ambiguous" sinyali).

### #6 — Çoklu seçimde video → preview görsel iniyor  [KÖK-C]
- Görsel/video karışık seçimde hepsinin preview görselini indiriyor; videolar
  video olarak inmeli. Kök: **KÖK-C** (`pickerConfirm` `m.image` ayrımı + poster).

### #7 — Galeride foto ve videoları ayrı görüntüleme  [galeri]
- Uygulama galerisinde foto ve videolar ayrı ayrı görüntülenebilsin (filtre/sekme).
  `GalleryScreen.swift`. Kayıt türü zaten biliniyor (Videolar/Fotoğraflar klasör
  ayrımı, `common/settings.js` `mediaCategoryFromUrl`).

### #8 — Bulut görselleri previewli + foto/video ayrımı  [galeri/bulut]
- Bulut medyası da cihazdaki gibi önizlemeli görünsün ve foto/video ayrışsın.
  Bulut listesi `CloudClient.list()` → her öğe `{name,size,mtime,kind}` (R2
  `media.js` `listMedia` `kind` alanı zaten var). Galeri bulut moduna küçük
  resim (thumbnail) çekimi + tür filtresi eklenmeli.

### #9 — Listeye kaydederken medyayı da dahil et  [listeler]
- Listeye kaydederken "medyayı dahil et" opsiyonu olsun; bağlantı + medya birlikte
  kaydolsun.
- Sunucuda aynı medya zaten varsa onu çek (yeniden upload etme); listedeki mevcut
  bir medyayı sonra indirirsek upload yerine listeden çek. Dedup gerekiyor
  (R2 anahtarı / içerik hash'i). `SiteListStore.swift`, `ListsScreen.swift`,
  cloud `media.js` (`freeKey` çakışma mantığı → dedup'a çevrilebilir).

### #10 — Reels'te indirme ve listeleme çalışmıyor  [KÖK-B + KÖK-A]
- Reels'te medya algılanamıyor. Kök: **KÖK-B** (blob video + reels feed bağlamı) —
  shortcode→API (`fetchMediaInfo` → `video_versions`) yolu FAB akışına bağlanmalı.
  İndirme çözülse bile KÖK-A guard'ına takılabilir.

### #11 — Kaydedilen bağlantı "instagram.com" oluyor, permalink olmalı  [listeler]
- Listeye kaydolan link postun paylaşım linki (`/p/<shortcode>/` veya
  `/reel/<shortcode>/`) olmalı, çıplak `instagram.com` değil.
- content-instagram zaten shortcode'u biliyor (`shortcodeFromHref`,
  `detectContext` `ctx.shortcode`). Liste kaydında `location.href` yerine seçili
  medyanın permalink'i geçirilmeli (native tarafına ayrı bir alan olarak).

### #12 — Seçim modunda ekran dışı medya yakalanıyor  [KÖK-B]
- Çoklu seçimde ekranda görünmeyen medyaları da algılıyor. `candidates()` +
  `onScreen()` (`native-bridge.js:173,215`) görünürlük eşiği sıkılaştırılmalı
  (kısmen görünür / fold-altı elenmeli). Not: seçilmiş öğe kaydırınca kasıtlı
  gizleniyor (`pickerSync:361`) — bu davranış korunmalı, sadece **aday** seçimi
  görünürle sınırlanmalı.

### #13 — Seçim modunda profil resimleri de algılansın  [KÖK-B]
- Çoklu seçimde profil fotoğrafları da aday olup seçilebilsin. `candidates()`
  120px img filtresi (`native-bridge.js:229`) ve avatar özel-durumu
  (content-instagram `isAvatarImg`/`findProfileAvatarImg`) picker'a bağlanmalı.

### #14 — DM: kişi listesinde buton çıkmasın, thread içinde çıksın  [KÖK-B]
- İndirme butonu mesajlar (DM) kişi/konuşma listesinde görünmesin; bir DM
  thread'ine girince görünsün. `/direct/inbox` vs `/direct/t/<id>` yol ayrımı
  (content-instagram `detectContext` + native FAB görünürlüğü).

### #15 — DM'de çoklu seçilen reels: düşük çöz. + preview  [KÖK-C]
- DM'de çoklu seçme ile inen reelsler çok düşük çözünürlüklü ve preview görsel;
  tam çözünürlük + reels videosu inmeli. Kök: **KÖK-C** (+ DM içi medya için
  shortcode yoksa API çözümü zor — fix anında DM reel'in gerçek URL'i nereden
  alınır, araştır).

### #16 — Repost sayfasındaki çoklu seçim çerçeveleri  [KÖK-B]
- Profildeki repostlar sayfasında postların çoklu seçme çerçeveleri optimize
  edilmeli (yanlış boyut/hizalama). `styleFrame`/`pickerSync`
  (`native-bridge.js:304,332`) + repost grid tile geometrisi.

### #17 — Çoklu seçim sonrası normal indirme de bozuluyor (sıra bağımlı)  [KÖK-A]
- Önce çoklu seçimle indirince "eklenti güncellendi"; sonra normal indirme de aynı.
  Ama sayfaya ilk girince önce normal indirme yaparsam çalışıyor; çoklu yapınca
  tekrar bozuluyor. Kök: **KÖK-A** (hangi akışın handler butonuna yöneldiğine
  bağlı sıra etkisi). `chrome.runtime.id` eklenince bu bağımlılık kalkmalı.

### #18 — Kaydedilenler'de çoklu indirme bozuk, tekli çalışıyor  [KÖK-A]
- Kendi profilinde Kaydedilenler'de çoklu indirme "eklenti güncellendi" veriyor,
  tekli indirme çalışıyor. Kök: **KÖK-A** (çoklu = handler butonu tıklaması →
  guard'a takılır; tekli direkt src ile geçer).

---

## Düzeltme sırası önerisi (fix aşamasında)
1. **KÖK-A** (`native-bridge.js` runtime `id`) — tek satır, #4/#17/#18 + reels/DM
   indirmelerini bir çırpıda açar. En önce bu, sonra tekrar test.
2. **KÖK-B** bağlam/görünürlük (reels, DM gate, grid tap-kapama, avatar, ekran-dışı).
3. **KÖK-C** çoklu seçimde video çözümü (poster yerine API video).
4. Native FAB UX (#1: konum presetleri + özel konum + slider haptik).
5. Galeri/bulut foto-video ayrımı + önizleme (#7, #8).
6. Listeler: permalink (#11) + medya dahil et/dedup (#9).
7. Auth: Google girişi + bulut paneli kaldırma (#2), WebView hesap geçişi (#3).
