-- Company map, database v18: the client's file under the dashboard.
-- Applied as migrations dr_uploads_v18_the_file_under_the_dashboard, dr_uploads_v18b_attribute_the_batch_only,
-- dr_uploads_v18c_one_pass_per_number, dr_uploads_v18d_internal_placing_not_callable and dr_uploads_v18e_unplaced_is_not_legacy,
-- on top of v16. In v18e 'unplaced' is site null with no rule at all (the legacy rows are not in it), and the day series
-- sums the placed sites only, so the last point of the chart is the sum of the table.
--
-- The client exports every uploaded session: one row per session with the account that uploaded it, the minutes, when
-- it was recorded and when it landed, and the reviewer's verdict. That file is the ground truth for hours, and it is
-- the only thing that can say whether what a site typed on its check-out is what came out of its phones. It comes in
-- daily, whole or in slices, through dr_upload_ingest, and lands on its session id: the same rows twice change nothing
-- but the verdicts, so the agent can post the whole export every morning.
--
-- A session belongs to a site by three rules, in order:
--   1. the check-out that listed its phone that day (dr_phone_log, kind evening, tag = the phone number in the account);
--   2. the first rule in dr_upload_rules whose pattern matches the account, the part of the email before the @;
--   3. the phone list, dr_phone_home: the sheet of which site holds which phone number.
-- Rule 1 is read at page time, because the check-outs come in after the file. Rules 2 and 3 are written on the row at
-- ingest (site_id and how: account, sheet, legacy, or null), and rerun over every row when a rule or a phone changes.
-- A rule with no site marks a legacy family: counted in the file, in no site's row.
--
-- Accounts are not phones. The numbered accounts (0101 to 0277) carry the sticker number of the phone, the named ones
-- (mobedair06, luca-panogouna, 105.ramsis) do not, and one login can sit on several phones at once. The phone number
-- is parsed from the account when it is one, ^0?(\d{2,3})$, and is null otherwise.
--
-- A day is settled three days on: a quarter of footage lands more than a day after it is shot, the middle phone
-- takes eight hours, and one site's phones take a day and a half.

create table public.dr_upload_sessions (
  session_id  text primary key,
  user_key    text,
  email       text not null,
  account     text not null,                 -- the part before the @
  phone       int,                           -- the sticker number, when the account is one
  task_name   text,
  quality     text,                          -- the reviewer's grade; null until reviewed
  verdict     text,                          -- fraud, feedback, or null
  flagged     int,
  minutes     numeric not null,
  recorded_at timestamptz not null,
  uploaded_at timestamptz,
  day         date not null,                 -- the Cairo date of recorded_at
  site_id     uuid references public.dr_sites(id) on delete set null,
  how         text,                          -- account, sheet, legacy, or null: how the row was placed on ingest
  imported_at timestamptz not null default now()
);
create index dr_upload_sessions_day on public.dr_upload_sessions (day);
create index dr_upload_sessions_site_day on public.dr_upload_sessions (site_id, day);
create index dr_upload_sessions_phone_day on public.dr_upload_sessions (phone, day);
create index dr_upload_sessions_account on public.dr_upload_sessions (account);

create table public.dr_upload_rules (
  id      uuid primary key default gen_random_uuid(),
  pattern text not null,                     -- a regular expression, matched case-blind against the account
  site_id uuid references public.dr_sites(id) on delete cascade,   -- null: a legacy family, counted in no row
  note    text,
  sort    int not null default 0
);

create table public.dr_phone_home (
  phone   int primary key,
  site_id uuid references public.dr_sites(id) on delete set null,
  place   text,
  status  text not null default 'active'     -- active, inactive, lost
);

alter table public.dr_upload_sessions enable row level security;
alter table public.dr_upload_rules enable row level security;
alter table public.dr_phone_home enable row level security;
-- no policies, no privileges: the tables are reached through the functions below and nothing else

