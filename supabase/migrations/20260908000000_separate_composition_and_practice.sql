-- Timeline v3: composition/PDF cues and practice ranges have independent
-- ownership, optimistic versions, timestamps, and atomic saves. This migration
-- is additive: timeline_markers remains readable for old clients and no legacy
-- rows are deleted.

alter table public.projects add column if not exists composition_version bigint not null default 0;
alter table public.projects add column if not exists composition_updated_at timestamptz not null default now();
alter table public.projects add column if not exists practice_version bigint not null default 0;
alter table public.projects add column if not exists practice_updated_at timestamptz not null default now();

create table if not exists public.composition_cues (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  page_number integer not null, start_time double precision not null,
  name text, created_at timestamptz not null default now()
);
create table if not exists public.practice_parts (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  start_time double precision not null, end_time double precision not null,
  start_page integer, end_page integer, name text, created_at timestamptz not null default now()
);
alter table public.practice_parts add column if not exists start_page integer;
alter table public.practice_parts add column if not exists end_page integer;
create index if not exists composition_cues_project_time_idx on public.composition_cues(project_id, start_time, id);
create index if not exists practice_parts_project_time_idx on public.practice_parts(project_id, start_time, id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'composition_cues_project_id_fkey') then alter table public.composition_cues add constraint composition_cues_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'practice_parts_project_id_fkey') then alter table public.practice_parts add constraint practice_parts_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'composition_cues_time_check') then alter table public.composition_cues add constraint composition_cues_time_check check (start_time >= 0) not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'practice_parts_range_check') then alter table public.practice_parts add constraint practice_parts_range_check check (start_time >= 0 and end_time >= start_time) not valid; end if;
end $$;

alter table public.composition_cues enable row level security;
alter table public.practice_parts enable row level security;
revoke all on table public.composition_cues, public.practice_parts from public, anon, authenticated;

-- A newly created project starts with one editable whole-song sentinel. Its end
-- is filled with the measured audio duration by the parts editor on first save.
create or replace function public.ensure_default_practice_part()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.practice_parts(project_id, start_time, end_time, name)
  values (new.id, 0, 0, '全体')
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists projects_default_practice_part on public.projects;
create trigger projects_default_practice_part after insert on public.projects for each row execute function public.ensure_default_practice_part();

-- Keep the existing snapshot RPC name for deployed clients while returning the
-- separate domains. The legacy marker array remains part of the response for
-- read-time compatibility with an older app.
create or replace function public.get_public_timeline_snapshot(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'markers', coalesce((select jsonb_agg(to_jsonb(marker) order by marker.start_time, marker.id) from public.timeline_markers marker where marker.project_id = project.id), '[]'::jsonb),
    'composition_cues', coalesce((select jsonb_agg(to_jsonb(cue) order by cue.start_time, cue.id) from public.composition_cues cue where cue.project_id = project.id), '[]'::jsonb),
    'practice_parts', coalesce((select jsonb_agg(to_jsonb(part) order by part.start_time, part.id) from public.practice_parts part where part.project_id = project.id), '[]'::jsonb),
    'version', project.timeline_version, 'updated_at', project.timeline_updated_at,
    'composition_version', project.composition_version, 'composition_updated_at', project.composition_updated_at,
    'practice_version', project.practice_version, 'practice_updated_at', project.practice_updated_at
  ) from public.projects project where project.id = p_project_id;
$$;
revoke all on function public.get_public_timeline_snapshot(uuid) from public;
grant execute on function public.get_public_timeline_snapshot(uuid) to anon, authenticated;

-- Preserve every legacy boundary/name. Rows sharing a timestamp cannot form
-- positive intervals, so the earliest stable ID wins and its first non-empty
-- name is retained; the largest legacy end is used to keep the partition valid.
insert into public.practice_parts(id, project_id, start_time, end_time, start_page, end_page, name)
select id, project_id, start_time,
  coalesce(next_start, final_end), page_number, page_number, name
from (
  select marker.id, marker.project_id, marker.start_time, marker.page_number,
    coalesce(nullif(marker.name, ''), (select nullif(other.name, '') from public.timeline_markers other where other.project_id = marker.project_id and other.start_time = marker.start_time and nullif(other.name, '') is not null order by other.id limit 1)) as name,
    (select min(other.start_time) from public.timeline_markers other where other.project_id = marker.project_id and other.start_time > marker.start_time) as next_start,
    max(marker.end_time) over (partition by marker.project_id) as final_end,
    row_number() over (partition by marker.project_id, marker.start_time order by marker.id) as same_time_order
  from public.timeline_markers marker
) grouped
where same_time_order = 1 and not exists (select 1 from public.practice_parts part where part.id = grouped.id);

