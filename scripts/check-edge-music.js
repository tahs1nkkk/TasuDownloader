"use strict";
// Isolated Edge + permission-bearing fixture. Never touches the user's profile.
// The diagnostic registration accepts only this temporary fixture, not websites.
const {chromium}=require("playwright"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),scratch=fs.mkdtempSync(path.join(os.tmpdir(),"tasu-native-check-")),ext=path.join(scratch,"extension"),name="com.tasuapps.music_check_"+require("node:crypto").randomUUID().replaceAll("-",""),reg="HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\"+name;
let context,registered=false;
function registry(args){const r=spawnSync("reg.exe",args,{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,"Diagnostic registry operation failed");}
(async()=>{
  try{
    fs.mkdirSync(ext);
    fs.writeFileSync(path.join(ext,"manifest.json"),JSON.stringify({manifest_version:3,name:"Tasu local connection check",version:"1.0",permissions:["nativeMessaging"],background:{service_worker:"worker.js"}}));
    fs.writeFileSync(path.join(ext,"worker.js"),"chrome.runtime.onMessage.addListener(()=>{});");
    context=await chromium.launchPersistentContext(path.join(scratch,"profile"),{channel:"msedge",headless:true,chromiumSandbox:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker"),id=new URL(worker.url()).hostname;
    const installedLookup=await worker.evaluate(()=>new Promise(resolve=>chrome.runtime.sendNativeMessage("com.tasuapps.music",{version:1,id:"lookup-check",method:"status",params:{}},response=>resolve({response,error:chrome.runtime.lastError?.message}))));
    console.log("Installed host lookup:",JSON.stringify(installedLookup));
    assert.match(installedLookup.error||"",/forbidden/i,"The installed registration must be found and reject an unrelated extension ID");
    const installed=JSON.parse(fs.readFileSync(path.join(root,"native-music/com.tasuapps.music.json"),"utf8"));
    // Same installed launch command, but a separate narrowly scoped registry name.
    const manifest=path.join(scratch,"host.json");
    fs.writeFileSync(manifest,JSON.stringify({...installed,name,allowed_origins:[`chrome-extension://${id}/`]}));
    registry(["add",reg,"/ve","/t","REG_SZ","/d",manifest,"/f"]);registered=true;
    const result=await worker.evaluate(name=>new Promise(resolve=>chrome.runtime.sendNativeMessage(name,{version:1,id:"browser-check",method:"status",params:{}},response=>resolve({response,error:chrome.runtime.lastError?.message}))),name);
    console.log("Actual Edge native transport:",JSON.stringify(result));
    assert.equal(result.error,undefined,result.error);
    assert.match(result.response?.error||"",/Bu eklentiye/,"Installed broker must deny the temporary fixture origin");
    console.log("Edge launched the installed broker; origin validation rejected the fixture as intended.");
  }finally{
    await context?.close();
    if(registered)registry(["delete",reg,"/f"]);
    const target=path.resolve(scratch),base=path.resolve(os.tmpdir());
    if(path.dirname(target)!==base||!path.basename(target).startsWith("tasu-native-check-"))throw Error("Unsafe fixture cleanup path");
    fs.rmSync(target,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
