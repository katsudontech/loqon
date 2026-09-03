import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('timeline migration contract', () => {
  it('contains additive versioning, atomic snapshot, CAS, duration and legacy guard', () => {
    const sql = readFileSync('supabase/migrations/20260821000000_timeline_versions_and_validation.sql', 'utf8')
    expect(sql).toContain('add column if not exists timeline_version bigint not null default 0')
    expect(sql).toContain('add column if not exists timeline_updated_at timestamptz not null default now()')
    expect(sql).toContain('get_public_timeline_snapshot')
    expect(sql).toContain('p_expected_version bigint')
    expect(sql).toContain('p_duration double precision')
    expect(sql).toContain('p_force boolean')
    expect(sql).toContain('for update')
    expect(sql).toContain('delete from public.timeline_markers')
    expect(sql).toContain('timeline_version = timeline_version + 1')
    expect(sql).toContain('returns bigint')
    expect(sql).toContain('grant execute on function public.get_public_timeline_snapshot(uuid) to anon, authenticated')
    expect(sql).toContain('grant execute on function public.replace_timeline_markers(uuid, jsonb, bigint, double precision, boolean) to anon, authenticated')
    expect(sql).toContain('with ordinality as item(value, ord) order by item.ord')
    expect(sql.indexOf('with ordinality as item(value, ord) order by item.ord')).toBeLessThan(sql.indexOf('delete from public.timeline_markers'))
    expect(sql).toContain('outdated timeline client')
    expect(sql).toContain('last marker end_time must equal audio duration')
    const deleteIndex = sql.indexOf('delete from public.timeline_markers')
    expect(deleteIndex).toBeGreaterThan(0)
    for (const validation of [
      "timeline must contain at least one marker",
      'timeline has too many markers',
      'marker ids must be unique',
      'marker page_number must be between 1 and 10000',
      'marker start_time must be finite and before duration',
      'marker end_time must be after start_time',
      'first marker must be at time 0 on page 1',
      'marker end_time must equal the next start_time',
      'last marker end_time must equal audio duration',
    ]) expect(sql.indexOf(validation)).toBeLessThan(deleteIndex)
  })
})
