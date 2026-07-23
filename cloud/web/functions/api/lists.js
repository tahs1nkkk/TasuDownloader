// Liste anlık görüntüsü: uygulama PUT eder, site ve uygulama GET eder.
// Depo tek satırdır (id = "default") — kişisel arşiv, kişi başı bir kayıt.
import { json, supabase, tokenOk, unauthorized } from "./_utils.js";

export async function onRequestGet({ request, env }) {
  if (!tokenOk(request, env)) return unauthorized();
  const response = await supabase(env, "tasu_sync?id=eq.default&select=payload");
  if (!response.ok) return json({ ok: false, error: `supabase ${response.status}` }, 502);
  const rows = await response.json();
  if (!rows.length) return json({ ok: false, error: "henüz kayıt yok" }, 404);
  return json(rows[0].payload);
}

export async function onRequestPut({ request, env }) {
  if (!tokenOk(request, env)) return unauthorized();
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "gövde JSON değil" }, 400);
  }
  if (!payload || !Array.isArray(payload.lists)) {
    return json({ ok: false, error: "beklenen şekil: {lists:[…], tombstones:[…]}" }, 400);
  }
  const response = await supabase(env, "tasu_sync", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id: "default", payload, updated_at: new Date().toISOString() }])
  });
  if (!response.ok) return json({ ok: false, error: `supabase ${response.status}` }, 502);
  return json({ ok: true });
}