-- Composition is the first marker plus actual page changes. Repeated rows at
-- the same time/page are intentionally excluded; their names are not lost from
-- practice_parts. The statement is idempotent by stable legacy IDs.
insert into public.composition_cues(id, project_id, page_number, start_time, name)
select id, project_id, page_number, start_time, name
from (
  select marker.*, lag(page_number) over (partition by project_id order by start_time, id) as previous_page,
    row_number() over (partition by project_id, start_time order by id) as same_time_order
  from public.timeline_markers marker
) legacy
where same_time_order = 1 and (previous_page is null or previous_page <> page_number)
  and not exists (select 1 from public.composition_cues cue where cue.id = legacy.id);

create or replace function public.get_public_project_timeline(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'composition_cues', coalesce((select jsonb_agg(to_jsonb(cue) order by cue.start_time, cue.id) from public.composition_cues cue where cue.project_id = p_project_id), '[]'::jsonb),
    'practice_parts', coalesce((select jsonb_agg(to_jsonb(part) order by part.start_time, part.id) from public.practice_parts part where part.project_id = p_project_id), '[]'::jsonb),
    'composition_version', project.composition_version, 'composition_updated_at', project.composition_updated_at,
    'practice_version', project.practice_version, 'practice_updated_at', project.practice_updated_at,
    'legacy_markers', coalesce((select jsonb_agg(to_jsonb(marker) order by marker.start_time, marker.id) from public.timeline_markers marker where marker.project_id = p_project_id), '[]'::jsonb)
  ) into result from public.projects project where project.id = p_project_id;
  return result;
end; $$;
revoke all on function public.get_public_project_timeline(uuid) from public;
grant execute on function public.get_public_project_timeline(uuid) to anon, authenticated;

