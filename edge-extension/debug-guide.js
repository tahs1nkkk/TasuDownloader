const SESSION_KEY = "rgDebugGuideSessionV2";
const extensionApi = globalThis.chrome?.runtime?.getManifest ? globalThis.chrome : null;

const COMMANDS = {
  setup: `copy(JSON.stringify({time:new Date().toISOString(),path:location.pathname,browser:navigator.userAgent,language:navigator.language},null,2))`,
  redgifs: `copy(JSON.stringify((()=>{const q=s=>[...document.querySelectorAll(s)];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"};return{time:new Date().toISOString(),site:"RedGifs",path:location.pathname,feedItems:q("[data-feed-item-id]").length,activeFeedItems:q(".GifPreview_isActive[data-feed-item-id]").length,gifPreviews:q(".GifPreview").length,videos:q("video").length,images:q("img").length,status:q('[id*="ripsnip"][id*="status"]').map(e=>e.textContent).filter(Boolean),helperButtons:q('[id^="rg-ripsnip"],.rg-ripsnip-tile-button').map(e=>({id:e.id||"",class:e.className,visible:vis(e),text:e.getAttribute("aria-label")||e.title||""})).slice(0,30)};})(),null,2))`,
  reddit: `copy(JSON.stringify((()=>{const roots=[document];for(let i=0;i<roots.length;i++)for(const e of roots[i].querySelectorAll("*"))if(e.shadowRoot)roots.push(e.shadowRoot);const all=s=>roots.flatMap(r=>[...r.querySelectorAll(s)]);const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"};return{time:new Date().toISOString(),site:"Reddit",path:location.pathname,shadowRoots:roots.length-1,posts:all("shreddit-post,article").length,images:all("img").length,videos:all("video").length,status:all("#rg-downloader-reddit-status").map(e=>e.textContent).filter(Boolean),helperButtons:all('.rg-downloader-reddit-button,.rg-downloader-reddit-multi-button,#rg-downloader-reddit-overlay').map(e=>({id:e.id||"",class:e.className,visible:vis(e)})).slice(0,30)};})(),null,2))`,
  instagram: `copy(JSON.stringify((()=>{const q=s=>[...document.querySelectorAll(s)];const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0};const ui=document.querySelector("#rg-feedback-host")?.shadowRoot;return{time:new Date().toISOString(),site:"Instagram",path:location.pathname,articles:q("article").length,dialogs:q('[role="dialog"]').length,videos:q("video").length,images:q("img").length,status:ui?.querySelector(".toast")?.textContent||q("#rg-ig-status").map(e=>e.textContent).filter(Boolean),picker:!!ui?.querySelector(".picker"),helperButtons:q('#rg-ig-one,#rg-ig-all,#rg-ig-web').map(e=>({id:e.id,visible:vis(e),disabled:e.disabled,state:e.dataset.visible,opacity:getComputedStyle(e).opacity,pointerEvents:getComputedStyle(e).pointerEvents,transition:getComputedStyle(e).transition,box:e.getBoundingClientRect().toJSON?.()||{}})),media:q("main img,main video,[role='dialog'] img,[role='dialog'] video").filter(vis).map(e=>({tag:e.tagName,fit:getComputedStyle(e).objectFit,box:e.getBoundingClientRect().toJSON()})).filter(e=>e.box.width>100&&e.box.height>100).slice(0,12)};})(),null,2))`,
  scrolller: `copy(JSON.stringify((()=>{const q=s=>[...document.querySelectorAll(s)];const h=document.querySelector("#rg-scrolller-v2-host");const c=document.querySelector("#rg-scrolller-card-buttons");const b=h?.shadowRoot?.querySelector("#rg-scrolller-v2-button");const cardButtons=[...(c?.shadowRoot?.querySelectorAll("#buttons button")||[])];return{time:new Date().toISOString(),site:"Scrolller",path:location.pathname,version:c?.dataset.rgVersion||h?.dataset.rgVersion||null,hostPresent:!!h,hostDisplay:h?getComputedStyle(h).display:null,fallbackButtonPresent:!!b,cardOverlayPresent:!!c,cardButtonCount:cardButtons.length,cardButtons:cardButtons.map(x=>({kind:x.dataset.rgKind,tag:x.dataset.rgMediaTag,sourcePage:x.dataset.rgSourcePage,visible:getComputedStyle(x).visibility})),videos:q("video").map(v=>({src:v.currentSrc||v.src||"",poster:v.poster||"",rect:v.getBoundingClientRect().toJSON()})),images:q("img").length,status:c?.shadowRoot?.querySelector("#status")?.textContent||h?.shadowRoot?.querySelector("#status")?.textContent||""};})(),null,2))`,
  coomer: `copy(JSON.stringify((()=>{const q=s=>[...document.querySelectorAll(s)];const name=document.querySelector(".post__user-name,.user-header__name")?.textContent?.trim()||"";return{time:new Date().toISOString(),site:"Coomer",path:location.pathname,profileName:name,isPost:/\/post\/[^/]+\/?$/.test(location.pathname),attachments:q("main a[href*='/data/']").map(a=>({href:a.href,kind:a.querySelector(".rg-coomer-download")?.dataset.rgKind||null})),videoSources:q("main video").map(v=>({src:v.currentSrc||v.src||null,sources:[...v.querySelectorAll("source[src]")].map(s=>s.src),error:v.error?{code:v.error.code,message:v.error.message}:null,button:!!v.parentElement?.querySelector(":scope > .rg-coomer-download[data-rg-kind='video']")})),buttons:q(".rg-coomer-download").length,buttonErrors:q(".rg-coomer-download").filter(b=>b.title&&/failed|BG\\d+|HTTP|network/i.test(b.title)).map(b=>b.title),adVideos:q(".ts-outstream-video__video").length};})(),null,2))`,
  ripsnip: `copy(JSON.stringify((()=>{const q=s=>[...document.querySelectorAll(s)];return{time:new Date().toISOString(),site:"Ripsnip",path:location.pathname,inputs:q('input,textarea,[contenteditable="true"]').length,buttons:q("button").map(e=>e.innerText.trim()).filter(Boolean).slice(0,20),links:q("a[href]").map(e=>e.innerText.trim()).filter(Boolean).slice(0,20),videos:q("video").length,status:document.body.innerText.match(/error|failed|captcha|download/ig)?.slice(0,20)||[]};})(),null,2))`
};

