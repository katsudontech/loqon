import { useState, useEffect } from 'react'

export function useCachedMedia(url: string) {
  const [cachedUrl, setCachedUrl] = useState<string>(url)
  const [isCaching, setIsCaching] = useState<boolean>(false)

  useEffect(() => {
    if (!url) return

    let isMounted = true

    const fetchAndCache = async () => {
      try {
        if (!('caches' in window)) return

        const cache = await caches.open('loqon-media-cache-v1')
        const response = await cache.match(url)

        if (response) {
          // キャッシュが存在する場合、Blobとして読み込んでローカルURLを生成
          const blob = await response.blob()
          if (isMounted) {
            setCachedUrl(URL.createObjectURL(blob))
          }
        } else {
          // キャッシュがない場合、取得して保存する
          setIsCaching(true)
          const fetchResponse = await fetch(url)
          if (fetchResponse.ok) {
            await cache.put(url, fetchResponse.clone())
            const blob = await fetchResponse.blob()
            if (isMounted) {
              setCachedUrl(URL.createObjectURL(blob))
            }
          }
        }
      } catch (error) {
        console.error('Failed to cache media:', error)
      } finally {
        if (isMounted) {
          setIsCaching(false)
        }
      }
    }

    fetchAndCache()

    return () => {
      isMounted = false
    }
  }, [url])

  return { cachedUrl, isCaching }
}
