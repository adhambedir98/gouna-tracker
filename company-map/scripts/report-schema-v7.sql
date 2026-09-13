-- Company map, database v7 (migration "company_map_v7_accounts"): who may read the map.
-- Adds accounts (Supabase Auth), a role and a status per person, the pages each role may open, the content itself behind the API,
-- and a log of what people do on the site with an immediate alert when something looks like a copy.
-- Applied on top of v6b. The three worker forms (the morning check-in, the evening check-out, the incident report) stay open with the team code:
-- the people at the sites have no accounts and their day must not stop.
--
-- These follow-ups are deployed on top of the text below, in this order:
--   v7b (migration "company_map_v7b_posthog_setting"): dr_admin also takes the settings posthog_key and posthog_host, each checked for its shape.
--   v7c (migration "company_map_v7c_open_forms_chrome"): dr_content hands a reader with no active account the public and chrome files only
--       (the navigation, the address of the database, the labels), so the three site forms can still draw themselves, and raises
--       'sign in', 'account waiting' or 'account blocked' only when they asked for content and got none. The text of dr_content below is that version.
--   v7d (migration "company_map_v7d_revoke_table_reads"): the three new tables have no privilege granted to anon or authenticated either,
--       so row level security is the second lock and not the only one, the way the older tables already are.
--   v7e (migration "company_map_v7e_harden_events_and_sections"), after review: a path nobody has placed belongs to the section 'closed' and is
--       refused by dr_content_put rather than stored where no role can read it; an anonymous reader gets only the label blocks the three site
--       forms use, not the rest of the map's vocabulary; a page name in dr_event is stripped to one plain line so nothing a caller types can
--       shape a Slack alert, the detail is capped, an anonymous caller can write at most sixty rows a minute, and a sign-up name is trimmed to 80
--       characters with no control characters. The text below is the v7e state.
--   v7f (migration "company_map_v7f_channels_is_company"): data/channels.json belongs to the section 'company'.
--   v7g (migration "company_map_v7g_quality_is_everyday"): data/manual/quality.json belongs to 'everyday'. It is the page about spotting
--       a faked day, and the people who work the sites need it.
--   v7h (migration "company_map_v7h_arabic_index_is_chrome"): data/index.json belongs to 'chrome', so data/ar/index.json does too and the
--       Arabic mirror of every page is asked for again. Before this the whole site was quietly English only once the content moved
--       behind the API.
--   v7i (migration "company_map_v7i_letting_in_confirms_the_email"): letting an account in also marks its email confirmed, so a person
--       who never received the sign-up message is not stuck waiting for it.
--   v7j (migration "report_v7j_profile_for_older_accounts"): an account made before this layer existed had no row in dr_users, so it could
--       never be given a role and signing up again sent nothing (an address that already has an account is sent no message). dr_my now
--       makes the missing row the first time that person asks, and the accounts already in the project were given one. The text of dr_my
--       below is that version.
--   v7k (migration "company_map_v7k_account_dates"): a profile made for an older account carries the date the account was made,
--       so the accounts page says when somebody actually asked. The text of dr_my below is that version.

-- 1. One row per account. It is made by a trigger the moment somebody signs up, and it starts pending with no role, so signing up grants nothing.
create table if not exists public.dr_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'none',
  status text not null default 'pending',          -- pending, active, blocked
  person_id uuid references public.dr_people(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz, approved_by text,
  last_seen timestamptz, seen_count int not null default 0
);
alter table public.dr_users enable row level security;   -- no policies: nothing reads this table except the functions below
create index if not exists dr_users_email on public.dr_users (lower(email));

create or replace function public.dr_user_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.dr_users (id, email, name)
  values (new.id, lower(coalesce(new.email, '')), nullif(btrim(coalesce(new.raw_user_meta_data->>'name', '')), ''))
  on conflict (id) do nothing;
  perform public.dr_log_add('account', 'Account asked for: ' || lower(coalesce(new.email, '')), 'sign-up');
  return new;
end $$;
drop trigger if exists dr_users_new on auth.users;
create trigger dr_users_new after insert on auth.users for each row execute function public.dr_user_new();

