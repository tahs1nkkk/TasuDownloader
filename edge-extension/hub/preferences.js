/* Restore existing global Downloader controls without touching account/site keys. */
globalThis.TasuHubPreferences=(()=>{
  const {SETTINGS_KEY,LEGACY_SETTINGS_KEY,DEFAULT_SETTINGS,cleanPathPart}=RG_SETTINGS,fields=new Map();let queue=Promise.resolve();
  const specs=[
    ["Medya butonları",null],
    ["buttonVisibility","Görünürlük",[["hover","Üzerine gelince"],["always","Her zaman"]]],
    ["buttonSize","Buton boyutu","range"],
    ["rightShiftDownload","Sağ Shift ile indir","checkbox"],
    ["İndirmeler",null],
    ["cloudDestination","Kayıt hedefi",[["local","Bilgisayar"],["cloud","Bulut"],["both","İkisi de"]]],
    ["downloadPath","Ana klasör adı","text"],
    ["folderLayout","Klasör düzeni",[["organized","Siteye göre"],["legacy","Eski düzen"]]],
    ["includeDateInFilename","Dosya adına tarih ekle","checkbox"]
  ];
  const notice=(text,level="success")=>document.dispatchEvent(new CustomEvent("hub:notice",{detail:{text,level}}));
  async function read(){const data=await chrome.storage.local.get([SETTINGS_KEY,LEGACY_SETTINGS_KEY]);return {...DEFAULT_SETTINGS,...(data[SETTINGS_KEY]||data[LEGACY_SETTINGS_KEY])};}
  function update(fn){const operation=queue.catch(()=>{}).then(async()=>{const next=await read();fn(next);await chrome.storage.local.set({[SETTINGS_KEY]:next});render(next);});queue=operation;return operation;}
  const host=document.getElementById("globalSettings");
  for(const [key,label,type]of specs){
    if(!label){const h=document.createElement("h3");h.textContent=key;host.append(h);continue;}
    const row=document.createElement("label");row.className="setting";const name=document.createElement("span");name.textContent=label;
    const el=document.createElement(Array.isArray(type)?"select":"input");el.dataset.globalSetting=key;
    if(Array.isArray(type))for(const [value,text]of type)el.add(new Option(text,value));else el.type=type;
    if(type==="range"){el.min="28";el.max="72";el.step="2";row.classList.add("range-setting");const output=document.createElement("output");name.append(" ",output);el.addEventListener("input",()=>output.textContent=el.value+" px");}
    if(type==="text")el.maxLength=80;
    el.addEventListener("change",()=>{let value=el.type==="checkbox"?el.checked:el.type==="range"?Math.max(28,Math.min(72,Number(el.value))):el.value;if(key==="downloadPath")value=cleanPathPart(value,DEFAULT_SETTINGS.downloadPath)||DEFAULT_SETTINGS.downloadPath;void update(data=>{data[key]=value;}).then(()=>notice("Ayar kaydedildi")).catch(()=>notice("Ayar kaydedilemedi","error"));});
    fields.set(key,el);row.append(name,el);host.append(row);
  }
  function render(data){
    for(const [key,el]of fields){if(document.activeElement===el)continue;if(el.type==="checkbox")el.checked=!!data[key];else el.value=data[key];if(el.type==="range")el.closest("label").querySelector("output").textContent=el.value+" px";}
    const host=document.getElementById("hubFolders");host.replaceChildren();
    for(const name of Array.isArray(data.mediaFolders)?data.mediaFolders:[]){
      const row=document.createElement("div");row.className="folder-edit";const input=document.createElement("input");input.value=name;input.maxLength=40;input.setAttribute("aria-label","Klasör adı");
      input.onchange=()=>{const next=cleanPathPart(input.value).slice(0,40);if(!next){input.value=name;notice("Klasör adı boş olamaz","error");return;}void update(s=>{s.mediaFolders=[...new Set(s.mediaFolders.map(x=>x===name?next:x))];}).catch(()=>notice("Klasör kaydedilemedi","error"));};
      const remove=document.createElement("button");remove.textContent="Kaldır";remove.title="Yalnızca listeden kaldır; diskteki dosyalara dokunulmaz";remove.onclick=()=>void update(s=>{s.mediaFolders=s.mediaFolders.filter(x=>x!==name);}).then(()=>notice("Klasör listeden kaldırıldı")).catch(()=>notice("İşlem tamamlanamadı","error"));
      row.append(input,remove);host.append(row);
    }
  }
  document.getElementById("hubFolderAdd").onclick=async()=>{const el=document.getElementById("hubFolderNew"),name=cleanPathPart(el.value).slice(0,40);if(!name)return;try{await update(s=>{s.mediaFolders=[...new Set([...(s.mediaFolders||[]),name])];});el.value="";notice("Klasör eklendi");}catch{notice("Klasör kaydedilemedi","error");}};
  document.getElementById("hubFolderNew").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("hubFolderAdd").click();});
  document.getElementById("resetGlobal").onclick=()=>document.getElementById("resetDialog").showModal();
  document.getElementById("cancelReset").onclick=()=>document.getElementById("resetDialog").close();
  document.getElementById("confirmReset").onclick=async()=>{try{await update(s=>{for(const key of fields.keys())s[key]=DEFAULT_SETTINGS[key];s.mediaFolders=[];});await TasuHubAppearance.reset();document.getElementById("resetDialog").close();notice("Genel ayarlar sıfırlandı");}catch{notice("Ayarlar sıfırlanamadı","error");}};
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes[SETTINGS_KEY])render({...DEFAULT_SETTINGS,...changes[SETTINGS_KEY].newValue});});
  return {init:async()=>render(await read())};
})();
