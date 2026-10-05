"use strict";
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname,".."), source = path.join(root,"integrations/roblox-source"), dest = path.join(root,"edge-extension/hub/roblox");
const check=process.argv.includes("--check");
if(!check)fs.mkdirSync(dest,{recursive:true});
function emit(name, text) { const file=path.join(dest,name);if(check){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(Buffer.from(text)))throw new Error(`Stale hub output: ${name}`);}else fs.writeFileSync(file, text); }
const read = name => fs.readFileSync(path.join(source,name),"utf8").replace(/\r\n/g,"\n");
let html = read("popup.html").replace(/<section id="tab-review"[\s\S]*?<\/section>/,"").replace(/<button id="navReview"[^>]*><\/button>/, "").replace(/<script type="module" src="review-tab[^>]*><\/script>/,"");
html = html.replace('</head>', '<link rel="stylesheet" href="../theme.css"><link rel="stylesheet" href="theme.css"><script src="../store.js"></script><script src="../../common/lifecycle.js"></script><script src="network.js"></script><script src="adapter.js"></script></head>');
html = html.replace('<div class="accounts"','<section id="notificationActivity" class="notification-activity" hidden><button id="closeNotificationActivity" class="notification-activity-close" type="button" aria-label="Kapat">&times;</button><img id="notificationActivityAvatar" alt=""><div><strong id="notificationActivityName"></strong><span id="notificationActivityState"></span><small id="notificationActivityHistory"></small></div></section><p id="trackerStatus" role="status" hidden></p><div class="accounts"');
html = html.replace('<section id="tab-settings" class="panel">','<section id="tab-settings" class="panel"><label class="setting"><span>Masaüstü bildirimleri</span><input id="desktopNotifications" type="checkbox" checked></label>');
html = html.replace(/<select id="langSelect">[\s\S]*?<\/select>/,'<div class="language-control"><button id="langSelect" class="language-button" type="button" aria-haspopup="listbox" aria-expanded="false"></button><div id="languageMenu" class="language-menu" role="listbox" hidden><button type="button" data-lang="auto">Otomatik</button><button type="button" data-lang="tr">Türkçe</button><button type="button" data-lang="en">English</button></div></div>');
html = html.replace('<p class="note" data-i18n="note"></p>','');
emit("index.html",html);
let popup = read("popup.js").replace(/\$\("#navReview"\)\.innerHTML = ICON\.star;/, "");
popup = popup.replace('$("#navGames").innerHTML = ICON.game;', '$("#navGames").innerHTML = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 7h9a4 4 0 0 1 3.9 3.1l1.1 6a2.3 2.3 0 0 1-3.9 2.1L15 15H9l-2.6 3.2a2.3 2.3 0 0 1-3.9-2.1l1.1-6A4 4 0 0 1 7.5 7Z"/><path d="M7.5 9.5v5m-2.5-2.5h5"/><circle cx="16" cy="10.5" r=".8" fill="currentColor" stroke="none"/><circle cx="18" cy="13" r=".8" fill="currentColor" stroke="none"/></svg>\';');
popup = popup.replace('await chrome.storage.local.set(data);', 'await chrome.runtime.sendMessage({ type: "importBackup", data });');
popup = popup.replace('if (data.settings?.theme) applyTheme(data.settings.theme);', '');
popup = popup.replace(/^.*console\.log\("\[FriendTracker\] markRead click".*$/m, '');
popup = popup.replace('setInterval(async () => {', 'life.setInterval(async () => {');
popup = popup.replace(/\$\("#pinBtn"\)\.addEventListener\("click", async \(\) => \{[\s\S]*?\n\}\);/, '');
popup = popup.replace('if (new URLSearchParams(location.search).get("w")) $("#pinBtn").hidden = true;', '$("#pinBtn").hidden = true; $("#themeBtn").hidden = true;');
popup = popup.replace('applyTheme(settings.theme === "light" ? "light" : "dark");', 'applyTheme("light");');
popup = popup.replace('  await backfillNames();', '');
popup = popup.replace('  await loadAvatars([...ids]);', '  void hydrateDecorations([...ids]);');
popup = popup.replace('async function backfillNames() {', 'async function backfillNames(snapshot=acct, snapshotId=viewId) {\n  const acct=snapshot,viewId=snapshotId;');
popup = popup.replace('${ICON.game}</div><div class="wm-label">${escapeHtml(t("watchGame"))}', '${WATCH_GAME_ICON}</div><div class="wm-label">${escapeHtml(t("watchGame"))}');
popup = popup.replace('async function setWatch(uid, patch, f) {', 'async function setWatch(uid, patch, f) {\n  if(settings.desktopNotifications!==false&&Object.values(patch).some(Boolean)){const granted=await globalThis.chrome.permissions.request({permissions:["notifications"]});if(!granted){settings.desktopNotifications=false;$("#desktopNotifications").checked=false;trackerStatus("Kullanıcı izleniyor; masaüstü bildirimleri kapalı.");}}');
popup = popup.replace('  await chrome.storage.local.set({ settings });\n}\nfunction closeWatchMenu', '  await chrome.storage.local.set({ settings });\n  return true;\n}\nfunction closeWatchMenu');
popup = popup.replace('      op.classList.toggle("on", on);\n      await setWatch(f.id, { [k]: on }, f);', '      if(await setWatch(f.id, { [k]: on }, f))op.classList.toggle("on", on);');
popup = popup.replace('await setWatch(f.id, { game: { placeId: Number(v), name: "" } }, f); custOpt.classList.add("on");', 'if(await setWatch(f.id, { game: { placeId: Number(v), name: "" } }, f))custOpt.classList.add("on");');
popup = popup.replace(/\$\("#refreshBtn"\)\.addEventListener\("click", async \(\) => \{[\s\S]*?\n\}\);/, '$("#refreshBtn").addEventListener("click", () => void refreshTracker());');
popup = popup.replace(/async function switchAccount\(key\) \{[\s\S]*?\n\}/, `async function switchAccount(key) {
  if(String(settings.viewAccount||"auto")===String(key))return;
  settings.viewAccount=key;ignoreStorageUntil=Date.now()+1200;
  await chrome.storage.local.set({settings});noFollowCache=null;exitSelection();await loadAll();
}`);
popup = popup.replace(/async function addAccount\(input\) \{[\s\S]*?\n\}/, `async function addAccount(input) {
  const acc=await resolveAccount(input);if(!acc)return false;
  settings.accounts=settings.accounts||[];
  if(!settings.accounts.some(a=>String(a.id)===String(acc.id)))settings.accounts.push({id:acc.id,name:acc.name,displayName:acc.displayName,notify:true});
  settings.viewAccount=String(acc.id);ignoreStorageUntil=Date.now()+30000;
  await chrome.storage.local.set({settings});noFollowCache=null;exitSelection();
  await refreshTracker();ignoreStorageUntil=Date.now()+1200;return true;
}`);
popup = popup.replace('  acct = viewId ? store["acct:" + viewId] || {} : {};', '  acct = viewId ? store["acct:" + viewId] || {} : {};\n  acct.events = cleanEventList(acct.events || []);');
popup = popup.replace('  settings = store.settings || {};', '  settings = store.settings || {};\n  if(typeof syncLanguageControl==="function")syncLanguageControl();');
popup = popup.replace('  if (changed) await chrome.storage.local.set({ ["acct:" + viewId]: acct });\n}', '  if (changed) await chrome.storage.local.set({ ["acct:" + viewId]: acct });\n  return changed;\n}');
popup = popup.replace('  menu.style.top = Math.min(r.bottom + 5, window.innerHeight - menu.offsetHeight - 8) + "px";\n  menu.style.right = window.innerWidth - r.right + "px";', '  positionFloatingMenu(menu, anchor);');
popup = popup.replace('if (k === "custom") { const c = menu.querySelector(".wm-custom"); c.hidden = !c.hidden; return; }', 'if (k === "custom") { const c = menu.querySelector(".wm-custom"); c.hidden = !c.hidden; requestAnimationFrame(()=>positionFloatingMenu(menu,anchor)); return; }');
popup = popup.replace('document.querySelectorAll(".tab").forEach((tab) => {\n  tab.addEventListener("click", () => showPanel(tab.dataset.tab, tab));\n});', 'document.querySelectorAll(".tab").forEach((tab) => {\n  tab.addEventListener("click", () => { showPanel(tab.dataset.tab, tab); if(tab.dataset.tab==="alerts")void markAllAccountsReadOnView(); });\n});');
const liveUpdates = `
const WATCH_GAME_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.6 7h8.8a4.2 4.2 0 0 1 4.1 3.3l1 5.2a2.4 2.4 0 0 1-4.1 2.2L14.8 15H9.2l-2.6 2.7a2.4 2.4 0 0 1-4.1-2.2l1-5.2A4.2 4.2 0 0 1 7.6 7Z"/><path d="M7.5 9.7v4.6M5.2 12h4.6"/><circle cx="16.1" cy="10.7" r=".85" fill="currentColor" stroke="none"/><circle cx="18.3" cy="13" r=".85" fill="currentColor" stroke="none"/></svg>';
let decorationPending=null,refreshPending=null,ignoreStorageUntil=0;
function trackerStatus(message,error=false){const el=$("#trackerStatus");el.hidden=!message;el.textContent=message;el.classList.toggle("error",error);}
function cleanEventList(events){
  const output=[];
  for(const event of Array.isArray(events)?events:[]){
    if(!event?.name)continue;
    const duplicate=output.findIndex(previous=>String(previous.userId)===String(event.userId)&&previous.type===event.type&&Math.abs(Number(previous.ts)-Number(event.ts))<120000);
    if(duplicate<0)output.push(event);else if(!output[duplicate].name&&event.name)output[duplicate]=event;
  }
  return output;
}
function positionFloatingMenu(menu,anchor){
  if(!menu?.isConnected||!anchor?.isConnected)return;
  const margin=8,r=anchor.getBoundingClientRect(),width=Math.min(menu.offsetWidth,window.innerWidth-margin*2);
  menu.style.width=width+"px";menu.style.maxHeight=Math.max(80,window.innerHeight-margin*2)+"px";
  const height=Math.min(menu.offsetHeight,window.innerHeight-margin*2),below=r.bottom+6,above=r.top-height-6;
  const top=below+height<=window.innerHeight-margin?below:Math.max(margin,above);
  const left=Math.max(margin,Math.min(r.right-width,window.innerWidth-width-margin));
  menu.style.top=top+"px";menu.style.left=left+"px";menu.style.right="auto";
}
async function hydrateDecorations(ids){
  if(decorationPending)return;const target=viewId;ignoreStorageUntil=Math.max(ignoreStorageUntil,Date.now()+3000);
  decorationPending=Promise.allSettled([backfillNames(),loadAvatars(ids)]);
  try{const result=await decorationPending;if(target===viewId){if(result[0]?.value===true){renderChips();renderHeader();if(friendsView==="friends")renderFriends();}applyAvatars();}}finally{decorationPending=null;}
}
async function refreshTracker(){
  if(refreshPending)return refreshPending;
  const button=$("#refreshBtn");button.disabled=true;button.classList.add("spin");trackerStatus("Arkadaşlar güncelleniyor…");
  refreshPending=(async()=>{try{await chrome.runtime.sendMessage({type:"pollNow"});await loadAll();trackerStatus(authId?"":"Roblox oturumu bulunamadı. roblox.com'da giriş yapıp yenile.");}catch(e){trackerStatus(e.message||"Roblox bağlantısı kurulamadı. Yeniden dene.",true);}finally{button.disabled=false;button.classList.remove("spin");refreshPending=null;}})();
  return refreshPending;
}
globalThis.chrome.storage.local.get("settings").then(data=>{$("#desktopNotifications").checked=data.settings?.desktopNotifications!==false;});
$("#desktopNotifications").addEventListener("change",async e=>{
  const control=e.target,enabled=control.checked;
  try{
    if(enabled&&!await globalThis.chrome.permissions.request({permissions:["notifications"]}))throw new Error("Masaüstü bildirim izni verilmedi.");
    settings.desktopNotifications=enabled;ignoreStorageUntil=Date.now()+800;await globalThis.chrome.storage.local.set({settings});
    trackerStatus(enabled?"Masaüstü bildirimleri açık.":"Masaüstü bildirimleri kapalı.");
  }catch(err){control.checked=!enabled;trackerStatus(err.message,true);}
});
const languageLabels={auto:"Otomatik",tr:"Türkçe",en:"English"},languageButton=$("#langSelect"),languageMenu=$("#languageMenu");
function syncLanguageControl(){languageButton.textContent=languageLabels[settings.lang||"auto"]||languageLabels.auto;}
languageButton.addEventListener("click",e=>{e.stopPropagation();languageMenu.hidden=!languageMenu.hidden;languageButton.setAttribute("aria-expanded",String(!languageMenu.hidden));if(!languageMenu.hidden)positionFloatingMenu(languageMenu,languageButton);});
languageMenu.addEventListener("click",e=>{const option=e.target.closest("[data-lang]");if(!option)return;e.stopPropagation();languageButton.value=option.dataset.lang;languageMenu.hidden=true;languageButton.setAttribute("aria-expanded","false");languageButton.dispatchEvent(new Event("change"));});
document.addEventListener("click",()=>{languageMenu.hidden=true;languageButton.setAttribute("aria-expanded","false");});syncLanguageControl();
async function markAllAccountsReadOnView(force=false){
  if(!force&&!$("#tab-alerts").classList.contains("active"))return;
  ignoreStorageUntil=Date.now()+1500;
  await chrome.runtime.sendMessage({type:"markRead",accountId:null}).catch(()=>{});
  for(const event of acct.events||[])event.unread=false;$("#alertBadge").hidden=true;$("#alertCount").textContent=\`0 \${t("unread")}\`;
}
async function renderNotificationActivity(){
  const uid=new URLSearchParams(location.search).get("activityUser");if(!/^\\d+$/.test(uid||""))return;
  const all=await chrome.storage.local.get(null);let person=null;const events=[];
  for(const [key,value]of Object.entries(all)){if(!key.startsWith("acct:")||!value)continue;if(value.friends?.[uid])person=value.friends[uid];for(const event of value.events||[])if(String(event.userId)===uid){events.push(event);person=person||event;}}
  person=person||settings.watches?.[uid]||{name:"",displayName:""};const panel=$("#notificationActivity");panel.hidden=false;
  $("#notificationActivityAvatar").dataset.uid=uid;$("#notificationActivityName").textContent=person.displayName||person.name||\`Kullanıcı \${uid}\`;
  await loadPresence([uid]).catch(()=>{});const state=statusInfo(presenceCache[uid]);$("#notificationActivityState").textContent=state.text;
  $("#notificationActivityHistory").textContent=events.length?events.slice(0,3).map(event=>\`\${event.type==="added"?"Eklendi":"Çıktı"} · \${fmtDate(event.ts)} \${fmtTime(event.ts)}\`).join(" • "):"İzleme bildirimi ayrıntısı";
  await loadAvatars([uid]).catch(()=>{});applyAvatars();await markAllAccountsReadOnView(true);
}
$("#closeNotificationActivity").addEventListener("click",()=>$("#notificationActivity").hidden=true);void renderNotificationActivity();
window.addEventListener("unhandledrejection",e=>{e.preventDefault();trackerStatus("İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.",true);});
let updatePending=false;
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local" || Date.now()<ignoreStorageUntil || refreshPending || !Object.keys(changes).some(k=>/^tasuApps:roblox:(acct:|authId)/.test(k)) || updatePending)return;
  updatePending=true;life.raf(()=>{updatePending=false;void loadAll();});
});
life.onResume=()=>void loadAll();
`;
emit("popup.js", '// Generated snapshot adapter; edit scripts/build-hub.js or hub modules.\n(() => { const chrome = globalThis.TasuRobloxChrome; const life=RG_LIFECYCLE.create("roblox"); const network=TasuRobloxNetwork(globalThis.fetch.bind(globalThis)),fetch=network.fetch;\n' + popup + liveUpdates + '\n})();\n');
emit("popup.css",read("popup.css")); emit("i18n.js",read("i18n.js"));
for (const name of fs.readdirSync(path.join(source,"icons"))) {
  if(!check)fs.mkdirSync(path.join(dest,"icons"),{recursive:true});emit("icons/"+name,fs.readFileSync(path.join(source,"icons",name)));
}
let bg = read("background.js").replace('importScripts("i18n.js");','');
bg = bg.replace(/chrome\.runtime\.onInstalled\.addListener[^\n]*\n/g, "").replace(/chrome\.runtime\.onStartup\.addListener[^\n]*\n/g, "");
bg = bg.replace(/chrome\.alarms\.onAlarm\.addListener\([\s\S]*?\n\}\);/, "");
// Only the central scheduler owns alarms. Legacy interval changes save preferences.
bg = bg.replace(/chrome\.alarms\.create\([^;]+;/g, "");
bg = bg.replace('"icons/', '"hub/roblox/icons/');
bg = bg.replaceAll('icon: "icons/', 'icon: "hub/roblox/icons/');
bg = bg.replace('icon || "icons/icon128.png"', 'icon || "hub/roblox/icons/icon128.png"');
// A failed presence response must not pretend that every friend went offline.
bg = bg.replace('const p = pres[id];', 'const p = pres[id]; if (!p) continue;');
bg = bg.replace('const pv = prev[id] || { type: 0, placeId: null };', 'const pv = prev[id]; if (!pv) { prev[id] = { type, placeId }; continue; }');
bg = bg.replace('await setAcct(id, acct);\n      return;', 'await setAcct(id, acct);\n      throw e;');
bg = bg.replaceAll('rft-', 'tasu-roblox-');
bg = bg.replace('    let events = acct.events || [];', '    let events = (acct.events || []).filter(event=>event?.name);');
bg = bg.replace(/\n    if \(notifyEnabled && \(added\.length \|\| removed\.length\)\) \{[\s\S]*?\n    \}\n    updateBadge\(\);/, '\n    updateBadge();');
bg = bg.replace('      events.unshift({ id: `${now}-a-${x}`, type: "added", userId: x, name: current[x].name, displayName: current[x].displayName, ts: now, unread: true });', '      if(current[x].name && !events.some(e=>e.type==="added"&&String(e.userId)===String(x)&&now-Number(e.ts)<300000)) events.unshift({ id: `${now}-a-${x}`, type: "added", userId: x, name: current[x].name, displayName: current[x].displayName, ts: now, unread: true });');
bg = bg.replace('      const info = prev[x]; delete nf[x];\n      events.unshift({ id: `${now}-r-${x}`, type: "removed", userId: x, name: info.name, displayName: info.displayName, ts: now, since: info.since || null, unread: true });', '      const info = prev[x]; delete nf[x];\n      if(info.name && !events.some(e=>e.type==="removed"&&String(e.userId)===String(x)&&now-Number(e.ts)<300000)) events.unshift({ id: `${now}-r-${x}`, type: "removed", userId: x, name: info.name, displayName: info.displayName, ts: now, since: info.since || null, unread: true });');
bg = bg.replace('async function notify({ userId, title, message, icon, buttons, buttonTitles }) {', 'async function notify({ userId, title, message, icon, buttons, buttonTitles }) {\n  const {settings}=await chrome.storage.local.get("settings"); if(settings?.desktopNotifications===false)return;');
bg = bg.replace('requireInteraction: true, priority: 2,', 'requireInteraction: false, priority: 1,');
bg = bg.replace('if (!r.ok) return null;\n    return await r.json();\n  } catch (e) { return null; }', 'if(r.status===401)return null;\n    if(!r.ok)throw new Error("Roblox oturum API " + r.status);\n    return await r.json();\n  } catch (e) { throw e; }');
emit("worker.js", '// Generated snapshot adapter; only initialized on explicit activation.\nglobalThis.TasuRobloxWorkerFactory = function(chrome) {\nconst network=TasuRobloxNetwork(globalThis.fetch.bind(globalThis)),fetch=network.fetch;\n' + bg + '\nreturn Object.fromEntries(Object.entries({pollAll,pollAuto,pollPinned,pollPresence}).map(([key,fn])=>[key,(...args)=>network.run(()=>fn(...args))]));\n};\n');
console.log("Built isolated Roblox snapshot (Dada is a separate safe module).");
require("./build-dada.js");
