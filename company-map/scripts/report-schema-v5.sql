-- v5 (migration "daily_reports_v5_phone_ledger_both_ends"): the phone ledger on the morning check-in too, tags as numbers, and prefill.
-- Applied on top of v1 to v4. Everything here is create or replace.
--
--   dr_phone_log: kind ('morning' or 'evening'), checkin_id (the morning rows hang off the check-in, the evening rows off the report)
--   settings: phones_max (the highest phone tag, 270): a tag is a whole number from 1 to phones_max, nothing else is accepted
--   dr_form_options(): phones_max, and per active site the tags to prefill: today's morning rows, else the latest evening rows
--   dr_checkin(p): takes phones [{tag, total, local}] like the evening form; phones recording defaults to the number of rows
--   dr_submit(p): the day's minutes per phone are the rise since the same day's morning row when there is one, else since the last row of any kind;
--     a tag listed twice in one form, or outside 1 to phones_max, is refused

alter table public.dr_phone_log add column if not exists kind text not null default 'evening';
alter table public.dr_phone_log add column if not exists checkin_id uuid references public.dr_checkins(id) on delete cascade;
create index if not exists dr_phone_log_tag_day on public.dr_phone_log (tag, day desc);
insert into public.dr_settings (key, value) values ('phones_max', '270') on conflict (key) do nothing;

create or replace function public.dr_form_options() returns jsonb
language sql stable security definer set search_path = public as $$
  with cairo as (select (now() at time zone 'Africa/Cairo')::date as today),
  latest as (
    -- for each active site: today's morning rows if any, else the most recent evening rows
    select s.id as site_id,
      coalesce(
        (select jsonb_build_object('day', l.day, 'kind', 'morning', 'tags', jsonb_agg(l.tag order by l.position)) from public.dr_phone_log l, cairo
           where l.site_id = s.id and l.kind = 'morning' and l.day = cairo.today group by l.day),
        (select jsonb_build_object('day', x.day, 'kind', 'evening', 'tags', (select jsonb_agg(l.tag order by l.position) from public.dr_phone_log l where l.site_id = s.id and l.kind = 'evening' and l.day = x.day))
           from (select max(day) as day from public.dr_phone_log where site_id = s.id and kind = 'evening') x where x.day is not null)
      ) as phones
    from public.dr_sites s where s.active)
  select jsonb_build_object(
    'sites', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'team', team, 'lead', lead, 'lead_id', lead_id, 'pm_id', pm_id, 'area', area, 'city', city) order by team, sort, name), '[]'::jsonb) from public.dr_sites where active),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'team', team, 'site_id', site_id) order by sort, name), '[]'::jsonb)
        from public.dr_people where active and role in ('management', 'portfolio-manager', 'site-lead', 'partner', 'planning')),
    'reporters', (select coalesce(jsonb_agg(name order by sort, name), '[]'::jsonb) from public.dr_people where active and role in ('management', 'portfolio-manager', 'site-lead', 'partner', 'planning')),
    'deadline', coalesce((select value from public.dr_settings where key = 'deadline'), '18:00'),
    'checkin_deadline', coalesce((select value from public.dr_settings where key = 'checkin_deadline'), '09:00'),
    'phones_max', coalesce((select value from public.dr_settings where key = 'phones_max'), '270')::int,
    'phones', (select coalesce(jsonb_object_agg(site_id, phones), '{}'::jsonb) from latest where phones is not null));
$$;

-- the ledger rows of one form, checked: whole-number tags from 1 to phones_max, each once, both numbers present
create or replace function public.dr_phone_rows(p jsonb) returns table (pos int, tag text, mins_total numeric, mins_local numeric)
language plpgsql stable security definer set search_path = public as $$
declare ph jsonb; i int := 0; t text; mx int := coalesce((select value from public.dr_settings where key = 'phones_max'), '270')::int; seen text[] := '{}';
begin
  if jsonb_typeof(p->'phones') <> 'array' then return; end if;
  for ph in select * from jsonb_array_elements(p->'phones') loop
    t := btrim(coalesce(ph->>'tag', ''));
    if t = '' then continue; end if;
    if t !~ '^[0-9]{1,4}$' or t::int < 1 or t::int > mx then raise exception 'unknown phone'; end if;
    t := t::int::text;
    if t = any(seen) then raise exception 'phone listed twice'; end if;
    seen := seen || t;
    i := i + 1;
    pos := i; tag := t;
    mins_total := public.dr_num(ph->>'total', 0, 100000000, 'minutes all time');
    mins_local := public.dr_num(ph->>'local', 0, 100000000, 'minutes saved locally');
    if mins_total is null then raise exception 'minutes all time are missing'; end if;
    return next;
  end loop;
end $$;

