/* Single event-driven coordinator. No polling loops or startup API requests. */
(() => {
  "use strict";
  if (!chrome.runtime.onConnect || !chrome.alarms || !chrome.tabs.onActivated) return;
  const {key,idleMs,modules}=TASU_HUB, ALARM="tasu:hub:tick", leases=new Map();
  let prefs,initializing,clockState={},chain=Promise.resolve(),robloxWorker=null,legacyHandler=null,notificationClick,notificationButton,notificationEventsBound=false,windowOperation=Promise.resolve();
  const queue=fn=>{chain=chain.catch(()=>{}).then(fn).catch(error=>{console.warn("[tasu-hub] scheduler",error.name);});return chain;};
  const trusted=s=>s.id===chrome.runtime.id && String(s.url||s.origin||"").startsWith(chrome.runtime.getURL(""));
  const defaults={enabled:{downloader:true,dada:true,roblox:false,music:false},tracking:false};
  async function init(){if(initializing)return initializing;initializing=(async()=>{const stored=await chrome.storage.local.get([key,"tasu:hub:clock"]);prefs={...defaults,...stored[key],enabled:{...defaults.enabled,...stored[key]?.enabled}};prefs.tracking=prefs.enabled.roblox;clockState=stored["tasu:hub:clock"]||{};if(stored[key]?.tracking!==prefs.tracking)await chrome.storage.local.set({[key]:prefs});})();try{await initializing;}catch(e){initializing=null;throw e;}}
  async function permitted(id){return !modules[id].permission || chrome.permissions.contains(modules[id].permission);}
  function getRoblox(){
    bindNotifications();
    if(robloxWorker)return robloxWorker;
    const storage=TASU_STORE.scopedStorage(chrome.storage.local);
    const facade={...chrome,notifications:{create:async(...args)=>{if(await chrome.permissions.contains({permissions:["notifications"]}))return chrome.notifications?.create(...args);},clear:id=>chrome.notifications?.clear(id),onClicked:{addListener(fn){notificationClick=fn;}},onButtonClicked:{addListener(fn){notificationButton=fn;}}},storage:{...chrome.storage,local:storage},runtime:{...chrome.runtime,onMessage:{addListener(fn){legacyHandler=fn;}}}};
    robloxWorker=TasuRobloxWorkerFactory(facade);return robloxWorker;
  }
  async function tick(){
    await init();const now=Date.now(), visible=new Set([...leases.values()].filter(l=>l.visible).map(l=>l.module));
    const windows=await chrome.windows.getAll({populate:true});
    for(const w of windows)if(w.focused)for(const t of w.tabs||[])if(t.active){try{const u=new URL(t.url);if(/(^|\.)roblox\.com$/.test(u.hostname))visible.add("roblox");if(t.url.startsWith(chrome.runtime.getURL("hub.html")) && u.searchParams.get("route")==="roblox")visible.add("roblox");}catch{}}
    const running=prefs.enabled.roblox && await permitted("roblox");
    if(running && visible.has("roblox")) clockState.lastRoblox=now;
    const live=running;
    const due=[];
    if(live){
      const worker=getRoblox();
      const saved=(await TASU_STORE.scopedStorage(chrome.storage.local).get("settings")).settings||{};
      const period=Math.max(1,Math.min(720,Number(saved.pollMinutes)||5))*60000;
      for(const [name,ms,fn] of [["friends",period,()=>worker.pollAuto()],["pinned",900000,()=>worker.pollPinned()],["presence",60000,()=>worker.pollPresence()]]){
        if(name==="presence" && !Object.keys(saved.watches||{}).length)continue;
        if((clockState[name]||0)<=now){
          try{await fn();clockState[name]=Date.now()+ms;clockState[name+"Errors"]=0;}catch(e){const n=Math.min(5,(clockState[name+"Errors"]||0)+1);clockState[name+"Errors"]=n;clockState[name]=Date.now()+Math.max(e.retryAfterMs||0,Math.min(1800000,ms*2**n));}
        }
        due.push(clockState[name]);
      }
    }
    await chrome.storage.local.set({"tasu:hub:clock":clockState});
    if(due.length)await chrome.alarms.create(ALARM,{when:Math.max(Date.now()+1000,Math.min(...due))});else await chrome.alarms.clear(ALARM);
  }
  chrome.runtime.onConnect.addListener(port=>{
    if(port.name!=="tasu-hub-view" || !trusted(port.sender))return;
    leases.set(port,{});
    port.onMessage.addListener(msg=>{if(msg.module!==null&&!modules[msg.module])return;leases.set(port,{module:msg.module,visible:msg.visible===true});void queue(tick);});
    port.onDisconnect.addListener(()=>{const last=leases.get(port);if(last?.module==="roblox"&&last.visible)clockState.lastRoblox=Date.now();leases.delete(port);void queue(tick);});
  });
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg?.type==="TASU_CONTENT_ACTIVE"){
      if(sender.tab)chrome.windows.get(sender.tab.windowId).then(w=>reply({active:!!(sender.tab.active&&w.focused)})).catch(()=>reply({active:false}));
      else reply({active:false});return !!sender.tab;
    }
    if(!["TASU_HUB_HEALTH","TASU_HUB_CONFIG","TASU_HUB_ACTIVATE","TASU_HUB_EXPAND","TASU_HUB_IMPORT","TASU_ROBLOX","TASU_MUSIC","TASU_MUSIC_DIAGNOSTICS"].includes(msg?.type))return;
    if(!trusted(sender)){reply({ok:false,error:"Bu işlem yalnızca Tasu Apps ekranından kullanılabilir"});return;}
    (async()=>{
      if(msg.type==="TASU_HUB_HEALTH")return {ok:true,protocol:TASU_HUB.version,build:TASU_HUB.build};
      if(msg.type==="TASU_MUSIC_DIAGNOSTICS")return {ok:true,data:{build:TASU_HUB.build,...await TasuMusicDiagnostics.run()}};
      await init();
      if(msg.type==="TASU_HUB_ACTIVATE"){
        if(!modules[msg.module]||!await permitted(msg.module))return {ok:false,error:"Bu araç için izin verilmedi."};
        prefs={...prefs,enabled:{...prefs.enabled,[msg.module]:true}};if(msg.module==="roblox")prefs.tracking=true;await chrome.storage.local.set({[key]:prefs});void queue(tick);return {ok:true,prefs};
      }
      if(msg.type==="TASU_HUB_EXPAND"){
        try{const win=await TasuHubWindows.open({route:msg.route,tabId:msg.tabId});return {ok:true,windowId:win.id};}catch(e){return {ok:false,error:e.message};}
      }
      if(msg.type==="TASU_HUB_CONFIG"){
        const next={enabled:{},tracking:false};
        for(const id of Object.keys(modules))next.enabled[id]=msg.prefs?.enabled?.[id]===true && await permitted(id);
        next.tracking=next.enabled.roblox;
        prefs=next;await chrome.storage.local.set({[key]:prefs});void queue(tick);return {ok:true,prefs};
      }
      if(msg.type==="TASU_HUB_IMPORT")return {ok:true,...await TASU_STORE.importBackup(chrome.storage.local,msg.data)};
      if(msg.type==="TASU_MUSIC"){
        if(!await permitted("music"))return {ok:false,code:"MUSIC_PERMISSION",error:"Müzik aracının yerel uygulama izni gerekli. Ana ekrandan müzik düğmesine basıp izin ver."};
        if(!prefs.enabled.music)return {ok:false,code:"MUSIC_INACTIVE",error:"Müzik aracı henüz etkinleşmedi. Ana ekrandan yeniden aç."};
        return await TASU_MUSIC.call(msg.payload);
      }
      if(!prefs.enabled.roblox||!await permitted("roblox"))throw new Error("Roblox aracı etkin değil");
      if(msg.payload?.type==="importBackup")return {ok:true,...await TASU_STORE.importBackup(chrome.storage.local,msg.payload.data)};
      if(!["pollNow","setInterval","markRead","openTempTab"].includes(msg.payload?.type))throw new Error("Bilinmeyen Roblox işlemi");
      if(msg.payload.type==="openTempTab" && !/^https:\/\/(?:www\.)?roblox\.com\//.test(msg.payload.url||""))throw new Error("Geçersiz Roblox bağlantısı");
      getRoblox();
      return await new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(!settled)reject(new Error("Roblox yanıt vermedi"));},25000);const done=r=>{settled=true;clearTimeout(timer);resolve(r||{ok:true});};if(legacyHandler(msg.payload,sender,done)!==true)done();});
    })().then(reply).catch(()=>reply({ok:false,error:msg.type==="TASU_MUSIC"?"Yerel müzik yardımcısı hazır değil. Kurulumu ve sürümünü kontrol et.":"İşlem tamamlanamadı. İzinlerini ve bağlantını kontrol et."}));
    return true;
  });
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)void queue(tick);});
  chrome.tabs.onActivated.addListener(()=>void queue(tick));chrome.tabs.onRemoved.addListener(()=>void queue(tick));
  chrome.tabs.onUpdated.addListener((_id,change)=>{if(change.url)void queue(tick);});
  chrome.windows.onFocusChanged.addListener(()=>void queue(tick));
  chrome.runtime.onStartup.addListener(()=>void queue(tick));
  chrome.permissions.onRemoved.addListener(()=>void queue(tick));
  // Register wake-up listeners synchronously, even before the lazy factory exists.
  function bindNotifications(){
    if(notificationEventsBound||!chrome.notifications)return;notificationEventsBound=true;
    chrome.notifications.onClicked.addListener(id=>{const uid=(id.match(/^tasu-roblox-(\d+)-/)||[])[1];if(uid){chrome.notifications.clear(id);void TasuHubWindows.openActivity(uid).catch(()=>{});}});
    chrome.notifications.onButtonClicked.addListener((id,index)=>{if(/^tasu-roblox-\d+-/.test(id)){getRoblox();notificationButton?.(id,index);}});
  }
  async function clearLegacyNotifications(){
    const marker="tasu:hub:notificationPolicy",data=await chrome.storage.local.get(marker);if(data[marker]===2||typeof chrome.notifications?.getAll!=="function")return;
    const active=await chrome.notifications.getAll();for(const id of Object.keys(active||{}))if(/^tasu-roblox-\d+-/.test(id))await chrome.notifications.clear(id);
    await chrome.storage.local.set({[marker]:2});
  }
  bindNotifications();chrome.permissions.onAdded?.addListener(bindNotifications);
  void clearLegacyNotifications().catch(()=>{});
  async function broadcastFocus(){const windows=await chrome.windows.getAll({populate:true});for(const w of windows)for(const t of w.tabs||[])if(t.active&&/^https?:/.test(t.url||""))chrome.tabs.sendMessage(t.id,{type:"TASU_TAB_ACTIVE",active:!!w.focused}).catch(()=>{});}
  chrome.tabs.onActivated.addListener(()=>void broadcastFocus());chrome.windows.onFocusChanged.addListener(()=>void broadcastFocus());
})();