create or replace function public.replace_composition_cues(p_project_id uuid, p_cues jsonb, p_expected_version bigint, p_duration double precision, p_num_pages integer default null, p_force boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare project_row public.projects%rowtype; cue jsonb; previous double precision := -1; next_version bigint;
begin
  if p_duration is null or p_duration <> p_duration or p_duration <= 0 or p_duration = 'Infinity'::double precision or p_duration = '-Infinity'::double precision then raise exception using errcode = '22023', message = 'audio duration must be finite and positive'; end if;
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'project not found'; end if;
  if not coalesce(p_force, false) and p_expected_version is distinct from project_row.composition_version then raise exception using errcode = 'P0001', message = 'composition conflict'; end if;
  if jsonb_typeof(p_cues) <> 'array' or jsonb_array_length(p_cues) = 0 or jsonb_array_length(p_cues) > 500 then raise exception using errcode = '22023', message = 'composition cues must contain 1 to 500 items'; end if;
  if exists (select 1 from jsonb_array_elements(p_cues) item group by item.value->>'id' having count(*) > 1) then raise exception using errcode = '22023', message = 'composition cue ids must be unique'; end if;
  for cue in select value from jsonb_array_elements(p_cues) loop
    if jsonb_typeof(cue) <> 'object' or jsonb_typeof(cue->'id') <> 'string' or jsonb_typeof(cue->'start_time') <> 'number' or jsonb_typeof(cue->'page_number') <> 'number' then raise exception using errcode = '22023', message = 'composition cue JSON shape is invalid'; end if;
    if (cue->>'start_time')::double precision <> (cue->>'start_time')::double precision or (cue->>'start_time')::double precision < 0 or (cue->>'start_time')::double precision >= p_duration then raise exception using errcode = '22023', message = 'composition cue time must be finite and before duration'; end if;
    if (cue->>'start_time')::double precision <= previous or (cue->>'page_number')::integer < 1 or (p_num_pages is not null and (cue->>'page_number')::integer > p_num_pages) then raise exception using errcode = '22023', message = 'composition cue is invalid'; end if;
    if cue ? 'name' and jsonb_typeof(cue->'name') not in ('string', 'null') then raise exception using errcode = '22023', message = 'composition cue name must be a string or null'; end if;
    if char_length(coalesce(cue->>'name', '')) > 100 then raise exception using errcode = '22023', message = 'composition cue name must be 100 characters or fewer'; end if;
    previous := (cue->>'start_time')::double precision;
  end loop;
  if (p_cues->0->>'start_time')::double precision <> 0 or (p_cues->0->>'page_number')::integer <> 1 then raise exception using errcode = '22023', message = 'first composition cue must be at 0 seconds on page 1'; end if;
  delete from public.composition_cues where project_id = p_project_id;
  insert into public.composition_cues(id, project_id, page_number, start_time, name)
  select (value->>'id')::uuid, p_project_id, (value->>'page_number')::integer, (value->>'start_time')::double precision, nullif(btrim(value->>'name'), '') from jsonb_array_elements(p_cues);
  update public.projects set composition_version = composition_version + 1, composition_updated_at = now() where id = p_project_id returning composition_version into next_version;
  return next_version;
end; $$;

create or replace function public.replace_practice_parts(p_project_id uuid, p_parts jsonb, p_expected_version bigint, p_duration double precision, p_force boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare project_row public.projects%rowtype; part jsonb; previous double precision := -1; next_version bigint; v_count integer;
begin
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'project not found'; end if;
  if not coalesce(p_force, false) and p_expected_version is distinct from project_row.practice_version then raise exception using errcode = 'P0001', message = 'practice parts conflict'; end if;
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 or jsonb_array_length(p_parts) > 500 then raise exception using errcode = '22023', message = 'practice parts must contain 1 to 500 items'; end if;
  if exists (select 1 from jsonb_array_elements(p_parts) item group by item.value->>'id' having count(*) > 1) then raise exception using errcode = '22023', message = 'practice part ids must be unique'; end if;
  for part in select value from jsonb_array_elements(p_parts) loop
    if jsonb_typeof(part) <> 'object' or jsonb_typeof(part->'id') <> 'string' or jsonb_typeof(part->'start_time') <> 'number' or jsonb_typeof(part->'end_time') <> 'number' then raise exception using errcode = '22023', message = 'practice part JSON shape is invalid'; end if;
    if char_length(coalesce(part->>'name', '')) > 100 then raise exception using errcode = '22023', message = 'practice part name must be 100 characters or fewer'; end if;
    if (part->>'start_time')::double precision <> (part->>'start_time')::double precision or (part->>'end_time')::double precision <> (part->>'end_time')::double precision or (part->>'start_time')::double precision <= previous or (part->>'end_time')::double precision <= (part->>'start_time')::double precision or (part->>'end_time')::double precision > p_duration or (nullif(part->>'start_page', '') is not null and nullif(part->>'end_page', '') is not null and (part->>'start_page')::integer > (part->>'end_page')::integer) then raise exception using errcode = '22023', message = 'practice parts must be strictly ordered and inside duration'; end if;
    previous := (part->>'start_time')::double precision;
  end loop;
  if (p_parts->0->>'start_time')::double precision <> 0 or (p_parts->(jsonb_array_length(p_parts)-1)->>'end_time')::double precision <> p_duration then raise exception using errcode = '22023', message = 'practice parts must cover the full audio duration'; end if;
  if jsonb_array_length(p_parts) > 1 then for v_count in 0..(jsonb_array_length(p_parts)-2) loop if (p_parts->v_count->>'end_time')::double precision <> (p_parts->(v_count+1)->>'start_time')::double precision then raise exception using errcode = '22023', message = 'practice parts must be adjacent'; end if; end loop; end if;
  delete from public.practice_parts where project_id = p_project_id;
  insert into public.practice_parts(id, project_id, start_time, end_time, start_page, end_page, name)
  select (value->>'id')::uuid, p_project_id, (value->>'start_time')::double precision, (value->>'end_time')::double precision, nullif(value->>'start_page', '')::integer, nullif(value->>'end_page', '')::integer, nullif(btrim(value->>'name'), '') from jsonb_array_elements(p_parts);
  update public.projects set practice_version = practice_version + 1, practice_updated_at = now() where id = p_project_id returning practice_version into next_version;
  return next_version;
end; $$;
revoke all on function public.replace_composition_cues(uuid, jsonb, bigint, double precision, integer, boolean), public.replace_practice_parts(uuid, jsonb, bigint, double precision, boolean) from public;
grant execute on function public.replace_composition_cues(uuid, jsonb, bigint, double precision, integer, boolean), public.replace_practice_parts(uuid, jsonb, bigint, double precision, boolean) to anon, authenticated;
