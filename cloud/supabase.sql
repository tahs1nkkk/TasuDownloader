-- TasuDownloader liste eşitlemesi için tek tablo.
-- Supabase Dashboard → SQL Editor'a yapıştırıp çalıştır.
create table if not exists public.tasu_sync (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS açık ve hiçbir policy yok: anon/authenticated anahtarlar tabloyu
-- göremez. Pages Functions service_role anahtarıyla konuşur ve RLS'i
-- zaten aşar — sapsal-panel'deki modelin aynısı.
alter table public.tasu_sync enable row level security;
