import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rpc: vi.fn(),
  getSnapshot: vi.fn(),
}))
let audioState: { currentTime: number; duration: number; isPlaying: boolean; playbackRate: number; playbackError: string; play: ReturnType<typeof vi.fn>; togglePlay: ReturnType<typeof vi.fn>; seekTo: ReturnType<typeof vi.fn>; setPlaybackRate: ReturnType<typeof vi.fn> }

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/lib/timeline-client', () => ({ getClientTimelineSnapshot: mocks.getSnapshot }))
vi.mock('@/hooks/useAudioPlayer', () => ({ useAudioPlayer: () => ({ audioRef: { current: null }, ...audioState }) }))
vi.mock('@/components/AudioControls', () => ({ AudioControls: () => React.createElement('div', { 'data-testid': 'audio-controls' }) }))
vi.mock('@/components/PDFViewerWrapper', () => ({ PDFViewerWrapper: () => React.createElement('div', { 'data-testid': 'pdf-viewer' }) }))

import { PartsEditorContainer } from './PartsEditorContainer'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const initial = [{ id: id(1), startTime: 0, endTime: 0, name: '全体' }]
const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('PartsEditorContainer', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    audioState = { currentTime: 50, duration: 100, isPlaying: false, playbackRate: 1, playbackError: '', play: vi.fn(), togglePlay: vi.fn(), seekTo: vi.fn(), setPlaybackRate: vi.fn() }
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<PartsEditorContainer projectId="project-1" audioUrl="/song.mp3" pdfUrl="/formation.pdf" cues={[{ id: id(9), time: 0, page: 1 }]} initialParts={initial} initialVersion={0} />))
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
  })

  it('does not become dirty just because duration metadata is available, and saves the default whole-song part', async () => {
    expect(host?.textContent).not.toContain('未保存のパート編集があります')
    const save = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '保存して練習') as HTMLButtonElement
    await act(async () => save.click())
    expect(mocks.rpc).toHaveBeenCalledWith('replace_practice_parts', expect.objectContaining({ p_duration: 100, p_parts: [expect.objectContaining({ start_time: 0, end_time: 100 })] }))
    expect(mocks.push).toHaveBeenCalledWith('/project-1')
  })

  it('splits at the current position, atomically resizes the boundary, and merges keeping the earlier name', () => {
    const split = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'ここでパートを分ける') as HTMLButtonElement
    act(() => split.click())
    expect(host?.querySelectorAll('input[aria-label="パート名"]').length).toBe(2)
    const names = [...(host?.querySelectorAll('input[aria-label="パート名"]') ?? [])] as HTMLInputElement[]
    act(() => setInputValue(names[0], '前半'))
    act(() => setInputValue(names[1], '後半'))
    const boundary = host?.querySelector('input[aria-label="境界時刻"]') as HTMLInputElement
    expect(boundary).toBeTruthy()
    act(() => setInputValue(boundary, '60'))
    expect(host?.textContent).toContain('0.0s – 60.0s')
    const remove = host?.querySelector('button[aria-label="この境界を削除して前後を結合"]') as HTMLButtonElement
    act(() => remove.click())
    expect(host?.querySelectorAll('input[aria-label="パート名"]').length).toBe(1)
    expect((host?.querySelector('input[aria-label="パート名"]') as HTMLInputElement).value).toBe('前半')
  })

  it('offers the three-way navigation guard after a boundary edit', () => {
    const split = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'ここでパートを分ける') as HTMLButtonElement
    act(() => split.click())
    const back = [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '構成を合わせる') as HTMLButtonElement
    act(() => back.click())
    expect(host?.textContent).toContain('移動前に編集内容を保存しますか？')
    expect(host?.textContent).toContain('保存')
    expect(host?.textContent).toContain('破棄して移動')
    expect(host?.textContent).toContain('移動をやめる')
  })
})
