// Generated snapshot adapter; only initialized on explicit activation.
globalThis.TasuRobloxWorkerFactory = function(chrome) {
const network=TasuRobloxNetwork(globalThis.fetch.bind(globalThis)),fetch=network.fetch;
// Roblox Friend Tracker - background service worker (MV3)
// Coklu hesap: her hesabin verisi ayri saklanir (acct:<id>).


const DEFAULT_POLL = 5;
const PINNED_MIN = 15; // aktif/giris yapilmamis hesaplar en sik 15 dk
const PRESENCE_MIN = 1;
const MAX_EVENTS = 2000;
const MAX_HISTORY = 12;

let csrfToken = null;
const notifData = {};
const pollingSet = new Set();

// ---------- lifecycle ----------

// eski tek-hesap verisini (state/events) yeni acct:<id> yapisina tasi
async function migrate() {
  const store = await chrome.storage.local.get(["state", "events"]);
  if (store.state && store.state.userId) {
    const id = store.state.userId;
    const key = acctKey(id);
    const existing = await chrome.storage.local.get(key);
    if (!existing[key]) {
      await chrome.storage.local.set({ [key]: { ...store.state, events: store.events || [] }, authId: id });
    }
    await chrome.storage.local.remove(["state", "events"]);
  }
}


async function ensureAlarms() {
  const { settings } = await chrome.storage.local.get("settings");
  
  
  
}
function clampInterval(v) {
  const n = Number(v);
  if (!n || n < 1) return DEFAULT_POLL;
  return n > 720 ? 720 : n;
}
async function getT() {
  const { settings } = await chrome.storage.local.get("settings");
  return TRANSLATIONS[resolveLang(settings?.lang)] || TRANSLATIONS.en;
}

// ---------- messaging ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "pollNow") {
    pollAll("manual").then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "setInterval") {
    const mins = clampInterval(msg.minutes);
    chrome.storage.local.get("settings").then(({ settings }) => {
      chrome.storage.local.set({ settings: { ...(settings || {}), pollMinutes: mins } }).then(() => {
        
        sendResponse({ ok: true, minutes: mins });
      });
    });
    return true;
  }
  if (msg.type === "markRead") {
    markAllRead(msg.accountId).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "openTempTab") {
    chrome.tabs.create({ url: msg.url }).then((tab) => {
      if (tab && tab.id != null && msg.closeAfter) {
        setTimeout(() => { chrome.tabs.remove(tab.id).catch(() => {}); }, msg.closeAfter);
      }
    });
    return false;
  }
});

// ---------- Roblox API ----------
async function robloxPost(url, body) {
  const doFetch = (tok) =>
    fetch(url, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...(tok ? { "x-csrf-token": tok } : {}) },
      body: JSON.stringify(body) });
  let res = await doFetch(csrfToken);
  if (res.status === 403) {
    const tok = res.headers.get("x-csrf-token");
    if (tok) { csrfToken = tok; res = await doFetch(tok); }
  }
  return res;
}
async function getAuthUser() {
  try {
    const r = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include" });
    if(r.status===401)return null;
    if(!r.ok)throw new Error("Roblox oturum API " + r.status);
    return await r.json();
  } catch (e) { throw e; }
}
async function getFriends(userId) {
  const r = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`, { credentials: "include" });
  if (!r.ok) throw new Error("friends API " + r.status);
  const d = await r.json();
  return d.data || [];
}
async function fetchNamesBg(ids) {
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
async function getPresence(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map(Number);
    try {
      const r = await robloxPost("https://presence.roblox.com/v1/presence/users", { userIds: chunk });
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of d.userPresences || []) map[p.userId] = p;
    } catch (e) {}
  }
  return map;
}
async function getAvatar(id) {
  try {
    const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=48x48&format=Png&isCircular=true`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.data?.[0]?.imageUrl || null;
  } catch (e) { return null; }
}

// ---------- hesap deposu ----------
const acctKey = (id) => "acct:" + id;
async function getAcct(id) {
  const k = acctKey(id);
  const store = await chrome.storage.local.get(k);
  return store[k] || null;
}
async function setAcct(id, data) {
  await chrome.storage.local.set({ [acctKey(id)]: data });
}

