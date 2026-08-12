create or replace function public.replace_timeline_markers(
  p_project_id uuid,
  p_markers jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id public.timeline_markers.project_id%type;
  v_marker jsonb;
  v_typed_marker public.timeline_markers%rowtype;
begin
  if p_project_id is null then
    raise exception using
      errcode = '22023',
      message = 'project id must not be empty';
  end if;

  if p_markers is null or jsonb_typeof(p_markers) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'markers must be a JSON array';
  end if;

  -- Use the table's real project_id type instead of duplicating it in this function.
  select populated.project_id
  into v_project_id
  from jsonb_populate_record(
    null::public.timeline_markers,
    jsonb_build_object('project_id', p_project_id)
  ) as populated;

  if not exists (
    select 1
    from public.projects
    where id = p_project_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'project not found';
  end if;

  -- A PostgreSQL function call is one transaction. Any exception below rolls this
  -- delete and every insert in the call back together.
  delete from public.timeline_markers
  where project_id = v_project_id;

  for v_marker in
    select marker.value
    from jsonb_array_elements(p_markers) as marker(value)
  loop
    if jsonb_typeof(v_marker) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'each marker must be a JSON object';
    end if;

    if jsonb_typeof(v_marker -> 'page_number') <> 'number'
      or jsonb_typeof(v_marker -> 'start_time') <> 'number'
      or jsonb_typeof(v_marker -> 'end_time') <> 'number'
    then
      raise exception using
        errcode = '22023',
        message = 'page_number, start_time, and end_time must be numbers';
    end if;

    if v_marker ? 'name'
      and jsonb_typeof(v_marker -> 'name') not in ('string', 'null')
    then
      raise exception using
        errcode = '22023',
        message = 'marker name must be a string or null';
    end if;

    if v_marker ? 'id'
      and jsonb_typeof(v_marker -> 'id') not in ('string', 'null')
    then
      raise exception using
        errcode = '22023',
        message = 'marker id must be a string or null';
    end if;

    if v_marker ? 'project_id'
      and (v_marker ->> 'project_id') is distinct from p_project_id::text
    then
      raise exception using
        errcode = '22023',
        message = 'marker project_id does not match the requested project';
    end if;

    select *
    into v_typed_marker
    from jsonb_populate_record(
      null::public.timeline_markers,
      (v_marker - 'created_at') || jsonb_build_object('project_id', p_project_id)
    );

    if v_typed_marker.page_number is null or v_typed_marker.page_number < 1 then
      raise exception using
        errcode = '22023',
        message = 'marker page_number must be at least 1';
    end if;

    if v_typed_marker.start_time is null or v_typed_marker.start_time < 0 then
      raise exception using
        errcode = '22023',
        message = 'marker start_time must be at least 0';
    end if;

    if v_typed_marker.end_time is null
      or v_typed_marker.end_time < v_typed_marker.start_time
    then
      raise exception using
        errcode = '22023',
        message = 'marker end_time must not be before start_time';
    end if;

    if v_typed_marker.id is null then
      insert into public.timeline_markers (
        project_id,
        page_number,
        start_time,
        end_time,
        name
      ) values (
        v_project_id,
        v_typed_marker.page_number,
        v_typed_marker.start_time,
        v_typed_marker.end_time,
        v_typed_marker.name
      );
    else
      insert into public.timeline_markers (
        id,
        project_id,
        page_number,
        start_time,
        end_time,
        name
      ) values (
        v_typed_marker.id,
        v_project_id,
        v_typed_marker.page_number,
        v_typed_marker.start_time,
        v_typed_marker.end_time,
        v_typed_marker.name
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.replace_timeline_markers(uuid, jsonb) from public;
grant execute on function public.replace_timeline_markers(uuid, jsonb) to anon;
