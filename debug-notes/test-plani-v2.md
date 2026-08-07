# Cihaz test planı — 2. tur düzeltmeleri

Bu plan yalnızca **2. tur** (v2.md) raporlarında düzeltilen maddeleri doğrular.
1. turun genel planı `test-plani.md`'de duruyor; oradaki dağıtım adımı (0.1) burada
da geçerli — önce dala push et, Cloudflare yayınlasın, telefonda **Arşiv**
sekmesinden gir.

İşaretleme: `[ ]` denenmedi · `[x]` geçti · `[!]` hâlâ bozuk. Bir madde kalırsa
"site #no" yaz (ör. "coomer #1 profilde grid çıkmıyor"), kök nedene oradan dönerim.

> Uygulama tarafı JS değişiklikleri `ios-app/Resources/generated/`'a yeniden
> derlendi (`node scripts/build-ios-app-js.js`). Telefonda test için önce yeni
> yapıyı yükle; eski yapı bu düzeltmeleri içermez.

---

## 0. Ön hazırlık

- [ ] **0.1** Dala push edildi, Cloudflare "Success" dedi, telefonda Arşiv açıldı.
- [ ] **0.2** Uygulama yeni yapıyla kuruldu (Sideloadly), açılışta çöküyorsa dur ve bildir.

---

## 1. Instagram

- [ ] **1.1 — Seçim katmanı sayfayla kaymıyordu.** Bir profilde yüzen butona
  **basılı tut** → seçim modu açılır (ekran kararır). Şimdi parmağını sürükle:
  **sayfa normal kaymalı.** Reels'te, bir gönderinin **çoklu görsel carousel'inde**
  (yatay kaydırma da çalışmalı) ve **DM** görünümünde ayrı ayrı dene. Beklenen:
  hiçbirinde katman "yapışıp" sayfayı kilitlememeli.
- [ ] **1.2 — Seçim dokunuşu.** Kararmış ekranda bir medyaya **dokun** → neon
  çerçeve gelir; tekrar dokun → kalkar. Sürükleme (kaydırma) seçim yapmamalı.
- [ ] **1.3 — Not/permalink etiketi.** Bir gönderiyi listeye kaydet. Listede
  etiket **"@kullanıcı | post"** (reels ise "reel") görünmeli — çıplak "post"
  ya da `instagram.com/p/...` değil. Bir **reels** ve bir **normal gönderi** dene.
- [ ] **1.4 — Yanlış hedef.** Beğenenler (`liked_by`) veya ses (`audio`) sayfasına
  düşen bir bağlantıyı kaydetmeye çalış: etiket gerçek gönderiyi göstermeli,
  "audio" gibi bir kod olmamalı.

## 2. Scrolller

- [ ] **2.1 — Her medyadaki indirme butonu kalktı.** Feed'i kaydır: kartların
  üstünde **artık tek tek indirme butonu olmamalı.** Sağ üstte **tek sabit** mavi
  buton kalır (sürekli görünür).
- [ ] **2.2 — Ortadaki medya iniyor.** Sabit butona bas → **ekranın ortasındaki**
  kart inmeli (yarı kaymış komşu değil). Video bir kartta dene.
- [ ] **2.3 — Çoklu indirmede videolar.** Yüzen butona basılı tut → seçim modu.
  Birkaç **video** kart seç → indir. Beklenen: videolar da inmeli (önceden yalnız
  görseller iniyordu, "çoklu indirmede videolar inmiyor").
- [ ] **2.4 — "URL bulunamadı" kalktı.** İçerik sayfasına gir (tekli video), indir:
  hata vermeden inmeli.

## 3. RedGifs

- [ ] **3.1 — Profilde çoklu, sayfa kayıyor.** Bir `/users/...` profilinde yüzen
  butona basılı tut → seçim modu → parmağını sürükle: **sayfa kaymalı** (Instagram
  ile aynı düzeltme). Grid kartları seçilebilmeli.
- [ ] **3.2 — Profilden videoya girince tekli iniyor.** Profilden bir videoya gir
  (tam ekran/watch). Yüzen buton tek indirme yapmalı; başarısızsa **otomatik
  Copy-Link yedeğine** düşüp yine indirmeli (önceden "url bulunamadı" deyip
  duruyordu).
