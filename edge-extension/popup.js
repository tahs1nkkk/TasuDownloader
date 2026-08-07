const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;

const controls = [...document.querySelectorAll("[data-setting]")];
const buttonSizeValue = document.getElementById("buttonSizeValue");
const folderStatus = document.getElementById("folderStatus");

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...(items && items[SETTINGS_KEY] || {}) });
    });
  });
}

function writeSettings(settings) {
  settings.feedButtons = true;
  settings.profileButtons = true;
  return chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve((tabs || [])[0] || null));
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function downloadCurrentScrolllerMedia() {
  const button = document.getElementById("downloadScrolllerCurrent");
  const status = document.getElementById("scrolllerActionStatus");
  const tab = await activeTab();
  if (!tab || !/^https:\/\/(?:[^/]+\.)?scrolller\.com\//i.test(tab.url || "")) {
    status.textContent = "Önce bir Scrolller sekmesini aktif et";
    status.dataset.level = "error";
    return;
  }

  button.disabled = true;
  status.textContent = "Medya aranıyor…";
  status.dataset.level = "idle";
  try {
    let response;
    try {
      response = await sendTabMessage(tab.id, { type: "RG_SCROLLLER_DOWNLOAD_CURRENT" });
    } catch {
      // Existing tabs may not have the newest content script. Inject the v2
      // stack on demand instead of requiring another page reload.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["common/settings.js", "content-folders.js", "content-scrolller-v2.js"]
      });
      response = await sendTabMessage(tab.id, { type: "RG_SCROLLLER_DOWNLOAD_CURRENT" });
    }
    if (!response?.ok) throw new Error(response?.error || "İndirme başlatılamadı");
    status.textContent = "İndirme başlatıldı ✓";
    status.dataset.level = "done";
  } catch (error) {
    status.textContent = String(error?.message || error);
    status.dataset.level = "error";
  } finally {
    button.disabled = false;
  }
}

async function sendScrolllerToolCommand(message) {
  const status = document.getElementById("scrolllerActionStatus");
  const tab = await activeTab();
  if (!tab || !/^https:\/\/(?:[^/]+\.)?scrolller\.com\//i.test(tab.url || "")) {
    status.textContent = "Önce bir Scrolller sekmesini aktif et";
    status.dataset.level = "error";
    return null;
  }
  try {
    try {
      return await sendTabMessage(tab.id, message);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["common/settings.js", "content-folders.js", "content-scrolller-v2.js"]
      });
      return await sendTabMessage(tab.id, message);
    }
  } catch (error) {
    status.textContent = String(error?.message || error);
    status.dataset.level = "error";
    return null;
  }
}

async function startScrolllerElementPicker() {
  const response = await sendScrolllerToolCommand({ type: "RG_SCROLLLER_PICK_HIDE" });
  if (response?.ok) window.close();
}

async function resetScrolllerHiddenElements() {
  const status = document.getElementById("scrolllerActionStatus");
  const response = await sendScrolllerToolCommand({ type: "RG_SCROLLLER_RESET_HIDDEN" });
  if (!response?.ok) return;
  status.textContent = "Gizlenen öğeler geri getirildi ✓";
  status.dataset.level = "done";
}

function setCloudStatus(text, level = "idle") {
  const el = document.getElementById("cloudStatus");
  if (!el) return;
  el.textContent = text || "";
  el.dataset.level = level;
}

// Worker'ı sekmede açar: giriş yapılmamışsa Google giriş sayfası gelir, sonra
// eklenti fetch'i o kökene ait oturum çerezini taşır.
async function connectWithGoogle() {
  const s = await readSettings();
  const base = globalThis.RG_CLOUD.normalizeBase(s.cloudBase);
  if (!base) { setCloudStatus("Önce Worker adresini gir", "error"); return; }
  chrome.tabs.create({ url: `${base}/` });
  setCloudStatus("Site açıldı — Google ile giriş yap. Eklenti içi yükleme/ızgara için jeton gerekir.", "idle");
}

async function testCloudConnection() {
  const s = await readSettings();
  setCloudStatus("Deneniyor…", "idle");
  const r = await globalThis.RG_CLOUD.checkConnection(s);
  if (r.ok) {
    setCloudStatus(`Bağlı ✓ (${r.mode === "token" ? "jeton" : "Google"}${r.version ? `, v${r.version}` : ""})`, "done");
  } else {
    setCloudStatus(r.error || "Bağlanamadı", "error");
  }
}

async function previewCloudLists() {
  const s = await readSettings();
  if (!globalThis.RG_CLOUD.canUseApi(s)) { setCloudStatus("Adres + jeton gir (listeler jeton ister)", "error"); return; }
  setCloudStatus("Listeler çekiliyor…", "idle");
  try {
    const data = await globalThis.RG_CLOUD.getLists(s);
    const n = data && Array.isArray(data.lists) ? data.lists.length : 0;
    setCloudStatus(n ? `Bulutta ${n} liste var. Yönetmek için "Arşivi aç".` : "Bulutta liste yok.", "done");
  } catch (e) {
    setCloudStatus(e.message || String(e), "error");
  }
}

