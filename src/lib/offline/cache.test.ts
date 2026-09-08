import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCompleteCachedResponse } from './cache'

describe('offline cache validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects opaque, partial, and truncated responses', async () => {
    const cache = { match: vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'Content-Range': 'bytes 0-1/4' } })) }
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
    expect(await hasCompleteCachedResponse('https://cdn/a', 4, undefined, true)).toBe(false)
    cache.match.mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Length': '4' } }))
    expect(await hasCompleteCachedResponse('https://cdn/a', 4, undefined, true)).toBe(false)
  })

  it('accepts a complete 200 response and verifies its body size', async () => {
    const cache = { match: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Length': '3' } })) }
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
    expect(await hasCompleteCachedResponse('https://cdn/a', 3)).toBe(true)
  })

  it('requires every saved app asset to be a usable cached 200', async () => {
    const cache = { match: vi.fn(async (url: string) => url === '/offline' ? new Response('shell', { status: 200 }) : undefined) }
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
    const { hasCachedShellAssets } = await import('./cache')
    expect(await hasCachedShellAssets(['/offline'])).toBe(true)
    expect(await hasCachedShellAssets(['/offline', '/missing'])).toBe(false)
  })
})
