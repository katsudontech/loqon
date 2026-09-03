-- Timeline v2: additive optimistic concurrency and finite-duration validation.
-- Existing rows are intentionally not rewritten; the application normalizes
-- legacy/duplicate rows at read time.
alter table public.projects add column if not exists timeline_version bigint not null default 0;
alter table public.projects add column if not exists timeline_updated_at timestamptz not null default now();

create or replace function public.get_public_timeline_snapshot(p_project_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'markers', coalesce(jsonb_agg(to_jsonb(marker) order by marker.start_time, marker.id) filter (where marker.id is not null), '[]'::jsonb),
    'version', project.timeline_version,
    'updated_at', project.timeline_updated_at
  )
  from public.projects project
  left join public.timeline_markers marker on marker.project_id = project.id
  where project.id = p_project_id
  group by project.timeline_version, project.timeline_updated_at;
$$;

create or replace function public.replace_timeline_markers(
  p_project_id uuid,
  p_markers jsonb,
  p_expected_version bigint,
  p_duration double precision,
  p_force boolean default false
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_marker jsonb;
  v_page integer;
  v_start double precision;
  v_end double precision;
  v_name text;
  v_previous double precision := -1;
  v_count integer;
  v_ord bigint;
  v_new_version bigint;
begin
  if p_project_id is null then raise exception using errcode = '22023', message = 'project id must not be empty'; end if;
  if p_markers is null or jsonb_typeof(p_markers) <> 'array' then raise exception using errcode = '22023', message = 'markers must be a JSON array'; end if;
  if p_duration is null or p_duration <> p_duration or p_duration <= 0 or p_duration = 'Infinity'::double precision or p_duration = '-Infinity'::double precision then raise exception using errcode = '22023', message = 'audio duration must be a finite positive number'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception using errcode = '22023', message = 'expected timeline version must be non-negative'; end if;
  v_count := jsonb_array_length(p_markers);
  if v_count = 0 then raise exception using errcode = '22023', message = 'timeline must contain at least one marker'; end if;
  if v_count > 500 then raise exception using errcode = '22023', message = 'timeline has too many markers'; end if;
  if exists (select 1 from jsonb_array_elements(p_markers) item group by item.value->>'id' having count(*) > 1) then raise exception using errcode = '22023', message = 'marker ids must be unique'; end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'project not found'; end if;
  if not coalesce(p_force, false) and p_expected_version is distinct from v_project.timeline_version then
    raise exception using errcode = 'P0001', message = 'timeline conflict: expected version does not match current version';
  end if;

  for v_marker, v_ord in select item.value, item.ord from jsonb_array_elements(p_markers) with ordinality as item(value, ord) order by item.ord
  loop
    if jsonb_typeof(v_marker) <> 'object' then raise exception using errcode = '22023', message = 'each marker must be an object'; end if;
    if coalesce(jsonb_typeof(v_marker->'id') <> 'string', true) or nullif(v_marker->>'id', '') is null then raise exception using errcode = '22023', message = 'marker id must be a stable UUID'; end if;
    if jsonb_typeof(v_marker->'page_number') <> 'number' or jsonb_typeof(v_marker->'start_time') <> 'number' or jsonb_typeof(v_marker->'end_time') <> 'number' then raise exception using errcode = '22023', message = 'page_number, start_time, and end_time must be JSON numbers'; end if;
    begin v_page := (v_marker->>'page_number')::integer; v_start := (v_marker->>'start_time')::double precision; v_end := (v_marker->>'end_time')::double precision; perform (v_marker->>'id')::uuid; exception when others then raise exception using errcode = '22023', message = 'marker id, page_number, start_time, and end_time have invalid types'; end;
    if v_marker ? 'name' and coalesce(jsonb_typeof(v_marker->'name') not in ('string', 'null'), true) then raise exception using errcode = '22023', message = 'marker name must be a string or null'; end if;
    v_name := nullif(btrim(v_marker->>'name'), '');
    if v_name is not null and char_length(v_name) > 100 then raise exception using errcode = '22023', message = 'marker name must be 100 characters or fewer'; end if;
    if v_page is null or v_page < 1 or v_page > 10000 then raise exception using errcode = '22023', message = 'marker page_number must be between 1 and 10000'; end if;
    if v_start is null or v_start <> v_start or v_start < 0 or v_start >= p_duration or v_start = 'Infinity'::double precision or v_start = '-Infinity'::double precision then raise exception using errcode = '22023', message = 'marker start_time must be finite and before duration'; end if;
    if v_end is null or v_end <> v_end or v_end < v_start or v_end = 'Infinity'::double precision or v_end = '-Infinity'::double precision then raise exception using errcode = '22023', message = 'marker end_time is invalid'; end if;
    if v_start <= v_previous then raise exception using errcode = '22023', message = 'marker start times must be strictly increasing'; end if;
    if v_count > 1 and v_end < p_duration and v_end <= v_start then raise exception using errcode = '22023', message = 'marker end_time must be after start_time'; end if;
    if v_ord = 1 and (v_start <> 0 or v_page <> 1) then raise exception using errcode = '22023', message = 'first marker must be at time 0 on page 1'; end if;
    v_previous := v_start;
  end loop;

  -- Validate the end chain in a second pass, including the final real duration.
  for v_marker, v_ord in select item.value, item.ord from jsonb_array_elements(p_markers) with ordinality as item(value, ord) order by item.ord
  loop
    -- Each non-final end must equal the next marker start; final must equal duration.
    if v_ord = jsonb_array_length(p_markers) then
      if (v_marker->>'end_time')::double precision <> p_duration then raise exception using errcode = '22023', message = 'last marker end_time must equal audio duration'; end if;
    end if;
  end loop;
  if jsonb_array_length(p_markers) > 1 then
    for v_count in 0..(jsonb_array_length(p_markers)-2) loop
      if (p_markers->v_count->>'end_time')::double precision <> (p_markers->(v_count+1)->>'start_time')::double precision then raise exception using errcode = '22023', message = 'marker end_time must equal the next start_time'; end if;
    end loop;
  end if;

  delete from public.timeline_markers where project_id = p_project_id;
  for v_marker in select value from jsonb_array_elements(p_markers)
  loop
    insert into public.timeline_markers(id, project_id, page_number, start_time, end_time, name)
    values ((v_marker->>'id')::uuid, p_project_id, (v_marker->>'page_number')::integer, (v_marker->>'start_time')::double precision, (v_marker->>'end_time')::double precision, nullif(btrim(v_marker->>'name'), ''));
  end loop;
  update public.projects set timeline_version = timeline_version + 1, timeline_updated_at = now() where id = p_project_id returning timeline_version into v_new_version;
  return v_new_version;
end;
$$;

-- Old clients must fail closed instead of silently overwriting newer data.
create or replace function public.replace_timeline_markers(p_project_id uuid, p_markers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'outdated timeline client: expected version and audio duration';
end;
$$;

revoke all on function public.get_public_timeline_snapshot(uuid) from public;
revoke all on function public.replace_timeline_markers(uuid, jsonb, bigint, double precision, boolean) from public;
revoke all on function public.replace_timeline_markers(uuid, jsonb) from public;
grant execute on function public.get_public_timeline_snapshot(uuid) to anon, authenticated;
grant execute on function public.replace_timeline_markers(uuid, jsonb, bigint, double precision, boolean) to anon, authenticated;
grant execute on function public.replace_timeline_markers(uuid, jsonb) to anon, authenticated;
