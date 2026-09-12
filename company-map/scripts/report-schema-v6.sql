-- Company map, database v6 (migration "daily_reports_v6_dashboard"): the dashboard map.
-- Adds a map pin to every site (lat, lng), a checker for it, the dr_map function the dashboard reads, and teaches dr_admin the two pin fields.
-- Applied on top of v5. Everything else stays as it was.

-- 1. A site can carry a map pin. Without one, the dashboard places it by its city, then by its name, then by its hub area.
alter table public.dr_sites add column if not exists lat numeric;
alter table public.dr_sites add column if not exists lng numeric;

-- 2. A coordinate typed on the site database: empty is null, anything else must be a number inside the range.
create or replace function public.dr_coord(v text, hi numeric) returns numeric
language plpgsql immutable as $$
declare x numeric;
begin
  if v is null or btrim(v) = '' then return null; end if;
  begin x := btrim(v)::numeric; exception when others then raise exception 'bad map pin'; end;
  if x < -hi or x > hi then raise exception 'bad map pin'; end if;
  return round(x, 5);
end $$;

-- 3. dr_admin: site_add and site_set take lat and lng. Patched in place so the rest of the function stays exactly as deployed.
do $do$
declare def text; a text; b text;
begin
  def := pg_get_functiondef('public.dr_admin(text, text, jsonb)'::regprocedure);
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
    select l.site_id, l.tag, l.day, l.minutes_total,
      (select m.minutes_total from public.dr_phone_log m where m.tag = l.tag and m.day = l.day and m.kind = 'morning' and m.minutes_total is not null order by m.at desc limit 1) as morning_total,
      (select b.minutes_total from public.dr_phone_log b where b.tag = l.tag and b.day < l.day and b.minutes_total is not null order by b.day desc, b.at desc limit 1) as before_total
    from public.dr_phone_log l
    where l.kind = 'evening' and l.day > todayc - win and l.day <= todayc and l.minutes_total is not null
  ), daily as (
    select site_id, tag, day,
      case when coalesce(morning_total, before_total) is not null then greatest(minutes_total - coalesce(morning_total, before_total), 0) / 60.0 end as hours
    from ev
  ), latest as (
    select distinct on (tag) tag, site_id, day, kind, minutes_total, minutes_local
    from public.dr_phone_log where day > todayc - 14 order by tag, day desc, at desc
  ), phones as (
    select la.tag, la.site_id, la.day as last_day, la.kind as last_kind, la.minutes_total, la.minutes_local,
      (select round(avg(d.hours)::numeric, 1) from daily d where d.tag = la.tag and d.hours is not null) as hours_day,
      (select count(*) from daily d where d.tag = la.tag and d.hours is not null) as days,
      (select round(d.hours::numeric, 1) from daily d where d.tag = la.tag and d.day = todayc and d.hours is not null limit 1) as today_hours
    from latest la
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