// DevTools copy(...) returns undefined. Wrap each command so it both copies and
// visibly returns the JSON string, preventing "undefined" diagnostic records.
for (const key of Object.keys(COMMANDS)) {
  const prefix = "copy(JSON.stringify(";
  const suffix = ",null,2))";
  const command = COMMANDS[key];
  if (!command.startsWith(prefix) || !command.endsWith(suffix)) continue;
  const expression = command.slice(prefix.length, -suffix.length);
  COMMANDS[key] = `(()=>{const data=${expression};const text=JSON.stringify(data,null,2);copy(text);return text;})()`;
}

const TESTS = [
  { site: "Hazırlık", title: "Eklentiyi yeniden yükle", instruction: "edge://extensions sayfasında Tasu Downloader için Yeniden Yükle'ye bas. Açık test sekmelerini F5 ile yenile. Eklenti Ayarlar'ından Siteye göre klasör düzenini seç ve en az bir özel klasör tanımla. Ana menüde site ve araç butonlarının üzerine gelip ayrıl.", expected: "Sürüm bu rehberle aynıdır. Site logosu bulanık tam yüzeyden soldaki net kareye dönüşür; isim sağdan belirir. Araç ikonu küçülür, altında adı görünür. Ayrılınca animasyon tersine döner; başlık sabit, yazılar okunur kalır.", command: COMMANDS.setup },
  { site: "RedGifs", title: "Feed videosu", instruction: "Ana feed'de oynatılabilir bir videonun indirme düğmesine bas ve Ana klasör seç.", expected: "Video RedGifsDownloader/RedGifs/Videolar altında iner.", url: "https://www.redgifs.com/", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Viewer videosu", instruction: "Bir videoyu viewer/tam ekran görünümünde aç ve sol üstteki indirme düğmesini kullan.", expected: "Doğru aktif video bir kez indirilir; başka feed videosu seçilmez.", url: "https://www.redgifs.com/", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "GIF keşfet sayfası", instruction: "/explore/gifs sayfasındaki bir kartı indir.", expected: "Kartın videosu RedGifs/Videolar altında iner.", url: "https://www.redgifs.com/explore/gifs", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Görsel keşfet sayfası", instruction: "/explore/images sayfasındaki bir görseli indir.", expected: "Gerçek görsel dosyası RedGifs/Fotoğraflar altında iner; XML/HTML dosyası inmez.", url: "https://www.redgifs.com/explore/images", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Profil grid içeriği", instruction: "Bir üretici profilindeki grid öğesini indirme düğmesiyle indir.", expected: "Seçilen grid öğesi doğru medya türü klasörüne iner ve profil sayfasına dönülür.", url: "https://www.redgifs.com/", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Profil avatarı", instruction: "Bir profil avatarının üzerine gel ve avatar indirme düğmesini kullan.", expected: "Avatar RedGifs/Fotoğraflar altında iner.", url: "https://www.redgifs.com/", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Özel klasör seçimi", instruction: "Normal bir video indirirken tanımlı özel klasörlerden birini seç.", expected: "Dosya RedGifs/Videolar/{seçilen-klasör} altında iner.", url: "https://www.redgifs.com/", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Niche dizini önizlemeleri", instruction: "Ana /niches sayfasını aç ve niche kartlarındaki önizleme videolarına bak. Kartı tıklayıp niche içine girmeden indirme deneme.", expected: "Ana niche dizinindeki önizleme kartlarında indirme düğmesi görünmez.", url: "https://www.redgifs.com/niches", command: COMMANDS.redgifs },
  { site: "RedGifs", title: "Niche otomatik klasörü", instruction: "Bir /niches/{ad} sayfasından içerik indir.", expected: "Dosya RedGifs/Niches/{niche-adı} altında iner; Fotoğraflar veya Videolar ara klasörü oluşmaz.", url: "https://www.redgifs.com/niches", command: COMMANDS.redgifs },

  { site: "Reddit", title: "Tek görsel", instruction: "Tek görselli bir Reddit gönderisindeki indirme düğmesini kullan.", expected: "Görsel Reddit/Fotoğraflar altında iner ve galeri/tümünü indir düğmesi görünmez.", url: "https://www.reddit.com/", command: COMMANDS.reddit },
  { site: "Reddit", title: "Galeri aktif görseli", instruction: "Galeri gönderisinde birkaç kez ileri git ve yalnızca ekranda görünen görseli indir.", expected: "Yalnızca aktif galeri görseli indirilir.", url: "https://www.reddit.com/", command: COMMANDS.reddit },
  { site: "Reddit", title: "Galerinin tamamı", instruction: "Çoklu indirme düğmesine bas. Önizlemede bir öğenin seçimini kaldırıp İndir'e bas; sonra yeniden açıp İptal'i dene.", expected: "Tüm öğeler başlangıçta yeşil çerçeveyle seçilidir. Yalnız onaylanan öğeler birer kez Reddit/Fotoğraflar altına iner. İptal yeni indirme başlatmaz.", url: "https://www.reddit.com/", command: COMMANDS.reddit },
  { site: "Reddit", title: "NSFW görsel yedeği", instruction: "Erişim iznin olan bir NSFW görsel gönderisini indir.", expected: "HTML onay sayfası yerine gerçek görsel indirilir; gerekirse preview.redd.it yedeği kullanılır.", url: "https://www.reddit.com/", command: COMMANDS.reddit },
  { site: "Reddit", title: "Profil avatar filtresi", instruction: "Profil fotoğrafı bulunan bir kullanıcı profiline git ve avatarın üzerinde medya indirme düğmesi oluşup oluşmadığını kontrol et. Avatar yoksa testi Atla.", expected: "Avatar gizleme ayarı açıksa avatar üzerinde gönderi indirme düğmesi görünmez.", url: "https://www.reddit.com/", command: COMMANDS.reddit },
  { site: "Reddit", title: "Video gönderisi", instruction: "Bir Reddit video gönderisinde indirme düğmesi ve indirme davranışını kontrol et.", expected: "Video desteği varsa Reddit/Videolar altında iner; düğme yoksa bu test eksik özellik olarak Çalışmıyor işaretlenir.", url: "https://www.reddit.com/", command: COMMANDS.reddit },

  { site: "Instagram", title: "Tek fotoğraf gönderisi", instruction: "Profilde tek fotoğraflı bir gönderinin üzerine gel, birkaç saniye bekle, fareyi dışarı çıkar ve yeniden gelip tekli düğmeyle indir. Görünürlük ayarı Hover olsun.", expected: "Çoklu indirme düğmesi görünmez. Dışarı çıkınca buton gecikmeden solmaya başlar. Fotoğraf Instagram/Fotoğraflar altına iner; altta bilgi ve gerçek tamamlanma bildirimleri görünür.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Reels videosu", instruction: "Bir Reels videosunun indirme düğmesini kullan.", expected: "Kapak görseli yerine video Instagram/Videolar altında iner.", url: "https://www.instagram.com/reels/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Carousel aktif öğesi", instruction: "Fotoğraf/video carousel içinde ilerle ve yalnızca ekrandaki öğeyi indir.", expected: "Görünen öğe kendi Fotoğraflar veya Videolar klasörüne iner.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Carousel tamamı", instruction: "Tümünü indir düğmesine bas. Kare önizlemelerde bir öğeyi çıkarıp İndir'e bas. Tekrar açıp tüm seçimleri kaldır; sonra İptal'i dene.", expected: "Tüm öğeler başlangıçta yeşil parlamayla seçilidir. Yalnız seçilenler iner ve dosya türlerine ayrılır. Sıfır seçimde İndir kapalıdır. İptal yeni indirme başlatmaz. Pencere yer varsa düğmenin üstünde, yoksa altında açılır.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Fotoğraf story", instruction: "Bir fotoğraf story'sinin üzerine gel. Pencereyi genişletip daralt ve butonun konumunu kontrol et; ardından indir.", expected: "Buton ekran köşesine değil görünen story görselinin sol üstüne bağlanır. Fotoğraf Instagram/Fotoğraflar altına iner.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Video story", instruction: "Bir video story'sini indir.", expected: "Video Instagram/Videolar altında iner.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Müzikli fotoğraf story", instruction: "Müzik etiketi bulunan ama görsel olan bir story'yi indir.", expected: "Siyah video yerine görünen fotoğraf indirilir.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Highlight", instruction: "Bir highlight içinde fotoğraf ve video öğelerini ayrı ayrı indir.", expected: "Ekrandaki doğru highlight öğesi medya türüne göre ayrılır; komşu preload öğesi indirilmez.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Profil avatarı", instruction: "Bir profil avatarının üzerine gel ve indir.", expected: "Avatar Instagram/Fotoğraflar altında iner.", url: "https://www.instagram.com/", command: COMMANDS.instagram },
  { site: "Instagram", title: "Gizli takip edilen hesap", instruction: "Takip ettiğin gizli bir hesabın erişilebilir gönderisini indir.", expected: "Mevcut Instagram oturumu kullanılır ve medya doğru klasöre iner.", url: "https://www.instagram.com/", command: COMMANDS.instagram },

  { site: "Scrolller", title: "Görsel kart düğmesi", instruction: "Görünür bir görsel kartın sol üstündeki indirme düğmesine bas.", expected: "Her görünür kartta düğme vardır ve seçilen görsel Scrolller/Fotoğraflar altında iner.", url: "https://scrolller.com/", command: COMMANDS.scrolller },
  { site: "Scrolller", title: "Video kartı", instruction: "Görünür bir video kartının sol üstündeki indirme düğmesine bas.", expected: "En iyi video varyantı Scrolller/Videolar altında iner.", url: "https://scrolller.com/", command: COMMANDS.scrolller },
  { site: "Scrolller", title: "Kaydırma sonrası hedef", instruction: "Sayfayı birkaç ekran kaydır ve yeni görünen bir kartın düğmesine bas.", expected: "Düğmeler kartların değişken yüksekliğine göre yeniden konumlanır ve doğru medya iner.", url: "https://scrolller.com/", command: COMMANDS.scrolller },
  { site: "Scrolller", title: "Tam ekran görüntüleyici", instruction: "Bir içeriği tam ekran/viewer görünümünde açıp indir.", expected: "Viewer içindeki aktif medya doğru tür klasörüne iner.", url: "https://scrolller.com/", command: COMMANDS.scrolller },

  { site: "Coomer", title: "Profil önizlemeleri", instruction: "Örnek kullanıcı profilini aç ve post önizlemelerini kontrol et.", expected: "Profil kartlarında ve reklam videolarında indirme düğmesi görünmez.", url: "https://coomer.st/fansly/user/659954537603276800", command: COMMANDS.coomer },
  { site: "Coomer", title: "Sayfalı profil", instruction: "Profilin ?o=50 sayfasını aç ve önizlemeleri kontrol et.", expected: "İkinci sayfadaki önizlemelerde de indirme düğmesi görünmez.", url: "https://coomer.st/fansly/user/659954537603276800?o=50", command: COMMANDS.coomer },
  { site: "Coomer", title: "Post görsel eki", instruction: "Örnek postu aç ve bir görsel ekinin mavi indirme düğmesini kullan.", expected: "Dosya Coomer/pockycats/Fotoğraflar altında gerçek ek URL'sinden iner.", url: "https://coomer.st/fansly/user/659954537603276800/post/660340145878212608", command: COMMANDS.coomer },
  { site: "Coomer", title: "Post video eki", instruction: "Örnek video postunu aç. Post tamamen boşsa site/API bakımını not et; medya görünüyorsa video düğmesini kullan.", expected: "Gerçek Coomer video kaynağında düğme görünür ve dosya Coomer/{kullanıcı}/Videolar altına iner; harici reklam videosunda düğme oluşmaz.", url: "https://coomer.st/fansly/user/659954537603276800/post/798739556680605697", command: COMMANDS.coomer },

  { site: "Ripsnip", title: "RedGifs yedek akışı", instruction: "Ripsnip sekmesini aç, popup'ta açık Ripsnip sekmesini kullan seçeneğini etkinleştir ve bir RedGifs videosu indir.", expected: "Ripsnip akışı tamamlanır ve dosya yine RedGifs/Videolar altında kalır.", url: "https://ripsnip.com/", command: COMMANDS.ripsnip }
];

let session = { index: 0, results: {}, startedAt: new Date().toISOString() };

const $ = (id) => document.getElementById(id);

function storageGet(key) {
  if (!extensionApi) {
    try { return Promise.resolve(JSON.parse(localStorage.getItem(key))); }
    catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => extensionApi.storage.local.get(key, (items) => resolve(items[key])));
}

function storageSet(value) {
  if (!extensionApi) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    return Promise.resolve();
  }
  return extensionApi.storage.local.set({ [SESSION_KEY]: value });
}

