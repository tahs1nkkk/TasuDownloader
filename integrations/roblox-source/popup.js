// Roblox Friend Tracker - popup UI (coklu hesap)

const $ = (s) => document.querySelector(s);
const avatarCache = {};
const presenceCache = {};
let authId = null;
let settings = {};
let viewId = null;
let acct = {};
let LANG = "en";
let friendsView = "friends";
let friendLayout = "list";
let timelineFilter = "all";
const TL_FILTERS = ["all", "added", "removed", "mine"];
let noFollowCache = null;
let csrfToken = null;
let selectionMode = false;
const selected = new Set();
let gamesEdit = false;

// ---------- modal (sayfa ici, bulanik arka plan) ----------
function openModal({ title, bodyHtml, okText, cancelText, danger }) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <div class="modal">
        ${title ? `<div class="modal-title">${escapeHtml(title)}</div>` : ""}
        <div class="modal-body">${bodyHtml || ""}</div>
        <div class="modal-actions">
          ${cancelText ? `<button class="modal-cancel">${escapeHtml(cancelText)}</button>` : ""}
          <button class="modal-ok ${danger ? "danger" : ""}">${escapeHtml(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const done = (val) => { back.remove(); resolve(val); };
    back.addEventListener("click", (e) => { if (e.target === back) done(null); });
    const ok = back.querySelector(".modal-ok");
    const cancel = back.querySelector(".modal-cancel");
    if (cancel) cancel.addEventListener("click", () => done(null));
    ok.addEventListener("click", () => { const inp = back.querySelector(".modal-input"); done(inp ? inp.value : true); });
    const input = back.querySelector(".modal-input");
    if (input) { input.focus(); input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); }); }
  });
}
async function modalConfirm(message, opts = {}) {
  const v = await openModal({ bodyHtml: `<div class="modal-msg">${escapeHtml(message)}</div>`, okText: opts.okText || t("ok"), cancelText: t("cancel"), danger: opts.danger });
  return v === true;
}
async function modalPrompt(message, opts = {}) {
  const v = await openModal({ bodyHtml: `<div class="modal-msg">${escapeHtml(message)}</div><input class="modal-input search" placeholder="${escapeHtml(opts.placeholder || "")}" value="${escapeHtml(opts.value || "")}"/>`, okText: t("ok"), cancelText: t("cancel") });
  return typeof v === "string" ? v : null;
}
async function modalAlert(message) {
  await openModal({ bodyHtml: `<div class="modal-msg">${escapeHtml(message)}</div>`, okText: t("ok") });
}

// ---------- SVG ikonlar ----------
const svg = (p) => `<svg viewBox="0 0 24 24" fill="currentColor">${p}</svg>`;
const ICON = {
  refresh: svg('<path d="M12 4a8 8 0 0 1 6.35 3.13V5.25a1.25 1.25 0 1 1 2.5 0v5.5A1.25 1.25 0 0 1 19.6 12h-5.5a1.25 1.25 0 1 1 0-2.5h2.72A5.55 5.55 0 1 0 17.3 16a1.25 1.25 0 0 1 2.03 1.46A8 8 0 1 1 12 4Z"/>'),
  bell: svg('<path d="M12 3a5 5 0 0 0-5 5v2.1c0 .82-.2 1.62-.57 2.35l-1.18 2.33A2.25 2.25 0 0 0 7.26 18h9.48a2.25 2.25 0 0 0 2.01-3.22l-1.18-2.33A5.25 5.25 0 0 1 17 10.1V8a5 5 0 0 0-5-5Zm0 18a3.25 3.25 0 0 0 3.06-2.15H8.94A3.25 3.25 0 0 0 12 21Z"/>'),
  people: svg('<path d="M9 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm7.25 1.25a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5ZM9 13.5c-3.86 0-7 2.06-7 4.6A1.9 1.9 0 0 0 3.9 20h10.2a1.9 1.9 0 0 0 1.9-1.9c0-2.54-3.14-4.6-7-4.6Zm7.25.1c-.76 0-1.47.1-2.13.28 1.43 1.06 2.33 2.55 2.33 4.22 0 .67-.18 1.31-.5 1.9h4.6A1.45 1.45 0 0 0 22 18.55c0-2.74-2.58-4.95-5.75-4.95Z"/>'),
  calendar: svg('<path d="M7 2.5a1.25 1.25 0 0 1 1.25 1.25V5h7.5V3.75a1.25 1.25 0 1 1 2.5 0V5H19a3 3 0 0 1 3 3v9.5a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8a3 3 0 0 1 3-3h.75V3.75A1.25 1.25 0 0 1 7 2.5ZM4.5 10v7.5A1.5 1.5 0 0 0 6 19h12a1.5 1.5 0 0 0 1.5-1.5V10h-15Z"/>'),
  sun: svg('<path d="M12 6.25a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5Zm0-5a1.25 1.25 0 0 1 1.25 1.25V4a1.25 1.25 0 1 1-2.5 0V2.5A1.25 1.25 0 0 1 12 1.25Zm0 17.5A1.25 1.25 0 0 1 13.25 20v1.5a1.25 1.25 0 1 1-2.5 0V20A1.25 1.25 0 0 1 12 18.75ZM4.22 2.45a1.25 1.25 0 0 1 1.77 0l1.06 1.06a1.25 1.25 0 1 1-1.77 1.77L4.22 4.22a1.25 1.25 0 0 1 0-1.77Zm12.73 14.27a1.25 1.25 0 0 1 1.77 0l1.06 1.06a1.25 1.25 0 0 1-1.77 1.77l-1.06-1.06a1.25 1.25 0 0 1 0-1.77ZM1.25 12A1.25 1.25 0 0 1 2.5 10.75H4a1.25 1.25 0 1 1 0 2.5H2.5A1.25 1.25 0 0 1 1.25 12Zm17.5 0A1.25 1.25 0 0 1 20 10.75h1.5a1.25 1.25 0 1 1 0 2.5H20A1.25 1.25 0 0 1 18.75 12ZM19.78 2.45a1.25 1.25 0 0 1 0 1.77l-1.06 1.06a1.25 1.25 0 0 1-1.77-1.77l1.06-1.06a1.25 1.25 0 0 1 1.77 0ZM7.05 16.72a1.25 1.25 0 0 1 0 1.77l-1.06 1.06a1.25 1.25 0 0 1-1.77-1.77l1.06-1.06a1.25 1.25 0 0 1 1.77 0Z"/>'),
  moon: svg('<path d="M20.45 14.1a1.25 1.25 0 0 1 1.35 1.7A9.9 9.9 0 0 1 12.5 22C6.7 22 2 17.3 2 11.5a9.9 9.9 0 0 1 6.2-9.3 1.25 1.25 0 0 1 1.7 1.35 8.1 8.1 0 0 0 10.55 10.55Z"/>'),
  pin: svg('<path d="M16 3a1 1 0 0 1 .7 1.7L15 6.4V11l2.5 2.5a1 1 0 0 1-.7 1.7H13v5a1 1 0 0 1-2 0v-5H7.2a1 1 0 0 1-.7-1.7L9 11V6.4L7.3 4.7A1 1 0 0 1 8 3h8Z"/>'),
  game: svg('<path d="M7 6h10a5 5 0 0 1 5 5 3 3 0 0 1-5.24 1.98l-.7-.98H7.94l-.7.98A3 3 0 0 1 2 11a5 5 0 0 1 5-5Zm-.5 3v1.5H5v1.5h1.5V13H8v-1.5h1.5V10H8V9H6.5ZM16 9.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm1.6 2.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"/>'),
  target: svg('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>'),
  trash: svg('<path d="M10 3h4a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7H5a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1Zm0 6a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Z"/>'),
  list: svg('<path d="M3 5h2v2H3V5Zm4 0h14v2H7V5ZM3 11h2v2H3v-2Zm4 0h14v2H7v-2ZM3 17h2v2H3v-2Zm4 0h14v2H7v-2Z"/>'),
  grid: svg('<path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z"/>'),
  arrowLeft: svg('<path d="M14 5v14l-9-7z"/>'),
  arrowRight: svg('<path d="M10 5v14l9-7z"/>'),
  play: svg('<path d="M8 5v14l11-7z"/>'),
  plus: svg('<path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5Z"/>'),
  server: svg('<path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/>'),
  settings: svg('<path d="M13.5 2a2 2 0 0 1 1.94 1.52l.24.95c.45.18.88.43 1.28.73l.94-.28a2 2 0 0 1 2.32.97l1.5 2.6a2 2 0 0 1-.39 2.48l-.7.67c.04.24.06.49.06.74s-.02.5-.06.74l.7.67a2 2 0 0 1 .39 2.48l-1.5 2.6a2 2 0 0 1-2.32.97l-.94-.28c-.4.3-.83.55-1.28.73l-.24.95A2 2 0 0 1 13.5 22h-3a2 2 0 0 1-1.94-1.52l-.24-.95a7.52 7.52 0 0 1-1.28-.73l-.94.28a2 2 0 0 1-2.32-.97l-1.5-2.6a2 2 0 0 1 .39-2.48l.7-.67a5.6 5.6 0 0 1 0-1.48l-.7-.67a2 2 0 0 1-.39-2.48l1.5-2.6a2 2 0 0 1 2.32-.97l.94.28c.4-.3.83-.55 1.28-.73l.24-.95A2 2 0 0 1 10.5 2h3ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>'),
  filter: svg('<path d="M4 5h16a1 1 0 0 1 .78 1.63L14 14v5a1 1 0 0 1-1.45.9l-2-1A1 1 0 0 1 10 18v-4L3.22 6.63A1 1 0 0 1 4 5Z"/>'),
  star: svg('<path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5Z"/>'),
};

