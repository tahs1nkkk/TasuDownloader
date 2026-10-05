"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
function fixture({permission=true,error=null}={}){
  const calls=[],ports=[],timers=new Set();
  const runtime={sendNativeMessage(host,request,reply){calls.push({host,request});runtime.lastError=error?{message:error}:undefined;reply(error?undefined:{version:1,ok:true,data:{ffmpeg_ok:true,download_dir:"C:/private",token:"secret"}});runtime.lastError=undefined;},connectNative(host){
    let message,disconnect;
    const port={closed:false,onMessage:{addListener(fn){message=fn;}},onDisconnect:{addListener(fn){disconnect=fn;}},disconnect(){port.closed=true;disconnect?.();},postMessage(request){calls.push({host,request});runtime.lastError=error?{message:error}:undefined;if(error)disconnect();else message({version:1,ok:true,data:{ffmpeg_ok:true,download_dir:"C:/private",token:"secret"}});runtime.lastError=undefined;}};
    ports.push(port);return port;
  }};
  const context=vm.createContext({chrome:{runtime,permissions:{contains:async()=>permission}},crypto:{randomUUID:()=>"fixture"},Date,setTimeout(fn,ms){const timer=setTimeout(fn,ms);timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);clearTimeout(timer);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../edge-extension/hub/music-diagnostics.js"),"utf8"),context);
  return {run:context.TasuMusicDiagnostics.run,calls,ports,timers};
}
test("connection report sends only status, removes private fields and closes native ports",async()=>{
  const f=fixture(),report=await f.run();assert.equal(report.send.ok,true);assert.equal(report.connect.ok,true);
  assert.ok(f.calls.every(c=>c.host==="com.tasuapps.music"&&c.request.method==="status"));assert.equal(f.calls.length,2);
  assert.ok(!JSON.stringify(report).includes("private"));assert.ok(!JSON.stringify(report).includes("secret"));assert.ok(f.ports.every(p=>p.closed));assert.equal(f.timers.size,0);
});
test("diagnostics retain exact known browser errors but omit arbitrary error contents",async()=>{
  for(const error of ["Specified native messaging host not found.","secret at C:/private"]){
    const f=fixture({error}),report=await f.run();assert.equal(report.send.ok,false);assert.equal(report.connect.ok,false);assert.equal(f.timers.size,0);
    if(error.startsWith("Specified"))assert.equal(report.send.error,error);else assert.ok(!JSON.stringify(report).includes("secret"));
  }
});
test("diagnostics do not launch a native host without permission",async()=>{
  const f=fixture({permission:false}),report=await f.run();assert.equal(report.permission,false);assert.equal(f.calls.length,0);
});
