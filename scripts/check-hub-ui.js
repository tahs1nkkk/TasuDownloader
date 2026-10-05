"use strict";
const {chromium}=require("playwright"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
(async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"tasu-hub-ui-")),requests=[],errors=[];let context;
  try{
    const ext=path.join(root,"edge-extension");context=await chromium.launchPersistentContext(path.join(scratch,"profile"),{channel:process.env.TASU_TEST_BROWSER||"chromium",headless:true,viewport:{width:440,height:600},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
    await context.route("**/*",route=>{if(route.request().url().startsWith("chrome-extension:"))return route.continue();requests.push(route.request().url());return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[],userPresences:[]})});});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker");const origin=`chrome-extension://${new URL(worker.url()).hostname}`;
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    const preview=path.join(root,"dist/hub-preview");fs.mkdirSync(preview,{recursive:true});
    await page.goto(origin+"/hub.html");await page.locator("[data-open=dada]").waitFor({state:"attached"});
    await page.emulateMedia({colorScheme:"dark"});
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).color),"rgb(32, 50, 75)");
    assert.match(await page.locator("body").evaluate(el=>getComputedStyle(el).backgroundImage),/glass-surface-v2/);
    await page.locator(".banner-canvas").first().waitFor();await page.waitForTimeout(200);await page.screenshot({path:path.join(preview,"home-rest.png")});
    for(const selector of ["#refresh","#settings","#expand"]){const centered=await page.locator(selector).evaluate(button=>{const b=button.getBoundingClientRect(),s=button.querySelector("svg").getBoundingClientRect();return Math.abs(b.x+b.width/2-s.x-s.width/2)<1&&Math.abs(b.y+b.height/2-s.y-s.height/2)<1;});assert.equal(centered,true,selector+" is centered");}
    assert.equal(await page.locator("iframe").count(),0);assert.equal(requests.length,0);
    await page.locator('[data-open="roblox-category"]').click();await page.locator('[data-open="dada"]').click();
    const dada=page.frameLocator("#workspace iframe");await dada.locator("#generateBtn").click();assert.ok((await dada.locator("#outputText").inputValue()).length>50);assert.equal(await dada.locator(".ratingRow").count(),3);assert.equal(requests.length,0,"Dada must not start Roblox or music");
    assert.equal(await dada.locator("body").evaluate(el=>el.scrollWidth<=innerWidth),true,"Dada must fit horizontally");
    assert.equal(await dada.locator("#langBtn").isVisible(),false);
    await dada.locator("#decalBtn").click();assert.match(await dada.locator("#decalBtn").getAttribute("data-last-copy"),/^\d+$/);
    await page.screenshot({path:path.join(preview,"dada.png")});
    await page.locator("#brand").click();assert.equal(await page.locator("iframe").count(),0);
    await page.locator('[data-open="downloader"]').click();await page.frameLocator("#workspace iframe").locator("#siteGrid button").first().waitFor();
    await page.locator("#brand").click();await page.locator("#settings").click();
    await page.locator('[data-global-setting="buttonVisibility"]').selectOption("always");
    await page.waitForFunction(()=>document.getElementById("notice").textContent==="Ayar kaydedildi");
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get("tasuDownloaderSettings"))).tasuDownloaderSettings.buttonVisibility,"always");
    await page.locator("#hubFolderNew").fill("Fixture folder");await page.locator("#hubFolderAdd").click();await page.locator('#hubFolders input').waitFor();
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get("tasuDownloaderSettings"))).tasuDownloaderSettings.mediaFolders[0],"Fixture folder");
    assert.equal(await page.locator("[data-global-setting]").count(),7);
    assert.equal(await page.locator(".banner-canvas").first().evaluate(el=>getComputedStyle(el).filter),"blur(1.75px)");
    assert.equal(await page.locator(".banner-half").first().evaluate(el=>getComputedStyle(el).transitionDuration),"0.9s");
    assert.equal(await page.locator("#hubBlur, #hubSpeed").count(),0);
    await worker.evaluate(()=>chrome.storage.local.set({tasuPopupPreferences:{glassEnabled:true,reduceMotion:false,bannerBlur:2.5,bannerDuration:1200}}));
    await page.waitForFunction(()=>getComputedStyle(document.querySelector(".banner-canvas")).filter==="blur(2.5px)");
    await page.evaluate(()=>TasuHubAppearance.reset());
    assert.equal(await page.locator(".banner-half").first().evaluate(el=>getComputedStyle(el).transitionDuration),"1.2s","Reset preserves the user's personal banner defaults");
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get("tasuPopupPreferences"))).tasuPopupPreferences.bannerBlur,2.5);
    await page.screenshot({path:path.join(preview,"settings.png")});
    await page.locator("#backupFile").setInputFiles({name:"fixture.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({settings:{lang:"tr"},"acct:42":{userId:42,friends:{},events:[]}}))});
    await page.waitForFunction(()=>document.getElementById("notice").textContent.includes("1 hesap"));
    const stored=await worker.evaluate(()=>chrome.storage.local.get(null));assert.ok(stored["tasuApps:roblox:acct:42"]);
    // Real extension view + synthetic permission/network adapters. No live account.
    await worker.evaluate(async()=>{chrome.permissions.contains=async()=>true;chrome.notifications={onClicked:{addListener(){}},onButtonClicked:{addListener(){}},create:async()=>{},clear:async()=>{}};await chrome.storage.local.set({"tasuApps:roblox:authId":42,"tasuApps:roblox:acct:42":{userId:42,userName:"Fixture",friends:{"56":{name:"FixtureFriend",displayName:"Fixture Friend"}},events:[],status:"ok"}});globalThis.fetch=async url=>{if(String(url).includes("thumbnails"))await new Promise(r=>setTimeout(r,1500));return {ok:true,status:200,headers:{get:()=>null},json:async()=>({id:42,name:"Fixture",displayName:"Fixture",data:String(url).includes("/friends")?[{id:56,name:"FixtureFriend",displayName:"Fixture Friend"}]:[],userPresences:[]})};};});
    await page.evaluate(()=>{chrome.permissions.contains=async()=>true;chrome.permissions.request=async()=>true;});
    await page.locator("#brand").click();await page.locator('[data-open="roblox-category"]').click();await page.locator('[data-open="roblox"]').click();
    await page.frameLocator("#workspace iframe").locator("#friendsList .item").filter({hasText:"Fixture Friend"}).waitFor({timeout:1200});
    const tracker=page.frameLocator("#workspace iframe");
    assert.equal(await page.frameLocator("#workspace iframe").locator("#pinBtn").isVisible(),false);
    assert.equal(await page.frameLocator("#workspace iframe").locator("#navGames svg").getAttribute("viewBox"),"0 0 24 24");
    await tracker.locator(".chip-add").click();await tracker.locator(".modal-input").waitFor();assert.ok((await tracker.locator(".modal-input").boundingBox()).width>250,"Account prompt input must fill the modal");await tracker.locator(".modal-cancel").click();
    await tracker.locator(".watch-btn").first().click();const watchBox=await tracker.locator(".watch-menu").boundingBox();assert.ok(watchBox.x>=0&&watchBox.y>=0&&watchBox.x+watchBox.width<=440&&watchBox.y+watchBox.height<=600,"Watch menu must stay inside the popup");assert.equal(await tracker.locator('.wm-opt[data-k="ingame"] svg').getAttribute("fill"),"none");
    await tracker.locator(".brand-title").click();
    await worker.evaluate(async()=>{const key="tasuApps:roblox:acct:42",data=(await chrome.storage.local.get(key))[key];data.events=[{id:"fixture-unread",type:"added",userId:"56",name:"FixtureFriend",displayName:"Fixture Friend",ts:Date.now(),unread:true}];await chrome.storage.local.set({[key]:data});await chrome.action.setBadgeText({text:"1"});});
    await tracker.locator('.tab[data-tab="alerts"]').click();await page.waitForTimeout(100);
    const unread=await worker.evaluate(async()=>{const data=await chrome.storage.local.get("tasuApps:roblox:acct:42");return data["tasuApps:roblox:acct:42"].events[0].unread;});assert.equal(unread,false);assert.equal(await worker.evaluate(()=>chrome.action.getBadgeText({})),"");
    await page.waitForTimeout(400);await page.screenshot({path:path.join(preview,"tracker.png"),animations:"disabled"});
    assert.equal(await page.frameLocator("#workspace iframe").locator("#friendsList .item").filter({hasText:"Fixture Friend"}).count(),1,"live refresh must retain the friend row");
    await page.locator("#brand").click();await page.locator('[data-open="music"]').click();await page.frameLocator("#workspace iframe").locator("#status").waitFor();
    await page.waitForTimeout(500);
    assert.match(await page.frameLocator("#workspace iframe").locator("#status").textContent(),/yardımcısı|motor|Motor/);
    const diagnosticsFrame=page.frames().find(f=>f.url().includes("hub/music.html"));
    await page.frameLocator("#workspace iframe").locator("#diagnoseConnection").click();
    await page.frameLocator("#workspace iframe").locator("#connectionSummary").filter({hasText:"Raporu paylaş"}).waitFor();
    const diagnosticReport=JSON.parse(await page.frameLocator("#workspace iframe").locator("#connectionReport").inputValue());
    assert.equal(diagnosticReport.extensionId,new URL(worker.url()).hostname);assert.equal(diagnosticReport.worker.build,require("../shared/core/version.js").platforms.edge);
    assert.equal(diagnosticReport.page.permission,false);assert.ok(!JSON.stringify(diagnosticReport).includes("download_dir"));
    await diagnosticsFrame.evaluate(()=>{navigator.clipboard.writeText=async text=>{globalThis.copiedConnectionReport=text;};});
    await page.frameLocator("#workspace iframe").locator("#copyConnectionReport").click();
    assert.equal(await diagnosticsFrame.evaluate(()=>JSON.parse(globalThis.copiedConnectionReport).schemaVersion),1);
    // Exercise the music view with an in-memory protocol fixture, never the real helper.
    await worker.evaluate(()=>{
      globalThis.fixtureMusic={downloads:[],jobs:[]};
      const respond=(request,reply)=>{
        const track={title:"Fixture song",artist:"Fixture artist",source:"spotify",cover_url:"https://i.scdn.co/image/fixture",search_query:"Fixture artist - Fixture song"};
        let data={};
        if(request.method==="status")data={download_dir:"C:/Synthetic/Music",spotify_configured:true,ffmpeg_ok:true};
        if(["preview","liked","search"].includes(request.method))data={meta:{name:"Fixture list"},tracks:[track]};
        if(request.method==="library")data=[{id:"abc123",name:"Fixture playlist"}];
        if(request.method==="download"){globalThis.fixtureMusic.downloads.push(request);data={id:"fixture-job"};globalThis.fixtureMusic.jobs=[{...data,status:"error",total:1,completed:0,errors:1,error_message:"Diskte boş alan yok. Yer açıp yeniden dene."}];}
        if(request.method==="jobs"){if(globalThis.fixtureMusic.failJobs){reply({version:1,ok:false,error:"Fixture journal unavailable"});return;}data=globalThis.fixtureMusic.jobs;}
        reply({version:1,ok:true,data});
      };
      chrome.runtime.sendNativeMessage=(_host,request,reply)=>respond(request,reply);
      chrome.runtime.connectNative=()=>{const messages=[],disconnects=[];return {onMessage:{addListener(fn){messages.push(fn);}},onDisconnect:{addListener(fn){disconnects.push(fn);}},postMessage(request){queueMicrotask(()=>respond(request,response=>messages.forEach(fn=>fn(response))));},disconnect(){}};};
    });
    const music=page.frameLocator("#workspace iframe");await page.locator("#refresh").click();await page.locator("#reloadScreen").click();await music.locator("#status").filter({hasText:"Motor hazır"}).waitFor();
    assert.equal(await music.locator("body").evaluate(el=>el.scrollWidth<=innerWidth),true,"Music must fit horizontally");
    assert.equal(await music.locator("#preset").isVisible(),true);assert.equal(await music.locator("#video_quality").isVisible(),false);
    await music.locator("#preset").selectOption("en_yuksek");await music.locator("#fmt").selectOption("mp4");
    assert.equal(await music.locator("#preset").isVisible(),false);assert.equal(await music.locator("#video_quality").isVisible(),true);
    await music.locator("#video_quality").selectOption("720");
    await music.locator("#fmt").selectOption("mp3");assert.equal(await music.locator("#preset").inputValue(),"en_yuksek");await music.locator("#fmt").selectOption("mp4");assert.equal(await music.locator("#video_quality").inputValue(),"720");
    await worker.evaluate(()=>{globalThis.fixtureMusic.failJobs=true;});await music.locator("#reconnect").click();
    await music.locator("#notice").filter({hasText:"İndirme listesi alınamadı"}).waitFor();assert.equal(await music.locator("#status").textContent(),"Motor hazır");assert.equal(await music.locator("#helperSetup").isVisible(),false);await worker.evaluate(()=>{globalThis.fixtureMusic.failJobs=false;});
    await music.locator("#query").fill("spotify:playlist:abc123");await music.locator("#preview").click();
    await music.locator("#tracks .track").waitFor();assert.equal(await music.locator("#tracks img").getAttribute("src"),"https://i.scdn.co/image/fixture");
    await page.screenshot({path:path.join(preview,"music.png")});
    await music.locator("#tracks input").uncheck();assert.equal(await music.locator("#download").isDisabled(),true);await music.locator("#tracks input").check();
    await music.locator("#toggleMusicOptions").click();assert.equal(await music.locator(".options-group").count(),6);
    await music.locator("#coverOptions summary").click();await music.locator("#embed_cover").uncheck();await music.locator("#sessionOptions summary").click();await music.locator("#cookies_from_browser").selectOption("edge");
    await page.screenshot({path:path.join(preview,"music-settings.png")});
    await music.locator("#download").click();await music.locator("#jobs .error").waitFor();assert.match(await music.locator("#jobs .error").textContent(),/Diskte boş alan yok/);
    const request=await worker.evaluate(()=>globalThis.fixtureMusic.downloads[0]);assert.equal(request.params.subfolder,"Fixture list");assert.equal(request.params.items[0].source,"spotify");assert.ok(request.id);assert.equal(request.params.video_quality,"720");assert.equal(request.params.embed_cover,false);assert.equal(request.params.cookies_from_browser,"edge");
    assert.equal(request.params.fmt,"mp4");
    await page.locator("#brand").click();await page.locator('[data-open="music"]').click();await page.frameLocator("#workspace iframe").locator("#jobs .error").waitFor();
    assert.equal(await page.frameLocator("#workspace iframe").locator("#cookies_from_browser").inputValue(),"");assert.equal(await page.frameLocator("#workspace iframe").locator("#video_quality").inputValue(),"720");
    await page.frameLocator("#workspace iframe").locator("#toggleAccount").click();await page.frameLocator("#workspace iframe").locator("#library").click();await page.frameLocator("#workspace iframe").locator("#libraryList button").waitFor();
    await page.frameLocator("#workspace iframe").locator("#liked").click();await page.frameLocator("#workspace iframe").locator("#tracks .track").waitFor();
    // Expanded Downloader keeps the original media tab context, not the hub tab.
    const mediaTab=await context.newPage();await mediaTab.goto("https://scrolller.com/");
    const mediaId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url==="https://scrolller.com/").id;});
    await page.goto(origin+`/hub.html?expanded=1&route=downloader&tabId=${mediaId}`);await page.frameLocator("#workspace iframe").locator("#siteGrid button").first().waitFor();
    assert.equal(await page.locator("#expand").isVisible(),false);
    assert.ok((await page.locator("#workspace iframe").getAttribute("src")).includes(`tasuTab=${mediaId}`));
    const child=page.frames().find(f=>f.url().includes("popup.html"));assert.equal((await child.evaluate(()=>activeTab())).id,mediaId);
    await mediaTab.close();await page.goto(origin+"/hub.html");
    // Old/unresponsive worker must not block local navigation or direct expansion.
    await page.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=message=>["TASU_HUB_ACTIVATE","TASU_HUB_HEALTH","TASU_HUB_EXPAND"].includes(message.type)?new Promise(()=>{}):send(message);window.close=()=>{};});
    await page.locator('[data-open="downloader"]').click();await page.frameLocator("#workspace iframe").locator("#siteGrid button").first().waitFor({timeout:1500});
    await page.locator("#brand").click();await page.locator('[data-open="roblox-category"]').click();await page.locator('[data-open="dada"]').click();await page.frameLocator("#workspace iframe").locator("#generateBtn").waitFor({timeout:1500});
    await page.locator("#runtimeWarning").waitFor();await page.locator("#settings").click();await page.locator('[data-global-setting="buttonSize"]').waitFor();
    await page.locator("#brand").click();
    const detachedPromise=context.waitForEvent("page");await page.locator("#expand").click();const detached=await detachedPromise;
    await detached.waitForURL("**/hub.html?expanded=1**");await detached.locator("#home").waitFor();
    assert.equal(await detached.locator("#expand").isVisible(),false);
    await page.locator("#expand").click();await page.waitForFunction(()=>document.getElementById("notice").textContent.includes("harici pencereyi kapat"));
    assert.equal(context.pages().filter(p=>p.url().includes("expanded=1")).length,1);
    await detached.close();
    // Full refresh must actually call runtime.reload, only after confirmation.
    await page.evaluate(()=>{globalThis.reloadCalls=0;chrome.runtime.reload=()=>{globalThis.reloadCalls++;};});
    await page.locator("#refresh").click();assert.equal(await page.evaluate(()=>globalThis.reloadCalls),0);await page.locator("#confirmReload").click();assert.equal(await page.evaluate(()=>globalThis.reloadCalls),1);
    await page.locator("#cancelReload").click();await page.goto(origin+"/hub.html");
    await page.locator("#brand").click();fs.mkdirSync(path.join(root,"dist/hub-preview"),{recursive:true});await page.locator('[data-open="roblox-category"]').hover();await page.screenshot({path:path.join(root,"dist/hub-preview/home.png"),animations:"disabled"});
    assert.deepEqual(errors,[]);console.log("Hub UI passed: lazy screens, offline Dada, Downloader isolation, scoped import, Roblox mount, missing helper, music preview/selection/jobs/library/errors, expanded source tab.");
  }catch(error){console.error("Hub fixture errors:",errors);if(context)for(const p of context.pages())console.error("Fixture state:",await p.evaluate(()=>({url:location.href,notice:document.getElementById("notice")?.textContent,frames:[...document.querySelectorAll("iframe")].map(f=>f.src)})).catch(()=>null));throw error;}
  finally{await context?.close();fs.rmSync(scratch,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