- [ ] **3.3 — Keşif / gifs tekli.** `/explore/gifs`'te bir karta bas veya seçip
  indir: tek video inmeli.
- [ ] **3.4 — Niches algılama.** Bir niş sayfasında (`/niches/{ad}`) yüzen butona
  basılı tut: **kartlar algılanmalı** (önceden hiçbir video algılanmıyordu). Not:
  `data-feed-item-id` taşımayan düzenlerde artık `/watch/` bağlantılı kartlara
  düşülüyor.
- [ ] **3.5 — Creators/bazı profiller.** Daha önce algılanmayan bir creator
  profilinde seçim modunu aç: kartlar çerçevelenebilmeli.

## 4. Reddit

- [ ] **4.1 — Kullanıcı arama.** Sol alttaki arama balonuna dokun → kullanıcı adı
  yaz → ara. Uygulamada **tek sekme** açılmalı (Reddit araması) ve sonuç
  gelmeli — önceden birden çok sağlayıcı aynı WebView'i çakıştırıp "çalışmıyor"
  görünüyordu.
- [ ] **4.2 — Açıklama metni.** Metinli/uzun açıklamalı bir gönderiyi listeye
  kaydet: etikette **başlık + gövdenin başı** görünmeli (yalnız başlık değil).
- [ ] **4.3 — RedGifs embed algılama.** İçinde RedGifs gömülü bir gönderide yüzen
  butona basılı tut: gömülü medya **algılanmalı**; indir → RedGifs çözücüsünden
  gerçek video inmeli.
- [ ] **4.4 — GIF.** RedGifs gömülü bir "gif" gönderisinde 4.3'teki gibi inmeli.
  (Not: Reddit'in kendi `v.redd.it` videoları hâlâ kapsam dışı — indirme hattında
  çözücüsü yok; bunu bir gönderi olarak bildir, ayrıca ele alırım.)

## 5. Coomer

- [ ] **5.1 — Profilde tıklamadan çoklu.** Bir creator profilinde (`/{servis}/user/{id}`)
  yüzen butona basılı tut: **grid kartları algılanmalı**, her postu açmadan
  görseller seçilip inmeli.
- [ ] **5.2 — Profil fotoğrafı ve banner.** Aynı profilde seçim modunda **avatar**
  ve **banner** da seçilebilir/inebilir olmalı.
- [ ] **5.3 — Post sayfası bozulmadı.** Bir posta gir: eskisi gibi görsel ve video
  butonları/algılama çalışmalı (regresyon kontrolü).

## 6. Genel / arşiv (regresyon)

- [ ] **6.1 — Önbellek.** Arşivde bir albümü aç, çık, tekrar aç: kareler **ağa
  çıkmadan** gelmeli (1 GB disk önbelleği). Uygulamayı kapatıp açınca da kalmalı.
- [ ] **6.2 — Cihazda saklama seçeneği.** Ayarlar → Bulut → "İndirilenler nereye"
  = **Fotoğraflar** seç: indirmeler cihaza (Fotoğraflar) düşmeli. "Bulut" seçiliyken
  cihazda yer kaplamamalı. ("İkisi" ikisine de).
- [ ] **6.3 — Bant genişliği.** İndirme/Yükleme hızını bir değere çek (ör. 5 Mbps),
  büyük bir medya indir: sunucu yavaşlatmalı; "Sınırsız"da tam hız.
- [ ] **6.4 — FAB konumu.** Ayarlarda 3×3 ızgaradan bir köşe seç ya da butonu
  sayfada sürükle ("Serbest"e geçmeli); konum kalıcı olmalı.

## 7. MS Edge eklentisi — sunucu / bulut (yeni)

> Bu bölüm **bilgisayarda** test edilir, telefonda değil. Önce eklentiyi yeniden
> yükle: `edge://extensions` → Geliştirici modu → **Yeniden yükle** (yeni dosyalar
> `common/cloud.js`, `archive.html/js/css` var). Ayarları aç (eklenti simgesi →
> **Sunucu / Bulut**): Worker adresini ve **jetonu** (ARCHIVE_TOKEN) gir.