-- The rules as seeded, from the file and the mapping the founders confirmed. Sort order is the match order.
--   \.ramsis$|^t\.p\.ramsis   Panorama Ramsis          the NNN.ramsis accounts
--   panogouna$|^lucagouna     Panorama El Gouna        luca, ahmed, soliman and the pano accounts
--   sharm\d*$                 Panorama Sharm           mazen.adel.sharm
--   sallab                    Sallab Factory           Y.f.NN.elsallab, s.a.sallab, a.a.elsallab
--   egplast                   EGPlast                  a.m.egplast
--   mksb                      MaxAB                    e.o.mksb
--   ^mo\.?bedair              Skilled Trades (Emad)    mobedair, Mobedair, mo.bedair.kitchen, mo.bedair.const: Mohamed Emad, Mansoura
--   ^ahm\d                    Tanta                    the ahm accounts
--   ^edcc?\d                  legacy                   the first accounts, before the sites had their own
-- The phone list was loaded from the distribution sheet of 17 September: 270 numbers, 265 with a site, five inactive
-- or lost. It is edited on the page, one phone at a time.

-- Placing rows. The batch version runs on ingest over the rows that just came in; the dated version runs over every
-- row (or every row from a day) when a rule or a phone on the list changes. Both are internal: no execute for anon.
create or replace function public.dr_upload_attribute_rows(p_ids text[])
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  with m as (
    select s.session_id,
      (select x.site_id from public.dr_upload_rules x where s.account ~* x.pattern order by x.sort, x.id limit 1) as rule_site,
      (select x.id from public.dr_upload_rules x where s.account ~* x.pattern order by x.sort, x.id limit 1) as rule_id,
      (select h.site_id from public.dr_phone_home h where h.phone = s.phone) as home_site
    from public.dr_upload_sessions s where s.session_id = any(p_ids))
  update public.dr_upload_sessions s
     set site_id = coalesce(m.rule_site, case when m.rule_id is null then m.home_site end),
         how = case when m.rule_site is not null then 'account' when m.rule_id is not null then 'legacy' when m.home_site is not null then 'sheet' end
    from m where m.session_id = s.session_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.dr_upload_attribute(p_from date default null)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  with m as (
    select s.session_id,
      (select x.site_id from public.dr_upload_rules x where s.account ~* x.pattern order by x.sort, x.id limit 1) as rule_site,
      (select x.id from public.dr_upload_rules x where s.account ~* x.pattern order by x.sort, x.id limit 1) as rule_id,
      (select h.site_id from public.dr_phone_home h where h.phone = s.phone) as home_site
    from public.dr_upload_sessions s where p_from is null or s.day >= p_from)
  update public.dr_upload_sessions s
     set site_id = coalesce(m.rule_site, case when m.rule_id is null then m.home_site end),
         how = case when m.rule_site is not null then 'account' when m.rule_id is not null then 'legacy' when m.home_site is not null then 'sheet' end
    from m where m.session_id = s.session_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- The file, as text, header or not. Ten columns: user_key, email, session_id, task_name, quality, verdict, flagged,
