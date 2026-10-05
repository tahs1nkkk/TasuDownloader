/* Bounded requests; the factory is inert until the tracker is activated. */
globalThis.TasuRobloxNetwork = function(nativeFetch) {
  let blockedUntil=0, failure=null;
  return {
    async fetch(url,options={}) {
      if(Date.now()<blockedUntil)throw failure||new Error("Roblox API beklemede");
      try {
        const r=await nativeFetch(url,{...options,signal:options.signal||AbortSignal.timeout(20000)});
        if(r.status===429||r.status>=500){
          const header=r.headers.get("Retry-After"),seconds=Number(header);
          const delay=header?(Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now()):60000;
          failure=Object.assign(new Error("Roblox API beklemede"),{retryAfterMs:Math.max(60000,Math.min(86400000,delay||60000))});
          blockedUntil=Date.now()+failure.retryAfterMs;throw failure;
        }
        return r;
      }catch(e){failure=e;blockedUntil=Math.max(blockedUntil,Date.now()+60000);throw e;}
    },
    async run(fn){if(Date.now()>=blockedUntil)failure=null;const result=await fn();if(failure)throw failure;return result;}
  };
};
