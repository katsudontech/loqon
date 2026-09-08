'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listOfflineProjects } from '@/lib/offline/db'
import { hasCachedShellAssets, hasCompleteCachedResponse } from '@/lib/offline/cache'
import { removeOfflineProject } from '@/lib/offline/save'
import type { OfflineProject } from '@/lib/offline/types'
import { PlayerContainer } from '@/components/PlayerContainer'
import { requestedOfflineProjectId } from '@/lib/offline/route'

export default function OfflinePage() {
  const [projects, setProjects] = useState<OfflineProject[]>([])
  const [invalid, setInvalid] = useState<OfflineProject[]>([])
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<OfflineProject | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void listOfflineProjects().then(async (items) => {
      const valid: OfflineProject[] = []
      const broken: OfflineProject[] = []
      for (const item of items) {
        if (await hasCompleteCachedResponse(item.audioUrl, item.audioBytes) && await hasCompleteCachedResponse(item.pdfUrl, item.pdfBytes) && await hasCachedShellAssets(item.appAssetUrls ?? [])) valid.push(item)
        else broken.push(item)
      }
      const requested = requestedOfflineProjectId(window.location.pathname, window.location.search)
      setProjects(valid); setInvalid(broken); setSelected(valid.find((item) => item.id === requested) ?? valid[0] ?? null); setReady(true)
    }).catch((cause) => { setLoadError(cause instanceof Error ? cause.message : '保存済みプロジェクトを読み込めませんでした'); setReady(true) })
  }, [])
  if (!ready) return <div className="page-shell"><p>保存済みプロジェクトを読み込み中…</p></div>
  return <div className="page-shell offline-page">
    <div className="section-heading"><div><p className="eyebrow">Offline practice</p><h1 className="page-title">オフライン再生</h1><p className="page-lede">保存済みのプロジェクトを、通信なしで開けます。</p></div><Link href="/select" className="button-quiet" onClick={(event) => { event.preventDefault(); window.location.assign('/select') }}>一覧へ</Link></div>
    {loadError && <div className="empty-panel" role="alert"><p>{loadError}</p></div>}
    {projects.length === 0 && invalid.length === 0 ? <div className="empty-panel"><h2>保存済みプロジェクトがありません</h2><p>オンラインでプロジェクトを開き、「オフライン保存」を選んでください。</p></div> : <>
      <div className="recent-list">{projects.map((item) => <button type="button" key={item.id} className="recent-item" onClick={() => setSelected(item)} aria-pressed={selected?.id === item.id}><span className="recent-title">{item.title}</span><span className="recent-id">{item.id.slice(0, 8)}…</span></button>)}</div>
      {selected && <div className="offline-player"><h2>{selected.title}</h2><PlayerContainer audioUrl={selected.audioUrl} pdfUrl={selected.pdfUrl} markers={selected.markers} compositionCues={selected.compositionCues} practiceParts={selected.practiceParts} /></div>}
      {invalid.length > 0 && <div className="empty-panel" role="alert"><h2>再保存が必要なプロジェクト</h2><p>保存記録はありますが、端末からファイルが削除されています。オンラインで再保存するか、記録を削除してください。</p>{invalid.map((item) => <div className="offline-control" key={item.id}><span>{item.title}</span><button type="button" className="button-quiet" onClick={() => { void removeOfflineProject(item).then(() => setInvalid((items) => items.filter((value) => value.id !== item.id))).catch((cause) => setLoadError(cause instanceof Error ? cause.message : '削除に失敗しました')) }}>記録を削除</button></div>)}</div>}
    </>}
  </div>
}
