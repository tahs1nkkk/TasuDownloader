"use strict";
(() => {
  const $=s=>document.querySelector(s),{modules}=TASU_HUB,params=new URLSearchParams(location.search),expanded=params.has("expanded");
  const pendingActivity=chrome.storage.local.get("tasu:hub:pendingActivity").then(async data=>{const pending=data["tasu:hub:pendingActivity"];if(!params.has("activityUser")&&/^\d+$/.test(String(pending?.userId||""))&&Number(pending.expiresAt)>Date.now()){params.set("route","roblox");params.set("activityUser",String(pending.userId));}if(pending)await chrome.storage.local.remove("tasu:hub:pendingActivity");}).catch(()=>{});
  let route="home",current=null,port=null,timer,navigation=0;
  function bounded(promise,ms=1800){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error("Arka plan yanıt vermedi. Eklentiyi yeniden yükle.")),ms);})]).finally(()=>clearTimeout(timeout));}
  let sourceTab=/^\d+$/.test(params.get("tabId")||"")?Number(params.get("tabId")):null;
  const sourceReady=sourceTab!==null?Promise.resolve():bounded(chrome.tabs.query({active:true,lastFocusedWindow:true})).then(tabs=>{if(/^https?:/.test(tabs[0]?.url||""))sourceTab=tabs[0].id;}).catch(()=>{});
  document.documentElement.classList.toggle("expanded",expanded);
  $("#expand").hidden=expanded;
  $("#version").textContent="v"+TASU_HUB.build;
  $("#extensionId").textContent=chrome.runtime.id;
  function notice(text,level="info"){clearTimeout(timer);const n=$("#notice");n.textContent=text;n.dataset.level=level;n.hidden=false;timer=setTimeout(()=>n.hidden=true,5500);}
  async function request(message){const r=await bounded(chrome.runtime.sendMessage(message));if(!r?.ok)throw new Error(r?.error||"Arka plan yanıt vermedi. Eklentiyi yeniden yükle.");return r;}
  function runtimeFailure(e){$("#runtimeWarning").hidden=false;$("#runtimeStatus").textContent=e.message;}
  async function checkRuntime(){try{const r=await request({type:"TASU_HUB_HEALTH"});if(r.protocol!==TASU_HUB.version||r.build!==TASU_HUB.build)throw new Error("Menü ve arka plan sürümleri farklı. Eklentiyi yeniden yükle.");$("#runtimeWarning").hidden=true;$("#runtimeStatus").textContent="Bağlı · "+r.build;return true;}catch(e){runtimeFailure(e);return false;}}
  function report(){try{port?.postMessage({module:current,visible:!document.hidden&&document.hasFocus()});}catch{}}
  function connect(){if(port)return;try{port=chrome.runtime.connect({name:"tasu-hub-view"});port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;port=null;});report();}catch(e){runtimeFailure(e);}}
  function requestAccess(next,gesture){
    const permission=modules[next]?.permission;
    if(!permission)return Promise.resolve(true);
    // Request synchronously inside the click gesture, before tab/storage awaits.
    return gesture?chrome.permissions.request(permission):chrome.permissions.contains(permission);
  }
  async function navigate(next,gesture=false){
    if(!modules[next]&&!["home","roblox-category","hub-settings"].includes(next))next="home";
    const token=++navigation;
    if(modules[next]){
      if(!await requestAccess(next,gesture))throw new Error("Aracı açmak için kendi düğmesine basıp erişim iznini ver.");
      if(token!==navigation)return;
      // Local screens must open even if an old/broken worker cannot activate them.
      const activation=request({type:"TASU_HUB_ACTIVATE",module:next}).catch(runtimeFailure);
      if(["roblox","music"].includes(next))await activation;
    }
    await sourceReady;if(token!==navigation)return;
    clearTimeout(timer);$("#notice").hidden=true;
    current=modules[next]?next:null;route=next;
    const work=$("#workspace");work.replaceChildren();work.hidden=!current;
    for(const id of ["home","roblox-category","hub-settings"])$("#"+id).hidden=id!==next;
    $("#back").hidden=next==="home";
    $("#routeTitle").textContent=modules[next]?.name||({home:"Araçların","roblox-category":"Roblox","hub-settings":"Merkez ayarları"}[next]);
    if(current){
      const frame=document.createElement("iframe");frame.title=modules[current].name;const frameQuery=new URLSearchParams();if(sourceTab!==null)frameQuery.set("tasuTab",String(sourceTab));if(current==="roblox"&&/^\d+$/.test(params.get("activityUser")||""))frameQuery.set("activityUser",params.get("activityUser"));frame.src=modules[current].page+(frameQuery.size?`?${frameQuery}`:"");
      frame.addEventListener("load",()=>{try{const doc=frame.contentDocument;const style=doc.createElement("link");style.rel="stylesheet";style.href=chrome.runtime.getURL("hub/embedded.css");doc.head.append(style);doc.documentElement.dataset.tasuEmbedded="true";TasuHubAppearance.apply(doc);}catch{}});
      work.append(frame);
    }
    const query=new URLSearchParams({route:next});if(expanded)query.set("expanded","1");if(sourceTab!==null)query.set("tabId",String(sourceTab));if(next==="roblox"&&/^\d+$/.test(params.get("activityUser")||""))query.set("activityUser",params.get("activityUser"));
    history.replaceState(null,"","?"+query);if(!port)connect();else report();
  }
  const go=(next,gesture=false)=>navigate(next,gesture).catch(e=>notice(e.message,"error"));
  document.addEventListener("click",e=>{const t=e.target.closest("[data-open]");if(t)void go(t.dataset.open,true);});
  $("#brand").onclick=()=>go("home");$("#back").onclick=()=>go(["roblox","dada"].includes(route)?"roblox-category":"home");$("#settings").onclick=()=>go("hub-settings");
  $("#refresh").onclick=$("#repairRuntime").onclick=()=>$("#reloadDialog").showModal();
  $("#cancelReload").onclick=()=>$("#reloadDialog").close();
  $("#reloadScreen").onclick=()=>{$("#reloadDialog").close();const frame=$("#workspace iframe");if(frame)frame.contentWindow.location.reload();else void checkRuntime();};
  $("#confirmReload").onclick=()=>chrome.runtime.reload();
  $("#checkRuntime").onclick=()=>void checkRuntime();
  $("#expand").onclick=async()=>{const button=$("#expand");button.disabled=true;try{await sourceReady;await TasuHubWindows.open({route,tabId:sourceTab});window.close();}catch(e){notice(e.message,"error");}finally{button.disabled=false;}};
  $("#importRoblox").onclick=()=>$("#backupFile").click();
  $("#backupFile").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10*1024*1024)throw new Error("Yedek en fazla 10 MB olabilir");const r=await request({type:"TASU_HUB_IMPORT",data:JSON.parse(await f.text())});notice(`${r.accounts} hesap aktarıldı. Eski eklentiyi kapatmayı unutma.`,"success");}catch(err){notice(err.message,"error");}finally{e.target.value="";}};
  document.addEventListener("visibilitychange",report);window.addEventListener("focus",()=>{if(!port)connect();else report();});window.addEventListener("blur",()=>setTimeout(report,0));window.addEventListener("pagehide",()=>port?.disconnect());
  document.addEventListener("hub:notice",e=>notice(e.detail.text,e.detail.level));
  void TasuHubAppearance.init().catch(()=>notice("Görünüm ayarları okunamadı","error"));
  void TasuHubPreferences.init().catch(()=>notice("Ayarlar okunamadı","error"));
  void pendingActivity.then(()=>go(params.get("route")||"home"));
  void checkRuntime();
})();
