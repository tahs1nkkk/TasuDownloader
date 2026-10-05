"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const folder=path.join(__dirname,"../edge-extension/hub");
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},emit(...args){for(const fn of this.listeners)fn(...args);}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
function fixture(saved={}){
  const data={tasuAppsHub:{enabled:{downloader:true,dada:true,roblox:true,music:false},tracking:false},...saved};let now=1000000,calls=0,windows=[];const alarms=new Map();
  const chrome={runtime:{id:"fixture",getURL:p=>"chrome-extension://fixture/"+p,onConnect:event(),onMessage:event(),onStartup:event()},storage:{local:{get:async()=>structuredClone(data),set:async d=>Object.assign(data,structuredClone(d))}},permissions:{contains:async()=>true,onRemoved:event()},tabs:{onActivated:event(),onRemoved:event(),onUpdated:event(),sendMessage:async()=>{},update:async()=>{}},windows:{getAll:async()=>windows,onFocusChanged:event(),update:async()=>{}},alarms:{onAlarm:event(),create:async(k,v)=>alarms.set(k,v),clear:async k=>alarms.delete(k)},notifications:{onClicked:event(),onButtonClicked:event(),clear:async()=>{}}};
  const context=vm.createContext({chrome,URL,URLSearchParams,Date:{now:()=>now},setTimeout,clearTimeout,console,TasuRobloxWorkerFactory:()=>({pollAuto:async()=>calls++,pollPinned:async()=>calls++,pollPresence:async()=>calls++})});
  for(const file of ["catalog.js","store.js","windows.js","worker.js"])vm.runInContext(fs.readFileSync(path.join(folder,file),"utf8"),context);
  function port(module){const p={name:"tasu-hub-view",sender:{id:"fixture",url:"chrome-extension://fixture/hub.html"},onMessage:event(),onDisconnect:event()};chrome.runtime.onConnect.emit(p);p.onMessage.emit({module,visible:true});return p;}
  chrome.windows.create=async options=>{const w={id:windows.length+1,tabs:[{url:options.url}]};windows.push(w);return w;};
  const message=msg=>new Promise(resolve=>chrome.runtime.onMessage.emit(msg,{id:"fixture",url:"chrome-extension://fixture/hub.html"},resolve));
  return {data,chrome,alarms,port,message,step(ms){now+=ms;chrome.alarms.onAlarm.emit({name:"tasu:hub:tick"});},setWindows(w){windows=w;},get windows(){return windows;},get calls(){return calls;}};
}
test("first-click activations share one initialization and preserve both module choices",async()=>{
  const f=fixture({tasuAppsHub:{enabled:{downloader:true,dada:true,roblox:false,music:false},tracking:false}});
  const get=f.chrome.storage.local.get;let reads=0;
  f.chrome.storage.local.get=async(...args)=>{reads++;await new Promise(r=>setTimeout(r,30));return get(...args);};
  const results=await Promise.all(["roblox","music"].map(module=>f.message({type:"TASU_HUB_ACTIVATE",module})));
  assert.ok(results.every(r=>r.ok));assert.equal(reads,1);assert.equal(f.data.tasuAppsHub.enabled.roblox,true);assert.equal(f.data.tasuAppsHub.enabled.music,true);
});
test("expansion is serialized, blocks duplicates and survives coordinator restart",async()=>{
  const f=fixture();const results=await Promise.all([1,2,3].map(()=>f.message({type:"TASU_HUB_EXPAND",route:"music",tabId:12})));
  assert.equal(results.filter(r=>r.ok).length,1);assert.ok(results.filter(r=>!r.ok).every(r=>r.error.includes("harici pencereyi kapat")));
  f.setWindows([]);assert.equal((await f.message({type:"TASU_HUB_EXPAND",route:"dada"})).ok,true);
  const restarted=fixture();restarted.setWindows([{tabs:[{url:"chrome-extension://fixture/hub.html?route=music&expanded=1"}]}]);
  assert.equal((await restarted.message({type:"TASU_HUB_EXPAND",route:"home"})).ok,false);
  restarted.setWindows([{tabs:[{url:"chrome-extension://another/hub.html?expanded=1"}]}]);
  assert.equal((await restarted.message({type:"TASU_HUB_EXPAND",route:"home"})).ok,true);
});
test("clicking a watched-user notification opens that user's Friend Tracker activity",async()=>{
  const f=fixture();f.chrome.notifications.onClicked.emit("tasu-roblox-42-1000");await settle();assert.equal(f.windows.length,1);assert.match(f.windows[0].tabs[0].url,/route=roblox/);assert.match(f.windows[0].tabs[0].url,/activityUser=42/);
});
test("Friend Tracker needs site access, not notification permission",async()=>{
  const f=fixture();f.chrome.permissions.contains=async p=>!p.permissions?.includes("notifications");
  assert.equal((await f.message({type:"TASU_HUB_ACTIVATE",module:"roblox"})).ok,true);
  f.chrome.permissions.contains=async()=>false;
  assert.equal((await f.message({type:"TASU_HUB_ACTIVATE",module:"music"})).ok,false);
  assert.equal(f.data.tasuAppsHub.enabled.music,false);assert.equal(f.data.tasuAppsHub.enabled.downloader,true);
});
test("personal Friend Tracker keeps background polling after its module is activated",async()=>{
  const disabled=fixture({tasuAppsHub:{enabled:{downloader:true,dada:true,roblox:false,music:false},tracking:false}});disabled.chrome.runtime.onStartup.emit();await settle();assert.equal(disabled.calls,0);assert.equal(disabled.alarms.size,0);
  const f=fixture();f.chrome.runtime.onStartup.emit();await settle();assert.equal(f.calls,2);assert.equal(f.data.tasuAppsHub.tracking,true);assert.ok(f.alarms.size);
  const dada=f.port("dada");await settle();assert.equal(f.calls,2);dada.onDisconnect.emit();
  const view=f.port("roblox");await settle();view.onDisconnect.emit();const before=f.calls;f.step(301000);await settle();assert.ok(f.calls>before);assert.ok(f.alarms.size,"background schedule remains active");
});
test("worker restart reconciles a visible hub route without a surviving port",async()=>{
  const f=fixture();f.setWindows([{focused:true,tabs:[{id:1,active:true,url:"chrome-extension://fixture/hub.html?expanded=1&route=roblox"}]}]);f.chrome.runtime.onStartup.emit();await settle();assert.equal(f.calls,2);assert.ok(f.alarms.size);assert.equal(f.data["tasu:hub:clock"].lastRoblox,1000000);
});
test("Dada stays offline when Roblox is disabled; enabled Roblox tracking is always on",async()=>{
  const f=fixture({tasuAppsHub:{enabled:{downloader:true,dada:true,roblox:false,music:false},tracking:false}});f.setWindows([{focused:true,tabs:[{active:true,url:"chrome-extension://fixture/hub.html?route=dada"}]}]);f.chrome.runtime.onStartup.emit();await settle();assert.equal(f.calls,0);
  const tracking=fixture({tasuAppsHub:{enabled:{roblox:true},tracking:false}});tracking.chrome.runtime.onStartup.emit();await settle();assert.equal(tracking.calls,2);assert.equal(tracking.data.tasuAppsHub.tracking,true);
});
test("Roblox fetch honors Retry-After even if a legacy function swallows the error",async()=>{
  let requests=0,now=1000;const context=vm.createContext({Date:{now:()=>now,parse:Date.parse},AbortSignal});vm.runInContext(fs.readFileSync(path.join(folder,"roblox/network.js"),"utf8"),context);
  const network=context.TasuRobloxNetwork(async()=>{requests++;return {status:429,headers:{get:()=>"120"}};});
  await assert.rejects(network.run(async()=>{try{await network.fetch("https://users.roblox.com/");}catch{}}),e=>e.retryAfterMs===120000);
  await assert.rejects(network.fetch("https://users.roblox.com/"));assert.equal(requests,1);now+=120001;await assert.rejects(network.fetch("https://users.roblox.com/"));assert.equal(requests,2);
});
