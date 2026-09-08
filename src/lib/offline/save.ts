import { deleteOfflineProject, getOfflineProject, putOfflineProject } from './db'
import { deleteProjectMedia, garbageCollectMediaUrls, hasCachedShellAssets, hasCompleteCachedResponse, MEDIA_CACHE_NAME, MEDIA_STAGING_CACHE_NAME, SHELL_CACHE_NAME } from './cache'
import { compareOfflineRevision } from './revision'
import { mapOfflineError, OfflineSaveError, type OfflineProject, type OfflineProjectInput } from './types'

const inFlight = new Map<string, Promise<OfflineProject>>()

export function calculateDownloadProgress(completedItems: number, itemCount: number, loaded: number, total: number) {
  if (itemCount <= 0) return 1
  const fraction = total > 0 ? Math.min(loaded / total, 1) : 0
  return Math.min(1, (completedItems + fraction) / itemCount)
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new OfflineSaveError('aborted', '保存をキャンセルしました')
}

async function ensureStorageCapacity(expectedBytes: number) {
  if (expectedBytes <= 0 || typeof navigator === 'undefined' || !navigator.storage?.estimate) return
  const estimate = await navigator.storage.estimate()
  if (estimate.quota == null) return
  const remaining = estimate.quota - (estimate.usage ?? 0)
  if (remaining < expectedBytes) throw new OfflineSaveError('quota', '端末の空き容量が不足しています')
}

