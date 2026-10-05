# Tasu Apps — Windows / Edge 0.31.7

## Bu sürüm

- 0.31.7: Reddit içindeki RedGifs embed indirme düğmesi, genel “her zaman göster” ayarında bile yalnız medya hover durumunda görünür. RedGifs embedleri galeri olarak değerlendirilmez ve çoklu indirme düğmesi hiçbir zaman gösterilmez.
- 0.31.6: Friend Tracker açılışta ikinci kez otomatik yenilenmez; hesap geçişi tek çizimde kalır. Adsız `?` olayları gösterilmez ve kısa aralıklı aynı geçişler tekrarlanmaz. Arkadaş ekleme/çıkarma masaüstü bildirimleri kaldırıldı; yalnız kullanıcı bazlı çevrimiçi/oyun izlemeleri bildirim üretir. Roblox modülü etkinleştirildikten sonra arka plan takibi her zaman açıktır, süre ayarlanır; masaüstü bildirimleri ayrı kapatılabilir. Aktiviteyi açınca araç çubuğu rozeti temizlenir. Bildirime basmak, açık Edge'de eklenti açılır penceresini kullanıcı ayrıntısıyla açmayı dener; Edge penceresi yoksa aynı ekranla yeni pencere açar.
- Friend Tracker oyun izleme simgesi yenilendi; izleme/dil menüleri pencereye sığdırıldı. Hesap, oyun ve özel sunucu girişleri modal genişliğine düzeltildi. Dil menüsü yerel, cam temalı ve hafif bir seçim menüsüne dönüştürüldü.
- Windows müzik çalışma dosyaları artık kayıt ve manifestle aynı `%LOCALAPPDATA%\TasuApps\Music` klasöründen başlar. Motor başlangıcı evre/yüzde çubuğu gösterir. Eski uygulamadaki liste/ızgara, varsayılan klasöre dönüş ve güvenli paylaşım ZIP'i seçenekleri taşındı; mevcut biçim, kalite, kapak, adlandırma, arama ve oturum grupları korunur.
- 0.31.5: RedGifs'teki `E_FAILED` indirme sorunu, açık sekme yenilenince çözüldü (kullanıcı doğruladı). Eski eklenti bağlantısı artık açık bir yenileme uyarısı verir; bağlantı hatası/zaman aşımı sonrası gereksiz paylaşım menüsü denemesi yapılmaz. Adresi değişmeyen Explore/Niches görüntüleyicilerinde ve kapsayıcı tam ekranda indirme/liste düğmeleri videonun görünen alanına yerleşir. Ayrıntı: `redgifs-0.31.5.md`.
- 0.31.4: Müzik ekranına açık kullanıcı isteğiyle çalışan “Bağlantıyı denetle” ve “Raporu kopyala” eklendi. Aynı kurulu yardımcıya hem ekran hem arka plan bağlamından, tek mesaj ve port yöntemleriyle yalnızca durum sorgusu yapılır. Rapor izin/sürüm/eklenti kimliği ve tanınan tarayıcı hatalarını içerir; hesap, çerez, özel dosya yolu, iş geçmişi ve ham yardımcı yanıtı içermez. Bu değişiklik henüz canlı bağlantı sorununun çözüldüğü anlamına gelmez.
- Banner bulanıklığı ve süre ayarları kaldırıldı; kullanıcının kayıtlı değerleri korunur, görünüm sıfırlaması bunları değiştirmez.
- Hızlı Galeri menüden kaldırıldı; indirme geçmişi ve tam Tasu Arşiv korunur. Google girişi/isteğe bağlı ARCHIVE_TOKEN yardımı arşiv ekranına eklendi. Hub içindeki arşiv düğmelerinin güvenilir çerçeve kontrolü düzeltildi.
- MP3 ses bit hızı ve MP4 video çözünürlüğü dönüşümlü gösterilir; seçimler ayrı saklanır. Dosya adı, kapak, arama ve YouTube oturumu ayrı ayar gruplarıdır.
- Dada dil düğmesi gizlendi; kaynak metinler ve kayıtlı dil değişmedi. Friend Tracker oyun düğmesi yeni vektör oyun kumandası simgesini kullanır.
- Müzikte kayıt bulunamadı/izin/başlatma/bağlantı hataları ayrıştırılır. İş geçmişi hatası artık sağlıklı motoru bağlı değil göstermez. Etkinleştirme yarışında eski kapalı modül durumu yeniden etkinleştirilir.
- Windows yardımcı kaydı yeniden kuruldu; bağlantı manifesti ve başlatıcı kalıcı kullanıcı uygulama klasörüne taşındı. Doğrudan broker ve ayrı Edge taşıma testleri geçti; kullanıcının açık tarayıcı oturumundaki son bağlantı sonucu ayrıca doğrulanmalıdır.

