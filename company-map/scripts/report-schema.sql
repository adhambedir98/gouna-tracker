-- Daily reports for the company map: one form per site per day, added up into one company report.
-- This is the schema as applied to the Supabase project in data/report.json (migration "daily_reports").
-- The codes are not here. They live in dr_settings: team_code (everyone who sends a report) and report_code (management).
--   insert into public.dr_settings (key, value) values ('team_code', '...'), ('report_code', '...');

create extension if not exists pg_cron;

create table if not exists public.dr_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team text not null default 'direct' check (team in ('direct', 'partner')),
  lead text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.dr_reports (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  site_id uuid not null references public.dr_sites(id),
  reporter text not null,
  hours numeric not null check (hours >= 0 and hours <= 10000),
  phones_recording integer check (phones_recording between 0 and 10000),
  phones_out integer check (phones_out between 0 and 10000),
  out_why text,
  workers integer check (workers between 0 and 100000),
  backlog numeric check (backlog >= 0),
  flags integer check (flags between 0 and 10000),
  flags_note text,
  problems text,
  hardware text,
  fixes text,
  absences text,
  operators text,
  first_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  late boolean not null default false,
  unique (day, site_id)
);
create index if not exists dr_reports_day on public.dr_reports(day);

create table if not exists public.dr_settings (key text primary key, value text not null);
create table if not exists public.dr_daily (day date primary key, report jsonb not null, built_at timestamptz not null default now());

alter table public.dr_sites enable row level security;
alter table public.dr_reports enable row level security;
alter table public.dr_settings enable row level security;
alter table public.dr_daily enable row level security;

drop policy if exists dr_sites_read on public.dr_sites;
create policy dr_sites_read on public.dr_sites for select to anon, authenticated using (active);

revoke all on public.dr_reports, public.dr_settings, public.dr_daily from anon, authenticated;
revoke insert, update, delete on public.dr_sites from anon, authenticated;
grant select on public.dr_sites to anon, authenticated;

-- a number from the form, or an error the form can show
create or replace function public.dr_num(v text, lo numeric, hi numeric, what text) returns numeric
language plpgsql immutable as $$
declare n numeric;
begin
  if v is null or btrim(v) = '' then return null; end if;
  begin n := replace(btrim(v), ',', '')::numeric; exception when others then raise exception 'not a number: %', what; end;
  if n < lo or n > hi then raise exception 'out of range: %', what; end if;
  return n;
end $$;

