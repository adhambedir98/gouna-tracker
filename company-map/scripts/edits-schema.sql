-- Live edits: the table and the function behind the Edit button. Applied to the company database already; kept here as the record.
-- A row is one change: text (before -> after, per language), or a section hidden, deleted, or a container's new order (both languages).
-- Anyone can read the rows. Writing takes the management code (dr_settings.report_code). node scripts/pull-edits.mjs writes
-- the text rows into the source files and marks them applied; section rows are listed for a person to apply by hand.

create table if not exists public.dr_edits (
  id uuid primary key default gen_random_uuid(),
  page text not null,                    -- the page path (rules, jobs/operator), 'all' for text that is on every page
  lang text not null default 'en' check (lang in ('en', 'ar', 'all')),
  kind text not null default 'text' check (kind in ('text', 'hide', 'delete', 'order')),
  before text not null,                  -- text: the source text. hide, delete: the section key. order: the container key
  after text not null,                   -- text: the new text. hide, delete: the section's label. order: json {keys, labels}
  who text,
  at timestamptz not null default now(),
  applied boolean not null default false,
  unique (page, lang, kind, before)
);
alter table public.dr_edits enable row level security;
drop policy if exists dr_edits_read on public.dr_edits;
create policy dr_edits_read on public.dr_edits for select to anon, authenticated using (true);

create or replace function public.dr_edit(p_code text, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_page text; v_lang text; v_kind text; v_before text; v_after text; v_who text; v_what text; n int;
begin
  if coalesce(p_code, '') = '' or p_code is distinct from (select value from public.dr_settings where key = 'report_code') then raise exception 'wrong code'; end if;
  if p_action = 'set' then
    v_page := left(coalesce(nullif(btrim(p->>'page'), ''), 'all'), 120);
    v_kind := case when p->>'kind' in ('hide', 'delete', 'order') then p->>'kind' else 'text' end;
    v_lang := case when v_kind <> 'text' then 'all' when p->>'lang' = 'ar' then 'ar' else 'en' end;
    v_before := left(btrim(coalesce(p->>'before', '')), 4000);
    v_after := left(btrim(coalesce(p->>'after', '')), 8000);
    v_who := nullif(left(btrim(coalesce(p->>'who', '')), 80), '');
    if v_before = '' then raise exception 'nothing to change'; end if;
    if v_kind = 'text' and v_after = '' then raise exception 'the text is empty'; end if;
    -- the same text as the source, or the source order: nothing to keep
    if (v_kind = 'text' and v_after = v_before) or (v_kind = 'order' and v_after = '') then
      delete from public.dr_edits where page = v_page and lang = v_lang and kind = v_kind and before = v_before and not applied;
      return jsonb_build_object('ok', true, 'removed', true);
    end if;
    -- one row per section: a delete replaces a hide, and the other way round
    if v_kind in ('hide', 'delete') then
      delete from public.dr_edits where page = v_page and kind in ('hide', 'delete') and kind <> v_kind and before = v_before and not applied;
    end if;
    insert into public.dr_edits (page, lang, kind, before, after, who) values (v_page, v_lang, v_kind, v_before, v_after, v_who)
    on conflict (page, lang, kind, before) do update set after = excluded.after, who = excluded.who, at = now(), applied = false
    returning id into v_id;
    v_what := case v_kind
      when 'text' then 'Text changed on ' || case when v_page = 'all' then 'every page' else v_page end || ': ' || left(v_before, 60) || ' -> ' || left(v_after, 60)
      when 'hide' then 'Section hidden on ' || v_page || ': ' || left(v_after, 60)
      when 'delete' then 'Section deleted on ' || v_page || ': ' || left(v_after, 60)
      else 'Sections moved on ' || v_page end;
    perform public.dr_log_add('edit', v_what, v_who, null, v_id);
    return jsonb_build_object('ok', true, 'id', v_id);
  elsif p_action = 'delete' then
    if coalesce(p->>'id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'unknown edit'; end if;
    delete from public.dr_edits where id = (p->>'id')::uuid returning page, kind, before, after into v_page, v_kind, v_before, v_after;
    if not found then raise exception 'unknown edit'; end if;
    perform public.dr_log_add('edit', case v_kind when 'text' then 'Edit undone on ' || v_page || ': ' || left(v_before, 60)
      when 'order' then 'Sections back in their order on ' || v_page else 'Section back on ' || v_page || ': ' || left(v_after, 60) end,
      nullif(left(btrim(coalesce(p->>'who', '')), 80), ''));
    return jsonb_build_object('ok', true);
  elsif p_action = 'applied' then
    update public.dr_edits set applied = true where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x where x ~ '^[0-9a-fA-F-]{36}$');
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'applied', n);
  end if;
  raise exception 'unknown action';
end $$;
grant execute on function public.dr_edit(text, text, jsonb) to anon, authenticated;
