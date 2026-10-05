(function(root) {
  "use strict";
  const prefix = "tasuApps:roblox:";
  const validKey = key => ["settings", "authId", "presencePrev", "reviewGeneratorState"].includes(key) || /^acct:\d+$/.test(key);
  function scopedStorage(storage) {
    return {
      async get(keys) {
        const all = await storage.get(null), result = {};
        for (const [key, value] of Object.entries(all)) if (key.startsWith(prefix) && validKey(key.slice(prefix.length))) result[key.slice(prefix.length)] = value;
        if (keys == null) return result;
        return Object.fromEntries((typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)).map(k => [k, result[k] ?? (typeof keys === "object" && !Array.isArray(keys) ? keys[k] : undefined)]));
      },
      async set(items) {
        if (Object.keys(items).some(k => !validKey(k))) throw new Error("Geçersiz Roblox ayarı");
        return storage.set(Object.fromEntries(Object.entries(items).map(([k,v]) => [prefix + k,v])));
      },
      async remove(keys) { return storage.remove((Array.isArray(keys) ? keys : [keys]).filter(validKey).map(k => prefix + k)); }
    };
  }
  const object = v => v && typeof v === "object" && !Array.isArray(v);
  const numericId = v => /^[1-9]\d{0,15}$/.test(String(v)) && Number.isSafeInteger(Number(v));
  const text = v => typeof v === "string" ? v.slice(0,250) : "";
  const time = v => Number.isFinite(v) && v >= 0 ? v : null;
  const list = v => Array.isArray(v) ? v : [];
  function identity(v) { return { name:text(v.name), displayName:text(v.displayName) }; }
  function safeSettings(v) {
    const s={};
    if (v.lang === "tr" || v.lang === "en") s.lang=v.lang;
    if (typeof v.desktopNotifications === "boolean") s.desktopNotifications=v.desktopNotifications;
    if (["list","grid"].includes(v.friendLayout)) s.friendLayout=v.friendLayout;
    if (Number.isFinite(v.pollMinutes)) s.pollMinutes=Math.max(1,Math.min(720,v.pollMinutes));
    if (numericId(v.viewAccount) || v.viewAccount === "auto") s.viewAccount=v.viewAccount;
    if (Array.isArray(v.accounts)) s.accounts=v.accounts.filter(a=>object(a)&&numericId(a.id)).slice(0,50).map(a=>({id:Number(a.id),...identity(a),notify:a.notify===true}));
    if (object(v.watches)) s.watches=Object.fromEntries(Object.entries(v.watches).filter(([id,w])=>numericId(id)&&object(w)).slice(0,1000).map(([id,w])=>[id,{online:w.online===true,ingame:w.ingame===true,game:object(w.game)&&numericId(w.game.placeId)?{placeId:Number(w.game.placeId),name:text(w.game.name)}:null}]));
    if (Array.isArray(v.games)) s.games=v.games.filter(g=>object(g)&&numericId(g.placeId)).slice(0,200).map(g=>{
      const r={placeId:Number(g.placeId),name:text(g.name),universeId:numericId(g.universeId)?Number(g.universeId):null};
      // Imported URLs are later displayed in legacy HTML attributes.
      try { const u=new URL(g.icon); if(u.protocol==="https:" && /(^|\.)rbxcdn\.com$/.test(u.hostname) && !u.username && !u.password)r.icon=u.href.replaceAll('"',"%22"); } catch {}
      if (typeof g.privateServer === "string" && (/^[A-Za-z0-9_-]{1,200}$/.test(g.privateServer) || /^https:\/\/(?:www\.)?roblox\.com\/[^\s"<>]{1,2000}$/.test(g.privateServer))) r.privateServer=g.privateServer;
      return r;
    });
    return s;
  }
  function cleanBackup(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Geçersiz yedek");
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (!validKey(key) || ["authId", "presencePrev", "reviewGeneratorState"].includes(key)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (key === "settings") {
        out.settings = safeSettings(value);
      } else {
        const id = key.slice(5);
        if (!numericId(id) || String(value.userId) !== id || !object(value.friends)) throw new Error("Hesap yedeği doğrulanamadı");
        const friends=Object.fromEntries(Object.entries(value.friends).filter(([uid,f])=>numericId(uid)&&object(f)).slice(0,10000).map(([uid,f])=>[uid,{...identity(f),since:time(f.since),known:f.known===true,nameHistory:list(f.nameHistory).slice(-20).map(text),displayHistory:list(f.displayHistory).slice(-20).map(text)}]));
        out[key] = { userId:Number(id),userName:text(value.userName),userDisplayName:text(value.userDisplayName),friends,baselineAt:time(value.baselineAt),lastPoll:time(value.lastPoll) };
        const seen = new Set();
        out[key].events = list(value.events).filter(e => object(e) && /^[\w-]{1,100}$/.test(e.id) && numericId(e.userId) && ["added","removed"].includes(e.type) && !seen.has(e.id) && seen.add(e.id)).slice(0,2000).map(e=>({id:e.id,type:e.type,userId:String(e.userId),...identity(e),ts:time(e.ts),since:time(e.since),unread:e.unread===true}));
      }
    }
    if (!Object.keys(out).length && !input.reviewGeneratorState) throw new Error("Roblox verisi bulunamadı");
    return out;
  }
  async function importBackup(storage, input) {
    const clean = cleanBackup(input), scoped = scopedStorage(storage), before = await scoped.get(null);
    const previousDada=(await storage.get("tasuApps:dada"))["tasuApps:dada"];
    await storage.set({ "tasuApps:roblox:importBackup": { at: Date.now(), data: before, dada:previousDada||null } });
    // Replace each imported account atomically; repeating an import cannot append duplicates.
    if(clean.settings)clean.settings={...before.settings,...clean.settings};
    await scoped.set(clean);
    await scoped.remove(["authId", "presencePrev"]);
    if (input.reviewGeneratorState && typeof input.reviewGeneratorState === "object") {
      const v = input.reviewGeneratorState;
      const ratings=Object.fromEntries(["avatar","kisilik","uzme"].map(k=>[k,Math.max(1,Math.min(5,Number(v.ratings?.[k])||3))]));
      await storage.set({ "tasuApps:dada": { version:13, language: (v.language||v.lang)==="en"?"en":"tr", ratings,
        style:["dada","good","mean","robux","freaky"].includes(v.style)?v.style:"dada",
        tone:["classic","contract","strict","freaky"].includes(v.tone)?v.tone:"classic",
        gender:v.gender==="male"?"male":"female",ascii:v.ascii===true,noEmoji:v.noEmoji!==false,includeNote:v.includeNote===true,includeBadge:v.includeBadge===true,
        history:list(v.history).filter(x=>typeof x==="string"&&x.length<=250).slice(0,200) } });
    }
    return { accounts: Object.keys(clean).filter(k => k.startsWith("acct:")).length };
  }
  const api = { scopedStorage, cleanBackup, importBackup, prefix };
  root.TASU_STORE = api;
  if (typeof module === "object") module.exports = api;
})(globalThis);