// Aktif Edge sayfasina sabit, surukle-birak panel enjekte eder (sayfa uzerinde en ustte kalir).
// executeScript ile sayfaya gonderildigi icin tamamen self-contained olmali.
function rftInjectOverlay(url) {
  const ID = "rft-overlay";
  const existing = document.getElementById(ID);
  if (existing) { existing.remove(); return; } // ikinci tikta kapat
  const wrap = document.createElement("div");
  wrap.id = ID;
  wrap.style.cssText = "position:fixed;top:16px;right:16px;width:400px;height:600px;z-index:2147483647;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55);background:#0d0d10;";
  const bar = document.createElement("div");
  bar.style.cssText = "height:32px;background:#1e1e23;cursor:move;display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 12px;user-select:none;";
  const title = document.createElement("span");
  title.textContent = "Friend Tracker";
  title.style.cssText = "color:#eceef2;font:600 12px 'Segoe UI',sans-serif;";
  const close = document.createElement("div");
  close.textContent = "✕";
  close.style.cssText = "color:#9598a3;cursor:pointer;font:14px sans-serif;padding:4px 8px;";
  close.onclick = () => wrap.remove();
  bar.appendChild(title); bar.appendChild(close);
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.cssText = "width:100%;height:calc(100% - 32px);border:0;display:block;";
  wrap.appendChild(bar); wrap.appendChild(iframe);
  document.body.appendChild(wrap);
  let ox = 0, oy = 0, drag = false;
  bar.addEventListener("mousedown", (e) => { drag = true; ox = e.clientX - wrap.offsetLeft; oy = e.clientY - wrap.offsetTop; e.preventDefault(); });
  document.addEventListener("mousemove", (e) => { if (!drag) return; wrap.style.left = (e.clientX - ox) + "px"; wrap.style.top = (e.clientY - oy) + "px"; wrap.style.right = "auto"; });
  document.addEventListener("mouseup", () => { drag = false; });
}

// ---------- i18n ----------
function t(k) {
  const table = TRANSLATIONS[LANG] || TRANSLATIONS.en;
  const v = table[k];
  if (v !== undefined) return v;
  return TRANSLATIONS.en[k] !== undefined ? TRANSLATIONS.en[k] : k;
}
function loc() { return LANG === "tr" ? "tr-TR" : "en-US"; }
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
}

// ---------- tabs + header app icons ----------
function showPanel(name, btn) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
  document.querySelectorAll(".nav-app").forEach((x) => x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
  if (btn) btn.classList.add("active");
  const panel = document.getElementById("tab-" + name);
  if (panel) panel.classList.add("active");
  if (name !== "friends") exitSelection();
}
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showPanel(tab.dataset.tab, tab));
});
document.querySelectorAll(".nav-app").forEach((b) => {
  b.addEventListener("click", () => showPanel(b.dataset.panel, b));
});
// takvim filtre butonu: her tikta sonraki filtreye gec
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("#tlFilterBtn");
  if (!btn) return;
  const i = TL_FILTERS.indexOf(timelineFilter);
  timelineFilter = TL_FILTERS[(i + 1) % TL_FILTERS.length];
  renderTimeline((acct && acct.events) || []);
});
document.querySelectorAll(".seg").forEach((seg) => {
  seg.addEventListener("click", () => {
    document.querySelectorAll(".seg").forEach((x) => x.classList.remove("active"));
    seg.classList.add("active");
    friendsView = seg.dataset.view;
    exitSelection();
    if (friendsView === "nofollow") renderNoFollow();
    else renderFriends();
  });
});

