"use strict";
// Personal preview, not a store release or an installation. No secrets swept in.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const {root}=require("./lib/shared-build.js"),{createArchive}=require("./lib/package-archive.js");
const {sourceState}=require("./lib/release-bundle.js"),{versions}=require("./lib/versioning.js");
function run(script,...args){const output=execFileSync(process.execPath,[script,...args],{cwd:root,encoding:"utf8",timeout:120000});process.stdout.write(output);return output;}
run("scripts/build-hub.js","--check");run("scripts/build-shared.js","--check");
const output=run("scripts/prepare-client-packages.js","--targets","edge");
const edgeDir=output.match(/Prepared edge packages: ([^\r\n]+)/)?.[1];
if(!edgeDir||!fs.existsSync(path.join(edgeDir,"release-manifest.json")))throw new Error("Missing verified Edge package");
const directory=fs.mkdtempSync(path.join(root,"dist/tasu-apps-preview-"));
const entries={};
for(const name of ["host.py","engine.py","protocol.py","runtime.py","journal.py","options.py","backend_adapter.py","install.ps1","uninstall.ps1","README.md","vendor/requirements.txt","vendor/backend/__init__.py","vendor/backend/config.py","vendor/backend/downloader.py","vendor/backend/spotify_client.py","vendor/backend/youtube_client.py"]){
  entries["native-music/"+name]=fs.readFileSync(path.join(root,"native-music",name));
}
entries["native-music/source-lock.json"]=fs.readFileSync(path.join(root,"integrations/source-lock.json"));
const helper=createArchive(entries),edge=fs.readFileSync(path.join(edgeDir,"TasuDownloader-edge.zip"));
const digest=buffer=>crypto.createHash("sha256").update(buffer).digest("hex");
const receipt={schemaVersion:1,kind:"personal-preview",...sourceState(),versions,protocolVersion:1,manualAcceptanceRequired:true,files:{"TasuApps-edge.zip":digest(edge),"TasuApps-music-helper.zip":digest(helper)}};
fs.writeFileSync(path.join(directory,"TasuApps-edge.zip"),edge,{flag:"wx"});
fs.writeFileSync(path.join(directory,"TasuApps-music-helper.zip"),helper,{flag:"wx"});
fs.writeFileSync(path.join(directory,"preview-manifest.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
fs.copyFileSync(path.join(root,"debug-notes/tasu-apps-hub.md"),path.join(directory,"KURULUM-VE-TEST.md"));
console.log(`Tasu Apps personal preview: ${directory}`);
console.log("Existing extension path is unchanged. Nothing installed, published, or deployed.");
