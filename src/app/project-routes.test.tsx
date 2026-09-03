import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notFoundError, notFound, getPublicProject, getPublicTimelineMarkers, getPublicTimelineSnapshot } = vi.hoisted(() => {
  const error = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    notFoundError: error,
    notFound: vi.fn(() => { throw error }),
    getPublicProject: vi.fn(),
    getPublicTimelineMarkers: vi.fn(),
    getPublicTimelineSnapshot: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/projects', () => ({ getPublicProject, getPublicTimelineMarkers, getPublicTimelineSnapshot }))
vi.mock('@/lib/timeline', () => ({
  convertDbRowsToPlayerMarkers: (rows: unknown[]) => rows,
}))
vi.mock('@/components/PlayerContainer', () => ({ PlayerContainer: () => React.createElement('div') }))
vi.mock('@/components/EditorContainer', () => ({ EditorContainer: () => React.createElement('div') }))
vi.mock('@/components/ShareButton', () => ({ ShareButton: () => React.createElement('button', { type: 'button' }, '共有') }))
vi.mock('@/components/RecentProjectTracker', () => ({ RecentProjectTracker: () => null }))
vi.mock('@/components/ProjectForm', () => ({ ProjectForm: () => React.createElement('form') }))

import PlayerPage from './[projectId]/page'
import EditPage from './[projectId]/edit/page'
import SettingsPage from './[projectId]/settings/page'
import ProjectLayout from './[projectId]/layout'

describe('project route not-found boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicTimelineMarkers.mockResolvedValue([])
    getPublicTimelineSnapshot.mockResolvedValue({ markers: [], version: 0, updatedAt: null })
  })

  it.each([
    ['player', PlayerPage],
    ['edit', EditPage],
    ['settings', SettingsPage],
  ])('calls notFound for a missing %s project', async (_name, Page) => {
    getPublicProject.mockResolvedValue(null)
    await expect(Page({ params: Promise.resolve({ projectId: 'missing' }) })).rejects.toBe(notFoundError)
    expect(notFound).toHaveBeenCalledOnce()
  })

  it('keeps Supabase exceptions as errors instead of turning them into 404s', async () => {
    const databaseError = new Error('database unavailable')
    getPublicProject.mockRejectedValue(databaseError)
    await expect(PlayerPage({ params: Promise.resolve({ projectId: 'missing' }) })).rejects.toBe(databaseError)
    expect(notFound).not.toHaveBeenCalled()
  })

  it('checks project existence in the layout before loading UI can stream', async () => {
    getPublicProject.mockResolvedValue(null)
    await expect(ProjectLayout({
      children: React.createElement('div'),
      params: Promise.resolve({ projectId: 'missing' }),
    })).rejects.toBe(notFoundError)
    expect(notFound).toHaveBeenCalledOnce()
  })

  it('lets layout data failures reach the parent error boundary', async () => {
    const databaseError = new Error('database unavailable')
    getPublicProject.mockRejectedValue(databaseError)
    await expect(ProjectLayout({
      children: React.createElement('div'),
      params: Promise.resolve({ projectId: 'missing' }),
    })).rejects.toBe(databaseError)
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('project error UI', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it('renders a Japanese retry control and invokes unstable_retry', async () => {
    const { default: ErrorPage } = await import('./[projectId]/error')
    const retry = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(React.createElement(ErrorPage, { error: new Error('boom'), unstable_retry: retry })))
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button?.textContent).toContain('もう一度試す')
    act(() => button.click())
    expect(retry).toHaveBeenCalledOnce()
  })
})