// ---------- helpers ----------
function fmtDate(ts) { return new Date(ts).toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit" }); }
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t("greetMorning");
  if (h >= 12 && h < 21) return t("greetEvening");
  return t("greetNight");
}
function openProfile(id) { chrome.tabs.create({ url: `https://www.roblox.com/users/${id}/profile` }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Roblox POST ----------
async function robloxPost(url, body) {
  const doFetch = (tok) => fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(tok ? { "x-csrf-token": tok } : {}) }, body: JSON.stringify(body) });
  let res = await doFetch(csrfToken);
  if (res.status === 403) { const tok = res.headers.get("x-csrf-token"); if (tok) { csrfToken = tok; res = await doFetch(tok); } }
  return res;
}
async function fetchNames(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map(Number);
    try {
      const r = await robloxPost("https://users.roblox.com/v1/users", { userIds: chunk, excludeBannedUsers: false });
      if (!r.ok) continue;
      const d = await r.json();
      for (const u of d.data || []) out[u.id] = { name: u.name, displayName: u.displayName };
    } catch (e) {}
  }
  return out;
}
async function resolveAccount(input) {
  const raw = input.trim().replace(/^https?:\/\/www\.roblox\.com\/users\//, "").replace(/\/.*$/, "");
  if (/^\d+$/.test(raw)) {
    const info = await fetchNames([raw]);
    const u = info[raw];
    return u ? { id: Number(raw), name: u.name, displayName: u.displayName } : { id: Number(raw), name: raw, displayName: raw };
  }
  try {
    const r = await robloxPost("https://users.roblox.com/v1/usernames/users", { usernames: [raw], excludeBannedUsers: false });
    if (r.ok) { const d = await r.json(); const u = (d.data || [])[0]; if (u) return { id: u.id, name: u.name, displayName: u.displayName }; }
  } catch (e) {}
  return null;
}
async function loadPresence(ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map(Number);
    try {
      const r = await robloxPost("https://presence.roblox.com/v1/presence/users", { userIds: chunk });
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of d.userPresences || []) presenceCache[p.userId] = p;
    } catch (e) {}
  }
}
async function fetchPaged(userId, kind) {
  let cursor = "", pages = 0; const out = [];
  do {
    const url = `https://friends.roblox.com/v1/users/${userId}/${kind}?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) break;
    const d = await r.json();
    out.push(...(d.data || []));
    cursor = d.nextPageCursor; pages++;
  } while (cursor && pages < 30);
  return out;
}

// ---------- avatarlar ----------
async function loadAvatars(ids) {
  const need = ids.filter((id) => id && !(id in avatarCache));
  if (!need.length) return;
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    try {
      const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(",")}&size=48x48&format=Png&isCircular=true`, { credentials: "include" });
      if (!r.ok) continue;
      const d = await r.json();
      for (const it of d.data || []) if (it.imageUrl) avatarCache[it.targetId] = it.imageUrl;
    } catch (e) {}
  }
}
function applyAvatars() {
  document.querySelectorAll("img[data-uid]").forEach((img) => {
    const url = avatarCache[img.dataset.uid];
    if (url) img.src = url;
  });
}

// ---------- ortak satir ----------
function itemRow({ uid, title, sub, tag, tagClass, unread }) {
  const el = document.createElement("div");
  el.className = "item" + (unread ? " unread" : "");
  el.innerHTML = `
    <img class="avatar" data-uid="${uid}" alt="" />
    <div class="item-main">
      <div class="item-name">${escapeHtml(title)}</div>
      <div class="item-sub">${escapeHtml(sub)}</div>
    </div>
    ${tag ? `<span class="tag ${tagClass}">${tag}</span>` : ""}
    ${unread ? `<span class="unread-dot"></span>` : ""}`;
  el.addEventListener("click", () => openProfile(uid));
  return el;
}
function emptyState(container, iconHtml, text) {
  container.innerHTML = `<div class="empty">${iconHtml}${escapeHtml(text)}</div>`;
}

// ---------- durum ----------
function presWeight(p) { if (!p) return 4; switch (p.userPresenceType) { case 2: return 0; case 3: return 1; case 1: return 2; default: return 3; } }
function statusInfo(p) {
  if (!p || p.userPresenceType === 0) return { cls: "dot-off", text: t("stOffline") };
  switch (p.userPresenceType) {
    case 2: return { cls: "dot-game", text: p.lastLocation ? t("stInGame") + " · " + p.lastLocation : t("stInGame") };
    case 3: return { cls: "dot-studio", text: t("stStudio") };
    case 1: return { cls: "dot-online", text: t("stOnline") };
    default: return { cls: "dot-off", text: t("stOffline") };
  }
}
function isJoinable(p) { return p && p.userPresenceType === 2 && p.placeId && p.gameId; }
function launchJoin(placeId, gameId) {
  const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${gameId}`;
  const a = document.createElement("a"); a.href = url; a.style.display = "none";
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 200);
}
async function unfriend(f) {
  const name = f.displayName || f.name || "?";
  if (!(await modalConfirm(t("confirmUnfriend")(name), { danger: true, okText: t("unfriendBtn") }))) return;
  try {
    const r = await robloxPost(`https://friends.roblox.com/v1/users/${f.id}/unfriend`, {});
    if (!r.ok) { await modalAlert(t("unfriendFail")); return; }
  } catch (e) { await modalAlert(t("unfriendFail")); return; }
  // basarili: yerel olarak cikar + zaman cizelgesine "sen cikardin" kaydi (bildirim/rozet yok)
  const now = Date.now();
  if (acct.friends) delete acct.friends[f.id];
  acct.events = acct.events || [];
  acct.events.unshift({ id: `${now}-u-${f.id}`, type: "removed", byMe: true, userId: f.id, name: f.name, displayName: f.displayName, ts: now, unread: false });
  await chrome.storage.local.set({ ["acct:" + viewId]: acct });
  if (friendsView === "friends") renderFriends();
  renderTimeline(acct.events);
  renderAlerts(acct.events);
  applyAvatars();
}