- Ana sayfa: üç yerel banner, düşük bulanıklık, beyaz ayırıcı ve ortadan iki yana açılan hover animasyonu. Orijinal logolar ayrı dosyalar olarak korunur.
- Sabit beyaz/açık mavi cam görseli; sitenin karanlık arka planı veya ekran görüntüsü kullanılmaz. Merkez ayarları sadeleştirildi.
- Başlık ve küçük ikon düğmeleri ortalandı. Friend Tracker, Dada ve müzik ekranları küçük pencereye göre düzenlendi.
- Araçlar kendi düğmelerinden izin alıp açılır. Eşzamanlı ilk açılışta etkinleştirme ayarının sıfırlanması düzeltildi.
- Tek harici pencere: açıkken yenisi reddedilir, harici pencerenin büyüt düğmesi yoktur. Pencere kapanınca yeniden açılabilir.
- Friend Tracker kayıtlı listeyi avatar/ağ sorgularından önce gösterir. Hata ve oturum yokluğu gizlenmez. Bildirim izni arkadaş listesi için zorunlu değildir; arka plan takibi kendi ayarındadır.
- Dada verilen ayrı kaynak projenin metin bankası ve işlevleriyle geri taşındı. 500 UTF-8 bayt, dil/Türkçe karakter, yıldızlar, not/rozet/emoji, kopyalama, Decal ID ve tekrar geçmişi korunur. Çocuk çağrışımlı cinsiyet/ton birleşimleri erişime açılmaz; yalnızca yetişkin modları vardır. Eski sadeleştirilmiş Dada uygulama dosyaları kaldırıldı; kaynak proje değişmedi.
- Müzikte arama, biçim, klasör, Spotify hesabı, ayarlar ve işler görsel olarak ayrıldı. Kaynak/eşleşme bilgisi sonuç satırında görünür.

## Mevcut bilgisayarda kurulum

Kullanılan Edge klasörü:
`C:\Users\lsatv\Documents\ALL_PROJECTS\TasuDownloader\edge-extension`

Bu klasörü yeniden yüklemek yerine mevcut Tasu Apps eklentisinde **Yenile** kullan.
Eski, bulunmayan `RedgifsRipsnipBot\edge-extension` yolundaki kopyayı açma.

Windows yardımcısı bu çalışma sırasında mevcut eklenti kimliği
`ppfdkoijifcinfpdlpepddlgjbajhdeg` için kullanıcı düzeyinde kuruldu.
Kayıt yalnızca bu kimliğe izin verir. Yönetici yetkisi, antivirüs değişikliği veya
tarayıcı güvenlik ayarı değişikliği yapılmadı. Kurulu aracı üzerinden durum/serbest
bırakma çağrısı başarıyla sınandı: motor, FFmpeg ve Spotify yapılandırması hazır.
Bu, gerçek Spotify girişinin veya bir indirme işleminin tamamlandığı anlamına gelmez.

Farklı bilgisayar/eklenti kimliği için `native-music/README.md` kurulumunu izle.
Yerel yardımcı ve eski Spotify Python ortamını taşırsan bağlantı kurulumunu yenile.

## Hızlı kabul sırası

1. Edge eklentisini yenile. Ana bannerlara sırayla hover yap; hareket ve geri dönüşü kontrol et.
2. Büyüt'e bas. Açılan pencerede ikinci büyüt düğmesi olmamalı. Menüden yeniden
   denediğinde önce açık pencereyi kapatmanı istemeli. Kapatınca tekrar açılmalı.
3. Roblox → Friend Tracker: roblox.com hesabına giriş yapmışken aç. Arkadaşlar,
   aktivite, takvim ve oyunları kontrol et. Takip süresini ve ayrı masaüstü
   bildirim seçeneğini Tracker ayarlarından denetle. Yedek aktarımı merkez ayarlarında.
4. Roblox → Dada: ton, tarz, yıldızlar, üret/kopyala ve Decal ID'yi kontrol et. Dil düğmesi görünmemeli.
   Çıktı 500 baytı aşmamalı; bu ekran arkadaş takibi veya müzik motoru başlatmamalı.
5. Müzik: “Motor hazır” görünmeli. Önce hak sahibi olduğun tek YouTube bağlantısı
   ile arama ve indirmeyi dene. Spotify hesabını ekranın Spotify düğmesinden aç.
   İndirme sırasında menüyü kapatıp yeniden aç; iş durumu korunmalı.
   Motor bağlı değilse “Bağlantıyı denetle” → “Raporu kopyala” ile canlı tarayıcı
   raporunu al. Yardımcıyı tekrar tekrar kurmadan önce bu raporu incele.
6. Downloader'da alışılmış görsel/video/çoklu indirme kontrolünü yap.

## Doğrulama ve sınırlar