create or replace function public.dr_checkin(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.dr_sites%rowtype;
  c public.dr_checkins%rowtype;
  d date;
  nowc timestamp := now() at time zone 'Africa/Cairo';
  deadline time := coalesce((select value from public.dr_settings where key = 'checkin_deadline'), '09:00')::time;
  rep record;
  started time;
  n_phones int := 0;
begin
  if coalesce(p->>'site_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
  select * into s from public.dr_sites where id = (p->>'site_id')::uuid and active;
  if not found then raise exception 'unknown site'; end if;
  rep := public.dr_reporter(p);
  begin d := coalesce(nullif(btrim(p->>'day'), '')::date, nowc::date); exception when others then raise exception 'bad date'; end;
  if d > nowc::date then raise exception 'day is in the future'; end if;
  if d < nowc::date - 2 then raise exception 'day is too far back'; end if;
  begin started := nullif(btrim(coalesce(p->>'started_at', '')), '')::time; exception when others then raise exception 'bad time'; end;
  select count(*) into n_phones from public.dr_phone_rows(p);
  if coalesce(btrim(p->>'phones_deployed'), '') = '' and n_phones = 0 then raise exception 'phones are missing'; end if;
  insert into public.dr_checkins as t (day, site_id, reporter, reporter_id, started_at, phones_deployed, wearers_scheduled, wearers_present, phones_out, ok, note, late)
  values (d, s.id, rep.r_name, rep.r_id, started,
    coalesce(public.dr_num(p->>'phones_deployed', 0, 10000, 'phones recording')::int, n_phones),
    public.dr_num(p->>'wearers_scheduled', 0, 100000, 'employees scheduled')::int,
    public.dr_num(p->>'wearers_present', 0, 100000, 'employees present')::int,
    public.dr_num(p->>'phones_out', 0, 10000, 'phones down')::int,
    not coalesce(lower(p->>'problem') in ('true', 'yes', '1', 'on'), false),
    left(p->>'note', 2000),
    d < nowc::date or nowc::time > deadline)
  on conflict (day, site_id) do update set
    reporter = excluded.reporter, reporter_id = excluded.reporter_id, started_at = excluded.started_at, phones_deployed = excluded.phones_deployed,
    wearers_scheduled = excluded.wearers_scheduled, wearers_present = excluded.wearers_present, phones_out = excluded.phones_out, ok = excluded.ok, note = excluded.note,
    submitted_at = now(), late = t.late and excluded.late
  returning * into c;
  -- the morning ledger rows, written fresh each time
  delete from public.dr_phone_log where checkin_id = c.id;
  insert into public.dr_phone_log (checkin_id, site_id, day, tag, minutes_total, minutes_local, position, kind)
  select c.id, s.id, d, r.tag, r.mins_total, r.mins_local, r.pos, 'morning' from public.dr_phone_rows(p) r;
  perform public.dr_log_add('checkin', 'Morning check-in, ' || s.name || ', ' || to_char(d, 'DD Mon') || ': ' || coalesce(c.phones_deployed::text, '0') || ' phones recording' || case when c.ok then '' else ', problem' end, c.reporter, s.id, c.id);
  return jsonb_build_object('ok', true, 'site', s.name, 'day', c.day, 'phones_deployed', c.phones_deployed, 'phones', n_phones, 'late', c.late, 'problem', not c.ok,
    'sent_at', to_char(c.submitted_at at time zone 'Africa/Cairo', 'HH24:MI'), 'updated', c.first_at <> c.submitted_at);
end $$;

create or replace function public.dr_submit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.dr_sites%rowtype;
  r public.dr_reports%rowtype;
  d date;
  nowc timestamp := now() at time zone 'Africa/Cairo';
  deadline time := coalesce((select value from public.dr_settings where key = 'deadline'), '18:00')::time;
  is_late boolean;
  rep record;
  row record; prev numeric;
  day_minutes numeric := 0; local_minutes numeric := 0; have_delta boolean := false; n_phones int := 0; n_local int := 0;
  hours_v numeric;
begin
  if coalesce(p->>'code', '') = '' or (p->>'code') is distinct from (select value from public.dr_settings where key = 'team_code') then
    raise exception 'wrong team code';
  end if;
  if coalesce(p->>'site_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
  select * into s from public.dr_sites where id = (p->>'site_id')::uuid and active;
  if not found then raise exception 'unknown site'; end if;
  rep := public.dr_reporter(p);
  begin d := coalesce(nullif(btrim(p->>'day'), '')::date, nowc::date); exception when others then raise exception 'bad date'; end;
  if d > nowc::date then raise exception 'day is in the future'; end if;
  if d < nowc::date - 7 then raise exception 'day is too far back'; end if;
  is_late := d < nowc::date or nowc::time > deadline;
  -- the day's minutes per phone: the rise since the same day's morning row when there is one, else since the phone's last row of any kind
  for row in select * from public.dr_phone_rows(p) loop
    n_phones := n_phones + 1;
    if coalesce(row.mins_local, 0) > 0 then n_local := n_local + 1; local_minutes := local_minutes + row.mins_local; end if;
    select l.minutes_total into prev from public.dr_phone_log l where l.tag = row.tag and l.kind = 'morning' and l.day = d and l.minutes_total is not null order by l.at desc limit 1;
    if prev is null then
      select l.minutes_total into prev from public.dr_phone_log l where l.tag = row.tag and l.day < d and l.minutes_total is not null order by l.day desc, l.at desc limit 1;
    end if;
    if prev is not null then day_minutes := day_minutes + greatest(row.mins_total - prev, 0); have_delta := true; end if;
  end loop;
  hours_v := coalesce(public.dr_num(p->>'hours', 0, 10000, 'hours recorded'), case when have_delta then round(day_minutes / 60.0, 1) else null end);
  insert into public.dr_reports as t (day, site_id, reporter, reporter_id, hours, hours_uploaded, phones_deployed, phones_uploaded, backlog, wearers_scheduled, wearers_present, phones_out, flags, incident, problems, gear_needed, other, late)
  values (d, s.id, rep.r_name, rep.r_id,
    hours_v,
    coalesce(public.dr_num(p->>'hours_uploaded', 0, 10000, 'hours uploaded'), case when have_delta then greatest(round((day_minutes - local_minutes) / 60.0, 1), 0) else null end),
    coalesce(public.dr_num(p->>'phones_deployed', 0, 10000, 'phones deployed')::int, nullif(n_phones, 0)),
    public.dr_num(p->>'phones_uploaded', 0, 10000, 'phones uploaded')::int,
    coalesce(public.dr_num(p->>'backlog', 0, 10000, 'phones still holding footage')::int, case when n_phones > 0 then n_local else null end),
    public.dr_num(p->>'wearers_scheduled', 0, 100000, 'employees scheduled')::int,
    public.dr_num(p->>'wearers_present', 0, 100000, 'employees present')::int,
    public.dr_num(p->>'phones_out', 0, 10000, 'phones down')::int,
    public.dr_num(p->>'flags', 0, 10000, 'flags')::int,
    coalesce(lower(p->>'incident') in ('true', 'yes', '1', 'on'), false),
    left(coalesce(p->>'incident_text', p->>'problems'), 4000),
    left(p->>'gear_needed', 2000), left(p->>'other', 4000),
    is_late)
  on conflict (day, site_id) do update set
    reporter = excluded.reporter, reporter_id = excluded.reporter_id, hours = excluded.hours, hours_uploaded = excluded.hours_uploaded, phones_deployed = excluded.phones_deployed,
    phones_uploaded = excluded.phones_uploaded, backlog = excluded.backlog, wearers_scheduled = excluded.wearers_scheduled, wearers_present = excluded.wearers_present,
    phones_out = excluded.phones_out, flags = excluded.flags, incident = excluded.incident, problems = excluded.problems, gear_needed = excluded.gear_needed, other = excluded.other,
    submitted_at = now(), late = t.late and excluded.late
  returning * into r;
  -- the evening ledger rows for this report, written fresh each time
  delete from public.dr_phone_log where report_id = r.id;
  insert into public.dr_phone_log (report_id, site_id, day, tag, minutes_total, minutes_local, position, kind)
  select r.id, s.id, d, x.tag, x.mins_total, x.mins_local, x.pos, 'evening' from public.dr_phone_rows(p) x;
  perform public.dr_log_add('report', 'Evening check-out, ' || s.name || ', ' || to_char(d, 'DD Mon') || ': ' || coalesce(n_phones::text, '0') || ' phones' || case when r.hours is not null then ', ' || r.hours || ' hours' else '' end || case when r.first_at <> r.submitted_at then ' (sent again)' else '' end || case when r.incident then ', incident' else '' end, r.reporter, s.id, r.id);
  return jsonb_build_object('ok', true, 'site', s.name, 'day', r.day, 'hours', r.hours, 'phones', n_phones, 'late', r.late, 'incident', r.incident,
    'sent_at', to_char(r.submitted_at at time zone 'Africa/Cairo', 'HH24:MI'), 'updated', r.first_at <> r.submitted_at);
end $$;

revoke execute on function public.dr_phone_rows(jsonb) from public, anon, authenticated;

-- v5b (migration "daily_reports_v5b_month_base"): hours already on the books for a month before the forms started.
--   setting month_base: {"YYYY-MM": hours}. dr_month_base(day) reads it. dr_build: month.hours adds it, month.base carries it,
--   month.per_day is the pace of the days that have reports (else the month so far over the days gone), and projected = hours + per_day * days left.
--   dr_admin: action month_base {month, hours}; settings returns month_base. The live function was patched in place with the same two changes.