function sanitizePath(value) {
  return String(value || "RedGifsDownloader")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "RedGifsDownloader";
}

function renderControl(control, settings) {
  const key = control.dataset.setting;
  const value = settings[key];
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
  } else if (control.type === "range") {
    control.value = Number(value) || DEFAULT_SETTINGS[key];
  } else {
    control.value = value ?? DEFAULT_SETTINGS[key] ?? "";
  }
}

function sanitizeFolder(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 40);
}

async function saveFolders(folders) {
  const current = await readSettings();
  current.mediaFolders = folders;
  await writeSettings(current);
}

function setFolderStatus(text, level = "idle") {
  if (!folderStatus) return;
  folderStatus.textContent = text || "";
  folderStatus.dataset.level = level;
}

function renderFolders(settings) {
  const list = document.getElementById("folderList");
  if (!list) return;
  const folders = Array.isArray(settings.mediaFolders) ? settings.mediaFolders : [];
  list.innerHTML = "";

  folders.forEach((name, index) => {
    const row = document.createElement("div");
    row.className = "folder-row";

    const input = document.createElement("input");
    input.className = "text-input wide";
    input.type = "text";
    input.value = name;
    input.spellcheck = false;
    input.addEventListener("change", async () => {
      const next = [...folders];
      const name = sanitizeFolder(input.value);
      next[index] = name;
      await saveFolders(next.filter(Boolean));
      setFolderStatus(name ? `"${name}" kaydedildi` : "Boş klasör silindi", "done");
      renderFolders(await readSettings());
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "folder-del";
    del.textContent = "Sil";
    del.addEventListener("click", async () => {
      const next = folders.filter((_, i) => i !== index);
      await saveFolders(next);
      renderFolders(await readSettings());
    });

    row.append(input, del);
    list.appendChild(row);
  });
}

async function render(settings) {
  for (const control of controls) renderControl(control, settings);
  buttonSizeValue.textContent = `${settings.buttonSize || DEFAULT_SETTINGS.buttonSize}px`;
  renderFolders(settings);
}

async function updateSetting(control) {
  const current = await readSettings();
  const key = control.dataset.setting;

  if (control.type === "checkbox") {
    current[key] = control.checked;
  } else if (control.type === "range") {
    current[key] = Number(control.value);
  } else if (key === "downloadPath") {
    current[key] = sanitizePath(control.value);
    control.value = current[key];
  } else {
    current[key] = control.value;
  }

  await writeSettings(current);
  await render(current);
}

/* -------------------------------------------------- yinelenen açık sekmeler */
// Kullanıcı beğendiği gönderileri sekme sekme açıyor ama aynısını farkında
// olmadan birkaç kez açabiliyor. Burası açık sekmeleri tarar ve BİREBİR AYNI
// bağlantıyı birden çok kez bulduğunda fazlalıkları kapatmayı önerir. Aynı
// profilin farklı gönderileri değil — yalnız aynı adres.

// Yalnız bizim sitelerimiz taranır; ölçüt cloud/web ve weblink ile aynı.
const DUPE_SITE_HINTS = [
  [/redgifs\./i, "RedGifs"],
  [/reddit\.|redd\.it/i, "Reddit"],
  [/instagram\./i, "Instagram"],
  [/scrolller\./i, "Scrolller"],
  [/coomer\.|kemono\./i, "Coomer"]
];

// www/m/old/new/np ön ekleri atılır (aynı gönderi eski/yeni Reddit'te aynı
// sayılsın). "i." bilerek atılmaz: i.redd.it görsel konağı, redd.it kısa
// bağlantı alanıdır — karışmasınlar.
function dupeCanonHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^(www|m|old|new|np)\./, "");
}

function dupeSiteName(host) {
  for (const [pattern, name] of DUPE_SITE_HINTS) if (pattern.test(host)) return name;
  return "";
}