0.31.6: Friend Tracker merkez/işçi testleri, menü ve modal taşma kontrolleri,
bildirim tıklama rotası, otomatik rozet temizleme, müzik ayarları ve başlatma
arayüzü sentetik Edge profilinde doğrulandı. Kurulu yardımcının sabit kullanıcı
klasöründeki broker/FFmpeg/Spotify yapılandırma durum çağrısı ile ayrı Edge taşıma
kontrolü geçti. Canlı kullanıcı Edge profilinde eklenti yenilemesi sonrası sonuç
ayrıca kullanıcı tarafından doğrulanmalıdır.

0.31.5: 119 JavaScript testi, 63 manifest varlığı, RedGifs arayüz testleri ve
Orion 23/23 + iOS JavaScript köprü testleri geçti. Yeni düğme konumu canlı sitede
henüz kullanıcı tarafından doğrulanmadı. Eklenti yenilendikten sonra açık
RedGifs sekmesi de Ctrl+R ile yenilenmelidir.

0.31.4: 116 JavaScript testi ve 63 manifest varlığının doğrulaması geçti.
Hub arayüz testinde tanılama ve kopyalama akışı sentetik ortamda doğrulandı.
Kullanıcının mevcut Edge oturumundan tanılama raporu bekleniyor.

0.31.3: 113 JavaScript testi, eklenti varlık/sözdizimi doğrulaması, Hub ve
Downloader menü testleri, 8 yerel motor testi geçti. Orion tarayıcı koşumunda
23/23 ve iOS JavaScript köprü kontrolleri geçti. Gerçek telefon/Xcode testi ve
kişisel Spotify/YouTube medya indirmesi yapılmadı.

Canlı Edge ekranında kullanıcı v0.31.3 ile `MUSIC_HOST_MISSING` durumunu gösterdi.
Bu nedenle kurucu yeniden çalıştırıldı; `HKCU` bağlantısı artık
`%LOCALAPPDATA%\TasuApps\Music\com.tasuapps.music.json` dosyasına işaret eder.
Kullanıcı onarımdan sonra da aynı hatanın sürdüğünü bildirdi. Ayrı Edge test
profilinde kayıt/başlatıcı erişimi doğrulansa da açık kullanıcı oturumundaki
sorunun nedeni henüz belirlenmedi; müzik kesin çözülmüş olarak işaretlenmemelidir.

Otomatik testler sentetik kullanıcı/medya kullanır; kişisel hesap sorgusu veya
gerçek medya indirmesi gerçekleştirilmez. Kurulu Windows bağlantı testi yalnızca
durum ve bırakma çağrıları yapar. Paketler yerel, kaydedilmemiş değişiklikli kişisel
önizlemedir; mağaza, tasuapps.com veya buluta yayınlanmaz.

Beş dakikalık uyku, çoklu görünüm, işlerin menü kapalıyken sürmesi, yeniden başlatma,
izin reddi, API bekleme ve veri alanlarının birbirinden ayrılması test edilir.
Eski Arşiv HTTPS testinin Kaspersky test-sertifikası engeli nedeniyle tüm
`test:edge` komutu tek parça geçti olarak raporlanmaz; güvenlik yazılımı kapatılmaz.

Hub arayüz/modül özellikleri Windows/Edge kapsamındadır. 0.31.5 RedGifs
düzeltmeleri ortak kaynakta olduğundan çekirdek/Orion 0.29.1 ve iOS kaynak 1.4.1
olarak birlikte güncellendi. Bu, mobil uygulamanın cihaza kurulduğu veya Xcode
ile doğrulandığı anlamına gelmez. Android hâlâ planlıdır.
Cloud Run ve hesap/bulut eşitleme kurulmadı.

## Kaynaklar ve tekrar üretim

- Hub: `edge-extension/hub/`; ortak site kodu: `shared/`.
- Tracker: `integrations/roblox-source` → `scripts/build-hub.js`.
- Dada: `integrations/dada-source/source-lock.json` → `scripts/build-dada.js`.
- Kaynak Dada: `C:\Users\lsatv\Documents\ALL_PROJECTS\roblox-review-generator-extension`.
- Banner kaynakları, ImageGen istemleri ve orijinal logo adresleri:
  `edge-extension/assets/hub/README.md`.
- Kontroller: `npm test`, `npm run test:hub`, `npm run test:music`,
  `node scripts/check-installed-music.js`, `node scripts/check-edge-music.js`.
  Sonuncusu yalnızca geçici bir test kimliği/kayıt kullanır: Edge'in kurulu
  başlatıcıyı çalıştırmasını ve yetkisiz test kimliğinin reddedilmesini doğrular.
  Test kaydı ve profil işlem sonunda kaldırılır; gerçek tarayıcı profili değiştirilmez.
- Paketleme: `npm run release:hub`. Paketlere anahtar, .env, kullanıcı yedeği,
  tarayıcı oturumu veya medya klasörü alınmaz.