function showToast(text, level = "info") {
  if (globalThis.RG_UI) { globalThis.RG_UI.toast(text, /hata|başarısız/i.test(text) ? "error" : level); return; }
  $("toast").textContent = text;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { $("toast").textContent = ""; }, 2500);
}

function statusCounts() {
  const values = Object.values(session.results);
  return {
    passed: values.filter((x) => x.status === "passed").length,
    failed: values.filter((x) => x.status === "failed").length,
    skipped: values.filter((x) => x.status === "skipped").length
  };
}

function renderSidebar() {
  const sites = [...new Set(TESTS.map((test) => test.site))];
  $("siteSummary").innerHTML = sites.map((site) => {
    const ids = TESTS.map((test, index) => ({ test, index })).filter((item) => item.test.site === site);
    const completed = ids.filter((item) => session.results[item.index]).length;
    const failed = ids.filter((item) => session.results[item.index]?.status === "failed").length;
    return `<div class="site-row"><strong>${site}</strong><span>${completed}/${ids.length}${failed ? ` · ${failed} hata` : ""}</span></div>`;
  }).join("");
}

function render() {
  const finished = session.index >= TESTS.length;
  const completed = Object.keys(session.results).length;
  $("progressLabel").textContent = `${completed} / ${TESTS.length}`;
  $("progressBar").style.width = `${Math.round(completed / TESTS.length * 100)}%`;
  renderSidebar();

  for (const id of ["stepTitle", "stepInstruction", "stepExpected", "siteBadge", "stepNumber", "decisionPanel", "stepTools", "expectedPanel"]) {
    const node = $(id);
    if (node) node.hidden = finished;
  }
  $("finishedPanel").hidden = !finished;
  $("failurePanel").hidden = true;

  if (finished) {
    const counts = statusCounts();
    $("finishedSummary").textContent = `${counts.passed} çalışıyor, ${counts.failed} çalışmıyor, ${counts.skipped} atlandı.`;
    return;
  }

  const test = TESTS[session.index];
  $("siteBadge").textContent = test.site;
  $("stepNumber").textContent = `Adım ${session.index + 1} / ${TESTS.length}`;
  $("stepTitle").textContent = test.title;
  $("stepInstruction").textContent = test.instruction;
  $("stepExpected").textContent = test.expected;
  $("openSite").hidden = !test.url;
  $("backStep").disabled = session.index === 0;
  $("diagnosticCommand").textContent = test.command || COMMANDS.redgifs;
  $("diagnosticOutput").value = session.results[session.index]?.diagnostic || "";
  $("failureNote").value = session.results[session.index]?.note || "";
}

