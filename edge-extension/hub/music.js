"use strict";
(() => {
  const $=s=>document.querySelector(s);let items=[],chosen=new Set(),poll,timer,title="",requestId=null;
  async function call(method,params={},id){const r=await chrome.runtime.sendMessage({type:"TASU_MUSIC",payload:{method,params,id}});if(!r?.ok){const error=new Error(r?.error||"Motor yanıt vermedi");error.code=r?.code;throw error;}return r.data;}
  function notice(text,level="info"){clearTimeout(timer);const n=$("#notice");n.hidden=false;n.textContent=text;n.dataset.level=level;timer=setTimeout(()=>n.hidden=true,6500);}
  function bind(id,fn){$("#"+id).onclick=async()=>{const button=$("#"+id);button.disabled=true;try{await fn();}catch(e){notice(e.message,"error");}finally{button.disabled=id==="download"&&!chosen.size;}};}
  function engineProgress(percent,stage){const panel=$("#engineProgress");panel.hidden=false;$("#engineProgressBar").value=Math.max(0,Math.min(100,Number(percent)||0));$("#enginePercent").textContent=`${Math.round(Number(percent)||0)}%`;$("#engineStage").textContent=stage||"Yerel motor hazırlanıyor";}
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==="TASU_MUSIC_PROGRESS"&&message.progress)engineProgress(message.progress.percent,message.progress.stage);});
  function render(){const host=$("#tracks");host.replaceChildren();items.forEach((item,i)=>{const row=document.createElement("label");row.className="track";const check=document.createElement("input");check.type="checkbox";check.checked=chosen.has(i);check.onchange=()=>{chosen.has(i)?chosen.delete(i):chosen.add(i);update();};const img=document.createElement("img");img.loading="lazy";img.alt="";if(/^https:\/\//.test(item.cover_url||""))img.src=item.cover_url;else img.hidden=true;const text=document.createElement("span");text.textContent=item.title||item.name||"Medya";const source=document.createElement("small");source.textContent=`${item.artist||""} · ${item.source==="spotify"?"Spotify bilgisi → YouTube eşleşmesi":"YouTube"}`;text.append(source);row.append(check,img,text);host.append(row);});update();}
  function showItems(d){if(!d)throw new Error("Kaynak bulunamadı");if(d.cookie_failed)notice("Tarayıcı oturumuna erişilemedi; çerezsiz sonuçlar gösteriliyor.");items=d.items||d.tracks||[];title=d.meta?.name||d.title||d.name||"";chosen=new Set(items.map((_,i)=>i));render();if(!items.length)notice("Sonuç bulunamadı");}
  function update(){$("#download").textContent=`Seçilenleri indir (${chosen.size})`;$("#download").disabled=!chosen.size;requestId=null;}
  async function jobs(){const data=await call("jobs");const host=$("#jobs");host.replaceChildren();if(!data.length){const empty=document.createElement("div");empty.className="empty-jobs";empty.textContent="Henüz indirme yok";host.append(empty);}for(const job of data){const card=document.createElement("div");card.className="job";card.dataset.state=job.status;const head=document.createElement("div");head.className="job-head";const title=document.createElement("strong");title.textContent=job.current_title||job.title||"İndirme";const badge=document.createElement("span");badge.className="job-badge";badge.textContent=({queued:"Sırada",running:"İndiriliyor",done:"Tamamlandı",partial:"Kısmen",interrupted:"Kesildi",error:"Başarısız"})[job.status]||job.status;head.append(title,badge);card.append(head);const count=document.createElement("small");count.textContent=`${job.completed||0} / ${job.total||0}`;card.append(count);if(job.errors){const err=document.createElement("small");err.className="error";err.textContent=job.error_message||`${job.errors} öğe indirilemedi`;card.append(err);}const progress=document.createElement("progress");progress.max=Math.max(1,job.total||1);progress.value=job.completed||0;card.append(progress);host.append(card);}}
  async function status(){
    $("#status").textContent="Motor bağlanıyor…";$("#status").dataset.state="connecting";engineProgress(4,"Windows yardımcısı aranıyor");
    try{
      let s;
      try{s=await call("status");}catch(e){
        // An old inactive module state can be repaired without restarting jobs.
        if(e.code!=="MUSIC_INACTIVE")throw e;
        const result=await chrome.runtime.sendMessage({type:"TASU_HUB_ACTIVATE",module:"music"});
        if(!result?.ok)throw e;s=await call("status");
      }
      $("#status").textContent=s.ffmpeg_ok?"Motor hazır":"Dönüştürücü bulunamadı";$("#status").dataset.state=s.ffmpeg_ok?"ready":"error";
      engineProgress(100,s.ffmpeg_ok?"Motor hazır":"Dönüştürücü bulunamadı");setTimeout(()=>{$("#engineProgress").hidden=true;},900);
      $("#helperSetup").hidden=true;$("#downloadDirectory").textContent=s.download_dir;$("#login").title=s.spotify_configured?"Spotify ile giriş":"Yerel Spotify Client ID / Secret ayarı gerekli";
    }catch(e){$("#status").textContent="Motor bağlı değil";$("#status").dataset.state="error";engineProgress(0,"Bağlantı kurulamadı");$("#helperSetup").hidden=false;$("#helperMessage").textContent=e.message;throw e;}
    // A journal error is not a disconnected engine.
    await jobs().catch(e=>notice("İndirme listesi alınamadı: "+e.message,"error"));
  }
  bind("preview",async()=>{const value=$("#query").value.trim();if(!value)return;showItems(await call(/^https?:\/\//i.test(value)||value.startsWith("spotify:")?"preview":"search",{input:value,...TasuMusicOptions.get()}));});
  bind("liked",async()=>showItems(await call("liked")));
  bind("library",async()=>{const lists=await call("library"),host=$("#libraryList");host.replaceChildren();for(const p of lists){const b=document.createElement("button");b.textContent=p.name||"Çalma listesi";b.onclick=async()=>{try{showItems(await call("preview",{input:`spotify:playlist:${p.id}`}));}catch(e){notice(e.message,"error");}};host.append(b);}if(!lists.length)notice("Çalma listesi bulunamadı");});
  document.addEventListener("music:options",()=>{requestId=null;});
  for(const id of ["fmt","preset"])$("#"+id).addEventListener("change",()=>{requestId=null;});
  bind("download",async()=>{requestId ||= crypto.randomUUID();await call("download",{...TasuMusicOptions.get(),items:items.filter((_,i)=>chosen.has(i)),preset:$("#preset").value,fmt:$("#fmt").value,subfolder:title},requestId);notice("İndirme sıraya alındı","success");await jobs();});
  bind("login",async()=>{await call("login");notice("Spotify girişini açılan tarayıcı sekmesinde tamamla.");});
  bind("logout",async()=>{await call("logout");notice("Spotify oturumu kapatıldı");});
  bind("folder",async()=>{await call("folder");await status();});bind("resetFolder",async()=>{await call("resetFolder");await status();notice("İndirme klasörü varsayılana döndü","success");});bind("openFolder",()=>call("openFolder"));bind("refreshJobs",jobs);
  bind("exportZip",async()=>{const result=await call("exportZip");notice(result.created?`Paylaşım ZIP'i oluşturuldu (${result.files} dosya)`:"ZIP oluşturulamadı",result.created?"success":"error");});
  bind("reconnect",async()=>{await status();monitor();});
  function boundedCheck(promise){let timeout;return Promise.race([promise,new Promise(resolve=>{timeout=setTimeout(()=>resolve({ok:false,error:"Worker check timed out"}),35000);})]).finally(()=>clearTimeout(timeout));}
  bind("diagnoseConnection",async()=>{
    clearTimeout(poll);$("#connectionReportPanel").hidden=false;$("#connectionSummary").textContent="Bağlantı denetleniyor…";$("#copyConnectionReport").disabled=true;
    const report={schemaVersion:1,checkedAt:new Date().toISOString(),extensionId:chrome.runtime.id,version:chrome.runtime.getManifest().version,host:"com.tasuapps.music",browser:(navigator.userAgent.match(/(?:Edg|Chrome)\/[\d.]+/g)||[]).join(" "),incognito:!!chrome.extension?.inIncognitoContext};
    try{
      const response=await boundedCheck(chrome.runtime.sendMessage({type:"TASU_MUSIC_DIAGNOSTICS"})).catch(()=>null);
      report.worker=response?.ok?response.data:{error:"Worker diagnostic unavailable; reload the extension"};
      report.page=await TasuMusicDiagnostics.run();
      const checks=[report.worker.send,report.worker.connect,report.page.send,report.page.connect].filter(Boolean);
      $("#connectionSummary").textContent=checks.length===4&&checks.every(r=>r.ok)?"Tüm bağlantı kontrolleri başarılı.":checks.some(r=>r.ok)?"Bağlantı yöntemleri farklı sonuç verdi. Raporu paylaş.":"Tarayıcı bağlantıyı kuramadı. Raporu paylaş.";
    }finally{$("#connectionReport").value=JSON.stringify(report,null,2);$("#copyConnectionReport").disabled=false;}
  });
  bind("copyConnectionReport",async()=>{try{await navigator.clipboard.writeText($("#connectionReport").value);notice("Bağlantı raporu kopyalandı","success");}catch{$("#connectionReport").focus();$("#connectionReport").select();notice("Rapor seçildi. Ctrl+C ile kopyalayabilirsin.");}});
  $("#extensionId").textContent=chrome.runtime.id;
  $("#toggleAccount").onclick=()=>$("#accountPanel").hidden=!$("#accountPanel").hidden;
  $("#toggleFolder").onclick=()=>$("#folderPanel").hidden=!$("#folderPanel").hidden;
  $("#query").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("#preview").disabled)$("#preview").click();});
  function active(){return !document.hidden && (document.hasFocus() || parent.document.hasFocus());}
  let monitoring=false,closed=false;
  function monitor(){clearTimeout(poll);if(closed||monitoring||!active())return;monitoring=true;call("heartbeat").then(jobs).catch(()=>{}).finally(()=>{monitoring=false;if(!closed&&active())poll=setTimeout(monitor,10000);});}
  document.addEventListener("visibilitychange",()=>{if(active())monitor();else{clearTimeout(poll);void call("release").catch(()=>{});}});
  parent.addEventListener("focus",monitor);window.addEventListener("focus",monitor);window.addEventListener("pagehide",()=>{closed=true;parent.removeEventListener("focus",monitor);clearTimeout(poll);void call("release").catch(()=>{});});
  const parentBlur=()=>setTimeout(()=>{if(!closed&&!active()){clearTimeout(poll);void call("release").catch(()=>{});}},0);
  parent.addEventListener("blur",parentBlur);window.addEventListener("pagehide",()=>parent.removeEventListener("blur",parentBlur));
  TasuMusicOptions.ready.then(status).then(monitor).catch(e=>notice(e.message,"error"));
})();
