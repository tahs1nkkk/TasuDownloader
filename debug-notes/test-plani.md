# Cihaz test planı — 57 saha raporunun doğrulaması

Bu liste, `debug-notes/` altındaki raporların **düzeltildiğini kanıtlamak** için
yazıldı. Sıra önemli: önce dağıtım, sonra web, en sonda telefon. Bir madde
kalırsa dosyanın adını ve numarasını yaz (ör. "scrolller #9 hâlâ poster iniyor"),
kök nedene oradan dönerim.

İşaretleme: `[ ]` denenmedi · `[x]` geçti · `[!]` hâlâ bozuk

---

## 0. Dağıtım (bir kez)

### 0.1 Worker'ı yayına al

**Elle deploy gerekmiyor.** Cloudflare'in Git entegrasyonu bağlı: dala push
edildiği anda derleyip yayınlıyor. Her push iki adres üretiyor —

- dal önizlemesi: `https://<dal-adı>-tasu-arsiv.<hesabin>.workers.dev`
- commit önizlemesi: `https://<hash>-tasu-arsiv.<hesabin>.workers.dev`

Deploy durumu PR'daki Cloudflare yorumunda görünür. Elle gerekirse:
`cd cloud/web && npx wrangler deploy`.

⚠️ **Google girişi yalnız asıl adreste çalışır.** OAuth istemcisine kayıtlı
redirect URI production adresi; önizleme adresinde giriş denenirse Google
`redirect_uri_mismatch` döndürür. Önizleme adreslerini `/auth/app` ile (yani
telefondaki Arşiv sekmesiyle) ya da paylaşım linkleriyle sınayabilirsin; tam
giriş akışı için dal main'e birleştikten sonra asıl adresi kullan.

Secret'lar panelden girilir (Workers & Pages → tasu-arsiv → Settings → Variables
and Secrets). Kodda hiçbiri yazılı değil:

| Secret | Ne |
|---|---|
| `ARCHIVE_TOKEN` | iOS uygulamasının kullandığı paylaşılan anahtar |
| `SESSION_SECRET` | oturum çerezini imzalar |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth istemcisi |
| `ALLOWED_EMAIL` | siteye girebilecek tek Google hesabı |
| `SUPABASE_URL` | `https://PROJE-REF.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service key (yalnız Worker'da) |

R2 kovası `tasu-media` panelde açık olmalı; `wrangler.jsonc` onu `MEDIA` adıyla
bağlıyor.

- [ ] PR'daki Cloudflare yorumu "Deployment successful" diyor
- [ ] `https://<worker>.workers.dev/` açılınca **"Tasu Archive v1.1"** ve tek bir
      **"Giriş yap"** düğmesi görünüyor (başka giriş yolu yok)
- [ ] İzinli Google hesabıyla giriş → arşiv açılıyor
- [ ] Başka bir Google hesabıyla giriş → sade **"Erişim reddedildi"** + **"Çıkış
      yap"** ekranı, başka hiçbir şey yok

### 0.2 .ipa'yı telefona kur

CI derlemesi: <https://github.com/tahs1nkkk/TasuDownloader/actions> → bu dalın
(`fix/saha-raporlari-arsiv-entegrasyonu`) koşusu → Artifacts.

- [ ] .ipa indi, Sideloadly ile kuruldu, uygulama açılıyor
- [ ] Ayarlar → Bulut ve Eşitleme: Worker adresi + `ARCHIVE_TOKEN` girildi,
      "Bağlantıyı sına" yeşil

---

## 1. Web arşiv (bilgisayardan)

### 1.1 Kapı ve gezinme
- [ ] İlk açılışta ekranı ikiye bölen **Listeler** / **Medya** seçenekleri
- [ ] Sol/sağ kenardaki butonlarla iki görünüm arasında geçiş
- [ ] Sol üstteki **"Tasu Arşiv"** yazısına tıklayınca kapıya dönüş
- [ ] Marka yazısının **solundaki hamburger** → arşiv çekmecesi açılıyor
- [ ] Çekmeceden **yeni arşiv** açılıyor, geçiş yapılınca medya ve kategoriler
      birbirine karışmıyor

