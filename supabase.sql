-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- Each screening is stored whole, as JSON, in a `data` column. The app has
-- grown new fields repeatedly (posters, genres, director, IMDb ids) and this
-- way the database never needs a migration to keep up with it.

create table if not exists nights (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- "Up Next" is a single row, always id 1, so there is nothing to reconcile
-- between visitors.
create table if not exists next_up (
  id   int primary key,
  data jsonb not null default '{}'::jsonb
);

insert into next_up (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Row-level security ON with no policies means nothing can read or write
-- these tables using the public anon key. The site's own /api routes use the
-- service role key, which bypasses RLS, so they remain the only way in --
-- and they allow exactly the operations the tracker needs, nothing more.
alter table nights  enable row level security;
alter table next_up enable row level security;

-- ---------------------------------------------------------------------------
-- ONLY if your Vercel project has no SUPABASE_SERVICE_ROLE_KEY and you are
-- falling back to the anon key, run the block below as well. It opens both
-- tables to anyone holding that key, which is the same trade-off the tracker
-- has always made -- but prefer adding the service role key instead.
-- ---------------------------------------------------------------------------
--
-- create policy "open access" on nights  for all using (true) with check (true);
-- create policy "open access" on next_up for all using (true) with check (true);
