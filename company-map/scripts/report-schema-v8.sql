-- Company map, database v8 (migration "daily_reports_v8_morning_phone_rows"): the morning check-in can write its phone rows.
-- Applied on top of v7k.
--
-- What was wrong: the phone ledger is written from both ends of the day. The evening check-out writes its rows against the report
-- it just made, and the morning check-in writes its rows against the check-in it just made. The column holding the report was left
-- not null from the days when only the evening wrote to this table, so every morning check-in that listed a phone failed with
--   null value in column "report_id" of relation "dr_phone_log" violates not-null constraint
-- and the site was told nothing useful. Nobody had sent a check-in, a report or an incident before this was found, so the ledger
-- was empty and no day was lost.
--
-- Follow-ups deployed on top of the text below, in this order:
--   v8b (migration "daily_reports_v8b_admin_day_undo"): dr_admin takes the action 'day_undo' with { site_id, day, what, by },
--       where what is 'checkin', 'report' or 'incident'. A submission sent for the wrong site or the wrong day can be taken off
--       by management, and the log keeps the fact that it was. The live round trip in scripts/report-smoke.mjs uses it to leave
--       the day exactly as it found it.
--   v8c (migration "daily_reports_v8c_undo_clears_its_log_line"): taking a submission off also takes off the log line that says
--       it arrived, so the log does not claim something that is not there. The line saying it was taken off stays.
--   v8d (migration "daily_reports_v8d_undo_log_column"): the log points at a row through "ref", not "ref_id".

-- 1. A morning row belongs to a check-in, an evening row belongs to a report, and exactly one of the two owns any row.
alter table public.dr_phone_log alter column report_id drop not null;
alter table public.dr_phone_log drop constraint if exists dr_phone_log_one_owner;
alter table public.dr_phone_log add constraint dr_phone_log_one_owner
  check ((report_id is not null) <> (checkin_id is not null));

-- 2. The two ways this table is read: by the check-in it belongs to, and by phone across days (the evening counts a day by
--    taking the morning reading away from the evening one).
create index if not exists dr_phone_log_checkin on public.dr_phone_log (checkin_id);
create index if not exists dr_phone_log_day_tag on public.dr_phone_log (tag, day);

-- 3. The undo action, as it stands after v8b to v8d. It sits inside dr_admin, which is guarded by the management code.
--
--   elsif p_action = 'day_undo' then
--     if coalesce(p->>'site_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
--     if coalesce(p->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
--     if coalesce(p->>'what', '') not in ('checkin', 'report', 'incident') then raise exception 'unknown action'; end if;
--     if p->>'what' = 'checkin' then
--       delete from public.dr_log where ref in (select id from public.dr_checkins where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date);
--       delete from public.dr_checkins where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date;
--     elsif p->>'what' = 'report' then
--       delete from public.dr_log where ref in (select id from public.dr_reports where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date);
--       delete from public.dr_reports where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date;
--     else
--       delete from public.dr_log where ref in (select id from public.dr_incidents where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date);
--       delete from public.dr_incidents where site_id = (p->>'site_id')::uuid and day = (p->>'day')::date;
--     end if;
--     perform public.dr_log_add('undo', (case p->>'what' when 'checkin' then 'Morning check-in' when 'report' then 'Evening check-out' else 'Incident' end)
--       || ' taken off: ' || coalesce((select name from public.dr_sites where id = (p->>'site_id')::uuid), 'a site') || ', ' || (p->>'day'), coalesce(p->>'by', 'management'));
--     return jsonb_build_object('ok', true);
