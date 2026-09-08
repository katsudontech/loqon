'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'
import { createMarkerId, removePracticeBoundary, splitPracticePart, TimelineConflictError, validatePracticeParts, type CompositionCue, type PracticePart } from '@/lib/timeline'
import { classifyTimelineError } from '@/lib/timeline'
import { supabase } from '@/lib/supabase'
import { getClientTimelineSnapshot } from '@/lib/timeline-client'

type Props = { projectId: string; audioUrl: string; pdfUrl: string; cues: CompositionCue[]; initialParts: PracticePart[]; initialVersion: number; initialUpdatedAt?: string | null }

export function PartsEditorContainer({ projectId, audioUrl, pdfUrl, cues, initialParts, initialVersion, initialUpdatedAt = null }: Props) {
  const router = useRouter()
  const { audioRef, ...audio } = useAudioPlayer()
  const [parts, setParts] = useState(initialParts)
  const [baseline, setBaseline] = useState(initialParts)
  const [version, setVersion] = useState(initialVersion)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null)
  const pendingSaveTarget = useRef<string | null>(null)
  const [history, setHistory] = useState<PracticePart[][]>([])
  const [draft, setDraft] = useState<PracticePart[] | null>(null)
  const draftKey = `loqon:practice-draft:${projectId}`
  const dirty = JSON.stringify(parts) !== JSON.stringify(baseline)
  useEffect(() => {
    let timer: number | undefined
    try {
      const saved = JSON.parse(window.localStorage.getItem(draftKey) ?? 'null') as { schemaVersion?: number; projectId?: string; basePracticeVersion?: number; baseUpdatedAt?: string | null; savedAt?: string; parts?: PracticePart[] } | null
      const valid = saved?.schemaVersion === 1 && saved.projectId === projectId && saved.basePracticeVersion === initialVersion && (saved.baseUpdatedAt === null || typeof saved.baseUpdatedAt === 'string') && typeof saved.savedAt === 'string' && Number.isFinite(Date.parse(saved.savedAt)) && Array.isArray(saved.parts)
      if (valid && JSON.stringify(saved.parts) !== JSON.stringify(initialParts)) timer = window.setTimeout(() => setDraft(saved.parts!), 0)
      else if (saved) window.localStorage.removeItem(draftKey)
    } catch { /* private browsing */ }
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [draftKey, initialParts, initialVersion, projectId])
  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => { try { window.localStorage.setItem(draftKey, JSON.stringify({ schemaVersion: 1, projectId, basePracticeVersion: version, baseUpdatedAt: updatedAt, parts, savedAt: new Date().toISOString() })) } catch { /* optional */ } }, 300)
    return () => window.clearTimeout(timer)
  }, [dirty, draftKey, parts, projectId, updatedAt, version])
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank') return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.href === window.location.href) return
      event.preventDefault(); event.stopPropagation(); setNavigationTarget(`${url.pathname}${url.search}${url.hash}`)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])
  const effectiveParts = useMemo(() => {
    if (audio.duration > 0 && parts.length === 1 && parts[0].startTime === 0 && parts[0].endTime <= 0) {
      return [{ ...parts[0], endTime: audio.duration }]
    }
    return parts
  }, [audio.duration, parts])
  const page = useMemo(() => [...cues].reverse().find((cue) => cue.time <= audio.currentTime)?.page ?? 1, [audio.currentTime, cues])
  const pageRange = (part: PracticePart) => ({ start: [...cues].reverse().find((cue) => cue.time <= part.startTime)?.page ?? 1, end: [...cues].reverse().find((cue) => cue.time < Math.max(part.endTime, part.startTime + 0.001))?.page ?? 1 })
  const partitionIssue = audio.duration > 0 && (() => { try { validatePracticeParts(effectiveParts, audio.duration); return false } catch { return true } })()
  const repairWholeSong = () => { const first = parts[0]; update([{ id: first?.id ?? createMarkerId(), startTime: 0, endTime: audio.duration, name: first?.name || '全体' }]) }
  const update = (next: PracticePart[]) => { setHistory((old) => [...old.slice(-19), parts]); setParts(next.sort((a, b) => a.startTime - b.startTime)); setError('') }
  const addBoundary = (time = audio.currentTime) => {
    if (!Number.isFinite(time) || time <= 0 || effectiveParts.some((part) => part.startTime === time || part.endTime === time)) { setError('同じ時刻の境界は追加できません'); return }
    try { update(splitPracticePart(effectiveParts, time)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'パートを分けられません') }
  }
  const addFromCue = (cue: CompositionCue) => addBoundary(cue.time)
  const save = async (force = false, navigate = true, navigateTarget?: string) => {
    setSaving(true); setError(''); setMessage('')
    try {
      const effectiveParts = parts.length === 1 && parts[0].startTime === 0 && parts[0].endTime <= 0
        ? [{ ...parts[0], endTime: audio.duration }] : parts
      validatePracticeParts(effectiveParts, audio.duration)
      const { data, error: rpcError } = await supabase.rpc('replace_practice_parts', {
        p_project_id: projectId,
        p_parts: effectiveParts.map((part) => { const range = pageRange(part); return { id: part.id, start_time: part.startTime, end_time: part.endTime, start_page: range.start, end_page: range.end, name: part.name ?? null } }),
        p_expected_version: version,
        p_duration: audio.duration,
        p_force: force,
      })
      if (rpcError) throw classifyTimelineError(rpcError)
      setVersion(typeof data === 'number' ? data : version + 1)
      setParts(effectiveParts)
      setBaseline(effectiveParts)
      try { window.localStorage.removeItem(draftKey) } catch { /* optional */ }
      setMessage('パートを保存しました。')
      if (navigate) router.push(navigateTarget ?? `/${projectId}`)
      return true
    } catch (cause) { if (cause instanceof TimelineConflictError) setConflict(true); else setError(cause instanceof Error ? cause.message : '保存に失敗しました。編集中の内容は残っています。'); return false }
    finally { setSaving(false) }
  }
  const reloadRemote = async () => {
    try { const remote = await getClientTimelineSnapshot(projectId); setParts(remote.practiceParts); setBaseline(remote.practiceParts); setVersion(remote.practiceVersion); setUpdatedAt(remote.practiceUpdatedAt); setConflict(false); setError(''); try { window.localStorage.removeItem(draftKey) } catch { /* optional */ } } catch { setError('最新のパート設定を読み込めませんでした。編集中の内容は残っています。') }
  }
  const saveAndNavigate = async (target: string) => { pendingSaveTarget.current = target; if (await save(false, false)) router.push(target) }
  const navigateTo = (target: string) => { if (dirty) setNavigationTarget(target); else router.push(target) }
  return <div className="editor-layout relative">
    {conflict && <div className="overlay"><div className="dialog"><h2>パート設定が競合しました</h2><p>別の保存が先に完了しています。再読み込みまたは編集中の内容で上書きできます。</p><div className="dialog-actions"><button type="button" className="button" onClick={reloadRemote}>再読み込み</button><button type="button" className="button-secondary" onClick={() => { setConflict(false); void save(true, true, pendingSaveTarget.current ?? undefined) }}>上書き</button><button type="button" className="button-quiet" onClick={() => setConflict(false)}>キャンセル</button></div></div></div>}
    {navigationTarget && <div className="overlay"><div className="dialog"><h2>未保存のパート編集があります</h2><p>移動前に編集内容を保存しますか？</p><div className="dialog-actions"><button type="button" className="button" onClick={() => { const target = navigationTarget; setNavigationTarget(null); void saveAndNavigate(target) }}>保存</button><button type="button" className="button-secondary" onClick={() => { const target = navigationTarget; try { window.localStorage.removeItem(draftKey) } catch { /* optional */ } setNavigationTarget(null); router.push(target) }}>破棄して移動</button><button type="button" className="button-quiet" onClick={() => setNavigationTarget(null)}>移動をやめる</button></div></div></div>}
    {draft && <div className="overlay"><div className="dialog"><h2>未保存のパート編集があります</h2><p>前回の編集を復元しますか？</p><div className="dialog-actions"><button type="button" className="button" onClick={() => { setParts(draft); setDraft(null) }}>復元</button><button type="button" className="button-secondary" onClick={() => { try { window.localStorage.removeItem(draftKey) } catch { /* optional */ } setDraft(null) }}>破棄</button><button type="button" className="button-quiet" onClick={() => setDraft(null)}>キャンセル</button></div></div></div>}
    <audio ref={audioRef} src={audioUrl} preload="metadata" />
    <div className="editor-pdf"><PDFViewerWrapper url={pdfUrl} currentPage={page} pages={[page]} fitToContainer={false} /></div>
    <aside className="editor-sidebar" data-expanded="true">
      <div className="timeline-head"><span>パートを分ける</span><span className="text-xs text-zinc-500">{effectiveParts.length}件</span></div>
      <p className="p-3 text-xs text-zinc-400">構成のページ切り替えとは別に、練習する区間を設定します。同じページ内でも分けられます。境界を削除して結合すると、前のパート名が残ります。</p>
      <div className="timeline-rail mx-3" role="img" aria-label="構成の切り替え位置とパート境界のタイムライン"><div className="h-2 rounded bg-amber-400/40" />{cues.map((cue) => <span key={`cue-${cue.id}`} data-kind="composition-cue" className="timeline-rail-cue" style={{ left: `${Math.min(100, Math.max(0, cue.time / Math.max(audio.duration, 1) * 100))}%` }} aria-label={`構成の切り替え ${cue.time.toFixed(1)}秒`} />)}{effectiveParts.slice(1).map((part) => <span key={`boundary-${part.id}`} data-kind="practice-boundary" className="timeline-rail-boundary" style={{ left: `${Math.min(100, Math.max(0, part.startTime / Math.max(audio.duration, 1) * 100))}%` }} aria-label={`パート境界 ${part.startTime.toFixed(1)}秒`} />)}</div>
      <div className="timeline-list">
        {cues.map((cue) => <button type="button" key={cue.id} className="timeline-item border-l-2 border-cyan-400 text-left" onClick={() => addFromCue(cue)}>構成 {cue.time.toFixed(1)}秒 / ページ{cue.page}から境界を追加</button>)}
        {effectiveParts.map((part) => <div key={part.id} className="timeline-item border-l-2 border-amber-400">
          <div className="timeline-item-top"><span>{part.startTime.toFixed(1)}s – {part.endTime.toFixed(1)}s</span><span className="flex gap-2">{effectiveParts.indexOf(part) > 0 && <button type="button" className="button-quiet" aria-label="この境界を削除して前後を結合" onClick={() => update(removePracticeBoundary(effectiveParts, part.id))}>境界を削除</button>}</span></div>
          <input aria-label="パート名" maxLength={100} value={part.name ?? ''} onChange={(event) => update(effectiveParts.map((item) => item.id === part.id ? { ...item, name: event.target.value } : item))} />
          {effectiveParts.indexOf(part) > 0 && <input aria-label="境界時刻" type="range" min={effectiveParts[effectiveParts.indexOf(part) - 1].startTime + 0.01} max={part.endTime - 0.01} step="0.01" value={part.startTime} onChange={(event) => { const time = Number(event.target.value); const index = effectiveParts.indexOf(part); update(effectiveParts.map((item, itemIndex) => itemIndex === index - 1 ? { ...item, endTime: time } : itemIndex === index ? { ...item, startTime: time } : item)) }} />}
          <p className="text-xs text-zinc-500 mt-1">含むPDF: ページ{pageRange(part).start}–{pageRange(part).end}</p>
        </div>)}
      </div>
    </aside>
    <div className="editor-actions"><AudioControls {...audio} />{partitionIssue && <div role="alert" className="alert alert-error"><p>現在の音源の長さに対して、パートに隙間・重複・範囲外の区間があります。</p><p className="text-xs mt-1">既存の記録を確認するか、全曲を1パートとして修復してください。</p><button type="button" className="button-quiet" onClick={repairWholeSong}>全曲1パートに直す</button></div>}<div className="editor-action-row"><button type="button" className="editor-action accent" onClick={() => addBoundary()}>ここでパートを分ける</button><button type="button" className="editor-action" onClick={() => setHistory((old) => { const previous = old.at(-1); if (previous) { setParts(previous); return old.slice(0, -1) } return old })} disabled={!history.length}>元に戻す</button></div>{error && <p role="alert" className="alert alert-error">{error}</p>}{message && <p role="status" className="alert alert-success">{message}</p>}<button type="button" className="button w-full" disabled={saving} onClick={() => save()}>{saving ? '保存中...' : '保存して練習'}</button><button type="button" className="button-quiet w-full" onClick={() => navigateTo(`/${projectId}/edit`)}>構成を合わせる</button></div>
  </div>
}
