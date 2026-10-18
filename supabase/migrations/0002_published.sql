-- Guide Studio → the website (18 October 2026): a Published tick on a guide, and a view the site reads.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run), after 0001_guides.sql.
-- Then nothing else in the dashboard: the site reads `published_stories` with the same anon key the tool
-- ships, and the policies below keep everything else as it was (team-only).

-- The tick: saved with the guide by Save to team. Only published guides' stories reach the view.
alter table guides add column if not exists published boolean not null default false;

-- The site's view: one row per story of a published guide, only the fields the website shows.
-- No emails (updated_by stays on the table), no cover, no drafts. A view runs with its owner's rights,
-- so the guides table's team-only policies don't apply to it; the grant below is what opens it, and
-- only for reading.
create or replace view published_stories as
select
  g.id                      as guide_id,
  g.name                    as guide_name,
  g.series                  as series,
  g.updated_at              as updated_at,
  ord.n                     as position,
  s ->> 'id'                as id,
  s ->> 'title'             as title,
  s ->> 'body'              as body,
  s ->> 'handle'            as handle,
  s ->> 'date'              as date,
  s ->> 'time'              as time,
  s ->> 'venue'             as venue,
  s ->> 'photo'             as photo,
  s ->> 'alt'               as alt,
  s ->> 'credit'            as credit,
  s ->> 'section'           as section,
  s ->> 'event'             as event
from guides g
cross join lateral jsonb_array_elements(g.issue -> 'stories') with ordinality as ord(s, n)
where g.published;

grant select on published_stories to anon, authenticated;
