-- =============================================================================
-- Cloud9 analytics — the documented metric set.
--
-- Run these in the Supabase SQL editor. Each block is standalone: highlight one
-- and run it. The definitions live here, in version control, so they cannot
-- drift the way the schema did — if a number is ever disputed, this file is the
-- answer to "how was it calculated".
--
-- TWO DATA SOURCES, and the difference matters:
--   * BACKFILLABLE  — computed from tables that already existed (users, trips,
--                     chat_messages). These cover the app's whole history.
--   * FROM 2026-08-04 — computed from user_events / login_events, which only
--                     started recording on that date. Searches and selections
--                     (the funnel middle) have no history before it.
-- Every query below says which it is. Do not compare a backfilled series with
-- an event-based one across that boundary.
--
-- PRICING for the cost queries (USD per million tokens, Opus 5 with 1h cache):
--   input $5.00 · cache read $0.50 · cache write $10.00 · output $25.00
-- Output INCLUDES adaptive thinking. Keep in sync with lib/chat/rate-limit.ts.
-- =============================================================================


-- =============================================================================
-- 1. THE HEADLINE METRIC — conversation-to-selection, paired with cost
--    Source: user_events (from 2026-08-04) + diag_events (historical)
--
-- The single number that says whether the unit economics work. At ~$0.98 of
-- Anthropic spend per conversation, the question is not "do people chat" but
-- "does chatting turn into a hotel selection often enough to pay for itself".
--
-- Defined on STAYS ONLY, deliberately: that is where the margin is (~€98 per
-- hotel on the planned pricing model) and where a selection is closest to
-- intent to book. An attraction can be selected out of curiosity.
--
-- READ THE TWO NUMBERS TOGETHER. A 40% selection rate is meaningless if each
-- selection costs $12 of API spend, and $2 per selection is meaningless if
-- almost nobody selects. Compare cost_per_stay_selection against the ~€98
-- hypothetical hotel margin — and remember selection is not yet booking, so
-- this is an UPPER bound on revenue per selection.
-- =============================================================================
with window_bounds as (
  select now() - interval '30 days' as since        -- ← change the period here
),
spend as (
  select coalesce(sum(
    ( coalesce((detail->>'input')::numeric, 0)       * 5.00
    + coalesce((detail->>'cache_read')::numeric, 0)  * 0.50
    + coalesce((detail->>'cache_write')::numeric, 0) * 10.00
    + coalesce((detail->>'output')::numeric, 0)      * 25.00
    ) / 1000000.0
  ), 0) as usd
  from public.diag_events, window_bounds
  where kind = 'chat_usage' and at >= since
),
funnel as (
  select
    count(distinct trip_id) filter (where event_type = 'stay_search')  as trips_shopping_hotels,
    count(distinct trip_id) filter (where event_type = 'offer_selected'
                                      and payload->>'itemType' = 'stay') as trips_with_stay_selection,
    count(*) filter (where event_type = 'offer_selected'
                       and payload->>'itemType' = 'stay')              as stay_selections
  from public.user_events, window_bounds
  where at >= since
)
select
  f.trips_shopping_hotels,
  f.trips_with_stay_selection,
  case when f.trips_shopping_hotels = 0 then null
       else round(100.0 * f.trips_with_stay_selection / f.trips_shopping_hotels, 1)
  end                                                        as conversion_pct,
  round(s.usd, 2)                                            as anthropic_spend_usd,
  case when f.stay_selections = 0 then null
       else round(s.usd / f.stay_selections, 2)
  end                                                        as cost_per_stay_selection_usd
from funnel f, spend s;


-- =============================================================================
-- 2. THE FUNNEL AND WHERE PEOPLE DROP OFF
--    Source: user_events (from 2026-08-04)
--
-- Each row is a stage; `trips` counts distinct conversations that reached it.
-- Read the fall between consecutive rows as the drop-off — the biggest gap is
-- where to spend product effort.
-- =============================================================================
select stage, trips,
       round(100.0 * trips / nullif(max(trips) over (), 0), 1) as pct_of_widest_stage
from (
  select '1. trip created'      as stage, count(distinct trip_id) as trips
    from public.user_events where event_type = 'trip_created'  and at >= now() - interval '30 days'
  union all
  select '2. searched hotels',  count(distinct trip_id)
    from public.user_events where event_type = 'stay_search'   and at >= now() - interval '30 days'
  union all
  select '3. saved a favourite', count(distinct trip_id)
    from public.user_events where event_type = 'favorite_added' and at >= now() - interval '30 days'
  union all
  select '4. selected a stay',  count(distinct trip_id)
    from public.user_events where event_type = 'offer_selected'
      and payload->>'itemType' = 'stay' and at >= now() - interval '30 days'
) s
order by stage;


