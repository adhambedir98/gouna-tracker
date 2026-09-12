-- Company map, database v6 (migration "daily_reports_v6_dashboard"): the dashboard map.
-- Adds a map pin to every site (lat, lng), a checker for it, the dr_map function the dashboard reads, and teaches dr_admin the two pin fields.
-- Applied on top of v5. Everything else stays as it was.
-- v6b (migration "daily_reports_v6b_dashboard_fixes"), after review: dr_map sums each phone once instead of three correlated scans, keeps one evening row
-- per phone and day (the last sent), ranks the evening row above a morning row sent again later, and drops phones whose latest site is closed;
-- dr_coord checks the shape of a pin before the cast (no hex, underscores, or exponents) and is not callable through the API; the dr_admin patch
-- skips itself when already applied. The text below is the v6b state.

-- 1. A site can carry a map pin. Without one, the dashboard places it by its city, then by its name, then by its hub area.
alter table public.dr_sites add column if not exists lat numeric;
alter table public.dr_sites add column if not exists lng numeric;

-- 2. A coordinate typed on the site database: empty is null, anything else must be a number inside the range.
create or replace function public.dr_coord(v text, hi numeric) returns numeric
language plpgsql immutable as $$
declare x numeric;
begin
  if v is null or btrim(v) = '' then return null; end if;
  if btrim(v) !~ '^[+-]?(\d+(\.\d*)?|\.\d+)$' then raise exception 'bad map pin'; end if;
  x := btrim(v)::numeric;
  if x < -hi or x > hi then raise exception 'bad map pin'; end if;
  return round(x, 5);
end $$;
revoke execute on function public.dr_coord(text, numeric) from public, anon, authenticated;

-- 3. dr_admin: site_add and site_set take lat and lng. Patched in place so the rest of the function stays exactly as deployed.
do $do$
declare def text; a text; b text;
begin
  def := pg_get_functiondef('public.dr_admin(text, text, jsonb)'::regprocedure);
  if position('public.dr_coord(' in def) > 0 then return; end if;   -- already patched
  a := $q$last_touch, lead_id, pm_id)
    values ($q$;
  b := $q$last_touch, lead_id, pm_id, lat, lng)
    values ($q$;
  if position(a in def) = 0 then raise exception 'dr_admin: the insert columns were not found'; end if;
  def := replace(def, a, b);
  a := $q$then (p->>'pm_id')::uuid end)
    on conflict (name)$q$;
  b := $q$then (p->>'pm_id')::uuid end,
      public.dr_coord(p->>'lat', 90), public.dr_coord(p->>'lng', 180))
    on conflict (name)$q$;
  if position(a in def) = 0 then raise exception 'dr_admin: the insert values were not found'; end if;
  def := replace(def, a, b);
  a := $q$nullif(p->>'last_touch', '')::date else last_touch end
    where id = v_id returning name into v_name;$q$;
  b := $q$nullif(p->>'last_touch', '')::date else last_touch end,
      lat = case when p ? 'lat' then public.dr_coord(p->>'lat', 90) else lat end,
      lng = case when p ? 'lng' then public.dr_coord(p->>'lng', 180) else lng end
    where id = v_id returning name into v_name;$q$;
  if position(a in def) = 0 then raise exception 'dr_admin: the update was not found'; end if;
  def := replace(def, a, b);
  execute def;
end $do$;