### 1.2 Listeler
- [ ] Masaüstünde en fazla **4 liste yan yana**, pencere daraldıkça 3 → 2 → 1
- [ ] Liste kartı sayıyı **"x adet"** olarak yazıyor (bağlantı değil)
- [ ] Kartta **eklenme tarihi yok**
- [ ] Karta tıklayınca içerik **altta açılıyor** (yeni sayfa yok)
- [ ] Listeler **site başlıkları** altında gruplu
- [ ] Sağdaki küçük okla grup **daralıyor/genişliyor**
- [ ] Listeye **banner** ve renk atanabiliyor, sayfa yenilenince kalıcı

### 1.3 Medya
- [ ] Site sekmeleri **en üstte tek satır**, en solda **"Tümü"**; pencere
      daraldığında aşağı kaymıyor, yatay taşma yok
- [ ] Her sitenin sekmesi kendi renginde
- [ ] Kartların sol üstünde **"VİDEO"/"GÖRSEL" yazısı yok**
- [ ] **Video önizlemeleri görünüyor** (ilk açılışta kapak üretilir; ikinci
      açılışta anında gelir)
- [ ] Dosya adı kartın altında **yukarı doğru fade** ile soluyor
- [ ] Medya istatistiği sayfanın **altında ve ortalanmış**
- [ ] Kategori ve **alt kategori** eklenebiliyor, adı/rengi değiştirilebiliyor

### 1.4 Seçim ve silme
- [ ] **Seçme** düğmesi → tek tek seçim
- [ ] Seçilenler kategoriye / albüme taşınabiliyor
- [ ] Silme **site içi onay penceresi** soruyor (tarayıcının kendi kutusu değil)
- [ ] Silinen medya **sayfa yeniden yüklenmeden** kayboluyor, kaydırma yerinde
      kalıyor

### 1.5 Görüntüleyici
- [ ] Karta tıklayınca tam ekran açılıyor
- [ ] Sağ/sol ok ile önceki-sonraki medyaya geçiliyor
- [ ] İndir / Sil / Kapat düğmeleri **buton görünümünde ve temayla uyumlu**
- [ ] Video oynatıcı çalışıyor (sarma dahil)
- [ ] **Pencerenin dışına tıklayınca kapanıyor**

### 1.6 Yükleme
- [ ] Header'daki **+** düğmesi, üzerine gelince **"+ Dosya Ekle"** olarak
      genişliyor ve rengi değişiyor
- [ ] Ayrı pencerede **sürükle-bırak** çalışıyor
- [ ] **Önce bütün yüklemeler bitiyor**, nereye ekleneceği sonra soruluyor

### 1.7 Paylaşım
- [ ] Bir medyaya paylaşım linki üretiliyor; **açılma adedi** ve **geçerlilik
      süresi** ayarlanabiliyor
- [ ] Link gizli sekmede (girişsiz) açılıyor
- [ ] Hak bitince ya da süre dolunca link **artık açılmıyor**
- [ ] Çekmecedeki "Paylaşımlar" listesinden link iptal edilebiliyor

---

## 2. Telefon — site site (saha raporlarının karşılığı)

Her başlıkta parantez içinde hangi rapora baktığı yazıyor.