// ---------- header + chips ----------
function renderHeader() {
  if (acct.userName) $("#whoami").textContent = `${greeting()}, ${acct.userDisplayName || acct.userName}`;
  else if (!viewId) $("#whoami").textContent = t("whoamiLoggedOut");
  else $("#whoami").textContent = "-";
  $("#logoImg").removeAttribute("src");
  if (viewId && avatarCache[viewId]) $("#logoImg").src = avatarCache[viewId];
}
function chipEl(key, label, avatarId, active) {
  const el = document.createElement("button");
  el.className = "chip" + (active ? " active" : "");
  el.innerHTML = `<img data-uid="${avatarId || ""}" alt=""/><span>${escapeHtml(label)}</span>`;
  el.addEventListener("click", () => switchAccount(key));
  return el;
}
function renderChips() {
  const bar = $("#accountsBar");
  bar.innerHTML = "";
  const want = settings.viewAccount || "auto";
  bar.appendChild(chipEl("auto", t("thisAccount"), authId, want === "auto"));
  for (const a of settings.accounts || []) {
    if (String(a.id) === String(authId)) continue;
    bar.appendChild(chipEl(String(a.id), a.displayName || a.name, a.id, String(want) === String(a.id)));
  }
  const add = document.createElement("button");
  add.className = "chip chip-add";
  add.textContent = "+";
  add.title = t("addAccount");
  add.addEventListener("click", addAccountPrompt);
  bar.appendChild(add);
}
async function switchAccount(key) {
  settings.viewAccount = key;
  await chrome.storage.local.set({ settings });
  noFollowCache = null;
  exitSelection();
  await loadAll();
}
async function addAccount(input) {
  const acc = await resolveAccount(input);
  if (!acc) return false;
  settings.accounts = settings.accounts || [];
  if (!settings.accounts.some((a) => String(a.id) === String(acc.id)))
    settings.accounts.push({ id: acc.id, name: acc.name, displayName: acc.displayName, notify: true });
  settings.viewAccount = String(acc.id);
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: "pollNow" });
  noFollowCache = null;
  await loadAll();
  return true;
}
async function addAccountPrompt() {
  const val = await modalPrompt(t("addPrompt"), { placeholder: t("accountInput") });
  if (val && val.trim()) await addAccount(val.trim());
}

// ---------- render ----------
async function loadAll() {
  const store = await chrome.storage.local.get(null);
  authId = store.authId || null;
  settings = store.settings || {};

  const want = settings.viewAccount || "auto";
  viewId = want === "auto" ? authId : Number(want);
  acct = viewId ? store["acct:" + viewId] || {} : {};

  await backfillNames();

  renderChips();
  renderHeader();

  const ids = new Set();
  Object.keys(acct.friends || {}).forEach((i) => ids.add(String(i)));
  (acct.events || []).slice(0, 60).forEach((e) => ids.add(String(e.userId)));
  if (authId) ids.add(String(authId));
  if (viewId) ids.add(String(viewId));
  (settings.accounts || []).forEach((a) => ids.add(String(a.id)));
  await loadAvatars([...ids]);
  applyAvatars();
  renderHeader();

  renderAlerts(acct.events || []);
  renderTimeline(acct.events || []);
  if (friendsView === "friends") renderFriends(); else renderNoFollow();
  renderSettings();
  renderAccList();
  renderGames();
  applyAvatars();

  const fids = Object.keys(acct.friends || {});
  if (fids.length) loadPresence(fids).then(() => {
    if (friendsView === "friends" && $("#tab-friends").classList.contains("active")) { renderFriends(); applyAvatars(); }
  });
}

async function backfillNames() {
  if (!viewId) return;
  const fMissing = Object.entries(acct.friends || {}).filter(([id, f]) => !f.name).map(([id]) => id);
  const eMissing = [...new Set((acct.events || []).filter((e) => !e.name).map((e) => e.userId))];
  const need = [...new Set([...fMissing, ...eMissing])];
  if (!need.length) return;
  const info = await fetchNames(need);
  let changed = false;
  for (const id of fMissing) if (info[id]) { acct.friends[id].name = info[id].name; if (!acct.friends[id].displayName) acct.friends[id].displayName = info[id].displayName; changed = true; }
  for (const e of acct.events || []) if (!e.name && info[e.userId]) { e.name = info[e.userId].name; if (!e.displayName) e.displayName = info[e.userId].displayName; changed = true; }
  if (changed) await chrome.storage.local.set({ ["acct:" + viewId]: acct });
}

function renderAlerts(events) {
  // Aktivite sekmesi = SADECE okunmamislar. Okundu isaretlenince liste bosalir.
  // Tum gecmis Timeline sekmesinde durur (veri silinmez).
  const unread = (events || []).filter((e) => e.unread);
  const box = $("#alertsList");
  $("#alertCount").textContent = `${unread.length} ${t("unread")}`;
  const badge = $("#alertBadge");
  if (unread.length) { badge.hidden = false; badge.textContent = unread.length; } else badge.hidden = true;
  box.innerHTML = "";
  if (!unread.length) { emptyState(box, ICON.bell, t("emptyAlerts")); return; }
  for (const e of unread.slice(0, 100))
    box.appendChild(itemRow({
      uid: e.userId, title: e.displayName || (e.name ? "@" + e.name : "?"),
      sub: `@${e.name || t("unknown")} · ${fmtDate(e.ts)} ${fmtTime(e.ts)}`,
      tag: e.type === "added" ? t("tagAdded") : (e.byMe ? t("tagUnfriended") : t("tagRemoved")),
      tagClass: e.type === "added" ? "added" : "removed", unread: true,
    }));
}
function tlLabel(f) {
  return { all: t("filterAll"), added: t("filterAdded"), removed: t("filterRemoved"), mine: t("filterMine") }[f] || t("filterAll");
}
function renderTimeline(events) {
  const box = $("#timelineList");
  const btn = $("#tlFilterBtn");
  if (btn) { btn.innerHTML = `${ICON.filter}<span>${escapeHtml(tlLabel(timelineFilter))}</span>`; btn.className = "filter-btn f-" + timelineFilter; }

  let list = events;
  if (timelineFilter === "added") list = events.filter((e) => e.type === "added");
  else if (timelineFilter === "removed") list = events.filter((e) => e.type === "removed" && !e.byMe);
  else if (timelineFilter === "mine") list = events.filter((e) => e.type === "removed" && e.byMe);

  box.innerHTML = "";
  if (!list.length) { emptyState(box, ICON.calendar, t("emptyTimeline")); return; }
  let lastDay = null;
  for (const e of list) {
    const dk = dayKey(e.ts);
    if (dk !== lastDay) { lastDay = dk; const h = document.createElement("div"); h.className = "day-head"; h.textContent = fmtDate(e.ts); box.appendChild(h); }
    box.appendChild(itemRow({
      uid: e.userId, title: e.displayName || (e.name ? "@" + e.name : "?"),
      sub: `@${e.name || t("unknown")} · ${fmtTime(e.ts)}`,
      tag: e.type === "added" ? t("tagAdded") : (e.byMe ? t("tagUnfriended") : t("tagRemoved")),
      tagClass: e.type === "added" ? "added" : "removed", unread: false,
    }));
  }
}

