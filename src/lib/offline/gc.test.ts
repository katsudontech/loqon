import { describe, expect, it, vi } from 'vitest'

const list = vi.hoisted(() => vi.fn())
vi.mock('./db', () => ({ listOfflineProjects: list }))

import { garbageCollectMediaUrls } from './cache'

describe('offline media garbage collection', () => {
  it('keeps URLs referenced by another saved project', async () => {
    list.mockResolvedValue([{ id: 'other', audioUrl: 'shared-a', pdfUrl: 'other-p' }])
    const deleted: string[] = []
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ delete: vi.fn(async (url: string) => { deleted.push(url); return true }) })) })
    await garbageCollectMediaUrls(['shared-a', 'old-p'])
    expect(deleted).toEqual(['old-p'])
    vi.unstubAllGlobals()
  })
})