// Bir sekmenin "aynılık" anahtarı: konak + yol (sorgu ve çapa yok, sondaki
// eğik çizgi kırpılır). İzleme parametreleri ya da aynı gönderinin farklı
// karesi (?img_index) aynı sayılır; farklı gönderiler ayrı kalır. Desteklenmeyen
// site ya da http(s) dışıysa null döner → taranmaz.
function dupeKey(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = dupeCanonHost(u.hostname);
  if (!dupeSiteName(host)) return null;
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${host}${path}`;
}

function setDupeStatus(text, level = "idle") {
  const el = document.getElementById("dupeStatus");
  if (!el) return;
  el.textContent = text || "";
  el.dataset.level = level;
}

// Açık sekmeleri gruplar; yalnız 2+ kez açılmış anahtarları döndürür.
async function findDuplicateTabs() {
  const tabs = await chrome.tabs.query({});
  const groups = new Map();
  for (const tab of tabs) {
    const key = dupeKey(tab.url || "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => ({ key, tabs: list }))
    .sort((a, b) => b.tabs.length - a.tabs.length);
}

// Gruptan biri kalır (etkin sekme varsa o, yoksa ilki), gerisi kapanır.
function extrasOf(list) {
  const keep = list.find((t) => t.active) || list[0];
  return list.filter((t) => t !== keep);
}

async function closeTabs(tabs) {
  const ids = tabs.map((t) => t.id).filter((id) => Number.isInteger(id));
  if (ids.length) await chrome.tabs.remove(ids);
}

function renderDuplicates(groups) {
  const host = document.getElementById("dupeList");
  const closeAll = document.getElementById("dupeCloseAll");
  host.innerHTML = "";

  if (!groups.length) {
    closeAll.hidden = true;
    setDupeStatus("Yinelenen sekme yok ✓", "done");
    return;
  }

  const totalExtras = groups.reduce((sum, g) => sum + (g.tabs.length - 1), 0);
  closeAll.hidden = false;
  setDupeStatus(`${groups.length} bağlantı yinelenmiş · ${totalExtras} fazla sekme`, "idle");

  for (const group of groups) {
    const named = group.tabs.find((t) => (t.title || "").trim()) || group.tabs[0];
    const title = (named.title || "").trim() || group.key;
    const site = dupeSiteName(group.key);

    const info = document.createElement("div");
    info.className = "dupe-info";
    const b = document.createElement("b");
    b.textContent = title;
    b.title = title;
    const small = document.createElement("small");
    small.textContent = `${site ? `${site} · ` : ""}${group.key}`;
    small.title = group.key;
    info.append(b, small);

    const badge = document.createElement("span");
    badge.className = "dupe-badge";
    badge.textContent = `×${group.tabs.length}`;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "secondary-action dupe-close";
    close.textContent = "Fazlalığı kapat";
    close.addEventListener("click", async () => {
      await closeTabs(extrasOf(group.tabs));
      await scanDuplicates();
    });

    const row = document.createElement("div");
    row.className = "dupe-group";
    row.append(info, badge, close);
    host.appendChild(row);
  }
}

async function scanDuplicates() {
  const scan = document.getElementById("dupeScan");
  if (scan) scan.disabled = true;
  setDupeStatus("Sekmeler taranıyor…", "idle");
  try {
    renderDuplicates(await findDuplicateTabs());
  } catch (error) {
    setDupeStatus(String(error?.message || error), "error");
  } finally {
    if (scan) scan.disabled = false;
  }
}

async function closeAllDuplicates() {
  const button = document.getElementById("dupeCloseAll");
  if (button) button.disabled = true;
  try {
    const groups = await findDuplicateTabs();
    await closeTabs(groups.flatMap((g) => extrasOf(g.tabs)));
    await scanDuplicates();
  } catch (error) {
    setDupeStatus(String(error?.message || error), "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function init() {
  document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
  const settings = await readSettings();
  await render(settings);

  for (const control of controls) {
    const eventName = control.type === "range" ? "input" : "change";
    control.addEventListener(eventName, () => updateSetting(control));
  }

  const folderNew = document.getElementById("folderNew");
  document.getElementById("folderAdd").addEventListener("click", async () => {
    const name = sanitizeFolder(folderNew.value);
    if (!name) { folderNew.focus(); return; }
    const s = await readSettings();
    const folders = Array.isArray(s.mediaFolders) ? s.mediaFolders : [];
    if (!folders.includes(name)) folders.push(name);
    await saveFolders(folders);
    setFolderStatus(`"${name}" eklendi`, "done");
    folderNew.value = "";
    renderFolders(await readSettings());
  });
  folderNew.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.getElementById("folderAdd").click();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await writeSettings({ ...DEFAULT_SETTINGS });
    await render({ ...DEFAULT_SETTINGS });
  });
  document.getElementById("openDebugGuide").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("debug-guide.html") });
    window.close();
  });
  document.getElementById("downloadScrolllerCurrent").addEventListener("click", downloadCurrentScrolllerMedia);
  document.getElementById("pickScrolllerElement").addEventListener("click", startScrolllerElementPicker);
  document.getElementById("resetScrolllerElements").addEventListener("click", resetScrolllerHiddenElements);

  document.getElementById("cloudGoogle").addEventListener("click", connectWithGoogle);
  document.getElementById("cloudTest").addEventListener("click", testCloudConnection);
  document.getElementById("cloudSyncLists").addEventListener("click", previewCloudLists);
  document.getElementById("openArchive").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") });
    window.close();
  });

  document.getElementById("dupeScan").addEventListener("click", scanDuplicates);
  document.getElementById("dupeCloseAll").addEventListener("click", closeAllDuplicates);
  scanDuplicates(); // menü açılır açılmaz sekmeleri tara
}

init();
