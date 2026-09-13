-- Company map, database v9: the account is the way in, and each role sees the whole of its own day and none of anybody else's.
-- Applied on top of v8e. The shape of it:
--
--   1. dr_may(p_code, p_roles)   one test for every guarded function. An active account whose role is in the list may pass, and
--                                so may the management code. The code is the spare key for the days when nobody is signed in
--                                yet, and it is on its way out: no page asks for it while an account opens the page.
--   2. sections                  the map is cut into sections, and a role opens a set of them. Money and the risk register left
--                                'numbers' for their own section, which only a founder opens. The management pages split into
--                                'mine' (a person's own sites), 'command' (the whole operation), 'admin' (the company's own
--                                lists) and 'accounts' (who may read).
--   3. the team list             a person in dr_people may carry a work email. Signing up with that email opens the account at
--                                once, at the role the team list gives that person. An email nobody knows waits with no role.
--                                This is the answer to who is allowed an account: management writes the email, the person makes
--                                the account, and nobody has to approve anything by hand.
--   4. dr_my_sites()             the sites a person covers: the ones they hold the book for, the ones they lead, the one they
--                                work at. dr_mine() is the page built on it.
--   5. the three site forms      open to anybody, with no account and no code. A person at a gate has a day to run. When they
--                                are signed in, dr_form_options tells the form who they are and which sites are theirs, so the
--                                form stops asking.
--
-- Migrations, in order: access_v9a_roles_sections_and_people_email, access_v9b_my_sites_view,
-- access_v9c_account_opens_the_management_functions, access_v9d_forms_know_who_is_filling_them,
-- access_v9e_team_list_carries_the_work_email, access_v9f_people_list_hands_back_the_email.

-- 1. May this caller do this?
create or replace function public.dr_may(p_code text, p_roles text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype;
begin
  if coalesce(btrim(p_code), '') <> '' and btrim(p_code) = (select value from public.dr_settings where key = 'report_code') then return true; end if;
  u := public.dr_my();
  return u.id is not null and u.status = 'active' and u.role = any(p_roles);
end $$;
revoke all on function public.dr_may(text, text[]) from public, anon, authenticated;

-- The six functions behind the management pages carry this line in place of the old code check:
--   dr_report, dr_map, dr_admin, dr_content_put, dr_edit:  if not public.dr_may(p_code, array['founder', 'management']) then raise exception 'wrong code'; end if;
--   dr_accounts:                                           if not public.dr_may(p_code, array['founder']) then raise exception 'wrong code'; end if;

-- 2. What each role opens. The list also lives in js/access.js, which draws the same rule in the browser so the page list only
--    offers what a person can open. The database is the one that decides.
insert into public.dr_settings (key, value) values ('roles', jsonb_build_object(
  'founder',           jsonb_build_array('company','everyday','training','forms','sops','manual','numbers','money','jobs','mine','command','admin','accounts'),
  'management',        jsonb_build_array('company','everyday','training','forms','sops','manual','numbers','jobs','mine','command','admin'),
  'portfolio-manager', jsonb_build_array('company','everyday','training','forms','sops','numbers','mine'),
  'site-lead',         jsonb_build_array('everyday','training','forms','sops','mine'),
  'operator',          jsonb_build_array('everyday','training','forms'),
  'partner',           jsonb_build_array('everyday','forms','mine'),
  'candidate',         jsonb_build_array('jobs'),
  'none',              jsonb_build_array()
)::text) on conflict (key) do update set value = excluded.value;

-- 3. The team list says who may have an account and what it opens.
alter table public.dr_people add column if not exists email text;
create unique index if not exists dr_people_email on public.dr_people (lower(email)) where email is not null;

create or replace function public.dr_role_of(p_role text) returns text
language sql immutable as $$
  select case p_role
    when 'management' then 'management'
    when 'portfolio-manager' then 'portfolio-manager'
    when 'site-lead' then 'site-lead'
    when 'partner' then 'partner'
    when 'operator' then 'operator'
    when 'planning' then 'portfolio-manager'
    else 'none' end;
$$;

-- A founder is never given out by a machine: the three of them are set by hand on the accounts page.
create or replace function public.dr_user_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.dr_people%rowtype; r text := 'none'; st text := 'pending'; nm text;
begin
  nm := nullif(btrim(left(regexp_replace(coalesce(new.raw_user_meta_data->>'name', ''), '[[:cntrl:]]', ' ', 'g'), 80)), '');
  select * into p from public.dr_people where active and lower(email) = lower(left(coalesce(new.email, ''), 160));
  if p.id is not null then
    r := public.dr_role_of(p.role);
    if r <> 'none' then st := 'active'; end if;
    nm := coalesce(nm, p.name);
  end if;
  insert into public.dr_users (id, email, name, role, status, person_id, approved_at, approved_by)
  values (new.id, lower(left(coalesce(new.email, ''), 160)), nm, r, st, p.id,
    case when st = 'active' then now() end, case when st = 'active' then 'the team list' end)
  on conflict (id) do nothing;
  perform public.dr_log_add('account',
    case when st = 'active' then 'Account opened: ' || lower(left(coalesce(new.email, ''), 160)) || ' (' || r || ', from the team list)'
    else 'Account asked for: ' || lower(left(coalesce(new.email, ''), 160)) end, 'sign-up');
  return new;
end $$;

-- 4. The sites a person covers, and the page built on them. dr_mine is in the migration access_v9b_my_sites_view; it answers
--    'sign in' to a caller with no account and 'account waiting' to one with no role, and it hands a founder every active site.
create or replace function public.dr_my_sites() returns uuid[]
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype; ids uuid[];
begin
  u := public.dr_my();
  if u.person_id is null then return '{}'::uuid[]; end if;
  select coalesce(array_agg(distinct s.id), '{}') into ids from public.dr_sites s
   where s.pm_id = u.person_id or s.lead_id = u.person_id
      or s.id = (select site_id from public.dr_people where id = u.person_id);
  return ids;
end $$;
revoke all on function public.dr_my_sites() from public, anon, authenticated;
revoke all on function public.dr_role_of(text) from public, anon, authenticated;

-- 5. The site forms. dr_incident no longer asks for the team code, so none of the three does. dr_form_options returns one more
--    block, 'me', with signed_in, role, person_id, name and the sites that person covers.
