import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }))

import { useTimelineEditor } from './useTimelineEditor'
import { TimelineConflictError, type Marker } from '@/lib/timeline'

const initial: Marker = { id: '00000000-0000-4000-8000-000000000001', time: 0, page: 1 }

describe('useTimelineEditor concurrency save', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  let editor: ReturnType<typeof useTimelineEditor> | undefined

  function Probe() {
    editor = useTimelineEditor([initial], { initialVersion: 7 })
    return null
  }
  beforeEach(() => {
    rpcMock.mockReset()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(Probe)))
  })
  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove(); root = undefined; host = undefined; editor = undefined
  })

  it('sends expected version, duration, and force=false, then retains edited markers on conflict', async () => {
    act(() => { editor?.recordMarker(10, 2) })
    const edited = editor?.markers
    expect(edited).toHaveLength(2)
    rpcMock.mockResolvedValueOnce({ data: 8, error: null })
    await act(async () => { await editor?.saveMarkers('123e4567-e89b-12d3-a456-426614174000', 42) })
    expect(rpcMock).toHaveBeenCalledWith('replace_timeline_markers', expect.objectContaining({ p_expected_version: 7, p_duration: 42, p_force: false }))
    expect(editor?.timelineVersion).toBe(8)

    act(() => { editor?.recordMarker(20, 3) })
    const beforeConflict = editor?.markers
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'timeline conflict' } })
    await act(async () => { await expect(editor?.saveMarkers('123e4567-e89b-12d3-a456-426614174000', 42)).rejects.toBeInstanceOf(TimelineConflictError) })
    expect(editor?.markers).toEqual(beforeConflict)
    expect(editor?.dirty).toBe(true)
  })

  it('passes force=true explicitly for an overwrite retry', async () => {
    act(() => { editor?.recordMarker(10, 2) })
    rpcMock.mockResolvedValueOnce({ data: 8, error: null })
    await act(async () => { await editor?.saveMarkers('123e4567-e89b-12d3-a456-426614174000', 30, true) })
    expect(rpcMock).toHaveBeenCalledWith('replace_timeline_markers', expect.objectContaining({ p_expected_version: 7, p_duration: 30, p_force: true }))
  })
})

describe('useTimelineEditor marker updates', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  let editor: ReturnType<typeof useTimelineEditor> | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    editor = undefined
  })

  it('retains two valid marker calls batched before a rerender', () => {
    function Harness() {
      editor = useTimelineEditor([{ time: 0, page: 1 }])
      return null
    }

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(Harness)))

    act(() => {
      expect(editor?.recordMarker(10, 2)).toBe(true)
      expect(editor?.recordMarker(20, 3)).toBe(true)
    })

    expect(editor?.markers.map((marker) => marker.time)).toEqual([0, 10, 20])
    expect(editor?.markers.map((marker) => marker.page)).toEqual([1, 2, 3])
  })
})
