import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

async function loadWorker() {
  const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
  const listeners: Record<string, (event: unknown) => void> = {}
  const fetchMock = vi.fn()
  const context = {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler }, clients: { claim: vi.fn() }, location: { origin: 'https://app.test' } },
    caches: {}, Response, Headers, URL, fetch: fetchMock,
  } as Record<string, unknown>
  vm.runInNewContext(source, context)
  return { worker: (context.self as { __loqonOffline: { rangeResponse: (response: Response, range: string) => Promise<Response>; SHELL_ASSETS: string[] } }).__loqonOffline, listeners, fetchMock }
}

import { vi } from 'vitest'

describe('service worker media ranges', () => {
  it('returns a valid 206 with range headers', async () => {
    const { worker } = await loadWorker()
    const response = await worker.rangeResponse(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }), 'bytes=1-2')
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2, 3]))
  })

  it('returns 416 for an invalid or unsatisfiable range', async () => {
    const { worker } = await loadWorker()
    const response = await worker.rangeResponse(new Response(new Uint8Array([1, 2]), { status: 200 }), 'bytes=10-20')
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */2')
  })

  it('keeps install assets small and defers CMaps to explicit save', async () => {
    const { worker } = await loadWorker()
    expect(worker.SHELL_ASSETS.some((asset) => asset.includes('/cmaps/'))).toBe(false)
    expect(worker.SHELL_ASSETS).toEqual([])
  })

  it('serves cached shell scripts and CMaps while offline', async () => {
    const cached = new Response('cached', { status: 200 })
    const shell = { match: vi.fn(async () => cached), put: vi.fn() }
    const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    const localListeners: Record<string, (event: unknown) => void> = {}
    const localFetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    const localContext = { self: { addEventListener: (name: string, handler: (event: unknown) => void) => { localListeners[name] = handler }, clients: { claim: vi.fn() }, location: { origin: 'https://app.test' } }, caches: { open: vi.fn(async () => shell) }, Response, Headers, URL, fetch: localFetch }
    vm.runInNewContext(source, localContext)
    for (const request of [
      { method: 'GET', url: 'https://app.test/_next/static/chunk.js', mode: 'cors', destination: 'script', headers: new Headers() },
      { method: 'GET', url: 'https://app.test/pdfjs/test/cmaps/Adobe-Japan1-0.bcmap', mode: 'cors', destination: '', headers: new Headers() },
    ]) {
      let responsePromise: Promise<Response> | undefined
      localListeners.fetch({ request, respondWith: (value: Promise<Response>) => { responsePromise = value } })
      expect(await responsePromise).toBe(cached)
    }
    expect(localFetch).not.toHaveBeenCalled()
    expect(shell.match).toHaveBeenCalled()
  })

  it('keeps online media usable when the project cache is unavailable', async () => {
    const networkResponse = new Response('network-media', { status: 200 })
    const network = vi.fn().mockResolvedValue(networkResponse)
    const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    const listeners: Record<string, (event: unknown) => void> = {}
    const context = {
      self: {
        addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler },
        clients: { claim: vi.fn() },
        location: { origin: 'https://app.test' },
      },
      caches: { open: vi.fn().mockRejectedValue(new Error('cache storage unavailable')) },
      Response,
      Headers,
      URL,
      fetch: network,
    }
    vm.runInNewContext(source, context)

    for (const request of [
      { method: 'GET', url: 'https://cdn.test/project/song.mp3', mode: 'cors', destination: 'audio', headers: new Headers() },
      { method: 'GET', url: 'https://cdn.test/project/formation.pdf', mode: 'cors', destination: '', headers: new Headers() },
    ]) {
      let responsePromise: Promise<Response> | undefined
      listeners.fetch({ request, respondWith: (value: Promise<Response>) => { responsePromise = value } })
      expect(await responsePromise).toBe(networkResponse)
      expect(network).toHaveBeenCalledWith(request)
    }
  })

  it('keeps a successful shell asset response when caching it fails', async () => {
    const networkResponse = new Response('network-script', { status: 200 })
    const network = vi.fn().mockResolvedValue(networkResponse)
    const media = { match: vi.fn(async () => undefined) }
    const shell = { match: vi.fn(async () => undefined), put: vi.fn().mockRejectedValue(new Error('cache is full')) }
    const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    const listeners: Record<string, (event: unknown) => void> = {}
    const context = {
      self: {
        addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler },
        clients: { claim: vi.fn() },
        location: { origin: 'https://app.test' },
      },
      caches: { open: vi.fn(async (name: string) => name.includes('project-media') ? media : shell) },
      Response,
      Headers,
      URL,
      fetch: network,
    }
    vm.runInNewContext(source, context)

    const request = { method: 'GET', url: 'https://app.test/_next/static/chunk.js', mode: 'cors', destination: 'script', headers: new Headers() }
    let responsePromise: Promise<Response> | undefined
    listeners.fetch({ request, respondWith: (value: Promise<Response>) => { responsePromise = value } })

    expect(await responsePromise).toBe(networkResponse)
    expect(network).toHaveBeenCalledWith(request)
    expect(shell.put).toHaveBeenCalledOnce()
  })

  it('falls back to the cached pathname for an offline navigation', async () => {
    const cached = new Response('select', { status: 200 })
    const shell = { match: vi.fn(async (key: string) => key === '/select' ? cached : undefined), put: vi.fn() }
    const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    const listeners: Record<string, (event: unknown) => void> = {}
    const context = { self: { addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler }, clients: { claim: vi.fn() }, location: { origin: 'https://app.test' } }, caches: { open: vi.fn(async () => shell) }, Response, Headers, URL, fetch: vi.fn().mockRejectedValue(new TypeError('offline')) }
    vm.runInNewContext(source, context)
    const request = { method: 'GET', url: 'https://app.test/select?from=offline', mode: 'navigate', destination: 'document', headers: new Headers() }
    let responsePromise: Promise<Response> | undefined
    listeners.fetch({ request, respondWith: (value: Promise<Response>) => { responsePromise = value } })
    expect(await responsePromise).toBe(cached)
    expect(shell.match).toHaveBeenCalledWith('/select')
  })

  it('does not cache dynamic project HTML and falls back directly to offline', async () => {
    const cachedOffline = new Response('offline', { status: 200 })
    const shell = { match: vi.fn(async (key: string) => key === '/offline' ? cachedOffline : undefined), put: vi.fn() }
    const source = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    const listeners: Record<string, (event: unknown) => void> = {}
    const network = vi.fn().mockResolvedValue(new Response('dynamic', { status: 200 }))
    const context = { self: { addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler }, clients: { claim: vi.fn() }, location: { origin: 'https://app.test' } }, caches: { open: vi.fn(async () => shell) }, Response, Headers, URL, fetch: network }
    vm.runInNewContext(source, context)
    const request = { method: 'GET', url: 'https://app.test/123e4567-e89b-42d3-a456-426614174000', mode: 'navigate', destination: 'document', headers: new Headers() }
    let responsePromise: Promise<Response> | undefined
    listeners.fetch({ request, respondWith: (value: Promise<Response>) => { responsePromise = value } })
    expect((await responsePromise)?.status).toBe(200)
    expect(shell.put).not.toHaveBeenCalled()

    network.mockRejectedValueOnce(new TypeError('offline'))
    let fallbackPromise: Promise<Response> | undefined
    listeners.fetch({ request, respondWith: (value: Promise<Response>) => { fallbackPromise = value } })
    expect(await fallbackPromise).toBe(cachedOffline)
  })
})