-- minutes, recorded_at, uploaded_at. A line that is not ten columns with a uuid and a number is refused and counted.
-- Management code or a signed-in manager. The page sends slices of four thousand lines; the agent may do the same.
create or replace function public.dr_upload_ingest(p_code text, p_csv text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n_lines int; n_bad int; n_before int; n_after int; n_valid int; d_from date; d_to date; h numeric;
begin
  if not public.dr_may(p_code, array['founder', 'management']) then raise exception 'wrong code'; end if;
  if p_csv is null or length(p_csv) < 40 then raise exception 'the file is empty'; end if;
  create temp table t_in on commit drop as
    select string_to_array(line, ',') as parts
    from regexp_split_to_table(p_csv, E'\r?\n') as line
    where btrim(line) <> '' and line !~* '^user_key,';
  select count(*) into n_lines from t_in;
  select count(*) into n_bad from t_in where array_length(parts, 1) <> 10 or parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or parts[8] !~ '^[0-9.]+$';
  select count(*) into n_before from public.dr_upload_sessions;
  insert into public.dr_upload_sessions (session_id, user_key, email, account, phone, task_name, quality, verdict, flagged, minutes, recorded_at, uploaded_at, day)
  select parts[3], nullif(parts[1], ''), btrim(parts[2]), split_part(btrim(parts[2]), '@', 1),
         (regexp_match(split_part(btrim(parts[2]), '@', 1), '^0?(\d{2,3})$'))[1]::int,
         nullif(parts[4], ''), nullif(parts[5], ''), nullif(parts[6], ''), nullif(parts[7], '')::numeric::int,
         parts[8]::numeric, parts[9]::timestamptz, nullif(parts[10], '')::timestamptz,
         (parts[9]::timestamptz at time zone 'Africa/Cairo')::date
  from t_in
  where array_length(parts, 1) = 10 and parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and parts[8] ~ '^[0-9.]+$'
  on conflict (session_id) do update
    set quality = excluded.quality, verdict = excluded.verdict, flagged = excluded.flagged, minutes = excluded.minutes,
        uploaded_at = excluded.uploaded_at, task_name = excluded.task_name, imported_at = now();
  select count(*) into n_after from public.dr_upload_sessions;
  n_valid := n_lines - n_bad;
  select min((parts[9]::timestamptz at time zone 'Africa/Cairo')::date), max((parts[9]::timestamptz at time zone 'Africa/Cairo')::date), sum(parts[8]::numeric) / 60.0
    into d_from, d_to, h from t_in where array_length(parts, 1) = 10 and parts[8] ~ '^[0-9.]+$' and parts[9] ~ '^\d{4}-\d{2}-\d{2}T';
  perform public.dr_upload_attribute_rows((select array_agg(parts[3]) from t_in where array_length(parts, 1) = 10));
  perform public.dr_log_add('uploads', 'Upload file: ' || n_valid || ' sessions, ' || round(coalesce(h, 0)) || ' hours, ' || coalesce(to_char(d_from, 'DD Mon'), '') || ' to ' || coalesce(to_char(d_to, 'DD Mon'), '') || case when n_bad > 0 then ', ' || n_bad || ' lines refused' else '' end, 'management');
  return jsonb_build_object('ok', true, 'lines', n_lines, 'new', n_after - n_before, 'updated', n_valid - (n_after - n_before), 'rejected', n_bad, 'from', d_from, 'to', d_to, 'hours', round(coalesce(h, 0), 1));
end $$;

-- The rules and the phone list, from the page: rule_set (id to edit, else new), rule_delete, phone_set, and
-- account_delete, which takes every session of one account out (the smoke test's, or rows that should never have
-- been in the file; the next file brings a real account's rows straight back).
-- dr_upload_admin(p_code text, p_action text, p jsonb): see migration dr_uploads_v18c_one_pass_per_number.

-- The page, dr_uploads(p_code, p_day, p_days): one JSON for a day and a window (7 to 90 days). The browser reads it
-- through the anon role, which gives a statement three seconds, so every number comes from one grouped pass over the
-- window (v18c; the first version scanned the window once per number per site and took three and a half seconds).
-- It returns: day, today, window, settled; file (sessions, hours, accounts, first_day, last_day, imported_at);
-- sites[] (id, name, team; typed, estimated, pending, phones_typed from the check-out; uploaded, sessions,
-- accounts, listed, listed_uploading, unlisted, wrong_on_ledger[{tag, home}], fraud, feedback, flagged, needs_work,
-- unreviewed, lag_median, week_uploaded, week_typed from the file); totals; unplaced; legacy; days[]; hours_of_day[24];
-- weekdays[7]; lengths; rules[] (id, pattern, site_id, site, note, sort, accounts, hours); unassigned[] families no rule places; phones; flags (clock:
-- accounts that upload before they record, shared: one login over 12 hours in a day, long: sessions over 30.5
-- minutes); sites_list.
-- dr_uploads(p_code text, p_day date, p_days int): see migration dr_uploads_v18c_one_pass_per_number.

-- Who may call what. The three the page uses go through dr_may; the two that place rows are internal.
grant execute on function public.dr_uploads(text, date, int) to anon, authenticated;
grant execute on function public.dr_upload_ingest(text, text) to anon, authenticated;
grant execute on function public.dr_upload_admin(text, text, jsonb) to anon, authenticated;
revoke execute on function public.dr_upload_attribute(date) from public, anon, authenticated;
revoke execute on function public.dr_upload_attribute_rows(text[]) from public, anon, authenticated;

-- 'uploads' is a command page, like the dashboard: dr_page_section(p_page) returns 'command' for it.