export async function ensureServiceWorkerReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new OfflineSaveError('unsupported', 'このブラウザではService Workerを利用できません')
  }
  let timer: number | undefined
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Service Workerの準備がタイムアウトしました')), timeoutMs) }),
    ])
    if (!registration.active && !registration.waiting) throw new Error('Service Workerが有効化されていません')
    return registration
  } catch (error) {
    throw new OfflineSaveError('unsupported', 'オフライン機能の準備に失敗しました。ページを再読み込みして再試行してください', { cause: error })
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

async function fetchComplete(url: string, signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void) {
  throwIfAborted(signal)
  const response = await fetch(url, { mode: 'cors', cache: 'no-store', signal })
  throwIfAborted(signal)
  if (response.status !== 200 || response.type === 'opaque' || response.headers.has('content-range')) {
    throw new OfflineSaveError('incomplete', '完全な200レスポンスを取得できませんでした')
  }
  const expected = Number(response.headers.get('content-length'))
  const total = Number.isFinite(expected) && expected > 0 ? expected : 0
  await ensureStorageCapacity(total)
  throwIfAborted(signal)
  if (!response.body) {
    const body = await response.arrayBuffer()
    onProgress?.(body.byteLength, total)
    if (total > 0 && body.byteLength !== total) throw new OfflineSaveError('incomplete', 'ファイルが途中で切断されました')
    const headers = new Headers(response.headers)
    headers.set('Content-Length', String(body.byteLength))
    headers.delete('Content-Encoding')
    return { response: new Response(body, { status: 200, headers }), size: body.byteLength }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    if (next.value) {
      chunks.push(next.value)
      loaded += next.value.byteLength
      onProgress?.(loaded, total)
    }
  }
  const body = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  if (total > 0 && loaded !== total) throw new OfflineSaveError('incomplete', 'ファイルが途中で切断されました')
  const headers = new Headers(response.headers)
  headers.set('Content-Length', String(body.byteLength))
  headers.delete('Content-Encoding')
  return { response: new Response(body, { status: 200, headers }), size: body.byteLength }
}

async function warmAppShell(signal?: AbortSignal) {
  const pages = ['/offline', '/select']
  const shell = await caches.open(SHELL_CACHE_NAME)
  const assets = new Set(['/manifest.json', '/icon-192.png', '/icon-512.png'])
  // Load the lazily split viewer before collecting resource timings. A user
  // can press Save before the on-screen PDF has finished booting, so relying
  // only on already-observed requests could omit its chunk and worker.
  throwIfAborted(signal)
  const { PDF_WORKER_URL } = await import('@/components/PDFViewer')
  const workerUrl = new URL(PDF_WORKER_URL, location.origin)
  if (workerUrl.origin === location.origin) assets.add(`${workerUrl.pathname}${workerUrl.search}`)

  // Warm the exact same-origin route, style, viewer, and worker resources
  // observed after the explicit import above.
  if (typeof performance !== 'undefined') {
    for (const entry of performance.getEntriesByType('resource')) {
      try {
        const url = new URL(entry.name)
        if (
          url.origin === location.origin
          && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pdfjs/'))
        ) assets.add(`${url.pathname}${url.search}`)
      } catch { /* ignore malformed performance entries */ }
    }
  }
  for (const page of pages) {
    throwIfAborted(signal)
    let response = await shell.match(page)
    if (!response) {
      response = await fetch(page, { cache: 'no-store', signal })
      if (!response.ok) throw new OfflineSaveError('network', 'オフライン画面を準備できませんでした')
      throwIfAborted(signal)
      await shell.put(page, response.clone())
    }
    const html = await response.clone().text()
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
      const value = match[1]
      if (value.startsWith('/') && !value.startsWith('//')) assets.add(value)
    }
  }
  let manifestResponse = await shell.match('/pdfjs/offline-manifest.json')
  const manifestWasCached = Boolean(manifestResponse)
  if (!manifestResponse) manifestResponse = await fetch('/pdfjs/offline-manifest.json', { cache: 'no-store', signal })
  if (!manifestResponse.ok) throw new OfflineSaveError('network', 'PDF資産マニフェストを準備できませんでした')
  if (!manifestWasCached) { throwIfAborted(signal); await shell.put('/pdfjs/offline-manifest.json', manifestResponse.clone()) }
  const manifest = await manifestResponse.json() as { assets?: string[]; cmaps?: string[] }
  for (const asset of manifest.assets ?? manifest.cmaps ?? []) assets.add(asset)
  for (const asset of assets) {
    throwIfAborted(signal)
    if (await shell.match(asset)) continue
    const response = await fetch(asset, { cache: 'no-store', signal })
    if (!response.ok) throw new OfflineSaveError('network', `アプリ資産を準備できませんでした: ${asset}`)
    throwIfAborted(signal)
    await shell.put(asset, response)
  }
  for (const asset of assets) {
    throwIfAborted(signal)
    if (!await shell.match(asset)) throw new OfflineSaveError('incomplete', `アプリ資産の検証に失敗しました: ${asset}`)
  }
  const appAssetUrls = [...new Set([...pages, '/pdfjs/offline-manifest.json', ...assets])]
  if (!await hasCachedShellAssets(appAssetUrls)) throw new OfflineSaveError('incomplete', 'アプリ資産の検証に失敗しました')
  return appAssetUrls
}

async function safeGarbageCollect(urls: Iterable<string>) {
  try { await garbageCollectMediaUrls(urls) } catch (error) { console.warn('offline media cleanup failed', error) }
}

