// Generated from shared/core/lifecycle.js; run npm run build:shared. Do not edit.
// Resource ownership for site adapters. Mobile/standalone clients retain auto-start.
(function(root){
  "use strict";
  function create(id){
    const w=root,d=w.document;let managed=false;
    try{managed=w.chrome.runtime.getManifest().action.default_popup==="hub.html";}catch{}
    let enabled=true,active=true,disposed=false,sequence=0,idleTimer=null,parentActive=false;
    const listeners=new Set(),observers=new Set(),intervals=new Map(),frames=new Map(),cleanup=[];
    const native={raf:w.requestAnimationFrame.bind(w),caf:w.cancelAnimationFrame.bind(w),interval:w.setInterval.bind(w),clear:w.clearInterval.bind(w)};
    const awake=()=>!managed || (enabled&&!d.hidden&&(d.hasFocus() || (w.top!==w && parentActive)));
    function bind(record){record.target.addEventListener(record.type,record.wrapped,record.options);}
    function unbind(record){record.target.removeEventListener(record.type,record.wrapped,record.options);}
    function listen(target,type,fn,options){
      const r={target,type,fn,options,wrapped:null};
      r.wrapped=function(...args){if(options?.once)listeners.delete(r);if(active)return typeof fn==="function"?fn.apply(this,args):fn.handleEvent(...args);};
      listeners.add(r);if(active)bind(r);
    }
    function unlisten(target,type,fn,options){for(const r of listeners)if(r.target===target&&r.type===type&&r.fn===fn){unbind(r);listeners.delete(r);}target.removeEventListener(type,fn,options);}
    class ScopedObserver extends w.MutationObserver{
      constructor(fn){super((...args)=>{if(active)fn(...args);});this.targets=new Map();observers.add(this);}
      observe(target,options){this.targets.set(target,options);if(active)super.observe(target,options);}
      disconnect(){super.disconnect();this.targets.clear();}
      pause(){super.disconnect();}
      resume(){for(const [target,options]of this.targets)if(target.isConnected||target===d)super.observe(target,options);}
    }
    function interval(fn,ms,...args){const key=++sequence,r={fn,ms,args,timer:null};intervals.set(key,r);if(active)r.timer=native.interval(fn,ms,...args);return key;}
    function clearInterval(key){const r=intervals.get(key);if(r)native.clear(r.timer);intervals.delete(key);}
    function raf(fn){const key=++sequence;const r={fn,timer:null};frames.set(key,r);if(active)r.timer=native.raf(t=>{frames.delete(key);fn(t);});return key;}
    function cancelAnimationFrame(key){const r=frames.get(key);if(r)native.caf(r.timer);frames.delete(key);}
    function suspend(){
      if(!active)return;active=false;
      for(const r of listeners)unbind(r);for(const o of observers)o.pause();
      for(const r of intervals.values()){native.clear(r.timer);r.timer=null;}
      for(const r of frames.values()){native.caf(r.timer);r.timer=null;}
      if(managed)d.documentElement.dataset.tasuSuspended="true";
    }
    function activate(){
      if(disposed||active)return;active=true;
      if(managed)delete d.documentElement.dataset.tasuSuspended;
      for(const r of listeners)bind(r);for(const o of observers)o.resume();
      for(const r of intervals.values())r.timer=native.interval(r.fn,r.ms,...r.args);
      for(const [key,r]of frames)r.timer=native.raf(t=>{frames.delete(key);r.fn(t);});
      scope.onResume?.();
    }
    function update(){
      if(disposed)return;
      w.clearTimeout(idleTimer);
      if(awake())activate();else{suspend();idleTimer=w.setTimeout(()=>{scope.onIdle?.();},300000);}
    }
    function dispose(){suspend();disposed=true;w.clearTimeout(idleTimer);listeners.clear();intervals.clear();frames.clear();observers.clear();for(const fn of cleanup)fn();cleanup.length=0;d.removeEventListener("visibilitychange",update);w.removeEventListener("focus",update);w.removeEventListener("blur",update);}
    const scope={id,listen,unlisten,MutationObserver:ScopedObserver,setInterval:interval,clearInterval,raf,cancelAnimationFrame,activate,suspend,dispose,onResume:null,onIdle:null,get active(){return active;}};
    if(managed){
      let style=d.getElementById("tasu-suspend-style");if(!style){style=d.createElement("style");style.id="tasu-suspend-style";style.textContent='html[data-tasu-suspended="true"] :is(button[id^="rg-"],button[class^="rg-"],[id="rg-scrolller-v2-host"],[id="rg-feedback-host"],[id="rg-sp-panel"],[id="rg-sp-trigger"]){visibility:hidden!important;pointer-events:none!important}';(d.head||d.documentElement).append(style);}
      d.addEventListener("visibilitychange",update);w.addEventListener("focus",update);w.addEventListener("blur",update);
      const moduleId=id==="roblox"?"roblox":"downloader";
      chrome.storage.local.get("tasuAppsHub").then(r=>{enabled=r.tasuAppsHub?.enabled?.[moduleId]!==false;update();});
      const storageChange=(changes,area)=>{if(area==="local"&&changes.tasuAppsHub){enabled=changes.tasuAppsHub.newValue?.enabled?.[moduleId]!==false;update();}};
      const tabChange=msg=>{if(msg?.type==="TASU_TAB_ACTIVE"){parentActive=msg.active===true;update();}};
      chrome.storage.onChanged.addListener(storageChange);chrome.runtime.onMessage.addListener(tabChange);
      cleanup.push(()=>chrome.storage.onChanged.removeListener(storageChange),()=>chrome.runtime.onMessage.removeListener(tabChange));
      if(w.top!==w){
        try{const parentFocus=()=>{parentActive=true;update();},parentBlur=()=>{parentActive=false;update();};parentActive=w.top.document.hasFocus();w.top.addEventListener("focus",parentFocus);w.top.addEventListener("blur",parentBlur);cleanup.push(()=>{w.top.removeEventListener("focus",parentFocus);w.top.removeEventListener("blur",parentBlur);});}catch{}
        chrome.runtime.sendMessage({type:"TASU_CONTENT_ACTIVE"},r=>{if(!chrome.runtime.lastError&&r){parentActive=r.active===true;update();}});
      }
      w.setTimeout(update,0);
    }
    return scope;
  }
  root.RG_LIFECYCLE={create};
})(globalThis);
