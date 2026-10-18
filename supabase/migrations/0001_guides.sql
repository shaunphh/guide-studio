-- Guide Studio — the team's shared library (18 October 2026).
--
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Then, in the dashboard:
--   Authentication → Providers → Email: keep it on (sign-in is by email link, no password).
--   Authentication → URL Configuration: Site URL https://shaunphh.github.io/guide-studio/ and, under
--     Redirect URLs, http://127.0.0.1:5193/ for the dev server. The link in the email goes back there.
--   Project Settings → API: the Project URL and the anon key go into the build (see .env.example).
--
-- Security model: the anon key is public (it ships in the page), so the policies below decide
-- everything. Only a signed-in email on the `team` guest list can read or write guides; anyone
-- can read the photos (the pages are published anyway). Add each teammate's email to `team`.

create table if not exists team (
  email     text primary key,                 -- lower case
  name      text,
  added_at  timestamptz not null default now()
);

-- One row per guide: the issue as Guide Studio saves it (photos as storage addresses, not data).
create table if not exists guides (
  id          text primary key,               -- the guide's own id, so a browser's copy and the row match
  name        text not null,
  series      text not null check (series in ('picks', 'new')),
  issue       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null                   -- the email that saved it
);

create index if not exists guides_updated_idx on guides (updated_at desc);

-- updated_at is the server's clock, so two browsers can tell whose copy is newer.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists guides_updated on guides;
create trigger guides_updated before update on guides for each row execute function set_updated_at();

-- Whether the signed-in email is on the guest list (security definer, so the check itself needs no policy).
create or replace function is_team() returns boolean language sql stable security definer as $$
  select exists (select 1 from team where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

alter table team enable row level security;
alter table guides enable row level security;

drop policy if exists "team reads team" on team;
create policy "team reads team" on team for select to authenticated using (is_team());

drop policy if exists "team reads guides" on guides;
create policy "team reads guides" on guides for select to authenticated using (is_team());
drop policy if exists "team adds guides" on guides;
create policy "team adds guides" on guides for insert to authenticated with check (is_team());
drop policy if exists "team changes guides" on guides;
create policy "team changes guides" on guides for update to authenticated using (is_team()) with check (is_team());
drop policy if exists "team removes guides" on guides;
create policy "team removes guides" on guides for delete to authenticated using (is_team());

-- The photos: a public bucket, written by the team. Each guide keeps its photos under its id.
insert into storage.buckets (id, name, public) values ('guides', 'guides', true) on conflict (id) do nothing;

drop policy if exists "anyone reads guide photos" on storage.objects;
create policy "anyone reads guide photos" on storage.objects for select using (bucket_id = 'guides');
drop policy if exists "team adds guide photos" on storage.objects;
create policy "team adds guide photos" on storage.objects for insert to authenticated with check (bucket_id = 'guides' and is_team());
drop policy if exists "team changes guide photos" on storage.objects;
create policy "team changes guide photos" on storage.objects for update to authenticated using (bucket_id = 'guides' and is_team());
drop policy if exists "team removes guide photos" on storage.objects;
create policy "team removes guide photos" on storage.objects for delete to authenticated using (bucket_id = 'guides' and is_team());

-- The guest list. Replace these with the team's emails (lower case), one row each; add more any time.
insert into team (email, name) values
  ('you@example.com', 'Your name')
on conflict (email) do nothing;
