/* Loqon offline shell and project-media worker. User media and app shell have
 * separate caches so an app update never evicts an explicitly saved project. */
// Revision 2026-09-08.2: change the worker bytes so existing installations
// adopt the updated CSP that permits connections to Supabase storage.
const MEDIA_CACHE = 'loqon-project-media-v1'
const SHELL_CACHE = 'loqon-shell-v1'
const SHELL_ASSETS = []

function parseRange(value, length) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '')
  if (!match || (!match[1] && !match[2])) return null
  let start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]))
  let end = match[2] ? Number(match[2]) : length - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= length) return { invalid: true }
  end = Math.min(end, length - 1)
  return { start, end }
}

async function rangeResponse(cached, rangeHeader) {
  const body = await cached.arrayBuffer()
  const range = parseRange(rangeHeader, body.byteLength)
  if (!range || range.invalid) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}`, 'Accept-Ranges': 'bytes' } })
  const headers = new Headers(cached.headers)
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${body.byteLength}`)
  headers.set('Content-Length', String(range.end - range.start + 1))
  headers.set('Accept-Ranges', 'bytes')
  headers.delete('Content-Encoding')
  return new Response(body.slice(range.start, range.end + 1), { status: 206, headers })
}

function isNavigation(request) {
  return request.mode === 'navigate' || request.destination === 'document'
}

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin
}

function isDynamicProjectPath(pathname) {
  return /^\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/(?:edit|settings))?\/?$/i.test(pathname)
}

async function shellFallback(request, forceOffline = false) {
  try {
    const shell = await caches.open(SHELL_CACHE)
    const pathname = new URL(request.url).pathname
    return (forceOffline ? undefined : await shell.match(pathname)) || (await shell.match('/offline'))
  } catch {
    return undefined
  }
}

async function cachedMediaResponse(request) {
  try {
    const media = await caches.open(MEDIA_CACHE)
    const cached = await media.match(request.url)
    if (!cached || cached.status !== 200 || cached.type === 'opaque') return undefined
    const range = request.headers.get('range')
    return range ? await rangeResponse(cached, range) : cached
  } catch {
    // Cache storage is optional for online playback. A stale or unavailable
    // cache must never turn a network media request into a failed fetch.
    return undefined
  }
}

async function cacheShellResponse(request, response) {
  try {
    const shell = await caches.open(SHELL_CACHE)
    await shell.put(request, response.clone())
  } catch {
    // Keep the network response usable when cache storage is unavailable.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  event.respondWith((async () => {
    const cached = await cachedMediaResponse(request)
    if (cached) return cached

    if (isNavigation(request)) {
      const dynamicProject = isDynamicProjectPath(new URL(request.url).pathname)
      try {
        const response = await fetch(request)
        if (response.ok && sameOrigin(request) && !dynamicProject) {
          await cacheShellResponse(request, response)
        }
        return response
      } catch {
        return (await shellFallback(request, dynamicProject)) || new Response('Offline', { status: 503 })
      }
    }

    if (sameOrigin(request) && (request.destination === 'script' || request.destination === 'style' || request.destination === 'font' || request.destination === 'image' || new URL(request.url).pathname.startsWith('/_next/static/') || new URL(request.url).pathname.startsWith('/pdfjs/'))) {
      try {
        const shell = await caches.open(SHELL_CACHE)
        const asset = await shell.match(request)
        if (asset) return asset
      } catch {
        // Fall through to the network when shell caching is unavailable.
      }
      try {
        const response = await fetch(request)
        if (response.ok) await cacheShellResponse(request, response)
        return response
      } catch {
        return (await shellFallback(request)) || new Response('', { status: 503 })
      }
    }

    try {
      return await fetch(request)
    } catch {
      return (await shellFallback(request)) || new Response('', { status: 503 })
    }
  })())
})

// Kept available for focused worker tests and diagnostics.
self.__loqonOffline = { parseRange, rangeResponse, MEDIA_CACHE, SHELL_CACHE, SHELL_ASSETS, isDynamicProjectPath }