-- 4. dr_map: what the dashboard reads. Management code. Every open site, and every phone seen in the last 14 days at the site of its latest row,
--    with its hours a day over the window (7 days unless asked otherwise, at most 30): for each evening row, the rise in the phone's all-time minutes
--    since that morning's row, or since its last row of any kind when there was no morning, the same sum the evening check-out uses. The average of
--    those days is the phone's hours a day. Green is 5 or more, yellow 3 to 5, red under 3, none when the window holds no evening reading for it.
create or replace function public.dr_map(p_code text, p_days int default 7) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  todayc date := (now() at time zone 'Africa/Cairo')::date;
  win int := greatest(1, least(coalesce(p_days, 7), 30));
  result jsonb;
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  with ev as (
    -- one evening row per phone and day in the window: the last one sent
    select distinct on (l.tag, l.day) l.tag, l.day, l.minutes_total
    from public.dr_phone_log l
    where l.kind = 'evening' and l.day > todayc - win and l.day <= todayc and l.minutes_total is not null
    order by l.tag, l.day, l.at desc
  ), ev2 as (
    -- the reading it rose from: that day's morning row, else the phone's last row before that day
    select e.tag, e.day, e.minutes_total,
      (select m.minutes_total from public.dr_phone_log m where m.tag = e.tag and m.day = e.day and m.kind = 'morning' and m.minutes_total is not null order by m.at desc limit 1) as morning_total,
      (select b.minutes_total from public.dr_phone_log b where b.tag = e.tag and b.day < e.day and b.minutes_total is not null order by b.day desc, b.at desc limit 1) as before_total
    from ev e
  ), daily as (
    select tag, day, greatest(minutes_total - coalesce(morning_total, before_total), 0) / 60.0 as hours
    from ev2 where coalesce(morning_total, before_total) is not null
  ), per as (
    -- once per phone: its hours a day over the window, the days read, and today's hours
    select tag, round(avg(hours)::numeric, 1) as hours_day, count(*) as days, round((max(hours) filter (where day = todayc))::numeric, 1) as today_hours
    from daily group by tag
  ), latest as (
    -- where each phone was last seen in the last 14 days; the evening row outranks a morning row sent again later the same day
    select distinct on (l.tag) l.tag, l.site_id, l.day, l.kind, l.minutes_total, l.minutes_local
    from public.dr_phone_log l where l.day > todayc - 14
    order by l.tag, l.day desc, (l.kind = 'evening') desc, l.at desc
  ), phones as (
    select la.tag, la.site_id, la.day as last_day, la.kind as last_kind, la.minutes_total, la.minutes_local, p.hours_day, coalesce(p.days, 0) as days, p.today_hours
    from latest la left join per p on p.tag = la.tag
    where la.site_id in (select id from public.dr_sites where status <> 'closed')
  )
  select jsonb_build_object(
    'day', todayc, 'window', win,
    'sites', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'team', s.team, 'status', s.status, 'city', s.city, 'area', s.area, 'lat', s.lat, 'lng', s.lng,
        'phones', (select count(*) from phones p where p.site_id = s.id),
        'green', (select count(*) from phones p where p.site_id = s.id and p.hours_day >= 5),
        'yellow', (select count(*) from phones p where p.site_id = s.id and p.hours_day >= 3 and p.hours_day < 5),
        'red', (select count(*) from phones p where p.site_id = s.id and p.hours_day < 3),
        'none', (select count(*) from phones p where p.site_id = s.id and p.hours_day is null),
        'hours_day', (select round(avg(p.hours_day)::numeric, 1) from phones p where p.site_id = s.id),
        'last_in', (select max(c.day) from public.dr_checkins c where c.site_id = s.id),
        'last_out', (select max(r.day) from public.dr_reports r where r.site_id = s.id)
      ) order by s.status, s.team, s.sort, s.name), '[]'::jsonb)
      from public.dr_sites s where s.status <> 'closed'),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object(
        'tag', p.tag, 'site_id', p.site_id, 'hours_day', p.hours_day, 'days', p.days, 'today', p.today_hours, 'last_day', p.last_day, 'last_kind', p.last_kind,
        'total', p.minutes_total, 'local', p.minutes_local,
        'status', case when p.hours_day is null then 'none' when p.hours_day >= 5 then 'green' when p.hours_day >= 3 then 'yellow' else 'red' end
      ) order by p.site_id, (case when p.tag ~ '^\d+$' then p.tag::int end), p.tag), '[]'::jsonb) from phones p)
  ) into result;
  return result;
end $$;

revoke all on function public.dr_map(text, int) from public;
grant execute on function public.dr_map(text, int) to anon, authenticated;