// ---------- izleme menusu ----------
async function setWatch(uid, patch, f) {
  settings.watches = settings.watches || {};
  const cur = settings.watches[uid] || {};
  const next = { ...cur, ...patch, name: f.name, displayName: f.displayName };
  if (!next.online && !next.ingame && !next.game) delete settings.watches[uid];
  else settings.watches[uid] = next;
  await chrome.storage.local.set({ settings });
}
function closeWatchMenu() { const m = document.querySelector(".watch-menu"); if (m) m.remove(); }
function openWatchMenu(f, anchor) {
  closeWatchMenu();
  const w = (settings.watches || {})[f.id] || {};
  const menu = document.createElement("div");
  menu.className = "watch-menu";
  menu.innerHTML = `
    <div class="wm-title">${escapeHtml(t("watchTitle"))}</div>
    <div class="wm-btns">
      <div class="wm-opt ${w.online ? "on" : ""}" data-k="online"><div class="wm-circle">${ICON.people}</div><div class="wm-label">${escapeHtml(t("watchActivity"))}</div></div>
      <div class="wm-opt ${w.ingame ? "on" : ""}" data-k="ingame"><div class="wm-circle">${ICON.game}</div><div class="wm-label">${escapeHtml(t("watchGame"))}</div></div>
      <div class="wm-opt ${w.game ? "on" : ""}" data-k="custom"><div class="wm-circle">${ICON.target}</div><div class="wm-label">${escapeHtml(t("watchCustom"))}</div></div>
    </div>
    <div class="wm-custom" ${w.game ? "" : "hidden"}>
      <input type="text" inputmode="numeric" placeholder="${escapeHtml(t("customGameId"))}" value="${w.game ? escapeHtml(String(w.game.placeId)) : ""}"/>
      <button>${escapeHtml(t("save"))}</button>
    </div>`;
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.min(r.bottom + 5, window.innerHeight - menu.offsetHeight - 8) + "px";
  menu.style.right = window.innerWidth - r.right + "px";
  menu.addEventListener("click", (e) => e.stopPropagation());

  menu.querySelectorAll(".wm-opt").forEach((op) => {
    op.addEventListener("click", async () => {
      const k = op.dataset.k;
      if (k === "custom") { const c = menu.querySelector(".wm-custom"); c.hidden = !c.hidden; return; }
      const on = !op.classList.contains("on");
      op.classList.toggle("on", on);
      await setWatch(f.id, { [k]: on }, f);
      renderFriends(); applyAvatars();
    });
  });
  menu.querySelector(".wm-custom button").addEventListener("click", async () => {
    const v = menu.querySelector(".wm-custom input").value.trim();
    const custOpt = menu.querySelector('.wm-opt[data-k="custom"]');
    if (/^\d+$/.test(v)) { await setWatch(f.id, { game: { placeId: Number(v), name: "" } }, f); custOpt.classList.add("on"); }
    else { await setWatch(f.id, { game: null }, f); custOpt.classList.remove("on"); }
    renderFriends(); applyAvatars();
    closeWatchMenu();
  });
}
document.addEventListener("click", closeWatchMenu);

// ---------- arkadas satiri ----------
function friendRow(f, watched) {
  const p = presenceCache[f.id];
  const st = statusInfo(p);
  const joinable = isJoinable(p);
  const label = f.known ? t("friendsSince") : t("trackingSince");
  let tip = `${label}: ${f.since ? fmtDate(f.since) : "-"}`;
  if (f.nameHistory && f.nameHistory.length) tip += `\n${t("oldUsernames")}: ` + f.nameHistory.map((x) => "@" + x).join(", ");
  if (f.displayHistory && f.displayHistory.length) tip += `\n${t("oldDisplayNames")}: ` + f.displayHistory.join(", ");

  // unfriend sadece giris yapili hesabi goruntulerken mumkun (API auth kullanici uzerinde calisir)
  const canUnfriend = authId && viewId && String(authId) === String(viewId);

  const el = document.createElement("div");
  el.className = "item friend" + (selected.has(String(f.id)) ? " selected" : "");
  el.innerHTML = `
    <div class="avatar-wrap">
      <img class="avatar" data-uid="${f.id}" alt="" />
      ${canUnfriend ? `<button class="unfriend-btn" title="${escapeHtml(t("unfriendTitle"))}">${ICON.trash}</button>` : ""}
    </div>
    <div class="item-main">
      <div class="item-name">${escapeHtml(f.displayName || f.name || "?")}</div>
      <div class="item-sub">@${escapeHtml(f.name || t("unknown"))}</div>
      <div class="status"><span class="dot ${st.cls}"></span>${escapeHtml(st.text)}</div>
    </div>
    <div class="friend-actions">
      ${joinable ? `<button class="join-btn">${escapeHtml(t("join"))}</button>` : ""}
      <button class="watch-btn ${watched ? "on" : ""}" title="${escapeHtml(t("watchTitle"))}">${ICON.bell}</button>
      <span class="info" data-tip="${escapeHtml(tip)}">?</span>
    </div>`;
  el.addEventListener("click", () => handleFriendClick(f, el));
  el.querySelector(".info").addEventListener("click", (e) => e.stopPropagation());
  const wb = el.querySelector(".watch-btn");
  wb.addEventListener("click", (e) => { e.stopPropagation(); openWatchMenu(f, wb); });
  const jb = el.querySelector(".join-btn");
  if (jb) jb.addEventListener("click", (e) => { e.stopPropagation(); launchJoin(p.placeId, p.gameId); });
  const ub = el.querySelector(".unfriend-btn");
  if (ub) ub.addEventListener("click", (e) => { e.stopPropagation(); unfriend(f); });
  return el;
}

// kare kart gorunumu
function friendCard(f, watched) {
  const p = presenceCache[f.id];
  const joinable = isJoinable(p);
  const stClass = p ? (p.userPresenceType === 2 ? "st-game" : p.userPresenceType === 3 ? "st-studio" : p.userPresenceType === 1 ? "st-online" : "") : "";
  const label = f.known ? t("friendsSince") : t("trackingSince");
  let tip = `${label}: ${f.since ? fmtDate(f.since) : "-"}`;
  if (f.nameHistory && f.nameHistory.length) tip += `\n${t("oldUsernames")}: ` + f.nameHistory.map((x) => "@" + x).join(", ");
  if (f.displayHistory && f.displayHistory.length) tip += `\n${t("oldDisplayNames")}: ` + f.displayHistory.join(", ");

  const el = document.createElement("div");
  el.className = "gcard " + stClass + (selected.has(String(f.id)) ? " selected" : "");
  el.innerHTML = `
    <button class="g-corner g-watch ${watched ? "on" : ""}" title="${escapeHtml(t("watchTitle"))}">${ICON.bell}</button>
    <span class="g-corner g-info" data-tip="${escapeHtml(tip)}">?</span>
    <img class="avatar" data-uid="${f.id}" alt="" />
    <div class="g-name">${escapeHtml(f.displayName || f.name || "?")}</div>
    <div class="g-user">@${escapeHtml(f.name || t("unknown"))}</div>
    ${joinable ? `<button class="join-btn">${escapeHtml(t("join"))}</button>` : `<button class="join-btn ghost" disabled>${escapeHtml(t("join"))}</button>`}`;
  el.addEventListener("click", () => handleFriendClick(f, el));
  el.querySelector(".g-info").addEventListener("click", (e) => e.stopPropagation());
  const wb = el.querySelector(".g-watch");
  wb.addEventListener("click", (e) => { e.stopPropagation(); openWatchMenu(f, wb); });
  if (joinable) {
    const jb = el.querySelector(".join-btn");
    jb.addEventListener("click", (e) => { e.stopPropagation(); launchJoin(p.placeId, p.gameId); });
  }
  return el;
}

