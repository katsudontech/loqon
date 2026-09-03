-- Re-assert the final write/storage security state after all historical
-- migrations. This is intentionally additive so existing installations can
-- apply the newly introduced bootstrap migration with --include-all first.

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
    raise exception using errcode = '22023', message = 'project id must not be empty';
  end if;
  if char_length(p_title) > 200 then
    raise exception using errcode = '22023', message = 'project title must be 200 characters or fewer';
  end if;
  if p_audio_url is not null
    and public.is_project_storage_url(p_audio_url, p_project_id, 'audio') is not true
  then
    raise exception using errcode = '22023', message = 'audio URL must be an immutable project-scoped Storage URL';
  end if;
  if p_pdf_url is not null
    and public.is_project_storage_url(p_pdf_url, p_project_id, 'pdf') is not true
  then
    raise exception using errcode = '22023', message = 'PDF URL must be an immutable project-scoped Storage URL';
  end if;

  update public.projects
  set
    title = coalesce(nullif(btrim(p_title), ''), '名称未設定プロジェクト'),
    audio_url = coalesce(p_audio_url, audio_url),
    pdf_url = coalesce(p_pdf_url, pdf_url)
  where id = p_project_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'project not found';
  end if;
end;
$$;

-- Project writes use a server-only service key so callers cannot bypass the
-- Server Action's exact-origin, MIME, size, signature, and path validation.
revoke all on function public.create_project_by_id(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_project_by_id(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_project_by_id(uuid, text, text, text) to service_role;
grant execute on function public.update_project_by_id(uuid, text, text, text) to service_role;

revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.timeline_markers from public, anon, authenticated;
grant execute on function public.get_public_project(uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_timeline_markers(uuid) to anon, authenticated;
grant execute on function public.replace_timeline_markers(uuid, jsonb) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'projects',
  'projects',
  true,
  52428800,
  array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg',
        'audio/flac', 'audio/mp4', 'audio/aac', 'application/pdf']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only fresh immutable object creation is available to browser clients. Public
-- reads use the bucket's public object endpoint, without a SELECT/list policy.
drop policy if exists projects_public_read on storage.objects;
drop policy if exists projects_scoped_insert on storage.objects;
create policy projects_scoped_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'projects'
    and (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp3|wav|ogg|oga|flac|m4a|mp4|aac)$'
      or name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/pdf/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$'
    )
  );

drop policy if exists projects_scoped_update on storage.objects;
drop policy if exists projects_scoped_delete on storage.objects;
revoke update, delete on table storage.objects from anon, authenticated;

comment on function public.update_project_by_id(uuid, text, text, text) is
  'Validated server-action write for the anonymous UUID capability model; no Auth ownership restriction is enabled.';
