-- Quaderno di Kristian: tabella dei dati con accesso riservato al proprietario.
-- Incolla tutto in Supabase > SQL Editor > New query e premi Run.

create table if not exists public.quaderno (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.quaderno enable row level security;

-- Nessun accesso per chi non ha fatto login; ognuno vede e modifica solo la propria riga.
revoke all on public.quaderno from anon;
grant select, insert, update, delete on public.quaderno to authenticated;

drop policy if exists "proprietario legge" on public.quaderno;
drop policy if exists "proprietario inserisce" on public.quaderno;
drop policy if exists "proprietario modifica" on public.quaderno;
drop policy if exists "proprietario elimina" on public.quaderno;

create policy "proprietario legge" on public.quaderno
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "proprietario inserisce" on public.quaderno
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "proprietario modifica" on public.quaderno
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietario elimina" on public.quaderno
  for delete to authenticated using ((select auth.uid()) = user_id);