function handleFriendClick(f, el) {
  if (selectionMode) { toggleSelect(String(f.id), el); return; }
  openProfile(f.id);
}
function toggleSelect(id, el) {
  if (selected.has(id)) { selected.delete(id); el.classList.remove("selected"); }
  else { selected.add(id); el.classList.add("selected"); }
  updateBulkBar();
}
function updateBulkBar() {
  const bar = $("#bulkBar");
  if (selectionMode && selected.size) { bar.hidden = false; $("#bulkCount").textContent = selected.size; }
  else bar.hidden = true;
}
function exitSelection() {
  selectionMode = false;
  selected.clear();
  $("#bulkBtn").classList.remove("on");
  updateBulkBar();
}

function renderFriends() {
  const box = $("#friendsList");
  box.classList.toggle("grid", friendLayout === "grid");
  const canBulk = authId && viewId && String(authId) === String(viewId);
  $("#bulkBtn").hidden = !canBulk;
  if (!canBulk && selectionMode) exitSelection();

  const friends = acct.friends || {};
  const watches = settings.watches || {};
  let arr = Object.entries(friends).map(([id, f]) => ({ id, ...f }));
  arr.sort((a, b) => {
    const w = presWeight(presenceCache[a.id]) - presWeight(presenceCache[b.id]);
    if (w !== 0) return w;
    return (a.displayName || "").localeCompare(b.displayName || "", loc());
  });
  const q = ($("#friendSearch").value || "").toLowerCase();
  const filtered = q ? arr.filter((f) => (f.displayName || "").toLowerCase().includes(q) || (f.name || "").toLowerCase().includes(q)) : arr;
  box.innerHTML = "";
  if (!filtered.length) { emptyState(box, ICON.people, q ? t("noMatch") : t("emptyFriends")); return; }
  for (const f of filtered) box.appendChild(friendLayout === "grid" ? friendCard(f, !!watches[f.id]) : friendRow(f, !!watches[f.id]));
  applyAvatars();
}

async function renderNoFollow() {
  const box = $("#friendsList");
  box.classList.remove("grid");
  if (!viewId) { emptyState(box, ICON.people, t("emptyFriends")); return; }
  emptyState(box, ICON.people, t("listLoading"));
  if (!noFollowCache) {
    const [followings, followers] = await Promise.all([fetchPaged(viewId, "followings"), fetchPaged(viewId, "followers")]);
    const followerIds = new Set(followers.map((u) => u.id));
    noFollowCache = followings.filter((u) => !followerIds.has(u.id));
  }
  await loadAvatars(noFollowCache.map((u) => String(u.id)));
  box.innerHTML = "";
  if (!noFollowCache.length) { emptyState(box, ICON.people, t("noFollowEmpty")); return; }
  for (const u of noFollowCache) {
    const el = document.createElement("div");
    el.className = "item friend";
    el.innerHTML = `<img class="avatar" data-uid="${u.id}" alt="" /><div class="item-main"><div class="item-name">${escapeHtml(u.displayName || u.name)}</div><div class="item-sub">@${escapeHtml(u.name)}</div></div>`;
    el.addEventListener("click", () => openProfile(u.id));
    box.appendChild(el);
  }
  applyAvatars();
}

// ---------- favori oyunlar ----------
function parsePlaceId(input) {
  const s = String(input).trim();
  const m = s.match(/(?:games|game)\/(\d+)/i) || s.match(/placeId=(\d+)/i);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}
async function resolveGame(placeId) {
  let universeId = null, name = "Game " + placeId, icon = null;
  try {
    const r = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); universeId = d.universeId; }
  } catch (e) {}
  if (universeId) {
    try {
      const r = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); if (d.data && d.data[0]) name = d.data[0].name || name; }
    } catch (e) {}
    try {
      const r = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png&isCircular=false`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); if (d.data && d.data[0]) icon = d.data[0].imageUrl || null; }
    } catch (e) {}
  }
  return { placeId: Number(placeId), universeId, name, icon };
}
async function addGame(input) {
  const pid = parsePlaceId(input);
  if (!pid) { await modalAlert(t("gameNotFound")); return; }
  const g = await resolveGame(pid);
  settings.games = settings.games || [];
  if (!settings.games.some((x) => String(x.placeId) === String(g.placeId))) settings.games.push(g);
  await chrome.storage.local.set({ settings });
  renderGames();
}
function launchGame(placeId) {
  const a = document.createElement("a");
  a.href = `roblox://experiences/start?placeId=${placeId}`;
  a.style.display = "none";
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 200);
}
function launchPrivate(g) {
  const v = g.privateServer;
  if (!v) return;
  if (/^https?:/i.test(v)) {
    // sekmeyi background acsin + 10 sn sonra kapatsin (popup kapaninca timer olur)
    chrome.runtime.sendMessage({ type: "openTempTab", url: v, closeAfter: 10000 });
    return;
  }
  const a = document.createElement("a");
  a.href = `roblox://experiences/start?placeId=${g.placeId}&linkCode=${encodeURIComponent(v)}`;
  a.style.display = "none";
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 200);
}
async function onPrivate(g, i) {
  // ilk kez veya edit modunda: linki/kodu iste ve kaydet; degilse dogrudan katil
  if (gamesEdit || !g.privateServer) {
    const v = await modalPrompt(t("privatePrompt"), { placeholder: t("gameInput"), value: g.privateServer || "" });
    if (v === null) return;
    settings.games[i].privateServer = v.trim() || undefined;
    await chrome.storage.local.set({ settings });
    if (!gamesEdit && settings.games[i].privateServer) launchPrivate(settings.games[i]);
    return;
  }
  launchPrivate(g);
}
async function moveGame(i, dir) {
  const g = settings.games || [];
  const j = i + dir;
  if (j < 0 || j >= g.length) return;
  [g[i], g[j]] = [g[j], g[i]];
  await chrome.storage.local.set({ settings });
  renderGames();
}
function renderGames() {
  const box = $("#gamesList");
  const games = settings.games || [];
  $("#gameEditBtn").classList.toggle("on", gamesEdit);
  box.innerHTML = "";
  if (!games.length) { emptyState(box, ICON.game, t("emptyGames")); return; }
  games.forEach((g, i) => {
    const hasPrivate = !!g.privateServer;
    const el = document.createElement("div");
    el.className = "game-card";
    el.innerHTML = `
      ${gamesEdit ? `<button class="game-del" title="${escapeHtml(t("removeAccount"))}">${ICON.trash}</button>` : ""}
      <div class="game-icon-wrap">
        <img class="game-icon" ${g.icon ? `src="${g.icon}"` : ""} alt="" />
        ${gamesEdit && i > 0 ? `<button class="game-move left">${ICON.arrowLeft}</button>` : ""}
        ${gamesEdit && i < games.length - 1 ? `<button class="game-move right">${ICON.arrowRight}</button>` : ""}
      </div>
      <div class="game-name">${escapeHtml(g.name || "Game " + g.placeId)}</div>
      <div class="game-btns">
        <button class="game-play">${ICON.play}<span>${escapeHtml(t("play"))}</span></button>
        <button class="game-private ${hasPrivate ? "on" : ""}" title="${escapeHtml(t("privateServer"))}">${ICON.server}</button>
      </div>`;
    el.querySelector(".game-play").addEventListener("click", () => launchGame(g.placeId));
    el.querySelector(".game-private").addEventListener("click", () => onPrivate(g, i));
    const del = el.querySelector(".game-del");
    if (del) del.addEventListener("click", async () => {
      settings.games = (settings.games || []).filter((x) => String(x.placeId) !== String(g.placeId));
      await chrome.storage.local.set({ settings });
      renderGames();
    });
    const ml = el.querySelector(".game-move.left");
    if (ml) ml.addEventListener("click", () => moveGame(i, -1));
    const mr = el.querySelector(".game-move.right");
    if (mr) mr.addEventListener("click", () => moveGame(i, 1));
    box.appendChild(el);
  });
}

