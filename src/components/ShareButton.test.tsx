import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

describe('ShareButton', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
    root = undefined
    host = undefined
  })

  const render = () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(ShareButton)))
  }

  it('uses the native share API before clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render()

    await act(async () => {
      host?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.any(String) }))
    expect(writeText).not.toHaveBeenCalled()
    expect(host?.querySelector('[aria-live="polite"]')?.textContent).toContain('共有しました')
  })

  it('shows a selectable URL when sharing and clipboard both fail', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render()

    await act(async () => {
      host?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host?.querySelector('input[aria-label="共有URL"]')).not.toBeNull()
    expect(host?.querySelector('[aria-live="polite"]')?.textContent).toContain('自動コピーに失敗しました')
  })

  it('falls back to clipboard when native sharing rejects', async () => {
    const share = vi.fn().mockRejectedValue(new Error('native share unavailable'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render()

    await act(async () => {
      host?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(share).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledOnce()
    expect(host?.querySelector('[aria-live="polite"]')?.textContent).toContain('共有URLをコピーしました')
  })
})
