-- Keep projects shareable/editable by URL while preventing anonymous clients
-- from enumerating every project through PostgREST.

create or replace function public.get_public_project(
  p_project_id uuid
)
returns table (
  id uuid,
  title text,
  audio_url text,
  pdf_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    project.id,
    project.title,
    project.audio_url,
    project.pdf_url,
    project.created_at
  from public.projects as project
  where project.id = p_project_id;
$$;

create or replace function public.get_public_timeline_markers(
  p_project_id uuid
)
returns setof public.timeline_markers
language sql
stable
security definer
set search_path = ''
as $$
  select marker.*
  from public.timeline_markers as marker
  where marker.project_id = p_project_id
  order by marker.start_time asc;
$$;

create or replace function public.update_project_by_id(
  p_project_id uuid,
  p_title text,
  p_audio_url text,
  p_pdf_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_project_id is null then
    raise exception using
      errcode = '22023',
      message = 'project id must not be empty';
  end if;

  update public.projects
  set
    title = coalesce(nullif(btrim(p_title), ''), '名称未設定プロジェクト'),
    audio_url = coalesce(p_audio_url, audio_url),
    pdf_url = coalesce(p_pdf_url, pdf_url)
  where id = p_project_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'project not found';
  end if;
end;
$$;

-- Direct table SELECT is what allowed /rest/v1/projects?select=id to enumerate
-- every UUID. Known-ID reads go through the two functions above instead.
revoke select on table public.projects from public, anon, authenticated;
revoke select on table public.timeline_markers from public, anon, authenticated;

revoke all on function public.get_public_project(uuid) from public;
revoke all on function public.get_public_timeline_markers(uuid) from public;
revoke all on function public.update_project_by_id(uuid, text, text, text) from public;

grant execute on function public.get_public_project(uuid) to anon, authenticated;
grant execute on function public.get_public_timeline_markers(uuid) to anon, authenticated;
grant execute on function public.update_project_by_id(uuid, text, text, text) to anon, authenticated;

-- Timeline replacement must keep working after direct table SELECT is revoked.
-- It still requires a known project UUID and intentionally remains editable by
-- anyone who has the shared URL.
alter function public.replace_timeline_markers(uuid, jsonb) security definer;
revoke all on function public.replace_timeline_markers(uuid, jsonb) from public;
grant execute on function public.replace_timeline_markers(uuid, jsonb) to anon, authenticated;
