import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AudioState = {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  playbackError: string
  play: ReturnType<typeof vi.fn>
  togglePlay: ReturnType<typeof vi.fn>
  seekTo: ReturnType<typeof vi.fn>
  setPlaybackRate: ReturnType<typeof vi.fn>
}

let audioState: AudioState
let recordMarker: ReturnType<typeof vi.fn>
let latestPdfProps: Record<string, unknown> | undefined

vi.mock('@/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({ audioRef: { current: null }, ...audioState }),
}))

vi.mock('@/hooks/useTimelineEditor', () => ({
  useTimelineEditor: () => ({
    markers: [],
    dirty: false,
    timelineVersion: 0,
    validationError: '',
    recordMarker,
    deleteMarker: vi.fn(),
    updateMarkerName: vi.fn(),
    clearMarkers: vi.fn(),
    saveMarkers: vi.fn(),
    replaceMarkersFromRemote: vi.fn(),
    restoreMarkers: vi.fn(),
    undoLast: vi.fn(() => true),
    setValidationError: vi.fn(),
  }),
}))

vi.mock('@/components/AudioControls', () => ({
  AudioControls: () => React.createElement('div', { 'data-testid': 'audio-controls' }),
}))

vi.mock('@/components/PDFViewerWrapper', () => ({
  PDFViewerWrapper: (props: Record<string, unknown>) => {
    latestPdfProps = props
    return React.createElement('div', { 'data-testid': 'pdf-viewer' })
  },
}))

vi.mock('@/lib/timeline-client', () => ({ getClientTimelineSnapshot: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { EditorContainer } from './EditorContainer'

describe('EditorContainer page advance', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(() => {
    audioState = {
      isPlaying: false,
      currentTime: 0,
      duration: 120,
      playbackRate: 1,
      playbackError: '',
      play: vi.fn(),
      togglePlay: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
    }
    recordMarker = vi.fn(() => true)
    latestPdfProps = undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3',
      pdfUrl: '/formation.pdf',
      projectId: 'project-1',
    })))
    act(() => (latestPdfProps?.onDocumentLoadSuccess as ((pages: number) => void) | undefined)?.(4))
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it.each([
    ['playing', true, 27.5],
    ['paused', false, 27.5],
    // The player has no separate stop flag; paused and stopped both map to
    // isPlaying=false while retaining the current seek position.
    ['stopped', false, 42],
  ])('advances while %s using the current playback time', (_state, isPlaying, currentTime) => {
    audioState.isPlaying = isPlaying
    audioState.currentTime = currentTime
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3',
      pdfUrl: '/formation.pdf',
      projectId: 'project-1',
    })))

    const advance = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '次のページへ') as HTMLButtonElement
    act(() => advance.click())

    expect(recordMarker).toHaveBeenCalledWith(currentTime, 2)
    expect(latestPdfProps?.pages).toEqual([2, 3])
    expect(audioState.play).not.toHaveBeenCalled()
    expect(audioState.togglePlay).not.toHaveBeenCalled()
    expect(audioState.seekTo).not.toHaveBeenCalled()
  })

  it('keeps the existing preview when the current timestamp already owns a marker', () => {
    audioState.isPlaying = false
    audioState.currentTime = 0
    recordMarker.mockReturnValue(false)
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3',
      pdfUrl: '/formation.pdf',
      projectId: 'project-1',
    })))

    const advance = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '次のページへ') as HTMLButtonElement
    act(() => advance.click())

    expect(recordMarker).toHaveBeenCalledWith(0, 2)
    expect(latestPdfProps?.pages).toEqual([1, 2])
    expect(audioState.play).not.toHaveBeenCalled()
  })

  it('does not advance when the marker timestamp is rejected', () => {
    recordMarker.mockReturnValue(false)
    audioState.currentTime = 18
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3',
      pdfUrl: '/formation.pdf',
      projectId: 'project-1',
    })))

    const advance = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '次のページへ') as HTMLButtonElement
    act(() => advance.click())

    expect(recordMarker).toHaveBeenCalledWith(18, 2)
    expect(latestPdfProps?.pages).toEqual([1, 2])
  })

  it('shows an empty next-formation card and disables advance on the final page', () => {
    act(() => (latestPdfProps?.onDocumentLoadSuccess as ((pages: number) => void) | undefined)?.(1))

    expect(latestPdfProps?.pages).toEqual([1])
    expect(latestPdfProps?.showEmptyNext).toBe(true)
    expect((host?.querySelector('button') && [...(host.querySelectorAll('button'))].find((button) => button.textContent === '次のページへ'))?.hasAttribute('disabled')).toBe(true)
  })

  it('uses the composition action while paused and keeps browse-only navigation separate', () => {
    audioState.currentTime = 12
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3', pdfUrl: '/formation.pdf', projectId: 'project-1',
      initialCues: [{ id: '00000000-0000-4000-8000-000000000001', time: 0, page: 1 }], compositionVersion: 2,
    })))
    const next = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '次を見る') as HTMLButtonElement
    act(() => next.click())
    expect(latestPdfProps?.currentPage).toBe(2)
    const record = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'ここで次の構成へ') as HTMLButtonElement
    act(() => record.click())
    expect(recordMarker).toHaveBeenCalledWith(12, 2)
    expect(audioState.play).not.toHaveBeenCalled()
    expect(latestPdfProps?.currentPage).toBe(2)
  })

  it('does not replace undo progression when a later composition recording fails', () => {
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3', pdfUrl: '/formation.pdf', projectId: 'project-1',
      initialCues: [{ id: '00000000-0000-4000-8000-000000000001', time: 0, page: 1 }], compositionVersion: 2,
    })))
    const record = () => [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'ここで次の構成へ') as HTMLButtonElement
    recordMarker.mockReturnValueOnce(true).mockReturnValueOnce(false)
    act(() => record().click())
    audioState.currentTime = 20
    act(() => root?.render(React.createElement(EditorContainer, {
      audioUrl: '/song.mp3', pdfUrl: '/formation.pdf', projectId: 'project-1',
      initialCues: [{ id: '00000000-0000-4000-8000-000000000001', time: 0, page: 1 }], compositionVersion: 2,
    })))
    act(() => record().click())
    const undo = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '直前の記録を取り消す') as HTMLButtonElement
    act(() => undo.click())
    expect(latestPdfProps?.currentPage).toBe(1)
  })
})
