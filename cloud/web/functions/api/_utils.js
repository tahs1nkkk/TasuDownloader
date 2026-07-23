// Ortak yardımcılar: token denetimi + Supabase REST erişimi.
// Service key yalnız burada (sunucu tarafında) yaşar; tarayıcıya asla inmez.

export function unauthorized() {
  return json({ ok: false, error: "geçersiz token" }, 401);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export function tokenOk(request, env) {
  const expected = env.ARCHIVE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return false;
  // Workers'ta timingSafeEqual yok; sabit zamanlı karşılaştırmayı elle yap.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
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