-- 2. The sections of the map, and which role may open which. The map lives in dr_settings so it can change without a deploy.
--    company: who we are, who does what, the process, the day. everyday: the rules, fraud, who to call, the never list, onboarding, incidents.
--    training, forms (the paper forms and the online forms), sops (the standard procedures), manual (how the subsystems work),
--    numbers (metrics, risks, the glossary, the money manual), jobs (the postings and handbooks), online (the management pages).
insert into public.dr_settings (key, value) values ('roles', jsonb_build_object(
  'founder',           jsonb_build_array('company','everyday','training','forms','sops','manual','numbers','jobs','online'),
  'management',        jsonb_build_array('company','everyday','training','forms','sops','manual','numbers','jobs','online'),
  'portfolio-manager', jsonb_build_array('company','everyday','training','forms','sops','manual','numbers','online'),
  'site-lead',         jsonb_build_array('company','everyday','training','forms','sops'),
  'operator',          jsonb_build_array('everyday','training','forms'),
  'partner',           jsonb_build_array('company','everyday','forms'),
  'candidate',         jsonb_build_array('jobs'),
  'none',              jsonb_build_array()
)::text) on conflict (key) do nothing;
insert into public.dr_settings (key, value) values ('posthog_key', ''), ('posthog_host', 'https://eu.i.posthog.com') on conflict (key) do nothing;

-- 3. Which section a file belongs to. The page modules carry the same rule in js/access.js; this one decides.
create or replace function public.dr_section(p_path text) returns text
language sql immutable as $$
  select case
    when p is null or p = '' then 'closed'
    when p in ('data/site.json', 'data/report.json') then 'public'
    when p = 'data/ui.json' then 'chrome'
    when p = 'data/manual/money.json' then 'numbers'
    when p = 'data/manual/quality.json' then 'everyday'   -- the eight fraud patterns live here, and the fraud page is a worker page
    when p like 'data/sops/%' then 'sops'
    when p like 'data/jobs/%' then 'jobs'
    when p like 'data/manual/%' then 'manual'
    when p like 'data/forms/%' then 'forms'
    when p in ('data/systems.json', 'data/decisions.json') then 'manual'
    when p = 'data/channels.json' then 'company'          -- the process page is a company page, and this is what it reads
    when p in ('data/metrics.json', 'data/risks.json', 'data/glossary.json') then 'numbers'
    when p = 'data/training.json' then 'training'
    when p in ('data/start.json', 'data/people.json', 'data/day.json') then 'company'
    when p in ('data/rules.json', 'data/fraud.json', 'data/call.json', 'data/never.json', 'data/gate.json', 'data/incidents.json') then 'everyday'
    else 'closed' end                                     -- a file nobody has placed is read by nobody
  from (select case when p_path like 'data/ar/%' then 'data/' || substring(p_path from 9) else p_path end as p) x;
$$;
revoke all on function public.dr_section(text) from public, anon, authenticated;

-- 4. Who is asking. Every page calls this first; it also keeps the last seen stamp.
create or replace function public.dr_my() returns public.dr_users
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype;
begin
  if auth.uid() is null then return u; end if;
  select * into u from public.dr_users where id = auth.uid();
  -- an account made before this layer existed, or one the trigger missed, gets its row here the first time it asks
  if u.id is null then
    insert into public.dr_users (id, email, name, created_at)
    select a.id, lower(left(coalesce(a.email, ''), 160)),
      nullif(btrim(left(regexp_replace(coalesce(a.raw_user_meta_data->>'name', ''), '[[:cntrl:]]', ' ', 'g'), 80)), ''),
      coalesce(a.created_at, now())
    from auth.users a where a.id = auth.uid() and a.email is not null
    on conflict (id) do nothing;
    select * into u from public.dr_users where id = auth.uid();
  end if;
  return u;
end $$;

create or replace function public.dr_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype; secs jsonb;
begin
  u := public.dr_my();
  if u.id is null then return jsonb_build_object('signed_in', false); end if;
  update public.dr_users set last_seen = now(), seen_count = seen_count + 1 where id = u.id;
  secs := case when u.status = 'active'
    then coalesce((select (value::jsonb) -> u.role from public.dr_settings where key = 'roles'), '[]'::jsonb) else '[]'::jsonb end;
  return jsonb_build_object('signed_in', true, 'id', u.id, 'email', u.email,
    'name', coalesce(nullif(btrim(coalesce(u.name, '')), ''), split_part(u.email, '@', 1)),
    'role', u.role, 'status', u.status, 'sections', coalesce(secs, '[]'::jsonb),
    'posthog', jsonb_build_object(
      'key', coalesce((select value from public.dr_settings where key = 'posthog_key'), ''),
      'host', coalesce(nullif((select value from public.dr_settings where key = 'posthog_host'), ''), 'https://eu.i.posthog.com')));
end $$;

