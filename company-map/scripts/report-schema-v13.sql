-- Company map, database v13: counting the hours the way the phones actually work.
-- Applied on top of v12 as migrations dr_day_minutes_v13, dr_day_minutes_v13b_baseline_per_site,
-- dr_map_v13_per_site_tags_and_held and dr_hours_held_v13.
--
-- Sites said they had sent their check-ins and check-outs and the numbers still came out wrong. Nothing was lost: every
-- form is in dr_phone_log. Three faults in how the hours were counted from it.
--
-- 1. The wrong sum. A day's hours were the rise in "minutes all time" alone. "Minutes all time" is everything the phone
--    has ever sent to the hub, so a day's footage sits in "minutes saved locally" until the phone reaches the hub, and a
--    site that recorded all day and uploaded nothing read as zero. EGPlast read 0.0 hours on two days while its ten
--    phones were holding 33 and 28 hours between them. The sum is now:
--      recorded today = (rise in minutes all time) + (saved locally tonight - saved locally this morning)
--      uploaded today = (rise in minutes all time)
--      still held     = saved locally tonight
--    A phone with no earlier reading is taken to have started empty.
--
-- 2. The hours were frozen at the moment the check-out was sent. Skilled Trades sent their check-out eight minutes
--    before their check-in, so there was no morning reading to count from and the hours stored as nothing. 126.4 hours
--    were recorded as null and never looked at again. dr_recount now rebuilds hours, hours uploaded, hours held and the
--    phone count from the log, and both dr_submit and dr_checkin call it, so a check-in that lands after its check-out
--    corrects the check-out that is already stored.
--
-- 3. Phone tags are numbered per site, not once across the company: tags 1 to 10 belong to EGPlast, Panorama Sharm and
--    Panorama Tanta at the same time. dr_map matched phones by tag alone, so three sites' phone 1 collapsed into one and
--    two of them lost their phones off the map. Every lookup in dr_map and dr_day_minutes is now keyed on
--    (site_id, tag). The same mistake was in the first backfill and showed up as EGPlast reading 25.9 instead of 32.8.
--
-- What changed in the schema
--   dr_day_minutes(site, day) -> (recorded, uploaded, held, phones, held_phones, with_baseline)
--     the sum above, read straight off dr_phone_log. Internal: no grant to anon or authenticated.
--   dr_recount(site, day)
--     writes that sum onto the day's report. Returns early when the check-out listed no phone, so a report with an
--     empty ledger keeps whatever it was sent with. Internal.
--   dr_reports.hours_held numeric
--     what the phones are still holding tonight. Until now the pages worked this out as hours minus hours uploaded,
--     which is only right when the site started the day empty. dr_build sends it per site, per team, in the day totals
--     and in the thirty day history. The dashboard falls back to the subtraction for a row written before v13.
--   dr_reports.backlog
--     stays a count of phones holding footage, not hours. dr_recount sets it from the ledger.
--
-- Read this before changing the sum again
--   Hours uploaded can be larger than hours recorded, and that is not a fault: a phone can send footage it was holding
--     from an earlier day, so the day's upload covers more than the day's recording.
--   Minutes saved locally can be larger than minutes all time, and that is not a fault either: a phone that has never
--     reached the hub has sent nothing and is holding everything. An earlier version of the dashboard flagged this as a
--     bad reading and left those phones out of the totals. It was wrong and it is gone.
--   A check-in sent after midnight Cairo time is stored under the next day, which is what a calendar day means. The
--     check-out form asks which day it is for, so the pair can still be put back together.
--
-- The backfill, run once over every stored check-out
--   EGPlast 14 Sep            0.0 -> 32.8    3.28 hours a phone
--   MaxAB 14 Sep              2.4 -> 11.9    3.97 hours a phone
--   EGPlast 13 Sep            0.0 -> 28.5    2.85 hours a phone
--   Skilled Trades 13 Sep    null -> 126.4   3.95 hours a phone
--   197.2 hours that the database was carrying and not counting. Four site days landing between 2.85 and 3.97 hours a
--   phone is what corroborates the sum: they were counted separately and they agree.

create or replace function public.dr_day_minutes(p_site uuid, p_day date)
returns table(recorded numeric, uploaded numeric, held numeric, phones integer, held_phones integer, with_baseline integer)
language sql stable security definer set search_path to 'public' as $fn$
  with ev as (
    select l.tag, l.minutes_total as et, coalesce(l.minutes_local, 0) as el
    from public.dr_phone_log l
    where l.site_id = p_site and l.day = p_day and l.kind = 'evening'
  ),
  base as (
    select e.tag, e.et, e.el,
      coalesce(
        (select m.minutes_total from public.dr_phone_log m
          where m.site_id = p_site and m.tag = e.tag and m.day = p_day and m.kind = 'morning' and m.minutes_total is not null
          order by m.at desc limit 1),
        (select m.minutes_total from public.dr_phone_log m
          where m.site_id = p_site and m.tag = e.tag and m.day < p_day and m.minutes_total is not null
          order by m.day desc, m.at desc limit 1)) as mt,
      coalesce(
        (select m.minutes_local from public.dr_phone_log m
          where m.site_id = p_site and m.tag = e.tag and m.day = p_day and m.kind = 'morning' and m.minutes_local is not null
          order by m.at desc limit 1),
        (select m.minutes_local from public.dr_phone_log m
          where m.site_id = p_site and m.tag = e.tag and m.day < p_day and m.minutes_local is not null
          order by m.day desc, m.at desc limit 1)) as ml,
      exists (select 1 from public.dr_phone_log m
                where m.site_id = p_site and m.tag = e.tag
                  and (m.day < p_day or (m.day = p_day and m.kind = 'morning'))) as seen
    from ev e
  )
  select coalesce(sum(greatest(greatest(b.et - coalesce(b.mt, b.et), 0) + (b.el - coalesce(b.ml, 0)), 0)), 0),
         coalesce(sum(greatest(b.et - coalesce(b.mt, b.et), 0)), 0),
         coalesce(sum(b.el), 0),
         count(*)::int,
         count(*) filter (where b.el > 0)::int,
         count(*) filter (where b.seen)::int
  from base b;
$fn$;

alter table public.dr_reports add column if not exists hours_held numeric check (hours_held >= 0);

create or replace function public.dr_recount(p_site uuid, p_day date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare m record;
begin
  select * into m from public.dr_day_minutes(p_site, p_day);
  if m.phones = 0 then return; end if;
  update public.dr_reports r
     set hours = round(m.recorded / 60.0, 1),
         hours_uploaded = round(m.uploaded / 60.0, 1),
         hours_held = round(m.held / 60.0, 1),
         backlog = m.held_phones
   where r.site_id = p_site and r.day = p_day;
end $fn$;

revoke all on function public.dr_day_minutes(uuid, date) from anon, authenticated;
revoke all on function public.dr_recount(uuid, date) from anon, authenticated;

-- rebuild every stored check-out from the log
do $$
declare rec record;
begin
  for rec in select distinct site_id, day from public.dr_phone_log where kind = 'evening' loop
    perform public.dr_recount(rec.site_id, rec.day);
  end loop;
end $$;
