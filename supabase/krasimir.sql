-- Quaderno di Krasimir: tabella dei dati di Krasimir.
-- Incolla tutto in Supabase > SQL Editor > New query e premi Run.

-- Dati del Quaderno di Krasimir, separati da quelli degli altri Quaderni.
create table if not exists public.quaderno_krasimir (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quaderno_krasimir enable row level security;
revoke all on public.quaderno_krasimir from anon;
grant select, insert, update, delete on public.quaderno_krasimir to authenticated;
drop policy if exists "proprietario" on public.quaderno_krasimir;
create policy "proprietario" on public.quaderno_krasimir
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Ogni dispositivo ricorda da quale app ha attivato le notifiche ('krasimir' per questa app).
alter table public.dispositivi add column if not exists app text not null default 'kristian';
