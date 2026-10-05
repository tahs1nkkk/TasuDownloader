# Tasu Apps — Windows müzik yardımcısı

Bu klasörü kalıcı bir konumda tut. Eklenti ZIP'inden ayrıdır; Python/FFmpeg
tarayıcı içinde çalışmaz. Kurulum bulut sunucusu açmaz, güvenlik yazılımını
değiştirmez ve yönetici yetkisi istemez.

## Bir kez kurulum

1. Edge eklenti sayfasında Tasu Apps kartındaki 32 harfli kimliği kopyala.
2. PowerShell'de bu klasördeki `install.ps1` dosyasını `-ExtensionId` ile çalıştır.
   Gerekirse `-SpotifyProject` ile eski spotify-downloader klasörünü ve
   `-PythonPath` ile bağımlılıkları kurulu Python'u belirt.
3. Tasu Apps → Müzik ekranını açıp Native Messaging iznini ver.

Örnek (kimlik yerine kendi kimliğin):

```powershell
& 'C:\Users\lsatv\Documents\ALL_PROJECTS\TasuDownloader\native-music\install.ps1' -ExtensionId 'eklenti-kimligin'
```

Varsayılan kurulum mevcut Spotify projesinin `.venv` ortamını kullanır. Ortamda
`vendor/requirements.txt` bağımlılıkları olmalı. Kurucu paket yüklemez, Spotify
anahtarlarını çıktıya yazmaz/kopyalamaz. Eski `.env` dosyası motor tarafından
yalnızca bu bilgisayarda okunur. Node/Deno, mevcut indiricide olduğu gibi
YouTube çözücüsü için gerekebilir.

Windows bağlantı kaydı, başlatıcı ve yardımcı Python çalışma dosyaları
`%LOCALAPPDATA%\TasuApps\Music` altında tutulur. Eklenti kimliği veya kaynak proje yolu değiştiğinde aynı kurucuyu tekrar
çalıştırmak bağlantıyı onarır; hesapları, indirmeleri ve iş geçmişini silmez.
“Windows yardımcısının kaydı bulunamadı” tarayıcının kayıt/manifest veya
başlatıcı dosyasına erişemediğini belirtebilir; tek başına kayıt anahtarının
olmadığını kanıtlamaz. “İndirme listesi alınamadı” ise ayrı bir iş geçmişi
hatasıdır ve motorun bağlı olmadığı anlamına gelmez.

0.31.4 ve sonrasında bağlantı hatası kartındaki **Bağlantıyı denetle** düğmesi
açık Edge oturumunda ekran ve arka plan bağlantılarını ayrı ayrı sınar.
Tamamlanınca **Raporu kopyala** ile sonucu paylaşabilirsin. Kontrol yalnızca
durum sorgular; hesap, çerez, indirme geçmişi veya özel dosya yollarını rapora
almaz. İzin reddi varsa yardımcıyı başlatmaz. Ayrı test profilinin başarılı
olması, mevcut kullanıcı profilinin bağlantısının da çalıştığını kanıtlamaz.

Spotify girişinde uygulamanın dönüş adresi `http://127.0.0.1:8765/callback`
(APP_PORT değiştirildiyse o port) olarak kalır. Eski sunucu aynı portta açıksa
kapatıp yeniden dene. Oturum yeniden açılır; yeni token Windows kullanıcı
korumasıyla saklanır. Spotify'dan yalnızca bilgiler alınır, ses YouTube'dan gelir.

## Çalışma

Müzik ekranı motor açılırken evre ve yüzde göstergesi sunar. Motor gerektiğinde arka planda başlar; görünür ekran ve devam eden iş yoksa
beş dakika sonra çıkar. Menü/broker kapanması indirmeyi kesmez. Dönüştürmeler
sırayladır. Süreç çökmesi sonrası eski işler “kesildi” olarak görünür; otomatik
yeniden başlatılmaz. Aynı istek kimliğinin tekrarı ikinci bir indirme açmaz.

İşler `%LOCALAPPDATA%\TasuApps\Music` altında, mevcut indirici klasör tercihi
`SpotifyYouTubeIndirici` kullanıcı ayarlarında kalır. Bu veriler paylaşım
paketlerine dahil edilmez. Yardımcı yalnızca kurulumda verdiğin eklenti kimliğiyle
konuşur; genel komut/shell API'si yoktur. Medya verisi Native Messaging üzerinden
geçmez. Kullanıcının indirme hakkı olan içerikler içindir; DRM çözme desteği yoktur.

Gelişmiş indirme ayarları müzik ekranındadır: video çözünürlüğü, bit hızı,
sanatçı/başlık adlandırması, ayırıcı, kapak, Türkçe sadeleştirme, liste/ızgara,
varsayılan klasöre dönüş ve kişisel verileri dışarıda bırakan paylaşım ZIP'i seçenekleri.
Tarayıcı oturumu seçimi sadece açık müzik ekranı için geçerlidir; her açılışta
kapalı başlar. Seçersen yardımcı o tarayıcının YouTube çerezlerini yerelde
kullanmayı dener. Çerezler eklentiye, iş kaydına veya paketlere yazılmaz.

## Kaldırma

`uninstall.ps1` yalnızca bu kullanıcıya ait Edge bağlantı kaydını kaldırır.
İndirilenleri ve kişisel veriyi silmez. Yardımcı süreci aktif indirmeler bitince
normal boşta kalma süresinde kapanır.
