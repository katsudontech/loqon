import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  getOfflineProject: vi.fn(),
  putOfflineProject: vi.fn(),
}))
const cache = vi.hoisted(() => ({
  hasCompleteCachedResponse: vi.fn(),
  hasCachedShellAssets: vi.fn(),
  deleteProjectMedia: vi.fn(),
  garbageCollectMediaUrls: vi.fn(),
  MEDIA_CACHE_NAME: 'media',
  MEDIA_STAGING_CACHE_NAME: 'staging',
  SHELL_CACHE_NAME: 'shell',
}))
vi.mock('./db', () => db)
vi.mock('./cache', () => cache)
vi.mock('@/components/PDFViewer', () => ({ PDF_WORKER_URL: '/_next/static/pdf.worker.mjs' }))

import { calculateDownloadProgress, saveOfflineProject } from './save'
import type { OfflineProjectInput } from './types'

describe('offline save activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cache.hasCompleteCachedResponse.mockResolvedValue(false)
    cache.hasCachedShellAssets.mockResolvedValue(true)
    const fakeCache = { put: vi.fn(), match: vi.fn(), delete: vi.fn() }
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache) })
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ active: {} }) } })
  })

  it('keeps the old active record when a changed media download fails', async () => {
    const old = { id: 'p', title: 'old', audioUrl: 'old-a', pdfUrl: 'old-p', timelineVersion: 1, timelineUpdatedAt: null, markers: [], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('offline')))

    const input: OfflineProjectInput = {
      id: old.id, title: old.title, audioUrl: 'new-a', pdfUrl: 'new-p',
      timelineVersion: old.timelineVersion, timelineUpdatedAt: old.timelineUpdatedAt, markers: old.markers,
    }
    await expect(saveOfflineProject(input)).rejects.toMatchObject({ code: 'network' })
    expect(db.putOfflineProject).not.toHaveBeenCalled()
  })

  it('does not download media for a timeline-only update and preserves sizes', async () => {
    const old = { id: 'timeline-only', title: 'old', audioUrl: 'audio', pdfUrl: 'pdf', audioBytes: 12, pdfBytes: 24, timelineVersion: 1, timelineUpdatedAt: null, markers: [], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    cache.hasCompleteCachedResponse.mockResolvedValue(true)
    const cached = { match: vi.fn(async (url: string) => url.includes('offline-manifest') ? new Response(JSON.stringify({ cmaps: [] })) : new Response('cached', { status: 200 })), put: vi.fn(), delete: vi.fn() }
    vi.stubGlobal('caches', { open: vi.fn(async () => cached) })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await saveOfflineProject({ id: old.id, title: old.title, audioUrl: old.audioUrl, pdfUrl: old.pdfUrl, audioBytes: old.audioBytes, pdfBytes: old.pdfBytes, timelineVersion: 2, timelineUpdatedAt: 'new', markers: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.audioBytes).toBe(12)
    expect(result.pdfBytes).toBe(24)
    expect(db.putOfflineProject).toHaveBeenCalledOnce()
  })

  it('rebuilds missing app assets instead of returning an otherwise unchanged record', async () => {
    const old = { id: 'repair-shell', title: 'same', audioUrl: 'audio', pdfUrl: 'pdf', audioBytes: 12, pdfBytes: 24, timelineVersion: 1, timelineUpdatedAt: null, markers: [], appAssetUrls: ['/missing-shell.js'], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    cache.hasCompleteCachedResponse.mockResolvedValue(true)
    cache.hasCachedShellAssets.mockResolvedValueOnce(false).mockResolvedValue(true)
    const cached = { match: vi.fn(async (url: string) => url.includes('offline-manifest') ? new Response(JSON.stringify({ cmaps: [] })) : new Response('cached', { status: 200 })), put: vi.fn(), delete: vi.fn() }
    vi.stubGlobal('caches', { open: vi.fn(async () => cached) })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await saveOfflineProject({ id: old.id, title: old.title, audioUrl: old.audioUrl, pdfUrl: old.pdfUrl, audioBytes: old.audioBytes, pdfBytes: old.pdfBytes, timelineVersion: old.timelineVersion, timelineUpdatedAt: old.timelineUpdatedAt, markers: [] })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.appAssetUrls).toContain('/_next/static/pdf.worker.mjs')
    expect(db.putOfflineProject).toHaveBeenCalledOnce()
  })

  it('leaves the previous record active when an update is cancelled', async () => {
    const old = { id: 'cancelled', title: 'old', audioUrl: 'old-a', pdfUrl: 'old-p', audioBytes: 2, pdfBytes: 2, timelineVersion: 1, timelineUpdatedAt: null, markers: [], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    const input: OfflineProjectInput = { id: old.id, title: old.title, audioUrl: 'new-a', pdfUrl: 'new-p', audioBytes: 2, pdfBytes: 2, timelineVersion: 2, timelineUpdatedAt: 'new', markers: [] }
    await expect(saveOfflineProject(input, controller.signal)).rejects.toMatchObject({ code: 'aborted' })
    expect(db.putOfflineProject).not.toHaveBeenCalled()
  })

  it('does not activate when cancellation arrives immediately after network response', async () => {
    const old = { id: 'late-cancel', title: 'old', audioUrl: 'old-a', pdfUrl: 'old-p', audioBytes: 2, pdfBytes: 2, timelineVersion: 1, timelineUpdatedAt: null, markers: [], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => { controller.abort(); return new Response(new Uint8Array([1, 2]), { status: 200 }) }))
    const input: OfflineProjectInput = { id: old.id, title: old.title, audioUrl: 'new-a', pdfUrl: 'new-p', audioBytes: 2, pdfBytes: 2, timelineVersion: 2, timelineUpdatedAt: 'new', markers: [] }
    await expect(saveOfflineProject(input, controller.signal)).rejects.toMatchObject({ code: 'aborted' })
    expect(db.putOfflineProject).not.toHaveBeenCalled()
  })

  it('downloads only the changed media file', async () => {
    const old = { id: 'one-file', title: 'old', audioUrl: 'old-a', pdfUrl: 'same-p', audioBytes: 2, pdfBytes: 3, timelineVersion: 1, timelineUpdatedAt: null, markers: [], savedAt: 1 }
    db.getOfflineProject.mockResolvedValue(old)
    cache.hasCompleteCachedResponse.mockImplementation(async (url: string) => url === 'same-p' || url === 'new-a')
    const cached = { match: vi.fn(async (key: string) => key.includes('offline-manifest') ? new Response(JSON.stringify({ cmaps: [] })) : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Length': '3' } })), put: vi.fn(), delete: vi.fn() }
    vi.stubGlobal('caches', { open: vi.fn(async () => cached) })
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await saveOfflineProject({ id: old.id, title: old.title, audioUrl: 'new-a', pdfUrl: old.pdfUrl, audioBytes: 3, pdfBytes: old.pdfBytes, timelineVersion: 1, timelineUpdatedAt: null, markers: [] })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('new-a', expect.objectContaining({ mode: 'cors' }))
  })

  it('reports monotonic progress that reaches 100 only at completion', () => {
    const progress = [
      calculateDownloadProgress(0, 2, 5, 10),
      calculateDownloadProgress(0, 2, 10, 10),
      calculateDownloadProgress(1, 2, 5, 10),
      calculateDownloadProgress(2, 2, 0, 0),
    ]
    expect(progress).toEqual([0.25, 0.5, 0.75, 1])
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })
})
