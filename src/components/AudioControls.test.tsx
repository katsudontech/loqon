import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioControls } from './AudioControls'

describe('AudioControls accessibility', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  const render = (playbackError = '') => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(AudioControls, {
      isPlaying: false,
      currentTime: 4,
      duration: 100,
      playbackRate: 1,
      togglePlay: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      playbackError,
    })))
  }

  it('exposes readable play state and labelled range/rate controls', () => {
    render()
    const play = host?.querySelector('button') as HTMLButtonElement
    expect(play.getAttribute('aria-label')).toBe('再生')
    expect(play.getAttribute('aria-pressed')).toBe('false')
    expect(host?.querySelector('input[type="range"]')?.getAttribute('aria-label')).toBe('再生位置')
    expect(host?.querySelector('select')?.getAttribute('aria-label')).toBe('再生速度')
    act(() => play.focus())
    expect(document.activeElement).toBe(play)
  })

  it('announces playback errors without relying on color', () => {
    render('音源を再生できませんでした')
    const status = host?.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('assertive')
    expect(status?.textContent).toContain('音源を再生できませんでした')
  })
})
