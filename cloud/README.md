# TasuDownloader bulut katmanı — kurulum

İki parça, ikisi de ₺0:

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| `server/` | **Senin PC'n** (bot sunucusuyla aynı makine) | Medya deposu: telefon indirdiklerini buraya yükler, buradan izler. Alan = diskin kadar. |
| `web/` | **Cloudflare Pages** | Link arşivin: uygulamadaki listeler + medya tarayıcı, her tarayıcıdan. |

İkisini de **tek gizli anahtar** açar. Önce onu üret (PowerShell):

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Çıkan değeri bir yere kopyala — üç yere gireceksin: sunucu config'i,
Cloudflare ortam değişkeni, uygulamanın Ayarlar ekranı.

## 1) PC medya sunucusu (5 dakika)

```powershell
cd C:\Users\lsatv\TasuDownloader\cloud\server
Copy-Item config.example.json config.json
notepad config.json
```

`config.json` içinde:
- `token` → ürettiğin anahtar
- `dir` → medyanın duracağı klasör (örn. `D:/TasuMedia` — bolluğu olan disk)

Başlat:

```powershell
node server.js
```

`http://localhost:8790` yazısını görünce çalışıyor. Otomatik başlatma için
`start-server.bat`'a bir kısayol yap ve `shell:startup` klasörüne at
(Win+R → `shell:startup`).

## 2) Tailscale Funnel — sunucuyu internete aç (10 dakika)

Alan adı, port yönlendirme, güvenlik duvarı ayarı **gerekmez**.

1. [tailscale.com/download](https://tailscale.com/download) → Windows'a kur →
   Google/GitHub hesabıyla giriş yap (ücretsiz).
2. PowerShell (yönetici):

```powershell
tailscale funnel --bg 8790
```

3. `tailscale funnel status` sana `https://<makine-adın>.<tailnet>.ts.net`
   biçiminde bir adres verir. **Bu adres medya sunucunun internet adresi** —
   uygulamaya ve web arşivine bunu gireceksin. Sabittir, PC yeniden başlasa da
   değişmez (`--bg` kalıcıdır).

Telefonda test: Safari'de `https://…ts.net/health?token=ANAHTAR` →
`{"ok":true,…}` görmelisin.

## 3) Supabase tablosu (2 dakika)

[supabase.com](https://supabase.com) → mevcut projen (`xwimvccylidnanwbncpb`)
→ SQL Editor → `cloud/supabase.sql` içeriğini yapıştır → Run. (İstersen bunun
yerine yeni ücretsiz bir proje de açabilirsin; SQL aynı.)

## 4) Cloudflare Pages sitesi (10 dakika)

sapsal-panel'i nasıl kurduysan aynısı:

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → Git repo bağla
   (`TasuDownloader`) ya da **Upload assets** ile `cloud/web/public` yükle.
   - Git bağlarsan: **Root directory = `cloud/web`**, **Build output
     directory = `public`**, build komutu boş.
2. **Settings → Environment variables** (Production + Preview):

| Değişken | Değer |
|---|---|
| `ARCHIVE_TOKEN` | ürettiğin anahtar |
| `SUPABASE_URL` | `https://xwimvccylidnanwbncpb.supabase.co` (ya da yeni projeninki) |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → service_role |

3. Deploy sonrası adresini al: `https://tasu-arsiv.pages.dev` gibi.
4. Siteyi aç → anahtarını gir → medya sunucusu alanına `…ts.net` adresini
   yaz → Giriş.

## 5) Uygulama ayarları (1 dakika)

Telefonda TasuDownloader → **Ayarlar → Bulut ve Eşitleme**:

- Medya sunucusu: `https://<makine>.<tailnet>.ts.net`
- Arşiv sitesi: `https://tasu-arsiv.pages.dev`
- Gizli anahtar: aynı anahtar
- **Bağlantıyı sına** → iki satır da ✓ olmalı (boş disk alanını da gösterir)
- "İndirilenler nereye": **Bulut** = cihazda yer kaplamaz; **İkisi** = hem
  Fotoğraflar hem bulut.

## Nasıl akıyor

```
telefon ──indir──▶ uygulama ──PUT /files──▶ PC (Tailscale Funnel, token'lı)
telefon ──listeler──▶ Pages /api/lists ──▶ Supabase (service key sadece sunucuda)
tarayıcı ──▶ tasu-arsiv.pages.dev ──▶ listeler + PC'deki medya
```

- Medya **hiçbir üçüncü tarafa çıkmaz**: telefon ↔ senin PC'n. Tailscale
  sadece şifreli tünel taşır.
- Galeri → Seç → **Buluta yükle** ile telefonda önceden inmiş dosyaları da
  PC'ye atabilirsin.
- PC kapalıyken medya erişilemez (listeler erişilir — onlar Supabase'de).
  Bot sunucun zaten 7/24 açık olduğu için pratikte fark etmez.

## Sık sorunlar

- **Uygulama "Bulut ✗" diyor:** PC'de `node server.js` çalışıyor mu?
  `tailscale funnel status` adresi gösteriyor mu?
- **Web arşivi "401":** Cloudflare'deki `ARCHIVE_TOKEN` ile girdiğin anahtar
  birebir aynı mı (boşluk kaçmış olmasın)?
- **Medya sekmesi web'de boş ama uygulamada dolu:** giriş ekranındaki medya
  sunucusu alanını boş bırakmışsın — Çıkış yapıp tekrar gir.
