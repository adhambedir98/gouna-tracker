-- Company map, database v14: the morning stops counting phones, and the day stands on two numbers.
-- Applied on top of v13 as migrations dr_day_v14_two_numbers_and_no_morning_ledger and dr_map_v14_two_numbers.
--
-- v13 counted a day as the rise in minutes all time plus the change in what the phone was holding. That is right on
-- paper and it needs two readings of the same phone taken at the right moments. In practice the morning reading is
-- what goes wrong: sites typed it a day late with the next day's numbers, or typed it after the check-out it is
-- supposed to come before, and one unreconcilable pair turned a real day into a zero. So the morning stops reading
-- phones at all, and the day is counted from the only reading anybody takes carefully: the evening check-out.
--
-- The two numbers
--   Hours recorded today = minutes all time tonight, minus minutes all time at that phone's last reading before today.
--   Hours pending upload = minutes saved locally tonight.
--   A site's day is each summed over its phones and divided by 60. The dashboard adds those per channel and per day.
--
-- What a first reading records: nothing. A phone's minutes all time on its first check-out are its whole life, not its
-- day, and there is nothing to subtract from. Counting it would have read Sallab Factory's first evening as 2,876
-- hours. Its minutes saved locally still count as pending, because that is a fact about tonight either way.
--
-- Hours recorded are the hours that reached a hub. dr_reports.hours and dr_reports.hours_uploaded are now the same
-- number and dr_recount writes both, so nothing that reads the older column gets a surprise. No page shows it twice.
--
-- The morning check-in
--   Four things: what time recording started, how many phones are recording, how many are down, how many employees are
--   present. The opt-in rate is the phones against the people present, and the form works it out while it is typed.
--   dr_checkin no longer writes to dr_phone_log and no longer calls dr_recount: it cannot change any count. Phone rows
--   sent by a stale form are ignored rather than refused, so a cached page cannot fail on a site at a gate.
--   phones_deployed is now typed and required, where it used to be the length of the phone list.
--
-- dr_form_options.phones is the tag list the evening check-out starts from. It used to prefer today's check-in list and
--   fall back to the last check-out. There is no check-in list any more, so it is the last check-out, full stop.
--
-- The rows already in dr_phone_log from when the morning did carry a ledger are kept. They are still the phone's last
--   known reading on their day, and the baseline lookup takes them when that day has no check-out. Within one earlier
--   day it takes the check-out first and only then whatever else that day left behind, because a check-out is the
--   phone's later state whatever order the two forms were typed in.
--
-- Every stored check-out was recounted on the new sum. What the days read now:
--   Panorama Ramsis 15 Sep   196.1 recorded   132.2 pending    5.16 a phone
--   Skilled Trades 14 Sep    134.1 recorded     0.0 pending    4.19 a phone
--   EGPlast 14 Sep            28.4 recorded    32.8 pending    2.84 a phone
--   MaxAB 15 Sep               9.7 recorded    95.7 pending
--   Sallab Factory 15 Sep      0.0 recorded   410.4 pending    first reading, nothing to count from
--   EGPlast 13 Sep             0.0 recorded    28.5 pending    first reading
--   Skilled Trades 13 Sep      0.0 recorded     0.0 pending    first reading
--
-- The two faults v13 was carrying are gone with the morning ledger: EGPlast's 14 Sep no longer reads zero because of a
-- check-in typed on the 15th, and there is no morning baseline left for anybody to type late.

drop function if exists public.dr_day_minutes(uuid, date);
create function public.dr_day_minutes(p_site uuid, p_day date)
returns table(recorded numeric, pending numeric, phones integer, pending_phones integer, with_baseline integer)
language sql stable security definer set search_path to 'public' as $fn$
  with ev as (
    select l.tag, l.minutes_total as et, coalesce(l.minutes_local, 0) as el
    from public.dr_phone_log l
    where l.site_id = p_site and l.day = p_day and l.kind = 'evening'
  ),
  base as (
    select e.tag, e.et, e.el,
      -- the phone's last reading before today: that day's check-out, else whatever else it left behind
      (select m.minutes_total from public.dr_phone_log m
        where m.site_id = p_site and m.tag = e.tag and m.day < p_day and m.minutes_total is not null
        order by m.day desc, (m.kind = 'evening') desc, m.at desc limit 1) as was
    from ev e
  )
  select coalesce(sum(greatest(b.et - b.was, 0)) filter (where b.was is not null), 0),
         coalesce(sum(b.el), 0),
         count(*)::int,
         count(*) filter (where b.el > 0)::int,
         count(*) filter (where b.was is not null)::int
  from base b;
$fn$;

create or replace function public.dr_recount(p_site uuid, p_day date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare m record; h numeric;
begin
  select * into m from public.dr_day_minutes(p_site, p_day);
  if m.phones = 0 then return; end if;
  h := round(m.recorded / 60.0, 1);
  update public.dr_reports r
     set hours = h, hours_uploaded = h,
         hours_held = round(m.pending / 60.0, 1),
         backlog = m.pending_phones
   where r.site_id = p_site and r.day = p_day;
end $fn$;

revoke all on function public.dr_day_minutes(uuid, date) from anon, authenticated;
revoke all on function public.dr_recount(uuid, date) from anon, authenticated;

-- rebuild every stored check-out on the new sum
do $$
declare rec record;
begin
  for rec in select distinct site_id, day from public.dr_phone_log where kind = 'evening' loop
    perform public.dr_recount(rec.site_id, rec.day);
  end loop;
end $$;
