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
-- access_v9e_team_list_carries_the_work_email, access_v9f_people_list_hands_back_the_email,
-- access_v9g_settings_are_founders_only, access_v9h_host_is_a_setting_a_founder_can_change,
-- access_v9i_settings_read_includes_the_host, access_v9j_the_team_code_is_gone,
-- access_v9k_live_edits_follow_the_same_rule, access_v9l_the_edits_page_lists_through_the_function,
-- access_v9m_edits_read_variable_name, access_v9n_the_team_list_opens_an_account_when_it_signs_in,
-- access_v9o2_leaving_closes_the_account, access_v9p_closed_accounts_own_no_sites,
-- access_v9q_promotion_looks_at_the_status_not_the_link, access_v9r_content_section_is_worked_out_when_it_is_read.
--
-- What the later ones do:
--   the settings (the codes, the Slack address, the mail key, the PostHog key, the address of the site) are a founder's alone
--   the team code is gone: no form asks for one
--   a live edit is a piece of the text of a page, so it comes through dr_edits_read, which asks whether the reader may open that
--     page, and the dr_edits table itself is closed. dr_page_section is the page rule in SQL, the twin of js/access.js
--   an account waits until the person signs in, which is the proof the address is theirs, and then the team list opens it at
--     that person's role. dr_my does that, and it also links an older account to its person by email
--   setting somebody to not active on the team page closes their account, and a founder's account is never closed that way
--   only a founder's own account can make another founder: the shared code cannot
--   dr_content works the section out from the path when it is read, rather than trusting what was stamped when it was pushed,
--     because a stamp made under an older rule kept two founder-only files reaching a portfolio manager

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

-- every role the team page offers means something here: the five that name themselves, planning which runs sites, and the
-- rest of the people at a site, who read what an operator reads
create or replace function public.dr_role_of(p_role text) returns text
language sql immutable as $$
  select case p_role
    when 'management' then 'management'
    when 'portfolio-manager' then 'portfolio-manager'
    when 'site-lead' then 'site-lead'
    when 'partner' then 'partner'
    when 'planning' then 'portfolio-manager'
    when '' then 'none'
    when null then 'none'
    else 'operator' end;
$$;

-- A founder is never given out by a machine: the three of them are set by hand on the accounts page. An account is made waiting,
-- with the role the team list has for it, and it opens the first time that person signs in, because signing in is the proof that
-- the address is theirs. dr_my does the opening, and it also links an older account to its person by email.
create or replace function public.dr_user_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.dr_people%rowtype; nm text;
begin
  nm := nullif(btrim(left(regexp_replace(coalesce(new.raw_user_meta_data->>'name', ''), '[[:cntrl:]]', ' ', 'g'), 80)), '');
  select * into p from public.dr_people where active and lower(email) = lower(left(coalesce(new.email, ''), 160));
  insert into public.dr_users (id, email, name, role, status, person_id)
  values (new.id, lower(left(coalesce(new.email, ''), 160)), coalesce(nm, p.name), coalesce(public.dr_role_of(p.role), 'none'), 'pending', p.id)
  on conflict (id) do nothing;
  perform public.dr_log_add('account', 'Account asked for: ' || lower(left(coalesce(new.email, ''), 160))
    || case when p.id is not null then ' (' || public.dr_role_of(p.role) || ' waiting, from the team list)' else '' end, 'sign-up');
  return new;
end $$;

create or replace function public.dr_my() returns public.dr_users
language plpgsql security definer set search_path = public as $$
declare u public.dr_users%rowtype; p public.dr_people%rowtype; r text;
begin
  if auth.uid() is null then return u; end if;
  select * into u from public.dr_users where id = auth.uid();
  if u.id is null then
    insert into public.dr_users (id, email, name, created_at)
    select a.id, lower(left(coalesce(a.email, ''), 160)),
      nullif(btrim(left(regexp_replace(coalesce(a.raw_user_meta_data->>'name', ''), '[[:cntrl:]]', ' ', 'g'), 80)), ''),
      coalesce(a.created_at, now())
    from auth.users a where a.id = auth.uid() and a.email is not null
    on conflict (id) do nothing;
    select * into u from public.dr_users where id = auth.uid();
  end if;
  if u.id is null then return u; end if;
  select * into p from public.dr_people
   where active and (id = u.person_id or lower(email) = lower(u.email)) order by (id = u.person_id) desc limit 1;
  if u.status = 'pending' and p.id is not null then
    r := public.dr_role_of(p.role);
    if r <> 'none' then
      update public.dr_users set person_id = p.id, role = r, status = 'active',
        approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, 'the team list')
      where id = u.id returning * into u;
    end if;
  elsif u.person_id is null and p.id is not null then
    update public.dr_users set person_id = p.id where id = u.id returning * into u;
  end if;
  return u;
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