// ---------- poll ----------
async function pollAll(reason) {
  await pollAuto();
  await pollPinned();
}
async function pollAuto() {
  const user = await getAuthUser();
  if (!user || !user.id) { await chrome.storage.local.set({ authId: null }); return; }
  await chrome.storage.local.set({ authId: user.id });
  await pollAccount({ id: user.id, name: user.name, displayName: user.displayName }, true);
}
async function pollPinned() {
  const { settings, authId } = await chrome.storage.local.get(["settings", "authId"]);
  const accounts = settings?.accounts || [];
  for (const acc of accounts) {
    if (String(acc.id) === String(authId)) continue; // pollAuto zaten yapti
    await pollAccount(acc, acc.notify !== false);
  }
}

async function pollAccount(target, notifyEnabled) {
  const id = Number(target.id);
  if (pollingSet.has(id)) return;
  pollingSet.add(id);
  try {
    const now = Date.now();
    let acct = (await getAcct(id)) || {};

    let friendsArr;
    try {
      friendsArr = await getFriends(id);
    } catch (e) {
      acct.status = "error"; acct.lastError = String(e); acct.lastPoll = now;
      acct.userId = id; acct.userName = target.name; acct.userDisplayName = target.displayName;
      await setAcct(id, acct);
      throw e;
    }

    const current = {};
    for (const f of friendsArr) current[f.id] = { name: f.name, displayName: f.displayName };
    const noName = Object.keys(current).filter((x) => !current[x].name);
    if (noName.length) {
      const info = await fetchNamesBg(noName);
      for (const x of noName) if (info[x]) { current[x].name = info[x].name; current[x].displayName = current[x].displayName || info[x].displayName; }
    }

    let events = (acct.events || []).filter(event=>event?.name);
    const prev = acct.friends;

    if (!prev) {
      const friends = {};
      for (const x in current) friends[x] = { ...current[x], since: now, known: false };
      acct = { userId: id, userName: target.name, userDisplayName: target.displayName, friends, events, baselineAt: now, lastPoll: now, status: "ok" };
      await setAcct(id, acct);
      updateBadge();
      return;
    }

    const added = [], removed = [];
    for (const x in current) if (!prev[x]) added.push(x);
    for (const x in prev) if (!current[x]) removed.push(x);

    const nf = { ...prev };
    for (const x of added) {
      nf[x] = { ...current[x], since: now, known: true };
      if(current[x].name && !events.some(e=>e.type==="added"&&String(e.userId)===String(x)&&now-Number(e.ts)<300000)) events.unshift({ id: `${now}-a-${x}`, type: "added", userId: x, name: current[x].name, displayName: current[x].displayName, ts: now, unread: true });
    }
    for (const x of removed) {
      const info = prev[x]; delete nf[x];
      if(info.name && !events.some(e=>e.type==="removed"&&String(e.userId)===String(x)&&now-Number(e.ts)<300000)) events.unshift({ id: `${now}-r-${x}`, type: "removed", userId: x, name: info.name, displayName: info.displayName, ts: now, since: info.since || null, unread: true });
    }
    for (const x in current) {
      if (!nf[x]) continue;
      const c = current[x], r = nf[x];
      if (c.name && r.name && c.name !== r.name) r.nameHistory = [...(r.nameHistory || []), r.name].slice(-MAX_HISTORY);
      if (c.displayName && r.displayName && c.displayName !== r.displayName) r.displayHistory = [...(r.displayHistory || []), r.displayName].slice(-MAX_HISTORY);
      r.name = c.name; r.displayName = c.displayName;
    }
    if (events.length > MAX_EVENTS) events = events.slice(0, MAX_EVENTS);

    acct.friends = nf; acct.userId = id; acct.userName = target.name; acct.userDisplayName = target.displayName;
    acct.events = events; acct.lastPoll = now; acct.status = "ok"; delete acct.lastError;
    await setAcct(id, acct);

    updateBadge();
  } finally {
    pollingSet.delete(id);
  }
}

