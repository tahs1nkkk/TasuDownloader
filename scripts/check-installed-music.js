"use strict";
// Tests the installed, origin-checked Native Messaging broker without account access.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),native=path.join(root,"native-music"),id="ppfdkoijifcinfpdlpepddlgjbajhdeg",origin=`chrome-extension://${id}/`;
const manifest=JSON.parse(fs.readFileSync(path.join(native,"com.tasuapps.music.json"),"utf8"));
assert.deepEqual(manifest.allowed_origins,[origin]);
const launcher=fs.readFileSync(manifest.path,"utf8").match(/^"([^"]+)" "([^"]+)" %\*/m);
assert.ok(launcher,"Installed launcher has expected fixed command");
function call(method,params={}){
  const body=Buffer.from(JSON.stringify({version:1,method,id:require("node:crypto").randomUUID(),params}));
  const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
  const result=spawnSync(launcher[1],[launcher[2],origin],{input:Buffer.concat([header,body]),timeout:30000,windowsHide:true,maxBuffer:1024*1024});
  assert.equal(result.status,0,"Broker exited normally");assert.ok(result.stdout.length>=4);
  const frames=[];for(let offset=0;offset+4<=result.stdout.length;){const length=result.stdout.readUInt32LE(offset);offset+=4;assert.ok(offset+length<=result.stdout.length,"Complete native frame");frames.push(JSON.parse(result.stdout.subarray(offset,offset+length).toString()));offset+=length;}return frames;
}
const statusFrames=call("status",{_progress:true}),status=statusFrames.at(-1);assert.equal(status.ok,true,status.error);assert.equal(status.version,1);assert.ok(statusFrames.slice(0,-1).some(frame=>frame.progress?.percent>0),"Cold/warm startup emits progress");
console.log("Installed native broker:",JSON.stringify({ready:status.ok,ffmpeg:status.data.ffmpeg_ok,spotifyConfigured:status.data.spotify_configured}));
assert.equal(call("release").at(-1).ok,true);
console.log("Status/release passed. No account login, cookies, library request or download performed.");