function renderSettings() {
  const map = { ok: t("stActive"), logged_out: t("stLoggedOut"), error: t("stError") + ": " + (acct.lastError || "") };
  $("#statusVal").textContent = viewId ? (map[acct.status] || "-") : t("stLoggedOut");
  $("#lastPollVal").textContent = acct.lastPoll ? `${fmtDate(acct.lastPoll)} ${fmtTime(acct.lastPoll)}` : "-";
  $("#totalVal").textContent = Object.keys(acct.friends || {}).length;
  $("#baselineVal").textContent = acct.baselineAt ? fmtDate(acct.baselineAt) : "-";
}
function renderAccList() {
  const box = $("#accList");
  const list = settings.accounts || [];
  $("#accBlock").hidden = list.length === 0;
  box.innerHTML = "";
  for (const acc of list) {
    const el = document.createElement("div");
    el.className = "acc-item";
    el.innerHTML = `
      <img data-uid="${acc.id}" alt="" />
      <div class="acc-name">${escapeHtml(acc.displayName || acc.name)} <span class="muted">@${escapeHtml(acc.name)}</span></div>
      <button class="acc-alert ${acc.notify !== false ? "on" : ""}" title="${escapeHtml(t("notifOn"))}">${ICON.bell}</button>
      <button class="acc-remove" title="${escapeHtml(t("removeAccount"))}">&times;</button>`;
    el.querySelector(".acc-alert").addEventListener("click", async (e) => {
      acc.notify = acc.notify === false;
      e.currentTarget.classList.toggle("on", acc.notify !== false);
      await chrome.storage.local.set({ settings });
    });
    el.querySelector(".acc-remove").addEventListener("click", async () => {
      settings.accounts = settings.accounts.filter((a) => String(a.id) !== String(acc.id));
      await chrome.storage.local.remove("acct:" + acc.id);
      if (String(settings.viewAccount) === String(acc.id)) settings.viewAccount = "auto";
      await chrome.storage.local.set({ settings });
      noFollowCache = null;
      await loadAll();
    });
    box.appendChild(el);
  }
  applyAvatars();
}

// ---------- actions ----------
$("#refreshBtn").addEventListener("click", async () => {
  const btn = $("#refreshBtn");
  btn.classList.add("spin");
  noFollowCache = null;
  await chrome.runtime.sendMessage({ type: "pollNow" });
  await loadAll();
  if (friendsView === "nofollow") renderNoFollow();
  btn.classList.remove("spin");
});
$("#friendSearch").addEventListener("input", () => { if (friendsView === "friends") { renderFriends(); applyAvatars(); } });

// liste / kare gorunum
document.querySelectorAll(".vt").forEach((b) => {
  b.addEventListener("click", async () => {
    friendLayout = b.dataset.layout;
    document.querySelectorAll(".vt").forEach((x) => x.classList.toggle("active", x === b));
    settings.friendLayout = friendLayout;
    await chrome.storage.local.set({ settings });
    if (friendsView === "friends") { renderFriends(); applyAvatars(); }
  });
});

// toplu secim modu
$("#bulkBtn").addEventListener("click", () => {
  selectionMode = !selectionMode;
  selected.clear();
  $("#bulkBtn").classList.toggle("on", selectionMode);
  updateBulkBar();
  if (friendsView === "friends") { renderFriends(); applyAvatars(); }
});
$("#bulkUnfriend").addEventListener("click", async () => {
  const ids = [...selected];
  if (!ids.length) return;
  if (!(await modalConfirm(t("confirmBulk")(ids.length), { danger: true, okText: t("unfriendBtn") }))) return;
  for (const id of ids) {
    try {
      const r = await robloxPost(`https://friends.roblox.com/v1/users/${id}/unfriend`, {});
      if (r.ok) {
        const f = (acct.friends && acct.friends[id]) || {};
        const now = Date.now();
        if (acct.friends) delete acct.friends[id];
        acct.events = acct.events || [];
        acct.events.unshift({ id: `${now}-u-${id}`, type: "removed", byMe: true, userId: id, name: f.name, displayName: f.displayName, ts: now, unread: false });
      }
    } catch (e) {}
    await new Promise((res) => setTimeout(res, 300)); // teker teker
  }
  await chrome.storage.local.set({ ["acct:" + viewId]: acct });
  exitSelection();
  renderFriends(); renderTimeline(acct.events); renderAlerts(acct.events); applyAvatars();
});

// favori oyunlar
$("#gameAddBtn").addEventListener("click", async () => {
  const v = await modalPrompt(t("addGame"), { placeholder: t("gameInput") });
  if (v && v.trim()) await addGame(v.trim());
});
$("#gameEditBtn").addEventListener("click", () => { gamesEdit = !gamesEdit; renderGames(); });