-- =============================================================================
-- 3. SIGNUPS PER DAY
--    Source: users.created_at — BACKFILLABLE, covers all history.
--
-- login_events.is_first will agree with this going forward; users.created_at is
-- authoritative for anything before 2026-08-04.
-- =============================================================================
-- The window's ORDER BY must be the SAME expression as the GROUP BY, including
-- the ::date cast — otherwise Postgres treats it as an ungrouped reference to
-- users.created_at and rejects the query.
select date_trunc('day', created_at)::date as day,
       count(*)                            as signups,
       sum(count(*)) over (order by date_trunc('day', created_at)::date) as cumulative_users
from public.users
group by 1
order by 1 desc
limit 60;


-- =============================================================================
-- 4. RETENTION — did they come back after 7 and 30 days?
--    Source: users + chat_messages — BACKFILLABLE, covers all history.
--
-- "Returned" = sent at least one message on or after day N. Chat messages are
-- used rather than user_events precisely so this works over the full history.
-- Cohorts younger than the window are EXCLUDED (shown as null), because a user
-- who signed up yesterday cannot yet have a 7-day return and counting them as
-- a failure would understate retention.
-- =============================================================================
with cohorts as (
  select u.id,
         date_trunc('week', u.created_at)::date as cohort_week,
         u.created_at
  from public.users u
),
activity as (
  select c.id, c.cohort_week, c.created_at,
         max(m.created_at) as last_seen
  from cohorts c
  left join public.chat_messages m
    on m.user_id = c.id and m.role = 'user'
  group by 1, 2, 3
)
select cohort_week,
       count(*) as users,
       case when min(created_at) > now() - interval '7 days'  then null
            else round(100.0 * count(*) filter (
                   where last_seen >= created_at + interval '7 days') / count(*), 1)
       end as d7_pct,
       case when min(created_at) > now() - interval '30 days' then null
            else round(100.0 * count(*) filter (
                   where last_seen >= created_at + interval '30 days') / count(*), 1)
       end as d30_pct
from activity
group by 1
order by 1 desc;


-- =============================================================================
-- 5. TRIPS PER USER
--    Source: trips — BACKFILLABLE.
--
-- The average is skewed by heavy testing accounts; the median is the honest
-- summary of a typical user. Watch `trips_with_no_messages` — an empty trip is
-- a conversation that was started and immediately abandoned.
-- =============================================================================
with per_user as (
  select user_id, count(*) as cnt from public.trips group by 1
)
select
  (select count(*) from per_user)                                  as users_with_trips,
  (select count(*) from public.trips)                              as trips,
  round(avg(cnt), 2)                                               as mean_trips_per_user,
  percentile_cont(0.5) within group (order by cnt)                 as median_trips_per_user,
  max(cnt)                                                         as max_trips_per_user,
  (select count(*) from public.trips t
    where not exists (select 1 from public.chat_messages m where m.trip_id = t.id))
                                                                   as trips_with_no_messages
from per_user;


-- =============================================================================
-- 6. MESSAGES PER CONVERSATION
--    Source: chat_messages — BACKFILLABLE.
--
-- User turns only (role='user'), because that is what costs money: one turn is
-- one model call, ~$0.074. `p95_turns` is the number to size rate limits
-- against — throttling below it throttles genuine users.
-- =============================================================================
select
  count(*)                                                     as conversations,
  round(avg(turns), 1)                                         as mean_turns,
  percentile_cont(0.5)  within group (order by turns)          as median_turns,
  percentile_cont(0.95) within group (order by turns)          as p95_turns,
  max(turns)                                                   as max_turns,
  round(avg(turns) * 0.074, 2)                                 as est_usd_per_conversation
from (
  select trip_id, count(*) as turns
  from public.chat_messages
  where role = 'user' and trip_id is not null
  group by 1
) c;


-- =============================================================================
-- 7. LOGIN ACTIVITY
--    Source: login_events (from 2026-08-04).
--
-- NOTE: sessions are stateless JWTs, so this records real SIGN-INS, not visits.
-- An already-signed-in user returning daily produces NO rows here. Use query 4
-- for engagement; use this for signups and account security.
-- =============================================================================
select date_trunc('day', at)::date        as day,
       count(*)                           as sign_ins,
       count(*) filter (where is_first)   as first_ever,
       count(distinct user_id)            as distinct_users
from public.login_events
group by 1
order by 1 desc
limit 60;


-- =============================================================================
-- 8. DATA HEALTH — run this before trusting any number above
--
-- An empty funnel has two very different causes: nobody used the product, or
-- the analytics are broken. This tells them apart. `analytics_failed` should be
-- ZERO; anything else names the table and the Postgres error.
-- =============================================================================
select event_type, count(*) as events, max(at) as most_recent
from public.user_events
group by 1
order by 2 desc;

select kind, count(*) as failures, max(at) as most_recent
from public.diag_events
where kind = 'analytics_failed' and at >= now() - interval '30 days'
group by 1;
