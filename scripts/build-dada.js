"use strict";
// Frozen user-provided source. Design-only integration, plus adult-only safety gate.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),source=path.join(root,"integrations/dada-source"),dest=path.join(root,"edge-extension/hub/dada");
const files=["popup.html","popup.js","popup.css","generator.js","comment-bank.js"],check=process.argv.includes("--check");
if(process.argv.includes("--import")){
  const original=path.resolve(root,"../roblox-review-generator-extension");
  fs.mkdirSync(source,{recursive:true});
  const hashes={};
  for(const name of files){const bytes=fs.readFileSync(path.join(original,name));fs.writeFileSync(path.join(source,name),bytes,{flag:"wx"});hashes[name]=crypto.createHash("sha256").update(bytes).digest("hex");}
  fs.writeFileSync(path.join(source,"source-lock.json"),JSON.stringify({source:original,files:hashes},null,2)+"\n",{flag:"wx"});
}
const read=name=>fs.readFileSync(path.join(source,name),"utf8").replace(/\r\n/g,"\n");
const lock=JSON.parse(read("source-lock.json"));
for(const name of files)if(crypto.createHash("sha256").update(fs.readFileSync(path.join(source,name))).digest("hex")!==lock.files[name])throw Error("Dada snapshot changed: "+name);
function emit(name,text){const out=path.join(dest,name);if(check){if(!fs.existsSync(out)||fs.readFileSync(out,"utf8")!==text)throw Error("Stale Dada output: "+name);}else{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,text);}}
let html=read("popup.html").replace('href="popup.css?v=2"','href="popup.css"').replace('src="popup.js?v=26"','src="popup.js"');
html=html.replace("</head>",'<link rel="stylesheet" href="../theme.css"><link rel="stylesheet" href="theme.css"></head>');
// Retain the controller's language state without exposing the language toggle.
html=html.replace('<header class="topbar">','<header class="topbar" hidden>');
emit("index.html",html);
let popup=read("popup.js").replaceAll(/\?v=\d+/g,"");
popup=popup.replace('const GENDER_ORDER = ["female", "littleFemale", "male", "littleMale"];','const GENDER_ORDER = ["female", "male"];');
popup=popup.replace('female: { en: "Girl", tr: "Kız" }','female: { en: "Woman · 18+", tr: "Kadın · 18+" }').replace('male: { en: "Boy", tr: "Erkek" }','male: { en: "Man · 18+", tr: "Erkek · 18+" }');
popup=popup.replaceAll('"reviewGeneratorState"','"tasuApps:dada"').replace('return result.reviewGeneratorState || {};','const saved=result["tasuApps:dada"];return saved?{version:STORAGE_VERSION,...saved,language:saved.language||saved.lang||"tr"}:{};').replace('{ reviewGeneratorState: serializable }','{ ["tasuApps:dada"]: serializable }');
emit("popup.js",popup);
let generator=read("generator.js").replaceAll(/\?v=\d+/g,"");
generator=generator.replace('["female", "littleFemale", "male", "littleMale"].includes(gender)','["female", "male"].includes(gender)');
// Hidden/old imported child-coded values cannot bypass the UI gate.
generator=generator.replace('if (gender === "male" || gender === "littleMale")','if (gender === "male")').replace('  if (gender === "littleFemale") result = applyLittleFemaleWords(result);','').replace('  if (gender === "littleMale") result = applyLittleMaleWords(result);','');
emit("generator.js",generator);
emit("comment-bank.js",read("comment-bank.js"));emit("popup.css",read("popup.css"));
console.log("Dada source verified and built (original bank, adult-only modes).");