- [ ] **7.1 — Bağlantı sınaması.** "Bağlantıyı sına" → **Bağlı ✓ (jeton)** çıkmalı.
  Jetonu boş bırakıp sına: jeton isteyen uyarı gelmeli (bağlanmamalı).
- [ ] **7.2 — Sunucuya yükleme.** Hedefi **Sunucu** yap. Herhangi bir sitede
  (RedGifs/Instagram/Coomer…) bir medya indir: **diske düşmemeli**, "Arşivi aç"
  ızgarasında yeni dosya görünmeli. Telefondaki/sitedeki arşivde de çıkmalı.
- [ ] **7.3 — İkisi.** Hedefi **İkisi** yap, indir: hem diske inmeli **hem** bulut
  ızgarasında görünmeli. (Coomer çok adaylı düşüşte yalnız gerçekten inen aday
  buluta gitmeli — çöp yükleme olmamalı.)
- [ ] **7.4 — Yerel (regresyon).** Hedef **Yerel**: eskisi gibi yalnız diske inmeli,
  buluta hiçbir şey gitmemeli.
- [ ] **7.5 — Jeton/adres yoksa kayıp yok.** Hedef Sunucu ama jeton **boş** iken
  indir: yine de **diske** inmeli (indirme kaybolmamalı).
- [ ] **7.6 — Arşiv ızgarası.** "Arşivi aç": kareler gelmeli, site çipleriyle
  süzülmeli, bir kareye tıkla → görüntüleyicide açılmalı, 🗗 ile silinmeli (R2'den
  gerçekten kalkmalı).
- [ ] **7.7 — Sürücü.** Üstteki "Sürücü" kutusunu değiştir (ör. `main` dışı bir ad):
  o sürücünün medyası gelmeli. Boşsa "bu sürücüde medya yok" demeli.
- [ ] **7.8 — Listeler.** "Arşivi aç" → **Listeler** sekmesi: buluttaki listeler
  gelmeli, bir giriş sil / bir liste sil → değişiklik `/api/lists`'e yazılmalı,
  telefonda/sitede de yansımalı (liste silme tombstone ile yayılır).
- [ ] **7.9 — Bant genişliği.** Yükleme/İndirme hızını bir değere çek (ör. 5 Mbps),
  büyük bir medyayı sunucuya yükle: `X-Tasu-Bw` başlığıyla yavaşlamalı.
- [ ] **7.10 — Google / "Sitede aç".** Jetonu geçici sil, "Arşivi aç": ızgara yerine
  **jeton uyarısı** + "Sitede aç" bağlantısı gelmeli. "Sitede aç" tam web arşivini
  sekmede açmalı (Google girişiyle). Bu beklenen davranış — çerez SameSite=Lax
  olduğu için eklenti içi ızgara/yükleme jeton ister, Google yalnız tam siteyi açar.

---

## Notlar (kapsam dışı bırakılanlar)

- **Cihazda çevrimdışı "sabitleme" (pin) alt sistemi** ayrı bir ekran/depo olarak
  eklenmedi. İhtiyacın iki mevcut mekanizmayla karşılanıyor: (1) 1 GB kalıcı disk
  önbelleği arşiv karelerini bir kez indirip saklıyor (6.1), (2) "Fotoğraflar"
  hedefi medyayı doğrudan cihaza yazıyor (6.2). Kalıcı, kotasız bir "şunu hep
  çevrimdışı tut" listesi istiyorsan ayrıca söyle; cihazda doğrulanabilir bir
  tasarımla ekleriz.
- **Reddit `v.redd.it` yerel videoları** indirme hattında çözücüsü olmadığı için
  bilerek algılanmıyor (yanlışlıkla poster/başarısız indirme üretmesin diye).
- **Eklentide "gönderiyi bulut listesine ekle"** (her sitenin içerik scriptine
  ayrı bir "listeye kaydet" butonu) bu turda eklenmedi. Eklenti buluta **indirme
  yükler** ve mevcut listeleri **görüntüler/siler**; ama sayfadaki bir gönderiyi
  tek tıkla bir buluta listeye eklemek her site için ayrı iş — istersen ayrı tur
  olarak ekleriz. Şimdilik liste oluşturma/ekleme telefondan ve siteden yapılıyor.
