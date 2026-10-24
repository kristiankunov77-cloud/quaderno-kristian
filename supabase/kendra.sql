-- Quaderno di Kendra: tabella dei dati di Kendra e notifiche gentili.
-- Incolla tutto in Supabase > SQL Editor > New query e premi Run.

-- Dati del Quaderno di Kendra, separati da quelli del Quaderno di Kristian.
create table if not exists public.quaderno_kendra (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quaderno_kendra enable row level security;
revoke all on public.quaderno_kendra from anon;
grant select, insert, update, delete on public.quaderno_kendra to authenticated;
drop policy if exists "proprietario" on public.quaderno_kendra;
create policy "proprietario" on public.quaderno_kendra
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Ogni dispositivo ricorda da quale app ha attivato le notifiche:
-- 'kristian' riceve le frasi cattive, 'kendra' quelle gentili.
alter table public.dispositivi add column if not exists app text not null default 'kristian';
