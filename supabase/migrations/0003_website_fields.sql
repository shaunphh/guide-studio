-- Guide Studio → the website (19 October 2026): the doc's website fields reach the site.
--
-- Run once in the Supabase SQL editor, after 0002_published.sql. It recreates the view with four more
-- columns; the grant is repeated so nothing changes about who reads it (the anon role, reading only).

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
  s ->> 'event'             as event,
  s ->> 'website'           as website,    -- the longer copy for the site; empty means the slide text is used
  s ->> 'pickNote'          as pick_note,  -- why the team picked it: the article's standfirst
  s ->> 'source'            as source,     -- a publication or organiser credited under the story
  s ->> 'link'              as link        -- the source's or tickets' address, a closing link
from guides g
cross join lateral jsonb_array_elements(g.issue -> 'stories') with ordinality as ord(s, n)
where g.published;

grant select on published_stories to anon, authenticated;
