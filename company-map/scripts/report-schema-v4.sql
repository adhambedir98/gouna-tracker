-- v4 (migration "daily_reports_v4_history_and_email"): the company report with history, and the evening email.
-- Applied on top of v1 to v3 (scripts/report-schema.sql). Everything here is create or replace.
--
--   dr_build: adds
--     month: hours (month to date), target, days_in, days_gone, per_day_needed (to still hit the target), projected (the pace so far times the days in the month)
--     days: the 30 days ending on the chosen day, every day present, zero-filled: has, checked_in, reported, expected, hours, hours_uploaded,
--       phones_deployed, wearers_present, phones_out, flags, incidents (filed), problems (check-ins not ok), phones_morning, wearers_morning
--     sites[].week and sites[].phones_week: the last seven days of hours and phones deployed for that site, oldest first, zero where no report
--   dr_email_html(rep): the report as a plain HTML email (tables and inline styles only, so every mail client shows it)
--   dr_notify('email'): sends it with Resend (api.resend.com) to the "report_email" setting at 8:05 PM Cairo time; nothing without a key
--   dr_admin: settings gain report_email, email_from, resend_key (masked); action test_post takes kind 'email'
--   cron: dr_email_summer 5 17, dr_email_winter 5 18 (UTC; the function checks Cairo time)
--   settings: report_email (comma separated addresses), email_from (a verified sender, default the Resend test sender), resend_key (empty until set)