// ---------- presence izleme ----------
async function pollPresence() {
  const { settings, presencePrev = {} } = await chrome.storage.local.get(["settings", "presencePrev"]);
  const watches = settings?.watches || {};
  const ids = Object.keys(watches).filter((id) => { const w = watches[id]; return w && (w.online || w.ingame || w.game); });
  if (!ids.length) return;

  const pres = await getPresence(ids);
  const prev = { ...presencePrev };
  const L = await getT();

  for (const id of ids) {
    const w = watches[id];
    const p = pres[id]; if (!p) continue;
    const type = p ? p.userPresenceType : 0;
    const placeId = p ? p.placeId : null;
    const pv = prev[id]; if (!pv) { prev[id] = { type, placeId }; continue; }
    const dName = w.displayName || w.name || "User";

    if (w.online && pv.type === 0 && type > 0)
      notify({ userId: id, title: L.notifOnlineTitle, message: L.notifOnlineBody(dName), buttons: [{ action: "profile" }], buttonTitles: [L.viewProfile] });
    if (w.ingame && pv.type !== 2 && type === 2)
      notifyGame(id, dName, p, L);
    if (w.game && w.game.placeId && String(placeId) === String(w.game.placeId) && String(pv.placeId) !== String(w.game.placeId))
      notifyGame(id, dName, p, L, L.notifGameTitle);

    prev[id] = { type, placeId };
  }
  await chrome.storage.local.set({ presencePrev: prev });
}
function notifyGame(id, dName, p, L, title) {
  const joinable = p && p.userPresenceType === 2 && p.placeId && p.gameId;
  const buttons = [{ action: "profile" }];
  const titles = [L.viewProfile];
  if (joinable) { buttons.push({ action: "join", placeId: p.placeId, gameId: p.gameId }); titles.push(L.join); }
  notify({ userId: id, title: title || L.notifInGameTitle, message: L.notifInGameBody(dName, p ? p.lastLocation : ""), buttons, buttonTitles: titles });
}

// ---------- bildirim ----------
async function notify({ userId, title, message, icon, buttons, buttonTitles }) {
  const {settings}=await chrome.storage.local.get("settings"); if(settings?.desktopNotifications===false)return;
  const nid = `tasu-roblox-${userId}-${Date.now()}`;
  const avatar = await getAvatar(userId);
  notifData[nid] = { userId, buttons: buttons || [] };
  chrome.notifications.create(nid, {
    type: "basic", iconUrl: avatar || icon || "hub/roblox/icons/icon128.png",
    title, message, contextMessage: "Roblox Friend Tracker",
    requireInteraction: false, priority: 1,
    buttons: (buttonTitles || []).map((tl) => ({ title: tl })),
  });
}
chrome.notifications.onClicked.addListener((nid) => {
  const d = notifData[nid];
  const uid = d ? d.userId : (nid.match(/^tasu-roblox-(\d+)-/) || [])[1];
  if (uid) chrome.tabs.create({ url: `https://www.roblox.com/users/${uid}/profile` });
  chrome.notifications.clear(nid);
});
chrome.notifications.onButtonClicked.addListener((nid, idx) => {
  const d = notifData[nid];
  if (!d) { const uid = (nid.match(/^tasu-roblox-(\d+)-/) || [])[1]; if (uid) chrome.tabs.create({ url: `https://www.roblox.com/users/${uid}/profile` }); return; }
  const b = d.buttons[idx];
  if (b && b.action === "join") openJoin(b.placeId, b.gameId);
  else chrome.tabs.create({ url: `https://www.roblox.com/users/${d.userId}/profile` });
  chrome.notifications.clear(nid);
});
function openJoin(placeId, gameId) {
  const url = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${gameId}`;
  chrome.tabs.create({ url }).catch(() => chrome.tabs.create({ url: `https://www.roblox.com/games/${placeId}` }));
}

// ---------- badge ----------
async function updateBadge() {
  const all = await chrome.storage.local.get(null);
  let unread = 0;
  for (const k in all) if (k.startsWith("acct:")) unread += (all[k].events || []).filter((e) => e.unread).length;
  chrome.action.setBadgeText({ text: unread ? String(unread) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
}
async function markAllRead(accountId) {
  if (accountId) {
    const acct = await getAcct(accountId);
    if (acct) { (acct.events || []).forEach((e) => (e.unread = false)); await setAcct(accountId, acct); }
  } else {
    const all = await chrome.storage.local.get(null);
    for (const k in all) if (k.startsWith("acct:")) { (all[k].events || []).forEach((e) => (e.unread = false)); await chrome.storage.local.set({ [k]: all[k] }); }
  }
  updateBadge();
}

return Object.fromEntries(Object.entries({pollAll,pollAuto,pollPinned,pollPresence}).map(([key,fn])=>[key,(...args)=>network.run(()=>fn(...args))]));
};
