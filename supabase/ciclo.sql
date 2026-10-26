-- Ciclo di Kendra: tabella dei dati dell'app del ciclo.
-- Incolla tutto in Supabase > SQL Editor > New query e premi Run.

-- Dati dell'app del ciclo, separati da quelli dei due Quaderni.
create table if not exists public.ciclo_kendra (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ciclo_kendra enable row level security;
revoke all on public.ciclo_kendra from anon;
grant select, insert, update, delete on public.ciclo_kendra to authenticated;
drop policy if exists "proprietario" on public.ciclo_kendra;
create policy "proprietario" on public.ciclo_kendra
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Ogni dispositivo ricorda da quale app ha attivato le notifiche ('ciclo' per questa app).
alter table public.dispositivi add column if not exists app text not null default 'kristian';