create or replace function public.dr_build(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from public.dr_reports where day = p_day),
  c as (select * from public.dr_checkins where day = p_day),
  s as (select * from public.dr_sites where active or id in (select site_id from r) or id in (select site_id from c)),
  mtd as (select coalesce(sum(hours), 0) as hours from public.dr_reports where day >= date_trunc('month', p_day)::date and day <= p_day),
  monthly as (select public.dr_target(p_day) as target,
                     extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::int as days_in,
                     extract(day from p_day)::int as days_gone),
  hist as (
    select d.day::date as day,
      coalesce(rr.n, 0) as reported, coalesce(cc.n, 0) as checked_in,
      coalesce(rr.hours, 0) as hours, coalesce(rr.hours_uploaded, 0) as hours_uploaded,
      coalesce(rr.phones_deployed, 0) as phones_deployed, coalesce(rr.wearers_present, 0) as wearers_present,
      coalesce(rr.phones_out, 0) as phones_out, coalesce(rr.flags, 0) as flags,
      coalesce(cc.phones, 0) as phones_morning, coalesce(cc.wearers, 0) as wearers_morning, coalesce(cc.problems, 0) as problems,
      coalesce(ii.n, 0) as incidents
    from generate_series(p_day - 29, p_day, interval '1 day') as d(day)
    left join (select day, count(*) as n, sum(hours) as hours, sum(hours_uploaded) as hours_uploaded, sum(phones_deployed) as phones_deployed,
                      sum(wearers_present) as wearers_present, sum(phones_out) as phones_out, sum(flags) as flags
               from public.dr_reports where day between p_day - 29 and p_day group by day) rr on rr.day = d.day::date
    left join (select day, count(*) as n, sum(phones_deployed) as phones, sum(wearers_present) as wearers, count(*) filter (where not ok) as problems
               from public.dr_checkins where day between p_day - 29 and p_day group by day) cc on cc.day = d.day::date
    left join (select day, count(*) as n from public.dr_incidents where day between p_day - 29 and p_day group by day) ii on ii.day = d.day::date
  )
  select jsonb_build_object(
    'day', p_day,
    'built_at', to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
    'deadline', coalesce((select value from public.dr_settings where key = 'deadline'), '18:00'),
    'checkin_deadline', coalesce((select value from public.dr_settings where key = 'checkin_deadline'), '09:00'),
    'target_month', (select target from monthly),
    'target_day', (select round(target / greatest(days_in, 1)) from monthly),
    'month_hours', (select hours from mtd),
    'month', (select jsonb_build_object('hours', mtd.hours, 'target', m.target, 'days_in', m.days_in, 'days_gone', m.days_gone,
        'per_day_needed', case when m.days_in - m.days_gone > 0 then round(greatest(m.target - mtd.hours, 0) / (m.days_in - m.days_gone)) else 0 end,
        'projected', case when m.days_gone > 0 then round(mtd.hours / m.days_gone * m.days_in) else 0 end) from monthly m, mtd),
    'expected', (select count(*) from s where active),
    'totals', (select jsonb_build_object('reported', count(*), 'late', count(*) filter (where late), 'hours', coalesce(sum(hours), 0),
        'hours_uploaded', coalesce(sum(hours_uploaded), 0), 'phones_deployed', coalesce(sum(phones_deployed), 0), 'phones_uploaded', coalesce(sum(phones_uploaded), 0),
        'backlog', coalesce(sum(backlog), 0), 'wearers_scheduled', coalesce(sum(wearers_scheduled), 0), 'wearers_present', coalesce(sum(wearers_present), 0),
        'phones_out', coalesce(sum(phones_out), 0), 'flags', coalesce(sum(flags), 0), 'incidents', count(*) filter (where incident)) from r),
    'morning', (select jsonb_build_object('checked_in', count(*), 'late', count(*) filter (where late), 'problems', count(*) filter (where not ok),
        'phones_deployed', coalesce(sum(phones_deployed), 0), 'wearers_present', coalesce(sum(wearers_present), 0), 'wearers_scheduled', coalesce(sum(wearers_scheduled), 0),
        'phones_out', coalesce(sum(phones_out), 0)) from c),
    'teams', (select coalesce(jsonb_object_agg(team, x), '{}'::jsonb) from (
        select s.team, jsonb_build_object('expected', count(*) filter (where s.active), 'reported', count(r.id), 'checked_in', count(c.id), 'hours', coalesce(sum(r.hours), 0),
          'hours_uploaded', coalesce(sum(r.hours_uploaded), 0), 'phones_deployed', coalesce(sum(r.phones_deployed), 0), 'wearers_present', coalesce(sum(r.wearers_present), 0),
          'phones_out', coalesce(sum(r.phones_out), 0), 'flags', coalesce(sum(r.flags), 0)) as x
        from s left join r on r.site_id = s.id left join c on c.site_id = s.id group by s.team) t),
    'sites', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'team', s.team, 'lead', s.lead, 'book', s.book, 'active', s.active,
        'checkin', case when c.id is null then null else jsonb_build_object('reporter', c.reporter, 'started_at', to_char(c.started_at, 'HH24:MI'), 'phones_deployed', c.phones_deployed,
          'wearers_scheduled', c.wearers_scheduled, 'wearers_present', c.wearers_present, 'phones_out', c.phones_out, 'ok', c.ok, 'note', c.note, 'late', c.late,
          'first_at', to_char(c.first_at at time zone 'Africa/Cairo', 'HH24:MI')) end,
        'report', case when r.id is null then null else jsonb_build_object('reporter', r.reporter, 'hours', r.hours, 'hours_uploaded', r.hours_uploaded,
          'phones_deployed', r.phones_deployed, 'phones_uploaded', r.phones_uploaded, 'backlog', r.backlog, 'wearers_scheduled', r.wearers_scheduled,
          'wearers_present', r.wearers_present, 'phones_out', r.phones_out, 'flags', r.flags, 'incident', r.incident, 'problems', r.problems,
          'gear_needed', r.gear_needed, 'other', r.other, 'late', r.late,
          'sent_at', to_char(r.submitted_at at time zone 'Africa/Cairo', 'HH24:MI'), 'first_at', to_char(r.first_at at time zone 'Africa/Cairo', 'HH24:MI')) end,
        'week', (select coalesce(jsonb_agg(coalesce(w.hours, 0) order by d.day), '[]'::jsonb)
                 from generate_series(p_day - 6, p_day, interval '1 day') as d(day) left join public.dr_reports w on w.site_id = s.id and w.day = d.day::date),
        'phones_week', (select coalesce(jsonb_agg(coalesce(w.phones_deployed, 0) order by d.day), '[]'::jsonb)
                 from generate_series(p_day - 6, p_day, interval '1 day') as d(day) left join public.dr_reports w on w.site_id = s.id and w.day = d.day::date)
      ) order by s.team, s.sort, s.name), '[]'::jsonb) from s left join r on r.site_id = s.id left join c on c.site_id = s.id),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'no', i.no, 'site_id', i.site_id, 'site', coalesce(x.name, i.place), 'at', to_char(i.at, 'HH24:MI'),
        'kind', i.kind, 'what', i.what, 'reporter', i.reporter, 'status', i.status, 'needs', i.needs) order by i.no), '[]'::jsonb)
        from public.dr_incidents i left join public.dr_sites x on x.id = i.site_id where i.day = p_day),
    'open_incidents', (select count(*) from public.dr_incidents where status = 'open'),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', h.day, 'has', (h.reported > 0 or h.checked_in > 0), 'checked_in', h.checked_in, 'reported', h.reported,
        'expected', (select count(*) from s where active), 'hours', h.hours, 'hours_uploaded', h.hours_uploaded, 'phones_deployed', h.phones_deployed,
        'wearers_present', h.wearers_present, 'phones_out', h.phones_out, 'flags', h.flags, 'incidents', h.incidents, 'problems', h.problems,
        'phones_morning', h.phones_morning, 'wearers_morning', h.wearers_morning) order by h.day), '[]'::jsonb) from hist h)
  );