$("#themeBtn").addEventListener("click", async () => {
  const theme = (document.documentElement.dataset.theme === "dark") ? "light" : "dark";
  applyTheme(theme);
  settings.theme = theme;
  await chrome.storage.local.set({ settings });
});
$("#pinBtn").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null && /^https?:/.test(tab.url || "")) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: rftInjectOverlay,
        args: [chrome.runtime.getURL("popup.html?w=1")],
      });
      window.close();
      return;
    }
  } catch (e) {}
  // http olmayan sayfa / enjekte edilemezse ayri pencereye dus
  chrome.windows.create({ url: chrome.runtime.getURL("popup.html?w=1"), type: "popup", width: 406, height: 620 });
  window.close();
});

$("#langSelect").addEventListener("change", async (e) => {
  const val = e.target.value;
  settings.lang = val;
  await chrome.storage.local.set({ settings });
  LANG = resolveLang(val);
  document.documentElement.lang = LANG;
  applyI18n();
  await loadAll();
});

$("#markReadBtn").addEventListener("click", markRead);
async function markRead() {
  if (!viewId) return;
  // 1) aninda gorsel geri bildirim (flicker yok) — vurgulari ve noktalari kaldir
  document.querySelectorAll("#alertsList .item.unread").forEach((el) => el.classList.remove("unread"));
  document.querySelectorAll("#alertsList .unread-dot").forEach((el) => el.remove());
  $("#alertBadge").hidden = true;
  $("#alertCount").textContent = `0 ${t("unread")}`;
  // 2) GERCEK KAYNAK arka plan: depodan taze oku, temizle, geri yaz + rozeti guncelle. Yaniti BEKLE.
  try {
    await chrome.runtime.sendMessage({ type: "markRead", accountId: viewId });
  } catch (e) {
    // arka plan uyanik degilse / mesaj basarisizsa: dogrudan depoya yaz (yedek yol)
    try {
      const fresh = (await chrome.storage.local.get("acct:" + viewId))["acct:" + viewId];
      if (fresh && fresh.events) { fresh.events.forEach((ev) => (ev.unread = false)); await chrome.storage.local.set({ ["acct:" + viewId]: fresh }); }
    } catch (e2) {}
  }
  // 3) bellekteki kopyayi depodaki gercek durumla senkronla; liste artik bosalir (sadece okunmamislar gosterilir)
  try {
    const fresh = (await chrome.storage.local.get("acct:" + viewId))["acct:" + viewId];
    if (fresh) { acct = fresh; renderAlerts(acct.events || []); applyAvatars(); }
  } catch (e) {}
}
async function markReadSilent() {
  await chrome.runtime.sendMessage({ type: "markRead", accountId: viewId });
  $("#alertBadge").hidden = true;
  $("#alertCount").textContent = `0 ${t("unread")}`;
}

// yenileme sikligi: her tikta sonraki secenege gec (poll tetiklemeden, sadece alarmi ayarla)
const INTERVALS = [1, 2, 3, 4, 5, 10, 15, 30, 60];
$("#intervalBtn").addEventListener("click", async () => {
  const cur = Number(settings.pollMinutes) || 5;
  const idx = INTERVALS.indexOf(cur);
  const next = INTERVALS[(idx + 1) % INTERVALS.length];
  settings.pollMinutes = next;
  $("#intervalBtn").textContent = `${next} ${t("minutesShort")}`;
  await chrome.runtime.sendMessage({ type: "setInterval", minutes: next });
});

$("#exportBtn").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  chrome.downloads ? chrome.downloads.download({ url, filename: `friend-tracker-backup-${stamp}.json` }) : window.open(url);
});
$("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
$("#restoreInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await chrome.storage.local.set(data);
    if (data.settings?.lang) { LANG = resolveLang(data.settings.lang); applyI18n(); }
    if (data.settings?.theme) applyTheme(data.settings.theme);
    noFollowCache = null;
    await loadAll();
    flash($("#restoreBtn"), t("restored"));
  } catch (err) { flash($("#restoreBtn"), "?"); }
  e.target.value = "";
});
$("#resetBtn").addEventListener("click", async () => {
  if (!(await modalConfirm(t("confirmReset"), { danger: true }))) return;
  const all = await chrome.storage.local.get(null);
  const rm = Object.keys(all).filter((k) => k.startsWith("acct:"));
  await chrome.storage.local.remove([...rm, "presencePrev"]);
  noFollowCache = null;
  await chrome.runtime.sendMessage({ type: "pollNow" });
  await loadAll();
});

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeBtn").innerHTML = theme === "dark" ? ICON.moon : ICON.sun;
}

// hesap cubugu: dikey tekerlegi yatay kaydirmaya cevir
$("#accountsBar").addEventListener("wheel", (e) => {
  if (e.deltaY !== 0) { e.preventDefault(); $("#accountsBar").scrollLeft += e.deltaY; }
}, { passive: false });

// presence periyodik tazele
setInterval(async () => {
  const ids = Object.keys(acct.friends || {});
  if (!ids.length) return;
  await loadPresence(ids);
  if (friendsView === "friends" && $("#tab-friends").classList.contains("active")) { renderFriends(); applyAvatars(); }
}, 30000);

// ---------- init ----------
(async () => {
  const { settings: s } = await chrome.storage.local.get("settings");
  settings = s || {};
  LANG = resolveLang(settings.lang);
  document.documentElement.lang = LANG;
  applyTheme(settings.theme === "light" ? "light" : "dark");
  $("#refreshBtn").innerHTML = ICON.refresh;
  $("#pinBtn").innerHTML = ICON.pin;
  $("#pinBtn").title = t("pinTop");
  $("#vtList").innerHTML = ICON.list;
  $("#vtGrid").innerHTML = ICON.grid;
  $("#bulkBtn").innerHTML = ICON.trash;
  $("#gameAddBtn").innerHTML = ICON.plus;
  $("#gameEditBtn").innerHTML = ICON.settings;
  $("#navGames").innerHTML = ICON.game;
  $("#navReview").innerHTML = ICON.star;
  $("#langSelect").value = settings.lang || "auto";
  $("#intervalBtn").textContent = `${Number(settings.pollMinutes) || 5} ${t("minutesShort")}`;
  friendLayout = settings.friendLayout === "grid" ? "grid" : "list";
  $("#vtList").classList.toggle("active", friendLayout === "list");
  $("#vtGrid").classList.toggle("active", friendLayout === "grid");
  if (new URLSearchParams(location.search).get("w")) $("#pinBtn").hidden = true;
  applyI18n();
  await loadAll();
})();
