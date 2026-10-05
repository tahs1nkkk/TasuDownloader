"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {scopedStorage,importBackup,cleanBackup}=require("../edge-extension/hub/store.js");
function memory(initial={}){const data=structuredClone(initial);return {data,get:async()=>structuredClone(data),set:async entries=>Object.assign(data,structuredClone(entries)),remove:async keys=>keys.forEach(k=>delete data[k])};}
test("backup preserves selected custom-game watches without allowing untrusted fields",()=>{
  const data=cleanBackup({settings:{desktopNotifications:false,watches:{"42":{online:true,ingame:false,game:{placeId:123,name:"Fixture game",secret:"discard"}}}}});
  assert.equal(data.settings.desktopNotifications,false);
  assert.deepEqual(data.settings.watches["42"],{online:true,ingame:false,game:{placeId:123,name:"Fixture game"}});
});
test("backup rejects nested HTML/URL injection and unrecognized data",()=>{
  const clean=cleanBackup({settings:{accounts:[{id:'1" onclick="x',name:"bad"}],watches:{evil:{online:true}},games:[{placeId:1,name:"ok",icon:'https://evil.test/" onclick="x',privateServer:"javascript:alert(1)"}]},"acct:12":{userId:12,friends:{'1" onload="x':{name:"bad"},"2":{name:"Good",secret:"never"}},events:[{id:"bad",userId:'1"',type:"added"}]}});
  assert.deepEqual(clean.settings.accounts,[]);assert.deepEqual(clean.settings.watches,{});assert.equal(clean.settings.games[0].icon,undefined);assert.equal(clean.settings.games[0].privateServer,undefined);assert.deepEqual(Object.keys(clean["acct:12"].friends),["2"]);assert.equal(clean["acct:12"].friends["2"].secret,undefined);assert.equal(clean["acct:12"].events.length,0);
});
test("Roblox scoped settings/reset cannot overwrite Downloader settings",async()=>{const raw=memory({tasuDownloaderSettings:{cloudBase:"https://archive.test"}}),store=scopedStorage(raw);await store.set({settings:{lang:"tr"},"acct:1":{userId:1}});assert.equal((await store.get("settings")).settings.lang,"tr");assert.equal((await store.get(null)).tasuDownloaderSettings,undefined);await assert.rejects(store.set({tasuDownloaderSettings:{}}));await store.remove(["settings","tasuDownloaderSettings"]);assert.equal(raw.data.tasuDownloaderSettings.cloudBase,"https://archive.test");});
test("backup import is repeatable, backs up target, rejects authority and filters keys",async()=>{const raw=memory({tasuDownloaderSettings:{x:1}});const backup={settings:{lang:"tr",theme:"dark",cloudToken:"never"},authId:999,"acct:12":{userId:12,friends:{},events:[{id:"e1",userId:2,type:"added"},{id:"e1",userId:2,type:"added"}]},reviewGeneratorState:{style:"freaky",ratings:{avatar:5}},tasuDownloaderSettings:{x:2}};await importBackup(raw,backup);await importBackup(raw,backup);const s=await scopedStorage(raw).get(null);assert.equal(s["acct:12"].events.length,1);assert.equal(s.authId,undefined);assert.deepEqual(s.settings,{lang:"tr"});assert.equal(raw.data.tasuDownloaderSettings.x,1);assert.equal(raw.data["tasuApps:dada"].style,"freaky");assert.equal(raw.data["tasuApps:dada"].gender,"female");assert.ok(raw.data["tasuApps:roblox:importBackup"]);assert.equal(raw.data["tasuApps:roblox:importBackup"].data.importBackup,undefined);assert.throws(()=>cleanBackup({"acct:7":{userId:8,friends:{}}}));});
test("content lifecycle removes timers/listeners/observers and resumes exactly once",()=>{
  let serial=0,intervalCalls=0,events=0,observations=0;const timers=new Map(),frames=new Map();
  const target=new EventTarget();target.hidden=false;target.hasFocus=()=>true;target.documentElement={dataset:{}};
  class Observer{observe(){observations++;}disconnect(){observations--;}}
  const context={document:target,removeEventListener(){},MutationObserver:Observer,setInterval(fn){const id=++serial;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);},setTimeout,clearTimeout,requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../shared/core/lifecycle.js"),"utf8"),context);
  const scope=context.RG_LIFECYCLE.create("fixture");scope.listen(target,"sample",()=>events++);scope.setInterval(()=>intervalCalls++,100);const o=new scope.MutationObserver(()=>{});o.observe({isConnected:true},{});
  target.dispatchEvent(new Event("sample"));assert.equal(events,1);scope.suspend();assert.equal(timers.size,0);assert.equal(observations,0);target.dispatchEvent(new Event("sample"));assert.equal(events,1);scope.activate();scope.activate();assert.equal(timers.size,1);assert.equal(observations,1);for(const fn of timers.values())fn();assert.equal(intervalCalls,1);target.dispatchEvent(new Event("sample"));assert.equal(events,2);scope.dispose();assert.equal(timers.size,0);
});
test("generated Friend Tracker keeps desktop notifications user-scoped and avoids an opening refresh",()=>{
  const popup=fs.readFileSync(path.join(__dirname,"../edge-extension/hub/roblox/popup.js"),"utf8"),worker=fs.readFileSync(path.join(__dirname,"../edge-extension/hub/roblox/worker.js"),"utf8");
  assert.doesNotMatch(worker,/notifAddedTitle|notifRemovedTitle/);assert.match(worker,/desktopNotifications===false/);assert.match(popup,/if\(!event\?\.name\)continue/);assert.doesNotMatch(popup,/await loadAll\(\);\s*void refreshTracker\(\);\s*\}\)\(\)/);
});