$$;

-- text from the forms, made safe for an HTML email
create or replace function public.dr_esc(t text) returns text
language sql immutable as $$ select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

-- the report as an email: tables and inline styles only, so it reads the same in Gmail, Outlook, and on a phone
create or replace function public.dr_email_html(rep jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  host text := coalesce((select value from public.dr_settings where key = 'host'), '');
  t jsonb := rep->'totals'; m jsonb := rep->'morning'; mo jsonb := rep->'month';
  d date := (rep->>'day')::date;
  expected int := (rep->>'expected')::int;
  hours numeric := coalesce((t->>'hours')::numeric, 0);
  phones int := coalesce((t->>'phones_deployed')::int, 0);
  present int := coalesce((t->>'wearers_present')::int, 0);
  target numeric := coalesce((rep->>'target_day')::numeric, 0);
  per_phone text := case when phones > 0 then to_char(hours / phones, 'FM9990.0') else '0' end;
  optin text := case when present > 0 then round(phones::numeric / present * 100)::text || '%' else '0%' end;
  html text; rows text := ''; bars text := ''; it jsonb; maxh numeric := 1; peak numeric;
  kpi text := '<td style="padding:14px 12px;border:1px solid #d9d4c7;background:#f5f2ea;vertical-align:top;width:20%%"><div style="font-size:30px;font-weight:600;line-height:1;color:#12261f">%s</div><div style="font-size:12px;color:#6b6b62;margin-top:6px">%s</div></td>';
  cell text := '<td style="padding:8px 8px;border-bottom:1px solid #e6e2d8;font-size:14px;color:#12261f;%s">%s</td>';
begin
  -- the last 14 days as bars: a table row of cells whose inner block grows with the hours
  select coalesce(max((e->>'hours')::numeric), 0) into peak from jsonb_array_elements(rep->'days') e;
  maxh := greatest(peak, target, 1);
  for it in select z.y from jsonb_array_elements(rep->'days') with ordinality as z(y, i) where z.i > jsonb_array_length(rep->'days') - 14 loop
    bars := bars || format('<td style="vertical-align:bottom;padding:0 2px;text-align:center"><div style="height:%spx;background:%s;width:100%%"></div><div style="font-size:10px;color:#6b6b62;margin-top:4px">%s</div></td>',
      greatest(round(((it->>'hours')::numeric / maxh) * 60), case when (it->>'hours')::numeric > 0 then 2 else 1 end),
      case when (it->>'day')::date = d then '#1d5c45' else '#b9c9c0' end, to_char((it->>'day')::date, 'DD'));
  end loop;
  for it in select e from jsonb_array_elements(rep->'sites') e loop
    rows := rows || '<tr>' || format(cell, '', public.dr_esc(it->>'name') || coalesce(' <span style="color:#6b6b62">' || public.dr_esc(coalesce(it->>'book', it->>'lead')) || '</span>', ''))
      || case when it->'report' = 'null'::jsonb
           then format(cell, 'color:#B3261E', 'not in') || format(cell, 'text-align:right', '') || format(cell, 'text-align:right', '') || format(cell, 'text-align:right', '') || format(cell, 'text-align:right', '') || format(cell, 'text-align:right', '')
           else format(cell, '', coalesce(it->'report'->>'first_at', '') || case when (it->'report'->>'late')::boolean then ' <span style="color:#B3261E">late</span>' else '' end || case when (it->'report'->>'incident')::boolean then ' <span style="color:#B3261E">incident</span>' else '' end)
             || format(cell, 'text-align:right', it->'report'->>'hours') || format(cell, 'text-align:right', it->'report'->>'hours_uploaded')
             || format(cell, 'text-align:right', it->'report'->>'phones_deployed')
             || format(cell, 'text-align:right', case when (it->'report'->>'phones_deployed')::int > 0 then to_char((it->'report'->>'hours')::numeric / (it->'report'->>'phones_deployed')::int, 'FM9990.0') else '' end)
             || format(cell, 'text-align:right', case when (it->'report'->>'wearers_present')::int > 0 then round((it->'report'->>'phones_deployed')::numeric / (it->'report'->>'wearers_present')::int * 100)::text || '%' else '' end)
         end
      || '</tr>';
  end loop;
  html := '<div style="font-family:Helvetica,Arial,sans-serif;background:#fbf9f4;padding:24px 16px;color:#12261f"><div style="max-width:680px;margin:0 auto">'
    || format('<div style="font-size:12px;color:#6b6b62;letter-spacing:.02em">Company report</div><div style="font-size:26px;font-weight:600;margin:4px 0 16px">%s</div>', to_char(d, 'FMDay, DD FMMonth YYYY'))
    || '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:4px 0;margin:0 -4px"><tr>'
    || format(kpi, phones, 'phones active') || format(kpi, round(hours), case when target > 0 then 'hours, of ' || round(target) || ' target' else 'hours today' end)
    || format(kpi, per_phone, 'hours per phone') || format(kpi, optin, 'opt-in rate') || format(kpi, present, 'employees present')
    || '</tr></table>'
    || format('<p style="font-size:14px;margin:16px 0 4px">Sites in: <b>%s of %s</b>. Started by %s: <b>%s of %s</b>, %s phones recording. Uploaded: <b>%s</b> hours. Phones down: %s. Flags: %s. Incidents filed: %s, open in all: %s.</p>',
        t->>'reported', expected, rep->>'checkin_deadline', m->>'checked_in', expected, m->>'phones_deployed', t->>'hours_uploaded', t->>'phones_out', t->>'flags', jsonb_array_length(rep->'incidents'), rep->>'open_incidents')
    || format('<p style="font-size:14px;margin:4px 0 16px">This month: <b>%s</b> hours of %s. On this pace the month ends at <b>%s</b>. To hit the target the rest of the month needs %s a day.</p>',
        mo->>'hours', mo->>'target', mo->>'projected', mo->>'per_day_needed')
    || '<div style="font-size:12px;color:#6b6b62;margin:8px 0 4px">Hours, the last 14 days</div><table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;height:80px"><tr>' || bars || '</tr></table>'
    || '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:20px"><tr>'
    || '<th style="text-align:left;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Site</th><th style="text-align:left;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Check-out</th>'
    || '<th style="text-align:right;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Hours</th><th style="text-align:right;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Uploaded</th>'
    || '<th style="text-align:right;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Phones</th><th style="text-align:right;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Per phone</th>'
    || '<th style="text-align:right;font-size:12px;color:#6b6b62;padding:6px 8px;border-bottom:1px solid #b9b5a8">Opt-in</th></tr>' || rows || '</table>';
  if jsonb_array_length(rep->'incidents') > 0 then
    html := html || '<div style="font-size:16px;font-weight:600;margin:24px 0 6px">Incidents</div>';
    for it in select e from jsonb_array_elements(rep->'incidents') e loop
      html := html || format('<p style="font-size:14px;margin:4px 0"><b>%s. %s</b>, %s, %s: %s</p>', it->>'no', public.dr_esc(it->>'site'), it->>'kind', it->>'status', public.dr_esc(it->>'what'));
    end loop;
  end if;
  if exists (select 1 from jsonb_array_elements(rep->'sites') e where coalesce(e->'report'->>'gear_needed', '') <> '') then
    html := html || '<div style="font-size:16px;font-weight:600;margin:24px 0 6px">What the sites need</div>';
    for it in select e from jsonb_array_elements(rep->'sites') e where coalesce(e->'report'->>'gear_needed', '') <> '' loop
      html := html || format('<p style="font-size:14px;margin:4px 0"><b>%s</b>: %s</p>', public.dr_esc(it->>'name'), public.dr_esc(it->'report'->>'gear_needed'));
    end loop;
  end if;
  if host <> '' then
    html := html || format('<p style="font-size:13px;color:#6b6b62;margin-top:24px">The full report with the charts: <a href="%s/report/day/#%s" style="color:#1d5c45">%s/report/day/</a></p>', host, rep->>'day', host);
  end if;
  return html || '</div></div>';
end $$;

create or replace function public.dr_notify(p_kind text, p_force boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  hook text := coalesce((select value from public.dr_settings where key = 'slack_webhook'), '');
  host text := coalesce((select value from public.dr_settings where key = 'host'), '');
  rkey text := coalesce((select value from public.dr_settings where key = 'resend_key'), '');
  rto text := coalesce((select value from public.dr_settings where key = 'report_email'), '');
  rfrom text := coalesce(nullif((select value from public.dr_settings where key = 'email_from'), ''), 'Company map <onboarding@resend.dev>');
  nowc timestamp := now() at time zone 'Africa/Cairo';
  d date := nowc::date;
  rep jsonb; missing text; not_started text; problems text; msg text; expected int; reported int; started int; subject text;
begin
  if not p_force then
    if p_kind = 'morning' and extract(hour from nowc) <> 9 then return false; end if;
    if p_kind = 'chase' and extract(hour from nowc) <> 18 then return false; end if;
    if p_kind in ('number', 'email') and extract(hour from nowc) <> 20 then return false; end if;
  end if;
  if p_kind = 'email' then
    if rkey = '' or rto = '' then return false; end if;
    rep := public.dr_build(d);
    subject := 'Company report, ' || to_char(d, 'Dy DD Mon') || ': ' || round((rep->'totals'->>'hours')::numeric) || ' hours, ' || (rep->'totals'->>'phones_deployed') || ' phones, '
      || (rep->'totals'->>'reported') || ' of ' || (rep->>'expected') || ' sites in';
    perform net.http_post(url := 'https://api.resend.com/emails',
      body := jsonb_build_object('from', rfrom, 'to', (select jsonb_agg(btrim(a)) from unnest(string_to_array(rto, ',')) a where btrim(a) <> ''),
        'subject', subject, 'html', public.dr_email_html(rep)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || rkey));
    return true;
  end if;
  if hook = '' then return false; end if;
  rep := public.dr_build(d);
  expected := (rep->>'expected')::int;
  reported := (rep->'totals'->>'reported')::int;
  started := (rep->'morning'->>'checked_in')::int;
  select string_agg(x->>'name' || coalesce(' (' || (x->>'lead') || ')', ''), ', ') into missing
    from jsonb_array_elements(rep->'sites') x where (x->>'active')::boolean and x->'report' = 'null'::jsonb;
  select string_agg(x->>'name' || coalesce(' (' || (x->>'lead') || ')', ''), ', ') into not_started
    from jsonb_array_elements(rep->'sites') x where (x->>'active')::boolean and x->'checkin' = 'null'::jsonb;
  select string_agg(x->>'name' || ': ' || coalesce(x->'checkin'->>'note', 'problem'), '; ') into problems
    from jsonb_array_elements(rep->'sites') x where x->'checkin' <> 'null'::jsonb and not (x->'checkin'->>'ok')::boolean;
  if p_kind = 'morning' then
    msg := 'Morning check-in, ' || to_char(d, 'Dy DD Mon') || ': ' || started || ' of ' || expected || ' sites started. '
      || (rep->'morning'->>'phones_deployed') || ' phones recording, ' || (rep->'morning'->>'wearers_present') || ' employees present.'
      || case when not_started is null then ' Every site is in.' else ' Not in: ' || not_started || '.' end
      || case when problems is null then '' else ' Problems: ' || problems || '.' end;
  elsif p_kind = 'chase' then
    msg := 'Evening check-out, ' || to_char(d, 'Dy DD Mon') || ': ' || reported || ' of ' || expected || ' sites in by 6 PM.'
      || case when missing is null then ' Every site is in.' else ' Not in: ' || missing || '. Mano, chase.' end;
  else
    msg := 'Company report, ' || to_char(d, 'Dy DD Mon') || ': ' || (rep->'totals'->>'hours') || ' hours recorded'
      || case when (rep->>'target_day')::numeric > 0 then ' of ' || (rep->>'target_day') || ' target' else '' end
      || '. Hours uploaded ' || (rep->'totals'->>'hours_uploaded') || '. Phones ' || (rep->'totals'->>'phones_deployed')
      || ', employees present ' || (rep->'totals'->>'wearers_present')
      || '. Sites in ' || reported || ' of ' || expected
      || case when missing is null then '.' else '. Counted as zero: ' || missing || '.' end
      || ' Incidents ' || jsonb_array_length(rep->'incidents') || ' filed, ' || (rep->'totals'->>'incidents') || ' on the check-outs, ' || (rep->>'open_incidents') || ' open. Flags ' || (rep->'totals'->>'flags') || '.'
      || case when host <> '' then ' ' || host || '/report/day/' else '' end;
  end if;
  perform net.http_post(url := hook, body := jsonb_build_object('text', msg), headers := '{"Content-Type": "application/json"}'::jsonb);
  return true;
end $$;

revoke execute on function public.dr_email_html(jsonb), public.dr_esc(text) from public, anon, authenticated;

select cron.schedule('dr_email_summer', '5 17 * * *', 'select public.dr_notify(''email'')');
select cron.schedule('dr_email_winter', '5 18 * * *', 'select public.dr_notify(''email'')');

insert into public.dr_settings (key, value) values ('report_email', ''), ('email_from', ''), ('resend_key', '') on conflict (key) do nothing;

-- dr_admin: the same function as v3 with three more settings (report_email, email_from, resend_key, the key masked when read)
create or replace function public.dr_admin(p_code text, p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; k text; st text; v_name text; v_no int; a text;
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  if p_action = 'sites' then
    return (select coalesce(jsonb_agg(to_jsonb(s) order by s.status, s.team, s.sort, s.name), '[]'::jsonb) from public.dr_sites s);
  elsif p_action = 'site_add' then
    if length(btrim(coalesce(p->>'name', ''))) < 2 then raise exception 'name is missing'; end if;
    st := coalesce(nullif(p->>'status', ''), case when (p->>'active')::boolean is false then 'paused' else 'active' end);
    insert into public.dr_sites (name, team, lead, sort, status, industry, city, area, contact_name, contact_phone, phones_capacity, book, notes, source, last_touch, lead_id, pm_id)
    values (left(btrim(p->>'name'), 80), case when p->>'team' = 'partner' then 'partner' else 'direct' end,
      nullif(left(btrim(coalesce(p->>'lead', '')), 80), ''), coalesce((select max(sort) + 1 from public.dr_sites), 0), st,
      nullif(left(btrim(coalesce(p->>'industry', '')), 80), ''), nullif(left(btrim(coalesce(p->>'city', '')), 80), ''), nullif(p->>'area', ''),
      nullif(left(btrim(coalesce(p->>'contact_name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'contact_phone', '')), 40), ''),
      public.dr_num(p->>'phones_capacity', 0, 100000, 'phones')::int, nullif(left(btrim(coalesce(p->>'book', '')), 80), ''),
      nullif(left(coalesce(p->>'notes', ''), 4000), ''), nullif(left(btrim(coalesce(p->>'source', '')), 120), ''), nullif(p->>'last_touch', '')::date,
      case when coalesce(p->>'lead_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'lead_id')::uuid end,
      case when coalesce(p->>'pm_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'pm_id')::uuid end)
    on conflict (name) do update set status = excluded.status, team = excluded.team, lead = coalesce(excluded.lead, public.dr_sites.lead)
    returning id into v_id;
    perform public.dr_log_add('site', 'Site added: ' || left(btrim(p->>'name'), 80) || ' (' || st || ')', coalesce(p->>'by', 'management'), v_id, v_id);
    return jsonb_build_object('ok', true, 'id', v_id);
  elsif p_action = 'site_set' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
    v_id := (p->>'id')::uuid;
    update public.dr_sites set
      name = coalesce(nullif(left(btrim(p->>'name'), 80), ''), name),
      team = case when p->>'team' in ('direct', 'partner') then p->>'team' else team end,
      lead = case when p ? 'lead_id' then null when p ? 'lead' then nullif(left(btrim(p->>'lead'), 80), '') else lead end,
      lead_id = case when p ? 'lead_id' then (case when coalesce(p->>'lead_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'lead_id')::uuid end) else lead_id end,
      book = case when p ? 'pm_id' then null when p ? 'book' then nullif(left(btrim(p->>'book'), 80), '') else book end,
      pm_id = case when p ? 'pm_id' then (case when coalesce(p->>'pm_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'pm_id')::uuid end) else pm_id end,
      status = case when p ? 'status' and coalesce(p->>'status', '') <> '' then p->>'status'
                    when p ? 'active' then (case when (p->>'active')::boolean then 'active' else 'paused' end) else status end,
      industry = case when p ? 'industry' then nullif(left(btrim(p->>'industry'), 80), '') else industry end,
      city = case when p ? 'city' then nullif(left(btrim(p->>'city'), 80), '') else city end,
      area = case when p ? 'area' then nullif(p->>'area', '') else area end,
      contact_name = case when p ? 'contact_name' then nullif(left(btrim(p->>'contact_name'), 120), '') else contact_name end,
      contact_phone = case when p ? 'contact_phone' then nullif(left(btrim(p->>'contact_phone'), 40), '') else contact_phone end,
      phones_capacity = case when p ? 'phones_capacity' then public.dr_num(p->>'phones_capacity', 0, 100000, 'phones')::int else phones_capacity end,
      notes = case when p ? 'notes' then nullif(left(p->>'notes', 4000), '') else notes end,
      source = case when p ? 'source' then nullif(left(btrim(p->>'source'), 120), '') else source end,
      last_touch = case when p ? 'last_touch' then nullif(p->>'last_touch', '')::date else last_touch end
    where id = v_id returning name into v_name;
    if not found then raise exception 'unknown site'; end if;
    perform public.dr_log_add('site', 'Site changed: ' || v_name, coalesce(p->>'by', 'management'), v_id, v_id);
    return jsonb_build_object('ok', true);
  elsif p_action = 'site_history' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown site'; end if;
    v_id := (p->>'id')::uuid;
    return jsonb_build_object(
      'reports', (select coalesce(jsonb_agg(jsonb_build_object('day', r.day, 'reporter', r.reporter, 'hours', r.hours, 'hours_uploaded', r.hours_uploaded, 'phones_deployed', r.phones_deployed,
          'phones_uploaded', r.phones_uploaded, 'backlog', r.backlog, 'wearers_present', r.wearers_present, 'wearers_scheduled', r.wearers_scheduled, 'phones_out', r.phones_out,
          'flags', r.flags, 'incident', r.incident, 'late', r.late, 'first_at', to_char(r.first_at at time zone 'Africa/Cairo', 'HH24:MI')) order by r.day desc), '[]'::jsonb)
          from (select * from public.dr_reports where site_id = v_id order by day desc limit 30) r),
      'checkins', (select coalesce(jsonb_agg(jsonb_build_object('day', c.day, 'reporter', c.reporter, 'started_at', to_char(c.started_at, 'HH24:MI'), 'phones_deployed', c.phones_deployed,
          'wearers_present', c.wearers_present, 'ok', c.ok, 'note', c.note, 'late', c.late) order by c.day desc), '[]'::jsonb)
          from (select * from public.dr_checkins where site_id = v_id order by day desc limit 30) c),
      'incidents', (select coalesce(jsonb_agg(jsonb_build_object('no', i.no, 'day', i.day, 'kind', i.kind, 'what', i.what, 'status', i.status, 'reporter', i.reporter) order by i.no desc), '[]'::jsonb)
          from (select * from public.dr_incidents where site_id = v_id order by no desc limit 20) i),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'phone', phone, 'active', active) order by sort, name), '[]'::jsonb)
          from public.dr_people where site_id = v_id),
      'month_hours', (select coalesce(sum(hours), 0) from public.dr_reports where site_id = v_id and day >= date_trunc('month', (now() at time zone 'Africa/Cairo')::date)::date),
      'days_reported', (select count(*) from public.dr_reports where site_id = v_id and day > (now() at time zone 'Africa/Cairo')::date - 30)
    );
  elsif p_action = 'people' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'role', pp.role, 'team', pp.team, 'site_id', pp.site_id, 'site', s.name, 'phone', pp.phone,
        'notes', pp.notes, 'active', pp.active, 'sort', pp.sort) order by pp.active desc, pp.sort, pp.name), '[]'::jsonb)
      from public.dr_people pp left join public.dr_sites s on s.id = pp.site_id);
  elsif p_action = 'person_add' then
    if length(btrim(coalesce(p->>'name', ''))) < 2 then raise exception 'name is missing'; end if;
    insert into public.dr_people (name, role, team, site_id, phone, notes, sort)
    values (left(btrim(p->>'name'), 80), coalesce(nullif(p->>'role', ''), 'site-lead'), case when p->>'team' = 'partner' then 'partner' else 'direct' end,
      case when coalesce(p->>'site_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'site_id')::uuid end,
      nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''), nullif(left(coalesce(p->>'notes', ''), 2000), ''), coalesce((select max(sort) + 1 from public.dr_people), 0))
    returning id into v_id;
    perform public.dr_log_add('person', 'Added to the team: ' || left(btrim(p->>'name'), 80) || ' (' || coalesce(nullif(p->>'role', ''), 'site-lead') || ')', coalesce(p->>'by', 'management'), null, v_id);
    return jsonb_build_object('ok', true, 'id', v_id);
  elsif p_action = 'person_set' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown person'; end if;
    v_id := (p->>'id')::uuid;
    update public.dr_people set
      name = coalesce(nullif(left(btrim(p->>'name'), 80), ''), name),
      role = case when p ? 'role' and coalesce(p->>'role', '') <> '' then p->>'role' else role end,
      team = case when p->>'team' in ('direct', 'partner') then p->>'team' else team end,
      site_id = case when p ? 'site_id' then (case when coalesce(p->>'site_id', '') ~ '^[0-9a-fA-F-]{36}$' then (p->>'site_id')::uuid end) else site_id end,
      phone = case when p ? 'phone' then nullif(left(btrim(p->>'phone'), 40), '') else phone end,
      notes = case when p ? 'notes' then nullif(left(p->>'notes', 2000), '') else notes end,
      active = coalesce((p->>'active')::boolean, active)
    where id = v_id returning name into v_name;
    if not found then raise exception 'unknown person'; end if;
    perform public.dr_log_add('person', 'Team changed: ' || v_name, coalesce(p->>'by', 'management'), null, v_id);
    return jsonb_build_object('ok', true);
  elsif p_action = 'incidents' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'no', i.no, 'day', i.day, 'at', to_char(i.at, 'HH24:MI'), 'site_id', i.site_id, 'site', coalesce(s.name, i.place),
        'reporter', i.reporter, 'role', i.role, 'kind', i.kind, 'what', i.what, 'people', i.people, 'phones', i.phones, 'actions', i.actions, 'told', i.told, 'needs', i.needs,
        'status', i.status, 'resolution', i.resolution, 'closed_by', i.closed_by, 'closed_at', to_char(i.closed_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
        'sent_at', to_char(i.first_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')) order by (i.status = 'open') desc, i.no desc), '[]'::jsonb)
      from (select * from public.dr_incidents where status = 'open' or day > (now() at time zone 'Africa/Cairo')::date - coalesce(nullif(p->>'days', '')::int, 60) order by no desc limit 300) i
      left join public.dr_sites s on s.id = i.site_id);
  elsif p_action = 'incident_set' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown incident'; end if;
    v_id := (p->>'id')::uuid;
    st := case when p->>'status' in ('open', 'closed') then p->>'status' end;
    update public.dr_incidents set
      status = coalesce(st, status),
      resolution = case when p ? 'resolution' then nullif(left(p->>'resolution', 2000), '') else resolution end,
      needs = case when p ? 'needs' then nullif(left(p->>'needs', 2000), '') else needs end,
      closed_at = case when st = 'closed' then now() when st = 'open' then null else closed_at end,
      closed_by = case when st = 'closed' then left(coalesce(nullif(p->>'by', ''), 'management'), 80) when st = 'open' then null else closed_by end
    where id = v_id returning no into v_no;
    if not found then raise exception 'unknown incident'; end if;
    if st is not null then perform public.dr_log_add('incident', 'Incident ' || v_no || ' ' || st, coalesce(nullif(p->>'by', ''), 'management'), null, v_id); end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'log' then
    return (select coalesce(jsonb_agg(jsonb_build_object('at', to_char(l.at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'), 'kind', l.kind, 'what', l.what, 'who', l.who, 'site', s.name) order by l.at desc), '[]'::jsonb)
      from (select * from public.dr_log order by at desc limit coalesce(nullif(p->>'limit', '')::int, 60)) l left join public.dr_sites s on s.id = l.site_id);
  elsif p_action = 'settings' then
    return (select coalesce(jsonb_object_agg(key, case when key in ('slack_webhook', 'resend_key') then (case when value <> '' then 'set' else '' end) else value end), '{}'::jsonb)
      from public.dr_settings where key in ('team_code', 'deadline', 'checkin_deadline', 'targets', 'slack_webhook', 'report_email', 'email_from', 'resend_key'));
  elsif p_action = 'setting' then
    k := p->>'key';
    if k not in ('team_code', 'report_code', 'deadline', 'checkin_deadline', 'reporters', 'slack_webhook', 'report_email', 'email_from', 'resend_key') then raise exception 'unknown setting'; end if;
    if k in ('team_code', 'report_code', 'deadline', 'checkin_deadline') and length(btrim(coalesce(p->>'value', ''))) < 3 then raise exception 'value is too short'; end if;
    if k in ('deadline', 'checkin_deadline') then perform (p->>'value')::time; end if;
    if k = 'slack_webhook' and coalesce(p->>'value', '') <> '' and (p->>'value') !~ '^https://hooks\.slack\.com/' then raise exception 'not a Slack webhook'; end if;
    if k = 'resend_key' and coalesce(p->>'value', '') <> '' and (p->>'value') !~ '^re_[A-Za-z0-9_-]{8,}$' then raise exception 'not a Resend key'; end if;
    if k = 'report_email' then
      for a in select btrim(x) from unnest(string_to_array(coalesce(p->>'value', ''), ',')) x loop
        if a <> '' and a !~ '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$' then raise exception 'not an email address'; end if;
      end loop;
    end if;
    if k = 'email_from' and length(coalesce(p->>'value', '')) > 120 then raise exception 'value is too long'; end if;
    insert into public.dr_settings (key, value) values (k, btrim(coalesce(p->>'value', ''))) on conflict (key) do update set value = excluded.value;
    perform public.dr_log_add('setting', 'Setting changed: ' || k, coalesce(p->>'by', 'management'));
    return jsonb_build_object('ok', true);
  elsif p_action = 'target' then
    if coalesce(p->>'month', '') !~ '^\d{4}-\d{2}$' then raise exception 'bad month'; end if;
    insert into public.dr_settings (key, value) values ('targets', jsonb_build_object(p->>'month', public.dr_num(p->>'hours', 0, 10000000, 'hours'))::text)
    on conflict (key) do update set value = (public.dr_settings.value::jsonb || jsonb_build_object(p->>'month', public.dr_num(p->>'hours', 0, 10000000, 'hours')))::text;
    perform public.dr_log_add('setting', 'Target set: ' || (p->>'month') || ', ' || (p->>'hours') || ' hours', coalesce(p->>'by', 'management'));
    return jsonb_build_object('ok', true);
  elsif p_action = 'test_post' then
    return jsonb_build_object('ok', true, 'sent', public.dr_notify(coalesce(p->>'kind', 'number'), true));
  end if;
  raise exception 'unknown action';
end $$;
