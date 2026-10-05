globalThis.TasuMusicOptions=(()=>{
  const key="tasuApps:music:preferences",host=document.getElementById("musicOptions"),fields={},dirty=new Set();
  let pending=Promise.resolve();
  const group=(id,title)=>{const section=document.createElement("details"),heading=document.createElement("summary");section.className="options-group";section.id=id;heading.textContent=title;section.append(heading);host.append(section);return section;};
  const select=(parent,id,label,values)=>{const row=document.createElement("label");row.className="setting";const name=document.createElement("span");name.textContent=label;const control=document.createElement("select");control.id=id;for(const [value,text]of values)control.add(new Option(text,value));row.append(name,control);parent.append(row);fields[id]=control;};
  const check=(parent,id,label,value)=>{const row=document.createElement("label");row.className="setting";const name=document.createElement("span");name.textContent=label;const control=document.createElement("input");control.id=id;control.type="checkbox";control.checked=value;row.append(name,control);parent.append(row);fields[id]=control;};
  const naming=group("namingOptions","Dosya adı");
  check(naming,"nameArtist","Sanatçıyı ekle",true);
  select(naming,"nameOrder","Sıralama",[["artist_first","Sanatçı – Başlık"],["title_first","Başlık – Sanatçı"]]);
  select(naming,"nameSeparator","Ayırıcı",[[" - ","Tire"],[" — ","Uzun çizgi"],[" _ ","Alt çizgi"],[" ","Boşluk"]]);
  check(naming,"ascii_tr","Türkçe harfleri sadeleştir",false);
  const covers=group("coverOptions","Kapak");
  check(covers,"embed_cover","Kapağı dosyaya göm",true);
  select(covers,"cover_res","Kapak kalitesi",[["maks","En yüksek"],["yuksek","Yüksek"],["orta","Orta"],["dusuk","Düşük"]]);
  const search=group("searchOptions","Arama");
  select(search,"result_limit","Sonuç sayısı",[["50","50"],["100","100"],["200","200"],["300","300"]]);
  select(search,"max_duration","En uzun video",[["0","Sınırsız"],["300","5 dakika"],["600","10 dakika"],["1800","30 dakika"],["3600","60 dakika"]]);
  const session=group("sessionOptions","YouTube oturumu");
  select(session,"cookies_from_browser","Yerel tarayıcı",[["","Kapalı"],["edge","Edge"],["chrome","Chrome"],["firefox","Firefox"],["brave","Brave"],["opera","Opera"]]);
  const note=document.createElement("small");note.textContent="Seçersen yerel yardımcı YouTube çerezlerini kullanmayı dener. Çerezler eklentiye, yedeğe veya günlüğe alınmaz. Ekranı kapatınca seçim sıfırlanır.";session.append(note);
  const appearance=group("appearanceOptions","Şarkı görünümü");
  select(appearance,"song_view","Liste düzeni",[["list","Liste"],["grid","Izgara"]]);
  const sharing=group("sharingOptions","Paylaşım");
  const exportButton=document.createElement("button");exportButton.id="exportZip";exportButton.type="button";exportButton.textContent="Güvenli paylaşım ZIP'i oluştur";sharing.append(exportButton);
  for(const id of ["fmt","preset","video_quality"])fields[id]=document.getElementById(id);
  function format(){const video=fields.fmt.value==="mp4";document.getElementById("audioQuality").hidden=video;document.getElementById("videoQuality").hidden=!video;document.querySelector(".music-app").dataset.view=fields.song_view.value;}
  const ready=chrome.storage.local.get(key).then(data=>{for(const [id,control]of Object.entries(fields)){const saved=data[key]?.[id];if(id==="cookies_from_browser"||saved===undefined||dirty.has(id))continue;if(control.type==="checkbox"&&typeof saved==="boolean")control.checked=saved;else if([...control.options||[]].some(o=>o.value===saved))control.value=saved;}}).finally(format);
  const save=e=>{
    const id=e.target.id;if(!fields[id])return;dirty.add(id);format();
    // Only patch the changed field; slow reads must not erase saved preferences.
    const value=fields[id].type==="checkbox"?fields[id].checked:fields[id].value;
    if(id!=="cookies_from_browser")pending=pending.catch(()=>{}).then(()=>ready.catch(()=>{})).then(async()=>{const stored=(await chrome.storage.local.get(key))[key]||{};await chrome.storage.local.set({[key]:{...stored,[id]:value}});});
    pending.catch(()=>{});host.dispatchEvent(new CustomEvent("music:options",{bubbles:true}));
  };
  host.addEventListener("change",save);for(const id of ["fmt","preset","video_quality"])fields[id].addEventListener("change",save);
  document.getElementById("toggleMusicOptions").onclick=()=>host.hidden=!host.hidden;
  format();
  return {ready,get:()=>({video_quality:fields.video_quality.value,embed_cover:fields.embed_cover.checked,ascii_tr:fields.ascii_tr.checked,cover_res:fields.cover_res.value,result_limit:Number(fields.result_limit.value),max_duration:Number(fields.max_duration.value),cookies_from_browser:fields.cookies_from_browser.value||null,naming:{artist:fields.nameArtist.checked,order:fields.nameOrder.value,separator:fields.nameSeparator.value}})};
})();