### 2.1 Genel (genel.md)
- [ ] FAB'a **kısa dokunuş** → ekranın ortasındaki tek medya iner (#5)
- [ ] FAB'a **uzun basış** → sarı neon çerçeveli seçim modu açılır (#8)
- [ ] Seçim modunda sayfa **kaydırılabiliyor** ama linkler/butonlar tıklanmıyor (#8)
- [ ] Seçim modunda **İptal** ve **Karanlık** düğmeleri her zaman basılabiliyor (#8)
- [ ] İndirme toast'una **basılı tutunca iptal** çıkıyor; takılan indirme
      kendiliğinden zaman aşımına düşüyor (#9)
- [ ] Listeye kaydedilen bağlantı **gönderinin permalink'i**, site alan adı değil (#7)
- [ ] Galeri → Bulut: dosyalar **site site** ayrılmış, foto/video ayrımı var (#1)
- [ ] Bulut galerisinde **önizlemeler** görünüyor (#3)
- [ ] Tam ekranda **sağa/sola kaydırarak** bir sonraki medyaya geçiliyor (#6)
- [ ] Cihaz galerisinden seçip **buluta yükleme** çalışıyor (#4)

### 2.2 Instagram (instagram.md — 18 rapor)
- [ ] Ayarlar'daki **FAB boyut slideri** çalışıyor, konum korunuyor (#1)
- [ ] Uzun kullanımdan sonra **"Eklenti güncellendi — sekmeyi yenile"** uyarısı
      artık hiç çıkmıyor (#4, #17, #18 — KÖK-A)
- [ ] **Çoklu seçimden sonra tekli indirme** hâlâ çalışıyor (#17)
- [ ] Kaydedilenler'de **çoklu indirme** çalışıyor (#18)
- [ ] Keşfet'te inen medya, **ekranın ortasındaki** medya (#5, #10 — KÖK-B)
- [ ] **Reels**'te indirme ve listeye ekleme çalışıyor (#10)
- [ ] Seçim modunda **ekran dışındaki** medya çerçevelenmiyor (#12)
- [ ] Seçim modunda **profil resimleri** de seçilebiliyor (#13)
- [ ] DM **kişi listesinde** buton yok, **thread içinde** var (#14)
- [ ] Çoklu seçimde video → **video iniyor**, poster görseli değil (#6, #15 — KÖK-C)
- [ ] DM'deki reels **tam çözünürlükte** iniyor (#15)
- [ ] Repost sayfasında çerçeveler doğru yerlerde (#16)
- [ ] Listeye kaydedilen link **permalink** (#11)
- [ ] İkinci Instagram hesabına geçiş (#3) — *bu WebView oturumuna bağlı, hâlâ
      sorunluysa ayrıca bak*

### 2.3 RedGifs (redgifs.md — 4 rapor)
- [ ] İnen görsel adının sonunda **`-large` eki yok** (#2)
- [ ] Liste sayfa adı **"RedGIFs"** (#3)
- [ ] Liste bağlantısı **medya linki**, hepsi tek kayda düşmüyor (#4)
- [ ] Bulut galerisinde RedGifs kendi sekmesinde (#1)

### 2.4 Scrolller (scrolller.md — 11 rapor)
- [ ] Medya başına **indirme butonu çıkmıyor**, yalnız ekran FAB'ı var (#1, #3)
- [ ] İnen görsel adında **çözünürlük eki yok** (#2)
- [ ] Görseller **jpg** iniyor, webp değil (#3)
- [ ] Tam ekranda **arkadaki medyalar algılanmıyor** (#4, #10)
- [ ] **Reklam videolarında** indirme seçeneği çıkmıyor (#5)
- [ ] Seçim modunda **İptal** düğmesine basılabiliyor (#6)
- [ ] Liste kaydında site adı hep **"Scrolller"** (#7)
- [ ] Listeler artık **tek medyaya düşmüyor** (#8)
- [ ] Discover'da çoklu indirmede **videolar video olarak** iniyor (#9, #11)

### 2.5 Reddit (reddit.md — 11 rapor)
- [ ] Kısa dokunuş **tek medya**, uzun basış **çoklu seçim** (#1, #2)
- [ ] Ana sayfada seçim modunda **medya olmayan çerçeveler yok** (#3, #8)
- [ ] Carousel'in **görünmeyen** görselleri çerçevelenmiyor (#4)
- [ ] Görsel tam ekranken **etraftaki çerçeveler yok** (#5)
- [ ] Tam ekranda indirme **tekil** sayılıyor (#6 — bu davranış korunmalı)
- [ ] Seçim modunda sayfadaki linkler tıklanmıyor (#9, #10)
- [ ] **İptal + Karanlık** düğmeleri çalışıyor (#10)
- [ ] ⏸ #7 (gömülü RedGifs) ve #11 (pencere grupları + Liquid arama) **ertelendi**,
      test edilmeyecek

### 2.6 Coomer (coomer.md — 4 rapor)
- [ ] Reklam popup/gif'lerine çerçeve çıkmıyor (#1)
- [ ] Medya üstündeki indirme butonlarının **hepsi** kaldırılmış (#3)
- [ ] Açılmayan videoda indirme **1 dakika takılmıyor**, zaman aşımına düşüp
      iptal edilebiliyor (#2)
- [ ] Listeye kaydedilen bağlantı **tam link** (#4)

---

## 3. Telefon — Galeri ve Arşiv sekmeleri (yeni)

### 3.1 Galeri → Bulut
- [ ] Kare **ızgara** görünümü, web'dekiyle aynı **site sekmeleri**
- [ ] Videolarda **kapak görseli** ve oynat rozeti (kapak yoksa film ikonu)
- [ ] Karta dokununca tam ekran, **sağa/sola kaydırma** ile geçiş
- [ ] Görselde **çift dokunuş** yakınlaştırıyor
- [ ] Video tam ekranda oynuyor; sayfa değişince önceki video **duruyor**
- [ ] Tam ekranda çöp kutusu → onay → siliniyor
- [ ] Uzun basınca **"Buluttan sil"**; silinen kare **listeyi baştan yüklemeden**
      kayboluyor

### 3.2 Arşiv sekmesi
- [ ] Sekme açılınca **Google ekranı görünmeden** doğrudan arşiv geliyor
- [ ] Sayfa iOS iskininde (kenar butonları dar, etiketsiz)
- [ ] **Yatay kaydırma** ile Listeler ↔ Medya geçişi çalışıyor
- [ ] Sayfa kendi kenar butonlarıyla geçiş yaparken **sistemin geri kaydırması
      araya girmiyor**
- [ ] Görüntüleyicideki **İndir** düğmesi → "Galeriye kaydedildi" bildirimi ve
      dosya **Fotoğraflar**'da
- [ ] Sağ üstteki yenile düğmesi sayfayı yeniden yüklüyor
- [ ] Uygulamayı kapatıp açınca **tekrar giriş istenmiyor**

### 3.3 Uçtan uca
- [ ] Telefondan bir Instagram gönderisi indir → hedef **Bulut**
- [ ] Aynı dosya web arşivinde **Instagram sekmesinde** görünüyor
- [ ] Aynı dosya Galeri → Bulut ızgarasında da **Instagram** altında
- [ ] Webden sil → telefonda yenileyince yok
- [ ] **Tam çözünürlük:** indirilen dosyanın boyutu ve piksel ölçüsü, siteden
      inen orijinaliyle aynı (bkz. aşağıdaki not)

---

## 4. Bilinen sınırlar

- **Çözünürlük:** yüklemede hiçbir küçültme yok — dosya diskten olduğu gibi
  akıtılıp R2'ye aynı baytlarla yazılıyor. Tek istisna Scrolller'ın WebP
  görselleri: iOS onları göstermediği için JPEG q0.95'e çevriliyor, **piksel
  ölçüsü değişmiyor** (Scrolller #3'ün kendi isteği).
- **Video kapakları** tarayıcıda üretiliyor (Worker'da ffmpeg yok). Bir videonun
  kapağı, o video web arayüzünde ilk kez görüldükten sonra oluşur; telefon
  ızgarasında ondan önce film ikonu görünür.
- **Ayarlar → Bulut ve Eşitleme paneli duruyor** (Instagram #2 kaldırılmasını
  istiyordu). Uygulama Worker'a Google ile değil paylaşılan anahtarla bağlanıyor;
  panel kalkarsa adres/anahtar girilecek yer kalmıyor. Web tarafı zaten yalnız
  Google girişini kabul ediyor.
- **Ertelenenler:** Reddit #11 (pencere grupları + Liquid arama), Reddit #7
  (gönderi içine gömülü RedGifs).