-- the monthly target for the month of a day: the latest month set at or before it
create or replace function public.dr_target(p_day date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare tg jsonb := coalesce((select value from public.dr_settings where key = 'targets'), '{}')::jsonb; best text;
begin
  select key into best from jsonb_each_text(tg) where key <= to_char(p_day, 'YYYY-MM') order by key desc limit 1;
  if best is null then return 0; end if;
  return (tg->>best)::numeric;
end $$;

-- one site's daily report. A second send for the same site and day replaces the first.
create or replace function public.dr_submit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.dr_sites%rowtype;
  r public.dr_reports%rowtype;
  d date;
  nowc timestamp := now() at time zone 'Africa/Cairo';
  deadline time := coalesce((select value from public.dr_settings where key = 'deadline'), '18:00')::time;
  is_late boolean;
begin
  if coalesce(p->>'code', '') = '' or (p->>'code') is distinct from (select value from public.dr_settings where key = 'team_code') then
    raise exception 'wrong team code';
  end if;
  if coalesce(p->>'site_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
  select * into s from public.dr_sites where id = (p->>'site_id')::uuid and active;
  if not found then raise exception 'unknown site'; end if;
  if length(btrim(coalesce(p->>'reporter', ''))) < 2 then raise exception 'name is missing'; end if;
  if coalesce(btrim(p->>'hours'), '') = '' then raise exception 'hours are missing'; end if;
  begin d := coalesce(nullif(btrim(p->>'day'), '')::date, nowc::date); exception when others then raise exception 'bad date'; end;
  if d > nowc::date then raise exception 'day is in the future'; end if;
  if d < nowc::date - 7 then raise exception 'day is too far back'; end if;
  is_late := d < nowc::date or nowc::time > deadline;
  insert into public.dr_reports as t (day, site_id, reporter, hours, phones_recording, phones_out, out_why, workers, backlog, flags, flags_note, problems, hardware, fixes, absences, operators, late)
  values (d, s.id, left(btrim(p->>'reporter'), 80),
    public.dr_num(p->>'hours', 0, 10000, 'hours'),
    public.dr_num(p->>'phones_recording', 0, 10000, 'phones recording')::int,
    public.dr_num(p->>'phones_out', 0, 10000, 'phones out')::int,
    left(p->>'out_why', 2000),
    public.dr_num(p->>'workers', 0, 100000, 'workers')::int,
    public.dr_num(p->>'backlog', 0, 100000, 'backlog'),
    public.dr_num(p->>'flags', 0, 10000, 'flags')::int,
    left(p->>'flags_note', 2000), left(p->>'problems', 4000), left(p->>'hardware', 4000), left(p->>'fixes', 4000), left(p->>'absences', 2000), left(p->>'operators', 4000),
    is_late)
  on conflict (day, site_id) do update set
    reporter = excluded.reporter, hours = excluded.hours, phones_recording = excluded.phones_recording, phones_out = excluded.phones_out, out_why = excluded.out_why,
    workers = excluded.workers, backlog = excluded.backlog, flags = excluded.flags, flags_note = excluded.flags_note, problems = excluded.problems,
    hardware = excluded.hardware, fixes = excluded.fixes, absences = excluded.absences, operators = excluded.operators,
    submitted_at = now(), late = t.late and excluded.late
  returning * into r;
  return jsonb_build_object('ok', true, 'site', s.name, 'day', r.day, 'hours', r.hours, 'late', r.late,
    'sent_at', to_char(r.submitted_at at time zone 'Africa/Cairo', 'HH24:MI'), 'updated', r.first_at <> r.submitted_at);
end $$;

-- the company report for one day: every site, the totals, the teams, and the last two weeks
create or replace function public.dr_build(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from public.dr_reports where day = p_day),
  s as (select * from public.dr_sites where active or id in (select site_id from r)),
  monthly as (select public.dr_target(p_day) as target, extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::int as days)
  select jsonb_build_object(
    'day', p_day,
    'built_at', to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
    'deadline', coalesce((select value from public.dr_settings where key = 'deadline'), '18:00'),
    'target_month', (select target from monthly),
    'target_day', (select round(target / greatest(days, 1)) from monthly),
    'month_hours', (select coalesce(sum(hours), 0) from public.dr_reports where day >= date_trunc('month', p_day)::date and day <= p_day),
    'expected', (select count(*) from s where active),
    'totals', (select jsonb_build_object('reported', count(*), 'late', count(*) filter (where late), 'hours', coalesce(sum(hours), 0),
        'phones_recording', coalesce(sum(phones_recording), 0), 'phones_out', coalesce(sum(phones_out), 0), 'workers', coalesce(sum(workers), 0),
        'backlog', coalesce(sum(backlog), 0), 'flags', coalesce(sum(flags), 0)) from r),
    'teams', (select coalesce(jsonb_object_agg(team, x), '{}'::jsonb) from (
        select s.team, jsonb_build_object('expected', count(*) filter (where s.active), 'reported', count(r.id), 'hours', coalesce(sum(r.hours), 0),
          'phones_recording', coalesce(sum(r.phones_recording), 0), 'phones_out', coalesce(sum(r.phones_out), 0), 'workers', coalesce(sum(r.workers), 0)) as x
        from s left join r on r.site_id = s.id group by s.team) t),
    'sites', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'team', s.team, 'lead', s.lead, 'active', s.active,
        'report', case when r.id is null then null else jsonb_build_object('reporter', r.reporter, 'hours', r.hours, 'phones_recording', r.phones_recording,
          'phones_out', r.phones_out, 'out_why', r.out_why, 'workers', r.workers, 'backlog', r.backlog, 'flags', r.flags, 'flags_note', r.flags_note,
          'problems', r.problems, 'hardware', r.hardware, 'fixes', r.fixes, 'absences', r.absences, 'operators', r.operators, 'late', r.late,
          'sent_at', to_char(r.submitted_at at time zone 'Africa/Cairo', 'HH24:MI'), 'first_at', to_char(r.first_at at time zone 'Africa/Cairo', 'HH24:MI')) end
      ) order by s.team, s.sort, s.name), '[]'::jsonb) from s left join r on r.site_id = s.id),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'hours', hours, 'reported', reported) order by day), '[]'::jsonb)
        from (select day, sum(hours) as hours, count(*) as reported from public.dr_reports where day > p_day - 14 and day <= p_day group by day) d)
  );
$$;

