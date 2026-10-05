/* Local, fixed glass and lightweight banner controls. No website capture. */
globalThis.TasuHubAppearance=(()=>{
  const key="tasuPopupPreferences",defaults={glassEnabled:true,reduceMotion:false,bannerBlur:1.75,bannerDuration:900};let prefs={...defaults},queue=Promise.resolve();
  const limit=(n,min,max,fallback)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):fallback;
  function render(){document.getElementById("hubGlass").checked=prefs.glassEnabled!==false;document.getElementById("hubMotion").checked=!!prefs.reduceMotion;}
  function apply(doc=document){
    doc.documentElement.dataset.tasuReduceMotion=String(!!prefs.reduceMotion);
    doc.documentElement.style.setProperty("--hub-banner-blur",limit(prefs.bannerBlur,0,5,1.75)+"px");
    doc.documentElement.style.setProperty("--hub-banner-duration",limit(prefs.bannerDuration,300,1500,900)+"ms");
    let style=doc.getElementById("tasu-fixed-surface");if(!style){style=doc.createElement("style");style.id="tasu-fixed-surface";doc.head.append(style);}
    style.textContent=`html,body{background-color:#f1f7fd!important}body{background-image:${prefs.glassEnabled===false?"none":'url("'+chrome.runtime.getURL("assets/hub/glass-surface-v2.png")+'")'}!important;background-size:cover!important;background-attachment:fixed!important}html[data-tasu-reduce-motion="true"] *,html[data-tasu-reduce-motion="true"] *::before,html[data-tasu-reduce-motion="true"] *::after{animation:none!important;transition:none!important}`;
  }
  function applyAll(){render();apply();for(const frame of document.querySelectorAll("iframe"))try{apply(frame.contentDocument);}catch{}}
  async function init(){prefs={...defaults,...(await chrome.storage.local.get(key))[key]};applyAll();}
  function save(patch){prefs={...prefs,...patch};applyAll();queue=queue.catch(()=>{}).then(async()=>{const stored=(await chrome.storage.local.get(key))[key]||{};await chrome.storage.local.set({[key]:{...stored,...patch}});}).catch(()=>document.dispatchEvent(new CustomEvent("hub:notice",{detail:{text:"Görünüm tercihi kaydedilemedi",level:"error"}})));return queue;}
  for(const [id,field]of [["hubGlass","glassEnabled"],["hubMotion","reduceMotion"]]){
    const el=document.getElementById(id);
    el.addEventListener("input",()=>{prefs={...prefs,[field]:el.type==="checkbox"?el.checked:Number(el.value)};applyAll();});
    el.addEventListener("change",()=>save({[field]:el.type==="checkbox"?el.checked:Number(el.value)}));
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes[key]){prefs={...defaults,...changes[key].newValue};applyAll();}});
  // The user's existing banner values are now the fixed personal defaults.
  return {init,apply,reset:()=>save({glassEnabled:true,reduceMotion:false})};
})();
