'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { getOfflineProject } from '@/lib/offline/db'
import { hasCachedShellAssets, hasCompleteCachedResponse } from '@/lib/offline/cache'
import { compareOfflineRevision } from '@/lib/offline/revision'
import { ensureServiceWorkerReady, removeOfflineProject, saveOfflineProject } from '@/lib/offline/save'
import type { OfflineProject, OfflineProjectInput } from '@/lib/offline/types'

type Props = { project: OfflineProjectInput }
type State = 'loading' | 'unsaved' | 'saving' | 'saved' | 'update' | 'inconsistent' | 'error' | 'unsupported'

export function OfflineProjectControl({ project }: Props) {
  const [state, setState] = useState<State>('loading')
  const [saved, setSaved] = useState<OfflineProject | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(0)
  const [controller, setController] = useState<AbortController | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const offlineHref = `/offline?project=${encodeURIComponent(project.id)}`
  const openOffline = (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); window.location.assign(offlineHref) }

  const inspect = async () => {
    try {
      if (!('indexedDB' in window) || !('caches' in window)) throw new Error('このブラウザではオフライン保存を利用できません')
      await ensureServiceWorkerReady()
      const record = await getOfflineProject(project.id)
      setSaved(record)
      setIsOffline(!navigator.onLine)
      if (!record) { setState('unsaved'); return }
      const complete = await hasCompleteCachedResponse(record.audioUrl, record.audioBytes) && await hasCompleteCachedResponse(record.pdfUrl, record.pdfBytes) && await hasCachedShellAssets(record.appAssetUrls ?? [])
      const currentRevision = compareOfflineRevision(record, project)
      setUsage(record.audioBytes != null && record.pdfBytes != null ? `${formatBytes(record.audioBytes + record.pdfBytes)} 保存済み` : null)
      setState(!complete ? 'inconsistent' : !navigator.onLine ? 'saved' : currentRevision.kind === 'changed' ? 'update' : 'saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'オフライン機能を確認できませんでした')
      setState('unsupported')
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void inspect() }, 0)
    const onOffline = () => {
      setIsOffline(true)
      setState((current) => current === 'update' ? 'saved' : current)
    }
    const onOnline = () => { setIsOffline(false); void inspect() }
    window.addEventListener('offline', onOffline); window.addEventListener('online', onOnline)
    return () => { window.clearTimeout(timer); window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline) }
  // inspect intentionally captures the current project snapshot for this run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.audioUrl, project.pdfUrl, project.timelineVersion, project.timelineUpdatedAt, project.title])

  const save = async () => {
    const abort = new AbortController()
    setController(abort); setState('saving'); setError(''); setProgress(0)
    try {
      if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false)
      const result = await saveOfflineProject(project, abort.signal, (loaded, total) => setProgress(total ? Math.round(loaded / total * 100) : null))
      setSaved(result); setState('saved')
      setUsage(result.audioBytes != null && result.pdfBytes != null ? `${formatBytes(result.audioBytes + result.pdfBytes)} 保存済み` : null)
    } catch (cause) {
      const e = cause as { code?: string; message?: string }
      if (e.code !== 'aborted') setError(e.message || '保存に失敗しました')
      setState(e.code === 'aborted' ? (saved ? 'saved' : 'unsaved') : 'error')
    } finally { setController(null) }
  }

  const remove = async () => {
    if (!saved) return
    try {
      await removeOfflineProject(saved)
      setSaved(null); setState('unsaved'); setUsage(null); setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '端末からの削除に失敗しました'); setState('error')
    }
  }

  if (state === 'loading') return <div className="offline-control" aria-live="polite">オフライン保存を確認中…</div>
  if (state === 'unsupported') return <div className="offline-control" role="alert">{error || 'このブラウザではオフライン保存を利用できません。'}</div>
  if (state === 'saving') return <div className="offline-control" aria-live="polite"><span>{progress == null ? '保存中… ダウンロード中' : `保存中… ${progress}%`}</span><button type="button" className="button-quiet" onClick={() => controller?.abort()}>キャンセル</button></div>
  if (state === 'inconsistent') return <div className="offline-control" role="alert"><span>保存記録とファイルが一致しません。再保存するか端末から削除してください。</span><button type="button" className="button" onClick={save}>もう一度保存</button>{saved && <button type="button" className="button-quiet" onClick={remove}>端末から削除</button>}</div>
  if (state === 'error') return <div className="offline-control" role="alert"><span>{error}{saved ? ' 以前の保存版は利用可能です。' : ''}</span><button type="button" className="button" onClick={save}>再試行</button>{saved && <><Link href={offlineHref} onClick={openOffline} className="button-quiet">以前の保存版を開く</Link><button type="button" className="button-quiet" onClick={remove}>端末から削除</button></>}</div>
  if (state === 'update') return <div className="offline-control"><span>更新があります。現在の保存版は利用できます。</span><button type="button" className="button" onClick={save}>更新</button><Link href={offlineHref} onClick={openOffline} className="button-quiet">保存版を開く</Link><button type="button" className="button-quiet" onClick={remove}>端末から削除</button>{usage && <small>{usage}</small>}</div>
  if (state === 'saved') return <div className="offline-control"><span>オフライン利用可能{usage ? ` · ${usage}` : ''}{isOffline ? ' · 更新確認はオンライン時のみ' : ''}</span><button type="button" className="button-quiet" onClick={remove}>端末から削除</button></div>
  return <div className="offline-control"><span>このプロジェクトを端末に保存できます。</span><button type="button" className="button" onClick={save}>オフライン保存</button></div>
}