-- 5. The content of the map, one row per file, pushed from the repository by scripts/push-content.mjs.
--    The deployed site does not carry data/*.json any more: the pages read them through dr_content, which answers only for the reader's role.
create table if not exists public.dr_content (
  path text primary key,
  section text not null,
  body jsonb not null,
  bytes int,
  updated_at timestamptz not null default now()
);
alter table public.dr_content enable row level security;

create or replace function public.dr_content(p_paths text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype; secs jsonb; out jsonb := '{}'::jsonb; r record; n int; open_only boolean;
begin
  u := public.dr_my();
  n := coalesce(array_length(p_paths, 1), 0);
  if n = 0 then return out; end if;
  if n > 200 then raise exception 'too many files'; end if;
  open_only := u.id is null or u.status <> 'active';
  secs := case when open_only then '[]'::jsonb
    else coalesce((select (value::jsonb) -> u.role from public.dr_settings where key = 'roles'), '[]'::jsonb) end;
  for r in select c.path, c.body, c.section from public.dr_content c where c.path = any(p_paths) loop
    if r.section in ('public', 'chrome') or secs ? r.section then out := out || jsonb_build_object(r.path, r.body); end if;
  end loop;
  -- somebody who asked for real content and has no account gets told why, instead of an empty page
  if open_only and out = '{}'::jsonb then
    if u.id is null then raise exception 'sign in';
    elsif u.status = 'blocked' then raise exception 'account blocked';
    else raise exception 'account waiting'; end if;
  end if;
  return out;
end $$;

create or replace function public.dr_content_put(p_code text, p_path text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  if coalesce(p_path, '') !~ '^data/[A-Za-z0-9/_-]+\.json$' then raise exception 'bad path'; end if;
  insert into public.dr_content (path, section, body, bytes, updated_at)
  values (p_path, public.dr_section(p_path), p_body, length(p_body::text), now())
  on conflict (path) do update set section = excluded.section, body = excluded.body, bytes = excluded.bytes, updated_at = now();
  return jsonb_build_object('ok', true, 'path', p_path, 'section', public.dr_section(p_path));
end $$;

-- 6. What people do on the map. Every page sends its own view; the guard sends anything that looks like a copy.
--    A browser cannot tell anyone that a screenshot was taken. These are the signals a browser does give, and the watermark on every page
--    is what makes a leaked picture traceable.
create table if not exists public.dr_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references public.dr_users(id) on delete set null,
  email text, name text, role text,
  kind text not null,          -- view, print, printscreen, capture, copy, save, devtools, right-click, sign-in, sign-out, denied
  page text, detail jsonb, agent text
);
alter table public.dr_events enable row level security;
create index if not exists dr_events_at on public.dr_events (at desc);
create index if not exists dr_events_kind on public.dr_events (kind, at desc);

-- the alert itself: Slack and email, sent the moment it happens, with the same settings the daily posts use
create or replace function public.dr_alert(p_text text, p_subject text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  hook text := coalesce((select value from public.dr_settings where key = 'slack_webhook'), '');
  rkey text := coalesce((select value from public.dr_settings where key = 'resend_key'), '');
  rto text := coalesce((select value from public.dr_settings where key = 'report_email'), '');
  rfrom text := coalesce(nullif((select value from public.dr_settings where key = 'email_from'), ''), 'Company map <onboarding@resend.dev>');
  sent boolean := false;
begin
  if hook <> '' then
    perform net.http_post(url := hook, body := jsonb_build_object('text', p_text), headers := jsonb_build_object('Content-Type', 'application/json'));
    sent := true;
  end if;
  if rkey <> '' and rto <> '' then
    perform net.http_post(url := 'https://api.resend.com/emails',
      body := jsonb_build_object('from', rfrom,
        'to', (select jsonb_agg(btrim(a)) from unnest(string_to_array(rto, ',')) a where btrim(a) <> ''),
        'subject', p_subject, 'html', '<p style="font:15px system-ui">' || public.dr_esc(p_text) || '</p>'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || rkey));
    sent := true;
  end if;
  return sent;
end $$;

create or replace function public.dr_event(p_kind text, p_page text, p_detail jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.dr_users%rowtype;
  k text := lower(coalesce(p_kind, ''));
  who text; nowc timestamp := now() at time zone 'Africa/Cairo';
  recent int;
begin
  if k !~ '^[a-z-]{2,20}$' then raise exception 'bad kind'; end if;
  u := public.dr_my();
  insert into public.dr_events (user_id, email, name, role, kind, page, detail, agent)
  values (u.id, u.email, u.name, u.role, k, left(coalesce(p_page, ''), 120), coalesce(p_detail, '{}'::jsonb),
    left(coalesce(current_setting('request.headers', true)::json->>'user-agent', ''), 300));
  -- the kinds worth waking somebody for, at most one alert a minute per person and kind
  if k in ('print', 'printscreen', 'capture', 'save', 'devtools', 'copy-page') then
    select count(*) into recent from public.dr_events e
      where e.kind = k and e.at > now() - interval '1 minute' and coalesce(e.email, '') = coalesce(u.email, '') and e.id < currval('dr_events_id_seq');
    if recent = 0 then
      who := coalesce(nullif(btrim(coalesce(u.name, '')), ''), u.email, 'somebody not signed in');
      perform public.dr_alert(
        case k when 'print' then 'Print' when 'printscreen' then 'Print Screen key' when 'capture' then 'Screen capture started'
               when 'save' then 'Save page' when 'devtools' then 'Developer tools' else 'Whole page copied' end
        || ': ' || who || ' on ' || coalesce(nullif(p_page, ''), 'the map') || ', ' || to_char(nowc, 'DD Mon HH24:MI') || ' Cairo.',
        'Company map: ' || who || ' on ' || coalesce(nullif(p_page, ''), 'the map'));
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 7. Management: the account list, approving somebody, and what the guard has seen.
create or replace function public.dr_accounts(p_code text, p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text; v_role text; v_status text;
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  if p_action = 'users' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', u.role, 'status', u.status,
        'created_at', to_char(u.created_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
        'last_seen', to_char(u.last_seen at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'), 'seen', u.seen_count, 'note', u.note)
      order by (u.status = 'pending') desc, u.created_at desc), '[]'::jsonb) from public.dr_users u);
  elsif p_action = 'user_set' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown account'; end if;
    v_id := (p->>'id')::uuid;
    v_role := case when p ? 'role' then p->>'role' end;
    v_status := case when p ? 'status' then p->>'status' end;
    if v_role is not null and not ((select value::jsonb from public.dr_settings where key = 'roles') ? v_role) then raise exception 'unknown role'; end if;
    if v_status is not null and v_status not in ('pending', 'active', 'blocked') then raise exception 'unknown status'; end if;
    update public.dr_users set
      role = coalesce(v_role, role),
      status = coalesce(v_status, status),
      name = case when p ? 'name' then nullif(btrim(p->>'name'), '') else name end,
      note = case when p ? 'note' then nullif(left(btrim(p->>'note'), 500), '') else note end,
      approved_at = case when v_status = 'active' then now() else approved_at end,
      approved_by = case when v_status = 'active' then left(coalesce(nullif(p->>'by', ''), 'management'), 80) else approved_by end
    where id = v_id returning email, role, status into v_email, v_role, v_status;
    if not found then raise exception 'unknown account'; end if;
    perform public.dr_log_add('account', 'Account ' || v_email || ': ' || v_role || ', ' || v_status, coalesce(p->>'by', 'management'));
    return jsonb_build_object('ok', true);
  elsif p_action = 'events' then
    return (select coalesce(jsonb_agg(jsonb_build_object('at', to_char(e.at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
        'kind', e.kind, 'page', e.page, 'name', coalesce(e.name, e.email), 'role', e.role, 'detail', e.detail) order by e.at desc), '[]'::jsonb)
      from (select * from public.dr_events
            where (coalesce(p->>'kind', '') = '' or kind = p->>'kind')
              and (coalesce(p->>'watch', '') <> 'true' or kind in ('print', 'printscreen', 'capture', 'save', 'devtools', 'copy-page', 'copy'))
            order by at desc limit least(coalesce(nullif(p->>'limit', '')::int, 100), 500)) e);
  elsif p_action = 'roles' then
    return (select value::jsonb from public.dr_settings where key = 'roles');
  end if;
  raise exception 'unknown action';
end $$;

-- 8. Who may call what through the API.
revoke all on function public.dr_content_put(text, text, jsonb) from public;
grant execute on function public.dr_content_put(text, text, jsonb) to anon, authenticated;
revoke all on function public.dr_alert(text, text) from public, anon, authenticated;
revoke all on function public.dr_my() from public, anon, authenticated;
revoke all on function public.dr_section(text) from public, anon, authenticated;
revoke all on function public.dr_content(text[]) from public;
grant execute on function public.dr_content(text[]) to anon, authenticated;
revoke all on table public.dr_users from anon, authenticated;
revoke all on table public.dr_content from anon, authenticated;
revoke all on table public.dr_events from anon, authenticated;
revoke all on sequence public.dr_events_id_seq from anon, authenticated;
revoke all on function public.dr_me() from public;
grant execute on function public.dr_me() to anon, authenticated;
revoke all on function public.dr_event(text, text, jsonb) from public;
grant execute on function public.dr_event(text, text, jsonb) to anon, authenticated;
revoke all on function public.dr_accounts(text, text, jsonb) from public;
grant execute on function public.dr_accounts(text, text, jsonb) to anon, authenticated;
