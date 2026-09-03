-- Initial schema and storage contract.
--
-- This migration is intentionally additive and idempotent. It can be run on a
-- new project, or against the pre-migration tables used by existing projects.
-- There is deliberately no Auth/ownership policy: a UUID is the capability and
-- anyone who knows it may read and edit that project.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  audio_url text not null,
  pdf_url text not null,
  created_at timestamptz not null default now()
);

alter table public.projects add column if not exists user_id uuid;
alter table public.projects add column if not exists title text;
alter table public.projects add column if not exists audio_url text;
alter table public.projects add column if not exists pdf_url text;
alter table public.projects add column if not exists created_at timestamptz;
alter table public.projects alter column created_at set default now();

create table if not exists public.timeline_markers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  page_number integer not null,
  start_time double precision not null,
  end_time double precision not null,
  created_at timestamptz not null default now(),
  name text
);

alter table public.timeline_markers add column if not exists project_id uuid;
alter table public.timeline_markers add column if not exists page_number integer;
alter table public.timeline_markers add column if not exists start_time double precision;
alter table public.timeline_markers add column if not exists end_time double precision;
alter table public.timeline_markers add column if not exists created_at timestamptz;
alter table public.timeline_markers add column if not exists name text;
alter table public.timeline_markers alter column created_at set default now();

do $$
begin
  -- Tighten nullable columns only when the existing data already satisfies the
  -- invariant; this keeps additive application safe for partially migrated DBs.
  if not exists (select 1 from public.projects where audio_url is null) then
    alter table public.projects alter column audio_url set not null;
  end if;
  if not exists (select 1 from public.projects where pdf_url is null) then
    alter table public.projects alter column pdf_url set not null;
  end if;
  if not exists (select 1 from public.projects where created_at is null) then
    alter table public.projects alter column created_at set not null;
  end if;
  if not exists (select 1 from public.timeline_markers where project_id is null) then
    alter table public.timeline_markers alter column project_id set not null;
  end if;
  if not exists (select 1 from public.timeline_markers where page_number is null) then
    alter table public.timeline_markers alter column page_number set not null;
  end if;
  if not exists (select 1 from public.timeline_markers where start_time is null) then
    alter table public.timeline_markers alter column start_time set not null;
  end if;
  if not exists (select 1 from public.timeline_markers where end_time is null) then
    alter table public.timeline_markers alter column end_time set not null;
  end if;
  if not exists (select 1 from public.timeline_markers where created_at is null) then
    alter table public.timeline_markers alter column created_at set not null;
  end if;
end;
$$;

create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists timeline_markers_project_start_time_idx
  on public.timeline_markers (project_id, start_time);

-- NOT VALID preserves existing rows while enforcing the contract for all new
-- writes. Operators can validate these constraints after repairing legacy data.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'timeline_markers_project_id_fkey') then
    alter table public.timeline_markers
      add constraint timeline_markers_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timeline_markers_page_number_check') then
    alter table public.timeline_markers add constraint timeline_markers_page_number_check
      check (page_number >= 1) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timeline_markers_start_time_check') then
    alter table public.timeline_markers add constraint timeline_markers_start_time_check
      check (start_time >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timeline_markers_end_time_check') then
    alter table public.timeline_markers add constraint timeline_markers_end_time_check
      check (end_time >= start_time) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_title_length_check') then
    alter table public.projects add constraint projects_title_length_check
      check (title is null or char_length(title) <= 200) not valid;
  end if;
end;
$$;

create or replace function public.is_project_storage_url(
  p_url text,
  p_project_id uuid,
  p_kind text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case p_kind
    when 'audio' then p_url ~* (
      '^https?://[^/?#]+/storage/v1/object/public/projects/'
      || p_project_id::text || '/audio/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp3|wav|ogg|oga|flac|m4a|mp4|aac)$'
    )
    when 'pdf' then p_url ~* (
      '^https?://[^/?#]+/storage/v1/object/public/projects/'
      || p_project_id::text || '/pdf/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$'
    )
    else false
  end;
$$;

comment on function public.is_project_storage_url(text, uuid, text) is
  'Validates the project-scoped Storage URL shape; exact configured origin and object bytes are checked by the server action.';

create or replace function public.is_legacy_project_storage_url(
  p_url text,
  p_project_id uuid,
  p_kind text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case p_kind
    when 'audio' then p_url ~* (
      '^https?://[^/?#]+/storage/v1/object/public/projects/'
      || p_project_id::text || '/audio[.][a-z0-9]+([?].*)?$'
    )
    when 'pdf' then p_url ~* (
      '^https?://[^/?#]+/storage/v1/object/public/projects/'
      || p_project_id::text || '/formation[.]pdf([?].*)?$'
    )
    else false
  end;
$$;

create or replace function public.create_project_by_id(
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
  if p_project_id is null
    or public.is_project_storage_url(p_audio_url, p_project_id, 'audio') is not true
    or public.is_project_storage_url(p_pdf_url, p_project_id, 'pdf') is not true then
    raise exception using errcode = '22023', message = 'project files must be project-scoped Supabase Storage URLs';
  end if;
  insert into public.projects (id, title, audio_url, pdf_url)
  values (p_project_id, coalesce(nullif(btrim(p_title), ''), '名称未設定プロジェクト'), p_audio_url, p_pdf_url);
end;
$$;

revoke all on function public.is_project_storage_url(text, uuid, text) from public;
revoke all on function public.is_legacy_project_storage_url(text, uuid, text) from public;
revoke all on function public.create_project_by_id(uuid, text, text, text) from public;
grant execute on function public.create_project_by_id(uuid, text, text, text) to service_role;

-- Existing rows may contain legacy URLs, so these checks are NOT VALID. New
-- inserts and replacements must use immutable project-scoped Storage objects.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_audio_url_storage_check') then
    alter table public.projects add constraint projects_audio_url_storage_check
      check (
        audio_url is null
        or public.is_project_storage_url(audio_url, id, 'audio') is true
        or public.is_legacy_project_storage_url(audio_url, id, 'audio') is true
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_pdf_url_storage_check') then
    alter table public.projects add constraint projects_pdf_url_storage_check
      check (
        pdf_url is null
        or public.is_project_storage_url(pdf_url, id, 'pdf') is true
        or public.is_legacy_project_storage_url(pdf_url, id, 'pdf') is true
      ) not valid;
  end if;
end;
$$;

alter table public.projects enable row level security;
alter table public.timeline_markers enable row level security;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.timeline_markers from public, anon, authenticated;

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

-- The bucket is public so a known object URL can be downloaded without a
-- SELECT policy. Deliberately omit a list/read policy: Storage object listing
-- must not become another way to enumerate project UUIDs.
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

-- Immutable objects are never updated in place. Cleanup is performed by
-- tightly validated server actions with the server-only service role.
drop policy if exists projects_scoped_update on storage.objects;
drop policy if exists projects_scoped_delete on storage.objects;

comment on table public.projects is
  'Anonymous capability model: anyone knowing the project UUID may read and edit it; Auth ownership is intentionally not enabled.';

comment on table public.timeline_markers is
  'Markers inherit the anonymous project UUID capability; no owner-only Auth policy is enabled.';
