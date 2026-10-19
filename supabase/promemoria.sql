-- Promemoria serale del Quaderno di Kristian.
-- Incolla in Supabase > SQL Editor > New query e premi Run.
-- Prima sostituisci INCOLLA_CRON_SECRET con lo stesso valore messo nei Secrets delle Edge Functions.

-- Impostazioni del promemoria e ultimo giorno in cui hai aperto l'app.
create table if not exists public.promemoria (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  attivo boolean not null default true,
  ore smallint[] not null default '{12,18,21}',
  ultimo_accesso date
);
-- Se avevi già creato la tabella con un orario solo, passa a più orari.
alter table public.promemoria add column if not exists ore smallint[] not null default '{12,18,21}';
alter table public.promemoria drop column if exists ora;

-- I dispositivi (telefono, computer) su cui arrivano le notifiche.
create table if not exists public.dispositivi (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription jsonb not null,
  creato_il timestamptz not null default now()
);

alter table public.promemoria enable row level security;
alter table public.dispositivi enable row level security;
revoke all on public.promemoria, public.dispositivi from anon;
grant select, insert, update, delete on public.promemoria, public.dispositivi to authenticated;

drop policy if exists "proprietario" on public.promemoria;
drop policy if exists "proprietario" on public.dispositivi;
create policy "proprietario" on public.promemoria
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietario" on public.dispositivi
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Ogni ora chiama la funzione "promemoria", che manda la notifica solo negli orari scelti
-- (sempre, anche se quel giorno hai già aperto l'app).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('promemoria-quaderno')
where exists (select 1 from cron.job where jobname = 'promemoria-quaderno');

select cron.schedule('promemoria-quaderno', '0 * * * *', $$
  select net.http_post(
    url := 'https://ebhaxdtdttfhsvrjjvgy.supabase.co/functions/v1/promemoria',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer INCOLLA_CRON_SECRET'),
    body := '{}'::jsonb
  );
$$);
