import { json, tokenOk, unauthorized } from "./_utils.js";

export async function onRequestGet({ request, env }) {
  if (!tokenOk(request, env)) return unauthorized();
  return json({ ok: true });
}
