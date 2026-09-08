import { describe, expect, it } from 'vitest'
import { addMarker, classifyTimelineError, convertDbRowsToMarkers, convertDbRowsToPlayerMarkers, convertMarkersToDbPayload, createMarkerId, isMarkerId, normalizeMarkers, parseTimelineDraft, serializeTimelineDraft, shouldOfferDraftRestore, type Marker } from '@/lib/timeline'
import { getPartBounds, shiftPartIndices, shouldLoopAt } from '@/lib/partLoop'
import { TimelineConflictError, deleteMarkerById, resetMarkers, updateMarkerById, migrateLegacyMarkers, removePracticeBoundary, splitPracticePart, validatePracticeParts } from '@/lib/timeline'

const id = (value: string) => value
const base: Marker = { id: id('00000000-0000-4000-8000-000000000001'), time: 0, page: 1 }

describe('timeline invariants', () => {
  it('normalizes empty and legacy duplicate rows with stable deterministic order', () => {
    const markers = normalizeMarkers([
      { id: '00000000-0000-4000-8000-000000000002', time: 10, page: 2, name: 'later' },
      { id: '00000000-0000-4000-8000-000000000003', time: 10, page: 3, name: 'first' },
    ])
    expect(markers[0]).toMatchObject({ time: 0, page: 1 })
    expect(markers).toHaveLength(2)
    expect(markers[1]).toMatchObject({ time: 10, page: 2, name: 'later' })
    expect(normalizeMarkers([])).toHaveLength(1)
  })
  it('collapses every legacy time-zero group into one forced page-one marker', () => {
    const markers = normalizeMarkers([
      { id: '00000000-0000-4000-8000-000000000010', time: 0, page: 2, name: 'Intro' },
      { id: '00000000-0000-4000-8000-000000000011', time: 0, page: 3, name: 'ignored' },
    ])
    expect(markers.filter((marker) => marker.time === 0)).toHaveLength(1)
    expect(markers[0]).toMatchObject({ id: '00000000-0000-4000-8000-000000000010', page: 1, name: 'Intro' })
  })
  it('regenerates invalid and legacy IDs to UUIDs before front validation', () => {
    const markers = normalizeMarkers([{ id: 'legacy-id', time: 0, page: 1 }, { id: 'also-invalid', time: 4, page: 2 }])
    expect(markers.every((marker) => isMarkerId(marker.id))).toBe(true)
    expect(markers.map((marker) => marker.id)).not.toContain('legacy-id')
    expect(() => convertMarkersToDbPayload([{ id: 'legacy-id', time: 0, page: 1 }], 'project-1', 10)).toThrow(/ID/)
  })
  it('rejects new duplicate start times and clear can be represented by the default marker', () => {
    expect(() => addMarker([base], 0, 1)).toThrow(/同じ時刻/)
    expect(normalizeMarkers([])[0]).toMatchObject({ time: 0, page: 1 })
  })
  it('updates and deletes by stable ID only and protects reset marker', () => {
    const other = { id: '00000000-0000-4000-8000-000000000007', time: 4, page: 2 }
    expect(updateMarkerById([base, other], other.id, 'Name')[1].name).toBe('Name')
    expect(deleteMarkerById([base, other], other.id)).toEqual([base])
    expect(deleteMarkerById([base], base.id)).toEqual([base])
    expect(resetMarkers()[0]).toMatchObject({ time: 0, page: 1 })
  })
  it('classifies recognizable concurrency conflicts without changing generic failures', () => {
    expect(classifyTimelineError({ code: 'P0001', message: 'timeline conflict' })).toBeInstanceOf(TimelineConflictError)
    expect(classifyTimelineError({ code: 'XX000', message: 'network' })).not.toBeInstanceOf(TimelineConflictError)
  })
  it('uses real duration for the final payload and blocks unavailable duration', () => {
    expect(convertMarkersToDbPayload([base, { id: id('00000000-0000-4000-8000-000000000004'), time: 10, page: 2 }], 'project-1', 42)).toMatchObject([
      { start_time: 0, end_time: 10 }, { start_time: 10, end_time: 42 },
    ])
    expect(() => convertMarkersToDbPayload([base], 'project-1', 0)).toThrow(/長さ/)
    expect(() => convertMarkersToDbPayload([base], 'project-1', undefined)).toThrow(/長さ/)
  })
  it('maps DB rows and always supplies IDs/default', () => {
    const markers = convertDbRowsToMarkers([{ id: '00000000-0000-4000-8000-000000000005', project_id: 'project-1', page_number: 4, start_time: 12.5, end_time: 20, created_at: '', name: null }])
    const loaded = markers.find((marker) => marker.time === 12.5)
    expect(loaded).toMatchObject({ id: '00000000-0000-4000-8000-000000000005', time: 12.5, name: undefined })
    expect(markers[0].id).toBeTruthy()
    expect(createMarkerId()).toMatch(/^[0-9a-f-]{36}$/i)
  })
  it('normalizes player rows and rebuilds finite end boundaries', () => {
    const rows = [
      { id: '00000000-0000-4000-8000-000000000010', project_id: 'project-1', page_number: 2, start_time: 0, end_time: 8, created_at: '', name: null },
      { id: '00000000-0000-4000-8000-000000000011', project_id: 'project-1', page_number: 3, start_time: 0, end_time: 9, created_at: '', name: 'duplicate' },
      { id: '00000000-0000-4000-8000-000000000012', project_id: 'project-1', page_number: 4, start_time: 8, end_time: 12, created_at: '', name: null },
    ]
    const markers = convertDbRowsToPlayerMarkers(rows)
    expect(markers.filter((marker) => marker.time === 0)).toHaveLength(1)
    expect(markers.map((marker) => marker.end_time)).toEqual([8, 12])
    expect(convertDbRowsToPlayerMarkers([])).toEqual([{ id: expect.any(String), time: 0, page: 1, name: undefined, end_time: undefined }])
  })
})

