-- Company map, database v12: closing the doors nothing walks through.
-- Applied on top of v11 (dr_map taking p_day) as migration dr_harden_v12.
--
-- A read of the whole schema turned up three things that were open with nothing on the other side of them. None of them
-- was a way in on its own. All three are surface that a later change could turn into one, so they are shut now.
--
-- 1. Five helpers ran without a search_path of their own: dr_esc, dr_coord, dr_section, dr_role_of, dr_page_section.
--    A role carrying its own search_path could have pointed them at another schema. Each is pinned to public now.
-- 2. dr_sites_sync is the trigger that keeps dr_sites.active in step with its status. It returns a trigger, so no page
--    could ever have called it, but execute was granted to everyone. Revoked.
-- 3. dr_phone_log had select, insert, update and delete granted to anon and authenticated. Row level security is on and
--    the table has no policy, so the grant returned nothing and wrote nothing. It is revoked so that a policy added later
--    cannot open the table by accident. Every reader of the phone log goes through dr_map and dr_report, which are
--    security definer and do their own checking.
--
-- What is deliberately left open, so the next reader does not close it by mistake:
--   dr_sites keeps its dr_sites_read policy: anon may select the active sites. scripts/report-smoke.mjs checks that this
--     still works and that no paused site is visible. No page in the browser reads the table directly any more, so this
--     is the one public read left in the schema. Closing it would break the smoke test, and is a call for the owner.
--   dr_content_put is callable by anon on purpose: scripts/push-content.mjs ships the pages with the publishable key and
--     the management code. The code is the gate, not the role.
--   Every dr_ table has row level security on with no policy. That is the design: nothing reaches a table except through
--     a security definer function.

alter function public.dr_esc(text) set search_path to 'public';
alter function public.dr_coord(text, numeric) set search_path to 'public';
alter function public.dr_section(text) set search_path to 'public';
alter function public.dr_role_of(text) set search_path to 'public';
alter function public.dr_page_section(text) set search_path to 'public';
revoke all on function public.dr_sites_sync() from public, anon, authenticated;
revoke all on table public.dr_phone_log from anon, authenticated;

-- The same read also found the day tables indexed one way only: by day. Every page that opens one business (the site page,
-- the map, the row that opens on the dashboard) was reading them the other way round with nothing to read by, and the phone
-- log is the table that grows fastest. Applied as migration dr_indexes_v12.
create index if not exists dr_reports_site_day on public.dr_reports (site_id, day desc);
create index if not exists dr_checkins_site_day on public.dr_checkins (site_id, day desc);
create index if not exists dr_phone_log_site_day on public.dr_phone_log (site_id, day desc);
create index if not exists dr_incidents_site_day on public.dr_incidents (site_id, day desc);
create index if not exists dr_log_site_at on public.dr_log (site_id, at desc);
create index if not exists dr_people_site on public.dr_people (site_id);
create index if not exists dr_events_user_at on public.dr_events (user_id, at desc);
create index if not exists dr_reports_reporter on public.dr_reports (reporter_id);
create index if not exists dr_incidents_reporter on public.dr_incidents (reporter_id);
-- (tag, day) and (tag, day desc) are the same index to a btree, which reads either way. One of the two is dropped.
drop index if exists public.dr_phone_log_day_tag;
