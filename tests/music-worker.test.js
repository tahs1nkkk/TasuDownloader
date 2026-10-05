"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
function fixture(send){const runtime={};if(send)runtime.sendNativeMessage=(host,payload,reply)=>send(runtime,host,payload,reply);const context=vm.createContext({chrome:{runtime},crypto:{randomUUID:()=>"fixture-id"},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,"../edge-extension/hub/music-worker.js"),"utf8"),context);return context.TASU_MUSIC;}
test("music reports a missing permission instead of throwing during first activation",async()=>{
  assert.equal((await fixture().call({method:"status"})).code,"MUSIC_PERMISSION");
});
test("music distinguishes host registration, origin, startup and transport failures without raw errors",async()=>{
  for(const [message,code]of [["Specified native messaging host not found.","MUSIC_HOST_MISSING"],["Access to the specified native messaging host is forbidden.","MUSIC_HOST_FORBIDDEN"],["Failed to start native messaging host.","MUSIC_HOST_START"],["Native host has exited.","MUSIC_HOST_CLOSED"],["secret-token http://private.example","MUSIC_CONNECTION"]]){
    const music=fixture((runtime,_host,_payload,reply)=>{runtime.lastError={message};reply();});
    const result=await music.call({method:"status"});assert.equal(result.code,code);assert.equal(result.ok,false);assert.ok(!result.error.includes("secret-token"));
  }
});
test("music forwards only allowed operations with a versioned request and stable download identity",async()=>{
  const requests=[],music=fixture((_runtime,host,payload,reply)=>{requests.push({host,payload});reply({version:1,ok:true,data:{ready:true}});});
  assert.equal((await music.call({method:"status"})).ok,true);assert.equal(requests[0].host,"com.tasuapps.music");assert.equal(requests[0].payload.version,1);
  await music.call({method:"download",id:"same-request",params:{fmt:"mp4",video_quality:"720"}});
  assert.equal(requests[1].payload.id,"same-request");assert.equal(requests[1].payload.params.video_quality,"720");
  assert.equal((await music.call({method:"exec"})).code,"MUSIC_METHOD");assert.equal(requests.length,2);
});
test("music closes the timer when the browser throws synchronously",async()=>{
  const music=fixture(()=>{throw Error("Failed to start native messaging host.");});
  assert.equal((await music.call({method:"status"})).code,"MUSIC_HOST_START");
});
test("music accepts staged startup progress before the final native response",async()=>{
  const progress=[],runtime={sendNativeMessage(){},sendMessage:async message=>progress.push(message),connectNative(){const messages=[],disconnects=[];return {onMessage:{addListener(fn){messages.push(fn);}},onDisconnect:{addListener(fn){disconnects.push(fn);}},postMessage(request){queueMicrotask(()=>{messages.forEach(fn=>fn({version:1,ok:true,progress:{percent:24,stage:"starting"}}));messages.forEach(fn=>fn({version:1,ok:true,data:{ffmpeg_ok:true}}));});},disconnect(){}};}};
  const context=vm.createContext({chrome:{runtime},crypto:{randomUUID:()=>"fixture-id"},setTimeout,clearTimeout,queueMicrotask});vm.runInContext(fs.readFileSync(path.join(__dirname,"../edge-extension/hub/music-worker.js"),"utf8"),context);
  const result=await context.TASU_MUSIC.call({method:"status"});assert.equal(result.ok,true);assert.equal(progress[0].type,"TASU_MUSIC_PROGRESS");assert.equal(progress[0].progress.percent,24);
});
