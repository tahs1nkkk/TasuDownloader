/* Same-origin lock shared by popup, detached views and the service worker. */
globalThis.TasuHubWindows=(()=>{
  let pending=Promise.resolve();
  async function create({route="home",tabId}={}){
    const prefix=chrome.runtime.getURL("hub.html");
    const windows=await chrome.windows.getAll({populate:true});
    const existing=windows.some(w=>(w.tabs||[]).some(t=>{try{const u=new URL(t.url);return t.url.startsWith(prefix+"?")&&u.searchParams.has("expanded");}catch{return false;}}));
    if(existing)throw new Error("Önce harici pencereyi kapat.");
    const next=TASU_HUB.modules[route]||["home","roblox-category","hub-settings"].includes(route)?route:"home";
    const params=new URLSearchParams({expanded:"1",route:next});
    if(Number.isInteger(tabId)&&tabId>=0)params.set("tabId",String(tabId));
    return chrome.windows.create({url:prefix+"?"+params,type:"popup",width:1040,height:780});
  }
  function open(options){
    if(globalThis.navigator?.locks)return navigator.locks.request("tasu-hub-detached-window",()=>create(options));
    // Older hosts still serialize requests made in the worker.
    const action=pending.catch(()=>{}).then(()=>create(options));pending=action;return action;
  }
  async function openActivity(userId){
    const uid=String(userId||"");
    if(!/^\d+$/.test(uid))throw new Error("Geçersiz Roblox kullanıcısı");
    const prefix=chrome.runtime.getURL("hub.html"),windows=await chrome.windows.getAll({populate:true});
    for(const win of windows)for(const tab of win.tabs||[]){
      try{
        const url=new URL(tab.url);if(!tab.url.startsWith(prefix)||url.searchParams.get("activityUser")!==uid)continue;
        await chrome.windows.update(win.id,{focused:true});await chrome.tabs.update(tab.id,{active:true});return win;
      }catch{}
    }
    await chrome.storage.local.set({"tasu:hub:pendingActivity":{userId:uid,expiresAt:Date.now()+30000}});
    const params=new URLSearchParams({route:"roblox",activityUser:uid,notification:"1"});
    const normal=windows.find(win=>win.type==="normal");
    if(!normal)return chrome.windows.create({url:prefix+"?"+params,type:"normal",focused:true});
    if(typeof chrome.action?.openPopup==="function"){
      try{await chrome.windows.update(normal.id,{focused:true});await chrome.action.openPopup({windowId:normal.id});return normal;}catch{}
    }
    const width=440,height=700,left=Math.max(0,(normal.left||0)+(normal.width||width)-width-18),top=Math.max(0,(normal.top||0)+70);
    return chrome.windows.create({url:prefix+"?"+params,type:"popup",width,height,left,top,focused:true});
  }
  return {open,openActivity};
})();