async function saveResult(status, extra = {}) {
  const test = TESTS[session.index];
  session.results[session.index] = {
    id: session.index,
    site: test.site,
    title: test.title,
    status,
    expected: test.expected,
    recordedAt: new Date().toISOString(),
    ...extra
  };
  session.index += 1;
  await storageSet(session);
  render();
  globalThis.RG_UI?.toast(status === "passed" ? "Çalışıyor olarak kaydedildi." : status === "failed" ? "Hata ve tanılama sonucu kaydedildi." : "Test atlandı.", status === "passed" ? "success" : status === "failed" ? "error" : "warning");
}

function buildLog() {
  const counts = statusCounts();
  return {
    schema: "redgifs-downloader-debug-v2",
    extensionVersion: extensionApi?.runtime.getManifest().version || "development",
    startedAt: session.startedAt,
    exportedAt: new Date().toISOString(),
    summary: { total: TESTS.length, ...counts },
    environment: { userAgent: navigator.userAgent, language: navigator.language },
    results: TESTS.map((test, index) => session.results[index] || {
      id: index,
      site: test.site,
      title: test.title,
      status: "pending",
      expected: test.expected
    })
  };
}

function downloadLog() {
  const text = JSON.stringify(buildLog(), null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `redgifs-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Debug logu indirme işlemi başlatıldı.");
}

async function init() {
  const saved = await storageGet(SESSION_KEY);
  if (saved && saved.results) session = saved;
  $("versionLabel").textContent = `v${extensionApi?.runtime.getManifest().version || "dev"}`;
  render();

  $("openSite").addEventListener("click", () => {
    const url = TESTS[session.index].url;
    if (extensionApi) extensionApi.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  });
  $("markPassed").addEventListener("click", () => saveResult("passed"));
  $("markFailed").addEventListener("click", () => {
    $("decisionPanel").hidden = true;
    $("failurePanel").hidden = false;
    $("diagnosticOutput").focus();
  });
  $("cancelFailure").addEventListener("click", () => {
    $("failurePanel").hidden = true;
    $("decisionPanel").hidden = false;
  });
  $("saveFailure").addEventListener("click", () => saveResult("failed", {
    diagnostic: $("diagnosticOutput").value.trim(),
    note: $("failureNote").value.trim()
  }));
  $("skipStep").addEventListener("click", () => saveResult("skipped"));
  $("backStep").addEventListener("click", async () => {
    if (session.index > 0) session.index -= 1;
    await storageSet(session);
    render();
  });
  $("copyCommand").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("diagnosticCommand").textContent); showToast("Konsol komutu kopyalandı.", "success"); }
    catch { showToast("Kopyalama başarısız. Komut metnini seçip elle kopyalayabilirsin.", "error"); }
  });
  $("copyLog").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(buildLog(), null, 2)); showToast("Debug logu panoya kopyalandı.", "success"); }
    catch { showToast("Kopyalama başarısız. JSON indir seçeneğini kullanabilirsin.", "error"); }
  });
  $("downloadLog").addEventListener("click", downloadLog);
  $("downloadLogFinal").addEventListener("click", downloadLog);
  $("resetSession").addEventListener("click", async () => {
    if (!confirm("Bütün debug sonuçları silinsin mi?")) return;
    session = { index: 0, results: {}, startedAt: new Date().toISOString() };
    await storageSet(session);
    render();
    globalThis.RG_UI?.toast("Debug oturumu sıfırlandı.", "warning");
  });
}

init();
