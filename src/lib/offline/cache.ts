import { listOfflineProjects } from './db'
import type { OfflineProject } from './types'

export const MEDIA_CACHE_NAME = 'loqon-project-media-v1'
export const MEDIA_STAGING_CACHE_NAME = 'loqon-project-media-staging-v1'
export const SHELL_CACHE_NAME = 'loqon-shell-v1'

export function cacheSupported() {
  return typeof caches !== 'undefined'
}

export async function hasCachedShellAssets(urls: readonly string[]) {
  if (!cacheSupported() || urls.length === 0) return false
  const cache = await caches.open(SHELL_CACHE_NAME)
  for (const url of urls) {
    const response = await cache.match(url)
    if (!response || response.status !== 200 || response.type === 'opaque') return false
  }
  return true
}

export async function hasCompleteCachedResponse(url: string, expectedBytes?: number | null, cacheName = MEDIA_CACHE_NAME, deep = false) {
  if (!cacheSupported()) return false
  const response = await caches.open(cacheName).then((cache) => cache.match(url))
  if (!response || response.status !== 200 || response.type === 'opaque') return false
  if (response.headers.has('content-range')) return false
  const contentLength = Number(response.headers.get('content-length'))
  if (expectedBytes != null && (!Number.isFinite(contentLength) || contentLength !== expectedBytes)) return false
  if (expectedBytes == null && Number.isFinite(contentLength) && contentLength === 0) return false
  if (deep) {
    try {
      const actualBytes = (await response.clone().arrayBuffer()).byteLength
      if (expectedBytes != null && actualBytes !== expectedBytes) return false
      if (Number.isFinite(contentLength) && actualBytes !== contentLength) return false
    } catch {
      return false
    }
  }
  return true
}

export async function referencedMediaUrls(excludeId?: string) {
  const projects = await listOfflineProjects()
  const refs = new Set<string>()
  for (const project of projects) {
    if (project.id === excludeId) continue
    refs.add(project.audioUrl)
    refs.add(project.pdfUrl)
  }
  return refs
}

export async function deleteProjectMedia(project: OfflineProject) {
  await garbageCollectMediaUrls([project.audioUrl, project.pdfUrl], project.id)
}

export async function garbageCollectMediaUrls(urls: Iterable<string>, excludeId?: string) {
  if (!cacheSupported()) return
  const refs = await referencedMediaUrls(excludeId)
  const cache = await caches.open(MEDIA_CACHE_NAME)
  for (const url of urls) {
    if (!refs.has(url)) await cache.delete(url)
  }
}
