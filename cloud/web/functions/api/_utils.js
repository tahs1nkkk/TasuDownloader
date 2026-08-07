// Ortak yardımcılar: JSON yanıtı + Supabase REST erişimi.
// Service key yalnız burada (sunucu tarafında) yaşar; tarayıcıya asla inmez.
// Yetki denetimi (oturum çerezi ya da Bearer token) worker.js'te yapılır.

// Veri uçları hep taze okunur: medya baytları sonsuza kadar önbelleklenirken
// listenin kendisi bayatlarsa silinen dosya geri gelmiş gibi görünür.
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export async function supabase(env, path, init = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  return response;
}