create or replace function public.dr_report(p_day date, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  return public.dr_build(p_day);
end $$;

-- the management side: the site list, the codes, the deadline, and the monthly targets
create or replace function public.dr_admin(p_code text, p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; k text;
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  if p_action = 'sites' then
    return (select coalesce(jsonb_agg(to_jsonb(s) order by s.team, s.sort, s.name), '[]'::jsonb) from public.dr_sites s);
  elsif p_action = 'site_add' then
    if length(btrim(coalesce(p->>'name', ''))) < 2 then raise exception 'name is missing'; end if;
    insert into public.dr_sites (name, team, lead, sort)
    values (left(btrim(p->>'name'), 80), case when p->>'team' = 'partner' then 'partner' else 'direct' end,
      nullif(left(btrim(coalesce(p->>'lead', '')), 80), ''), coalesce((select max(sort) + 1 from public.dr_sites), 0))
    on conflict (name) do update set active = true, team = excluded.team, lead = coalesce(excluded.lead, public.dr_sites.lead);
    return jsonb_build_object('ok', true);
  elsif p_action = 'site_set' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
    v_id := (p->>'id')::uuid;
    update public.dr_sites set
      name = coalesce(nullif(left(btrim(p->>'name'), 80), ''), name),
      team = case when p->>'team' in ('direct', 'partner') then p->>'team' else team end,
      lead = case when p ? 'lead' then nullif(left(btrim(p->>'lead'), 80), '') else lead end,
      active = coalesce((p->>'active')::boolean, active)
    where id = v_id;
    if not found then raise exception 'unknown site'; end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'settings' then
    return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.dr_settings where key in ('team_code', 'deadline', 'targets'));
  elsif p_action = 'setting' then
    k := p->>'key';
    if k not in ('team_code', 'report_code', 'deadline') then raise exception 'unknown setting'; end if;
    if length(btrim(coalesce(p->>'value', ''))) < 3 then raise exception 'value is too short'; end if;
    if k = 'deadline' then perform (p->>'value')::time; end if;
    insert into public.dr_settings (key, value) values (k, btrim(p->>'value')) on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true);
  elsif p_action = 'target' then
    if coalesce(p->>'month', '') !~ '^\d{4}-\d{2}$' then raise exception 'bad month'; end if;
    insert into public.dr_settings (key, value) values ('targets', jsonb_build_object(p->>'month', public.dr_num(p->>'hours', 0, 10000000, 'hours'))::text)
    on conflict (key) do update set value = (public.dr_settings.value::jsonb || jsonb_build_object(p->>'month', public.dr_num(p->>'hours', 0, 10000000, 'hours')))::text;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'unknown action';
end $$;

-- the 6 PM snapshot, kept for the record. Runs at 18:10 Cairo time whatever the clock change.
create or replace function public.dr_snapshot() returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Africa/Cairo')::date;
begin
  if extract(hour from now() at time zone 'Africa/Cairo') <> 18 then return; end if;
  insert into public.dr_daily (day, report) values (d, public.dr_build(d))
  on conflict (day) do update set report = excluded.report, built_at = now();
end $$;

revoke execute on function public.dr_build(date), public.dr_snapshot(), public.dr_target(date), public.dr_num(text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.dr_submit(jsonb), public.dr_report(date, text), public.dr_admin(text, text, jsonb) to anon, authenticated;

-- two jobs, one for summer time and one for winter time; the function only writes when it is 6 PM in Cairo
select cron.schedule('dr_snapshot_summer', '10 15 * * *', 'select public.dr_snapshot()');
select cron.schedule('dr_snapshot_winter', '10 16 * * *', 'select public.dr_snapshot()');

insert into public.dr_settings (key, value) values
  ('deadline', '18:00'),
  ('targets', '{"2026-09": 25000, "2026-10": 50000}')
on conflict (key) do nothing;

-- v2 (migration "daily_reports_v2_site_registry"): the site registry with its pipeline fields, the v3.0 form fields,
-- dr_form_options() for the form, and the automatic Slack posts. The full text of v2 is in the Supabase migration history;
-- the shape it adds:
--   dr_sites: status (prospect, contacted, agreed, ready, active, paused, closed; active follows it by trigger), industry, city,
--     area (central, east, west), contact_name, contact_phone, phones_capacity, book, notes, source, last_touch, updated_at
--   dr_reports: phones_deployed, phones_uploaded, hours_uploaded, wearers_scheduled, wearers_present, incident, gear_needed, other
--   dr_form_options(): active sites, reporter names (the "reporters" setting plus site leads), the deadline. Public.
--   dr_notify(kind, force): posts the 6:15 PM chase list or the 8:00 PM number to the "slack_webhook" setting with pg_net. Internal.
--   dr_admin: site_add and site_set take the registry fields; settings gain reporters and slack_webhook; action test_post.
--   cron: dr_chase_summer 15 15, dr_chase_winter 15 16, dr_number_summer 0 17, dr_number_winter 0 18 (UTC; the function checks Cairo time).
--   settings: reporters, slack_webhook (empty until set), host.
