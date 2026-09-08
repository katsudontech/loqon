import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('separate timeline migration contract', () => {
  it('keeps legacy rows, adds independent stores, indexes and strict RPC validation', () => {
    const sql = readFileSync('supabase/migrations/20260908000000_separate_composition_and_practice.sql', 'utf8')
    expect(sql).toContain('create table if not exists public.composition_cues')
    expect(sql).toContain('create table if not exists public.practice_parts')
    expect(sql).toContain('composition_cues_project_start_unique')
    expect(sql).toContain('practice_parts_project_start_unique')
    expect(sql).toContain('foreign key (project_id) references public.projects(id) on delete cascade')
    expect(sql).toContain('p_duration double precision')
    expect(sql).toContain('p_num_pages integer')
    expect(sql).toContain('ids must be unique')
    expect(sql).toContain('must be adjacent')
    expect(sql).toContain('jsonb_typeof(part->\'name\')')
    expect(sql).toContain('select distinct on (marker.project_id, marker.start_time)')
    expect(sql).toContain('timeline_markers')
    expect(sql).toContain("p_cues is null or jsonb_typeof(p_cues) <> 'array'")
    expect(sql).toContain("p_parts is null or jsonb_typeof(p_parts) <> 'array'")
    expect(sql).toContain('part.project_id = grouped.project_id and part.start_time = grouped.start_time')
    expect(sql).toContain('cue.project_id = legacy.project_id and cue.start_time = legacy.start_time')
  })
})
