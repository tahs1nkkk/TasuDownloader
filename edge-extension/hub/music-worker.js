(() => {
  "use strict";
  const allowed=new Set(["status","preview","search","library","liked","download","jobs","job","login","logout","folder","resetFolder","openFolder","exportZip","heartbeat","release"]);
  function failure(message){
    const text=String(message||"");
    if(/not found|not registered/i.test(text))return {ok:false,code:"MUSIC_HOST_MISSING",error:"Edge, Windows yardımcısının kaydını veya başlatıcı dosyasını bulamıyor. Bağlantıyı denetle düğmesiyle ayrıntıları kontrol et."};
    if(/forbidden|not allowed|access.*denied/i.test(text))return {ok:false,code:"MUSIC_HOST_FORBIDDEN",error:"Windows yardımcısı bu eklenti kimliğine izin vermiyor. Kurulumu aşağıdaki güncel kimlikle yenile."};
    if(/Failed to start/i.test(text))return {ok:false,code:"MUSIC_HOST_START",error:"Windows yardımcısı başlatılamadı. Python yolunu ve güvenlik yazılımının engelleme kaydını kontrol et."};
    if(/exited|communicating/i.test(text))return {ok:false,code:"MUSIC_HOST_CLOSED",error:"Windows yardımcısı bağlantıyı kapattı. Bağlantıyı yenile; tekrarlanırsa yardımcı kurulumunu onar."};
    return {ok:false,code:"MUSIC_CONNECTION",error:"Müzik bağlantısı kurulamadı. Bağlantıyı yenile veya eklentiyi yeniden yükle."};
  }
  globalThis.TASU_MUSIC={
    call(payload){
      if(!payload||!allowed.has(payload.method))return Promise.resolve({ok:false,code:"MUSIC_METHOD",error:"Bilinmeyen müzik işlemi"});
      if(typeof chrome.runtime.sendNativeMessage!=="function"&&typeof chrome.runtime.connectNative!=="function")return Promise.resolve({ok:false,code:"MUSIC_PERMISSION",error:"Yerel uygulama izni etkinleşmemiş. Ana ekrandan müzik aracını açıp izin ver; izin zaten açıksa eklentiyi yeniden yükle."});
      return new Promise(resolve=>{
        let settled=false,port=null;
        const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);try{port?.disconnect();}catch{}resolve(value);};
        const timer=setTimeout(()=>finish({ok:false,code:"MUSIC_TIMEOUT",error:"Motor yanıtı gecikti. İşler ekranından durumu kontrol et."}),120000);
        const request={version:1,id:payload.id||crypto.randomUUID(),method:payload.method,params:{...(payload.params||{}),...(payload.method==="status"?{_progress:true}:{})}};
        const receive=response=>{
          if(response?.progress){try{chrome.runtime.sendMessage({type:"TASU_MUSIC_PROGRESS",progress:response.progress}).catch?.(()=>{});}catch{}return;}
          if(response?.version!==1){finish({ok:false,code:"MUSIC_VERSION",error:"Müzik yardımcısının sürümü uyumlu değil; yardımcıyı güncelle."});return;}
          finish(response);
        };
        try{
          if(typeof chrome.runtime.connectNative==="function"){
            port=chrome.runtime.connectNative("com.tasuapps.music");
            port.onMessage.addListener(receive);
            port.onDisconnect.addListener(()=>{if(!settled)finish(failure(chrome.runtime.lastError?.message||"Native host has exited."));});
            port.postMessage(request);
          }else chrome.runtime.sendNativeMessage("com.tasuapps.music",request,response=>{if(chrome.runtime.lastError){finish(failure(chrome.runtime.lastError.message));return;}receive(response);});
        }catch(e){finish(failure(e.message));}
      });
    }
  };
})();
