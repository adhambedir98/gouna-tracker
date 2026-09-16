-- Company map, database v15: a day is everything the phone has, now against last night.
-- Applied on top of v14 as migrations dr_day_v15_recorded_is_everything_the_phone_has and dr_map_and_build_v15.
--
-- v14 counted a day as the rise in minutes all time. Minutes all time is what has reached a hub, and the phones upload
-- overnight, so that rise is last night's upload, which is the PREVIOUS day's filming. A day counted that way is a day
-- behind and misses everything still sitting on the phone. Sites were reporting two to three hundred hours and seeing
-- a fraction of it.
--
-- Everything a phone has ever shot is minutes all time plus minutes saved locally, so:
--
--   hours recorded today = (all time + saved locally) tonight  minus  (all time + saved locally) at its last check-out
--   hours pending upload = saved locally tonight
--
-- The overnight upload moves minutes from one column to the other and cancels out of the first line. That is the whole
-- point of adding the two together.
--
-- A phone whose total goes down, footage deleted before it ever reached a hub, records nothing rather than a negative,
-- clamped per phone so one bad reading cannot eat another phone's day.
--
-- The second fault, worth more than the first at some sites
--   A phone whose tag has never been read at that site before is taken to have arrived empty: nothing saved on it, and
--   its minutes all time are its own history, not this site's day. So the baseline is (its own all time, zero) and what
--   it is holding tonight is what it shot today. This is the same line, not a special case.
--   It matters because tags rotate. MaxAB read 20 phones on 16 Sep and 11 of those tags had never been read there
--   before; on 15 Sep it was 19 of 20. Counting them as zero was throwing away most of the site's day. dr_reports
--   carries phones_new so the dashboard can say so on the site's row, because rotating tags also means the hours
--   cannot be followed phone by phone and somebody should decide whether that is intended.
--
-- Hours uploaded is a real and different number again: the rise in minutes all time alone. It is stored, and no page
-- shows it, because two numbers is what the day is judged on.
--
-- Every stored check-out was recounted. Hours a phone a day, which is the tell that a sum is right:
--   MaxAB 16 Sep            90.5 recorded    91.5 pending    4.53 a phone   11 of 20 tags new
--   Skilled Trades 16 Sep  131.5 recorded     0.0 pending    4.11 a phone
--   MaxAB 15 Sep           102.9 recorded    95.7 pending    5.15 a phone   19 of 20 tags new
--   Panorama Ramsis 15 Sep  79.5 recorded   132.2 pending    2.09 a phone   baseline is a morning row from the 13th
--   EGPlast 15 Sep          40.1 recorded    73.0 pending    4.01 a phone
--   EGPlast 14 Sep          32.8 recorded    32.8 pending    3.28 a phone
--   Skilled Trades 14 Sep  134.1 recorded     0.0 pending    4.19 a phone
--   Sallab Factory 15 Sep  410.4 recorded   410.4 pending    6.84 a phone   its first night, all 60 tags new
--   Under v14 the same days read 0.00, 4.11, 0.48, 5.16, 0.00, 2.84, 4.19 and nothing: noise.
--
-- What to watch, because the sum cannot tell these apart
--   A phone that arrives at a site already holding footage from somewhere else has that footage counted as today's.
--     Sallab Factory's first night is the case to look at: 6.84 hours a phone across 60 phones that had never been
--     read, which is a long day if it is real and a backlog if it is not.
--   A site that skips a night has two days of filming land on the night it comes back, because the baseline is the
--     phone's last reading whenever that was, not yesterday by the calendar.
--   Panorama Ramsis still counts against a morning row from 13 Sep, the last reading those phones have. Morning rows
--     are not collected any more, so this fades as each site sends its next check-out.

drop function if exists public.dr_day_minutes(uuid, date);
create function public.dr_day_minutes(p_site uuid, p_day date)
returns table(recorded numeric, uploaded numeric, pending numeric, phones integer, pending_phones integer, new_phones integer)
language sql stable security definer set search_path to 'public' as $fn$
  with ev as (
    select l.tag, l.minutes_total as et, coalesce(l.minutes_local, 0) as el
    from public.dr_phone_log l
    where l.site_id = p_site and l.day = p_day and l.kind = 'evening'
  ),
  base as (
    select e.tag, e.et, e.el,
      (select m.minutes_total from public.dr_phone_log m
        where m.site_id = p_site and m.tag = e.tag and m.day < p_day and m.minutes_total is not null
        order by m.day desc, (m.kind = 'evening') desc, m.at desc limit 1) as wt,
      (select m.minutes_local from public.dr_phone_log m
        where m.site_id = p_site and m.tag = e.tag and m.day < p_day and m.minutes_local is not null
        order by m.day desc, (m.kind = 'evening') desc, m.at desc limit 1) as wl
    from ev e
  )
  select coalesce(sum(greatest((b.et + b.el) - (coalesce(b.wt, b.et) + coalesce(b.wl, 0)), 0)), 0),
         coalesce(sum(greatest(b.et - coalesce(b.wt, b.et), 0)), 0),
         coalesce(sum(b.el), 0),
         count(*)::int,
         count(*) filter (where b.el > 0)::int,
         count(*) filter (where b.wt is null)::int
  from base b;
$fn$;

alter table public.dr_reports add column if not exists phones_new integer check (phones_new >= 0);

create or replace function public.dr_recount(p_site uuid, p_day date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare m record;
begin
  select * into m from public.dr_day_minutes(p_site, p_day);
  if m.phones = 0 then return; end if;
  update public.dr_reports r
     set hours = round(m.recorded / 60.0, 1),
         hours_uploaded = round(m.uploaded / 60.0, 1),
         hours_held = round(m.pending / 60.0, 1),
         backlog = m.pending_phones,
         phones_new = m.new_phones
   where r.site_id = p_site and r.day = p_day;
end $fn$;

revoke all on function public.dr_day_minutes(uuid, date) from anon, authenticated;
revoke all on function public.dr_recount(uuid, date) from anon, authenticated;

do $$
declare rec record;
begin
  for rec in select distinct site_id, day from public.dr_phone_log where kind = 'evening' loop
    perform public.dr_recount(rec.site_id, rec.day);
  end loop;
end $$;