describe('drafts and part bounds', () => {
  it('separates legacy composition changes from every practice boundary', () => {
    const rows = [
      { id: '00000000-0000-4000-8000-000000000010', time: 0, page: 1, name: 'Intro' },
      { id: '00000000-0000-4000-8000-000000000011', time: 10, page: 1, name: 'A' },
      { id: '00000000-0000-4000-8000-000000000012', time: 20, page: 2, name: 'B' },
      { id: '00000000-0000-4000-8000-000000000013', time: 30, page: 2, name: 'C' },
    ]
    const result = migrateLegacyMarkers(rows, 40)
    expect(result.compositionCues.map((cue) => [cue.time, cue.page])).toEqual([[0, 1], [20, 2]])
    expect(result.practiceParts.map((part) => part.startTime)).toEqual([0, 10, 20, 30])
    expect(result.practiceParts.map((part) => part.name)).toEqual(['Intro', 'A', 'B', 'C'])
    const duplicate = migrateLegacyMarkers([{ ...rows[0], id: '00000000-0000-4000-8000-000000000014', name: 'Intro 2', end_time: 5 }, { ...rows[0], end_time: 10 }], 10)
    expect(duplicate.practiceParts).toHaveLength(1)
    expect(duplicate.practiceParts[0].name).toBe('Intro 2')
  })

  it('rejects duplicate/zero-length practice ranges while allowing same-page splits', () => {
    const parts = [
      { id: '00000000-0000-4000-8000-000000000010', startTime: 0, endTime: 10 },
      { id: '00000000-0000-4000-8000-000000000011', startTime: 10, endTime: 20 },
    ]
    expect(() => validatePracticeParts(parts, 20)).not.toThrow()
    expect(() => validatePracticeParts([{ ...parts[0], endTime: 0 }], 20)).toThrow()
    expect(() => validatePracticeParts([{ ...parts[0] }, { ...parts[1], startTime: 0 }], 20)).toThrow()
  })

  it('splits and resizes adjacent practice ranges, and merges while retaining earlier names', () => {
    const parts = [{ id: id('00000000-0000-4000-8000-000000000020'), startTime: 0, endTime: 20, name: '前' }]
    const split = splitPracticePart(parts, 8)
    expect(split.map((part) => [part.startTime, part.endTime])).toEqual([[0, 8], [8, 20]])
    const resized = split.map((part, index) => index === 0 ? { ...part, endTime: 10 } : { ...part, startTime: 10 })
    expect(resized.map((part) => [part.startTime, part.endTime])).toEqual([[0, 10], [10, 20]])
    expect(removePracticeBoundary(resized, resized[1].id)).toEqual([{ ...parts[0], endTime: 20 }])
  })

  it('round trips drafts and rejects stale or identical candidates', () => {
    const draft = { projectId: 'project-1', baseTimelineVersion: 2, baseUpdatedAt: '2026-01-01T00:00:00Z', savedAt: '2026-01-01T00:01:00Z', markers: [base] }
    const parsed = parseTimelineDraft(serializeTimelineDraft(draft), 'project-1')
    expect(parsed).not.toBeNull()
    expect(shouldOfferDraftRestore(parsed, 2, draft.baseUpdatedAt, [{ ...base, name: 'edited' }])).toBe(true)
    expect(shouldOfferDraftRestore(parsed, 3, draft.baseUpdatedAt, [base])).toBe(false)
    expect(shouldOfferDraftRestore(parsed, 2, draft.baseUpdatedAt, [base])).toBe(false)
    expect(parseTimelineDraft('{bad', 'project-1')).toBeNull()
    expect(parseTimelineDraft(JSON.stringify({ schemaVersion: 1, projectId: 'project-1', baseTimelineVersion: -1, savedAt: draft.savedAt, baseUpdatedAt: draft.baseUpdatedAt, markers: [base] }), 'project-1')).toBeNull()
    expect(parseTimelineDraft(JSON.stringify({ schemaVersion: 1, projectId: 'project-1', baseTimelineVersion: 2, savedAt: 'not-a-time', baseUpdatedAt: draft.baseUpdatedAt, markers: [base] }), 'project-1')).toBeNull()
    expect(parseTimelineDraft(JSON.stringify({ schemaVersion: 1, projectId: 'project-1', baseTimelineVersion: 2, savedAt: draft.savedAt, baseUpdatedAt: 'not-a-time', markers: [base] }), 'project-1')).toBeNull()
    const afterReload = parseTimelineDraft(serializeTimelineDraft({ ...draft, baseTimelineVersion: 3, baseUpdatedAt: '2026-01-01T00:05:00Z', savedAt: '2026-01-01T00:06:00Z', markers: [{ ...base, name: 'after reload' }] }), 'project-1')
    expect(shouldOfferDraftRestore(afterReload, 3, '2026-01-01T00:05:00Z', [base])).toBe(true)
    expect(shouldOfferDraftRestore(afterReload, 3, '2026-01-01T00:07:00Z', [base])).toBe(false)
    const postConflict = parseTimelineDraft(serializeTimelineDraft({ ...draft, baseTimelineVersion: 1, savedAt: '2026-01-01T00:10:00Z', markers: [{ ...base, name: 'post conflict' }] }), 'project-1')
    expect(shouldOfferDraftRestore(postConflict, 2, '2026-01-01T00:05:00Z', [base])).toBe(true)
    expect(shouldOfferDraftRestore(postConflict, 2, '2026-01-01T00:11:00Z', [base])).toBe(false)
  })
  it('clamps lead-in and custom A/B to selected part and detects boundaries', () => {
    const markers = [{ ...base, end_time: 10 }, { id: '00000000-0000-4000-8000-000000000006', time: 10, page: 2, end_time: 20 }]
    expect(getPartBounds(markers, 0, 1, 20, 12, 18, true)).toEqual({ selectionStart: 0, selectionEnd: 20, loopStart: 12, loopEnd: 18, leadInStart: 7 })
    expect(getPartBounds(markers, 1, 1, 20, null, null, true)?.leadInStart).toBe(5)
    expect(getPartBounds(markers, 0, 1, 20, 10, 10, false)).toBeNull()
    expect(getPartBounds(markers, 0, 1, 20, -1, 18, false)).toBeNull()
    expect(getPartBounds(markers, 1, 0, 20, null, null, false)).toBeNull()
    expect(shiftPartIndices(0, 0, 1, 3)).toEqual({ startIndex: 1, endIndex: 1 })
    expect(shiftPartIndices(0, 0, -1, 3)).toBeNull()
    expect(shouldLoopAt(18, 18)).toBe(true)
    expect(shouldLoopAt(17.9, 18)).toBe(false)
  })
})
