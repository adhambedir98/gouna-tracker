-- Company map, database v16: the day's hours are the minutes each site counts, typed in, not derived.
-- Applied on top of v15 as migration dr_day_v16_recorded_is_what_the_site_counts.
--
-- Why the derived numbers could never be made to agree. On 16 Sep the sites counted their day by hand, phone by phone,
-- after deleting the bad videos. Against what the two phone readings gave, no sum was right at more than two sites:
--
--   site         hand count   (all time + local) delta   all time delta   local tonight   check-out sent
--   Ramsis          119.0            137.6                   169.0            118.2        Wed 22:33
--   Gouna           110.0              0.6                     0.0              0.6        Wed 22:44   one phone typed of 20
--   Sharm            89.0            109.2                   106.5            151.0        Wed 23:19
--   Tanta            75.0            139.1                    83.7             56.0        Thu 00:27   last reading two days back
--   EGPlast          46.5             42.9                     0.0            115.9        Wed 23:06   all time unchanged four nights
--   MaxAB           115.6             90.5                    27.0             91.5        Wed 12:53   11 of 20 tags never read before
--   Sallab          321.0            375.2                   329.3            429.4        Thu 08:21   read after the overnight upload
--
-- Three of the sites match three different columns. Ramsis reads before plugging in with the phones cleared, so what
-- is on the phone tonight is the day. Sallab reads the next morning after the upload, so the rise in all time is the
-- day. EGPlast has not uploaded since the 14th, so the rise in local is the day. The readings are taken at midday, in
-- the evening, after midnight, the next morning and the next noon, the bad videos are deleted before the reading at
-- some sites and after it at others, tags rotate at MaxAB, Tanta skipped a night, Gouna typed one phone. No formula
-- over two numbers read at seven different moments lands on a count taken at one.
--
-- The readings themselves are not wrong. EGPlast phone 1 over four nights (all time, local): (0, 217), (217, 127),
-- (217, 346), (217, 585). The 217 uploaded once and the phone has held everything since. Minutes all time is what has
-- reached a hub, minutes saved locally is what is on the phone, uploading moves minutes from one to the other. The
-- trouble is only ever WHEN the two are read and what was deleted in between.
--
-- So the check-out now asks for the number the site already counts: the minutes each phone recorded today, after the
-- bad videos are deleted. The day is that column added up, and it agrees with the hand count because it is the hand
-- count. Minutes saved locally stays, as the pending figure. Minutes all time is not asked for.
--
--   dr_phone_log.minutes_recorded numeric   what the phone recorded today, per the site
--   dr_phone_log.minutes_total              now nullable: the form no longer sends it, the history keeps it
--   dr_phone_rows(p)                        recorded is required, by the name 'minutes recorded are missing'
--   dr_day_minutes(site, day)               recorded = sum of minutes_recorded, pending = sum of minutes_local
--   dr_recount(site, day)                   leaves a day alone when none of its rows carries minutes_recorded, so
--                                           the days before this change keep the hours they have
--   dr_map                                  a phone's day is its minutes_recorded; a day from before falls back to the
--                                           old estimate so the dots do not go blank
--   dr_reports.hours_uploaded, phones_new   no longer written; the columns stay for the history
--
-- 16 Sep was written over with the hand counts above, by hand, in dr_reports.hours only. The log is untouched.
--
-- If the phone readings are ever to be used as a cross-check, every site has to take them at the same moment: after
-- the bad videos are deleted, before the phones are plugged in. Until then they are what they are.

alter table public.dr_phone_log add column if not exists minutes_recorded numeric check (minutes_recorded >= 0);
alter table public.dr_phone_log alter column minutes_total drop not null;

drop function if exists public.dr_day_minutes(uuid, date);
create function public.dr_day_minutes(p_site uuid, p_day date)
returns table(recorded numeric, pending numeric, phones integer, pending_phones integer, with_recorded integer)
language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(sum(l.minutes_recorded), 0),
         coalesce(sum(coalesce(l.minutes_local, 0)), 0),
         count(*)::int,
         count(*) filter (where coalesce(l.minutes_local, 0) > 0)::int,
         count(*) filter (where l.minutes_recorded is not null)::int
  from public.dr_phone_log l
  where l.site_id = p_site and l.day = p_day and l.kind = 'evening';
$fn$;

create or replace function public.dr_recount(p_site uuid, p_day date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare m record;
begin
  select * into m from public.dr_day_minutes(p_site, p_day);
  if m.phones = 0 or m.with_recorded = 0 then return; end if;
  update public.dr_reports r
     set hours = round(m.recorded / 60.0, 1),
         hours_uploaded = null,
         hours_held = round(m.pending / 60.0, 1),
         backlog = m.pending_phones,
         phones_new = null
   where r.site_id = p_site and r.day = p_day;
end $fn$;

revoke all on function public.dr_day_minutes(uuid, date) from anon, authenticated;
revoke all on function public.dr_recount(uuid, date) from anon, authenticated;
