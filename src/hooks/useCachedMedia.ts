import { useState, useEffect } from 'react'

/**
 * 以前は CacheStorage API を用いて手動でBlobに変換していましたが、
 * 以下の問題があったためブラウザの標準HTTPキャッシュに任せる設計に刷新しました：
 * 1. メモリリーク（古いBlob URLが破棄されない）
 * 2. オーディオのストリーミング再生阻害（全データダウンロード完了まで再生できない）
 * 3. 状態の競合による他プロジェクトの音源再生バグ
 */
export function useCachedMedia(url: string) {
  // ブラウザのネイティブ機能（<img>, <audio>, <object>のsrc属性）に
  // URLを直接渡すことで、ブラウザが自動的に効率よくキャッシュ・ストリーミング処理を行います。
  return { cachedUrl: url, isCaching: false }
}