async function saveProjectInternal(input: OfflineProjectInput, signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void) {
  if (typeof caches === 'undefined' || typeof fetch === 'undefined') throw new OfflineSaveError('unsupported', 'このブラウザはオフライン保存に対応していません')
  await ensureServiceWorkerReady()
  const old = await getOfflineProject(input.id)
  const revision = compareOfflineRevision(old, input)
  const result: OfflineProject = {
    ...input,
    compositionCues: input.compositionCues ?? old?.compositionCues ?? [],
    practiceParts: input.practiceParts ?? old?.practiceParts ?? [],
    compositionVersion: input.compositionVersion ?? old?.compositionVersion ?? input.timelineVersion,
    compositionUpdatedAt: input.compositionUpdatedAt ?? old?.compositionUpdatedAt ?? input.timelineUpdatedAt,
    practiceVersion: input.practiceVersion ?? old?.practiceVersion ?? input.timelineVersion,
    practiceUpdatedAt: input.practiceUpdatedAt ?? old?.practiceUpdatedAt ?? input.timelineUpdatedAt,
    audioBytes: input.audioBytes ?? old?.audioBytes ?? null,
    pdfBytes: input.pdfBytes ?? old?.pdfBytes ?? null,
    appAssetUrls: input.appAssetUrls ?? old?.appAssetUrls ?? [],
    savedAt: Date.now(),
  }
  if (
    revision.kind === 'same'
    && old
    && old.audioBytes != null
    && old.pdfBytes != null
    && await hasCompleteCachedResponse(old.audioUrl, old.audioBytes)
    && await hasCompleteCachedResponse(old.pdfUrl, old.pdfBytes)
    && await hasCachedShellAssets(old.appAssetUrls ?? [])
  ) return old

  const staging = await caches.open(MEDIA_STAGING_CACHE_NAME)
  const media = await caches.open(MEDIA_CACHE_NAME)
  const urls = [
    { url: input.audioUrl, changed: revision.media.audio, bytes: input.audioBytes },
    { url: input.pdfUrl, changed: revision.media.pdf, bytes: input.pdfBytes },
  ]
  const staged: string[] = []
  try {
    const pending = []
    for (const item of urls) {
      throwIfAborted(signal)
      if (!item.changed && await hasCompleteCachedResponse(item.url, item.bytes)) {
        continue
      }
      pending.push(item)
    }
    const itemCount = pending.length
    let completedItems = 0
    for (const item of pending) {
      throwIfAborted(signal)
      const fetched = await fetchComplete(item.url, signal, (size, total) => {
        const progress = calculateDownloadProgress(completedItems, itemCount, size, total)
        onProgress?.(Math.min(progress, 0.99), 1)
      })
      throwIfAborted(signal)
      if (item.url === input.audioUrl) result.audioBytes = fetched.size
      if (item.url === input.pdfUrl) result.pdfBytes = fetched.size
      throwIfAborted(signal)
      await staging.put(item.url, fetched.response)
      staged.push(item.url)
      completedItems += 1
      onProgress?.(Math.min(calculateDownloadProgress(completedItems, itemCount, 0, 0), 0.99), 1)
    }
    if (itemCount === 0) onProgress?.(0.99, 1)
    for (const item of urls) {
      throwIfAborted(signal)
      if (await hasCompleteCachedResponse(item.url, item.bytes)) continue
      const stagedResponse = await staging.match(item.url)
      if (!stagedResponse) throw new OfflineSaveError('incomplete', '保存したファイルを検証できませんでした')
      throwIfAborted(signal)
      await media.put(item.url, stagedResponse)
    }
    if (!await hasCompleteCachedResponse(result.audioUrl, result.audioBytes, MEDIA_CACHE_NAME, true) || !await hasCompleteCachedResponse(result.pdfUrl, result.pdfBytes, MEDIA_CACHE_NAME, true)) {
      throw new OfflineSaveError('incomplete', 'キャッシュの検証に失敗しました')
    }
    throwIfAborted(signal)
    result.appAssetUrls = await warmAppShell(signal)
    throwIfAborted(signal)
    await putOfflineProject(result)
    onProgress?.(1, 1)
    if (old) await safeGarbageCollect([old.audioUrl, old.pdfUrl])
    return result
  } catch (error) {
    for (const url of staged) await staging.delete(url)
    await safeGarbageCollect(staged)
    throw mapOfflineError(error)
  } finally {
    for (const url of staged) await staging.delete(url)
  }
}

export function saveOfflineProject(input: OfflineProjectInput, signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void) {
  const existing = inFlight.get(input.id)
  if (existing) return existing
  const operation = saveProjectInternal(input, signal, onProgress).finally(() => inFlight.delete(input.id))
  inFlight.set(input.id, operation)
  return operation
}

export async function removeOfflineProject(project: OfflineProject) {
  await deleteOfflineProject(project.id)
  await deleteProjectMedia(project)
}
