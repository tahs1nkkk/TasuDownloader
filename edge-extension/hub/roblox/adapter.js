"use strict";
const realChrome = globalThis.chrome;
globalThis.TasuRobloxChrome = {
  ...realChrome,
  storage: { ...realChrome.storage, local: TASU_STORE.scopedStorage(realChrome.storage.local) },
  runtime: { ...realChrome.runtime, sendMessage: async payload => {const result=await realChrome.runtime.sendMessage({ type: "TASU_ROBLOX", payload });if(!result?.ok)throw new Error(result?.error||"Roblox yanıt vermedi");return result;} }
};
