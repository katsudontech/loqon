'use client'
import { useEffect, useRef, useState } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useTimelineEditor } from '@/hooks/useTimelineEditor'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'
import { useRouter } from 'next/navigation'
import { getClientTimelineSnapshot } from '@/lib/timeline-client'
import { parseTimelineDraft, serializeTimelineDraft, shouldOfferDraftRestore, timelineDraftKey, TimelineConflictError, type Marker, type CompositionCue } from '@/lib/timeline'

type Props = {
    audioUrl: string
    pdfUrl: string
    initialMarkers?: Marker[]
    projectId: string
    initialVersion?: number
    initialUpdatedAt?: string | null
    initialCues?: CompositionCue[]
    compositionVersion?: number
    compositionUpdatedAt?: string | null
}

export const EditorContainer = ({ audioUrl, pdfUrl, initialMarkers = [], projectId, initialVersion = 0, initialUpdatedAt = null, initialCues, compositionVersion, compositionUpdatedAt }: Props) => {
    const router = useRouter()
    const { audioRef, ...audioState } = useAudioPlayer()
    const [currentPage, setCurrentPage] = useState(1)
    const [browsePage, setBrowsePage] = useState(1)
    const [numPages, setNumPages] = useState<number | null>(null)
    const editor = useTimelineEditor(initialCues?.map((cue) => ({ id: cue.id, time: cue.time, page: cue.page, name: cue.name })) ?? initialMarkers, { initialVersion: compositionVersion ?? initialVersion, initialUpdatedAt, numPages })
    const { markers, dirty, timelineVersion, validationError, recordMarker, deleteMarker, updateMarkerName, clearMarkers, saveMarkers, saveComposition, undoLast, replaceMarkersFromRemote, restoreMarkers, setValidationError } = editor
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saveMessage, setSaveMessage] = useState('')
    const [conflictOpen, setConflictOpen] = useState(false)
    const [draftCandidate, setDraftCandidate] = useState<ReturnType<typeof parseTimelineDraft>>(null)
    const [draftOpen, setDraftOpen] = useState(false)
    const [navigationTarget, setNavigationTarget] = useState<string | null>(null)
    const draftKey = initialCues ? `loqon:composition-draft:${projectId}` : timelineDraftKey(projectId)
    const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(compositionUpdatedAt ?? initialUpdatedAt)
    const isSavingRef = useRef(false)
    const previousProgressRef = useRef<{ currentPage: number; browsePage: number } | null>(null)
    const pendingSaveDestinationRef = useRef<'parts' | 'player' | string>('player')
    const canAdvancePage = numPages !== null && currentPage < numPages
    const previewPages = canAdvancePage ? [currentPage, currentPage + 1] : [currentPage]

    useEffect(() => {
        try {
            const rawDraft = window.localStorage.getItem(draftKey)
            const candidate = parseTimelineDraft(rawDraft, projectId)
            const baseMarkers = initialCues?.map((cue) => ({ id: cue.id, time: cue.time, page: cue.page, name: cue.name })) ?? initialMarkers
            if (shouldOfferDraftRestore(candidate, compositionVersion ?? initialVersion, compositionUpdatedAt ?? initialUpdatedAt, baseMarkers)) {
                window.setTimeout(() => { setDraftCandidate(candidate); setDraftOpen(true) }, 0)
            } else if (rawDraft !== null) {
                window.localStorage.removeItem(draftKey)
            }
        } catch { /* localStorage is optional in private mode */ }
    }, [compositionUpdatedAt, compositionVersion, draftKey, initialCues, initialMarkers, initialUpdatedAt, initialVersion, projectId])

    useEffect(() => {
        if (!dirty || draftOpen) return
        const timeout = window.setTimeout(() => {
            try {
                window.localStorage.setItem(draftKey, serializeTimelineDraft({
                    projectId,
                    baseTimelineVersion: timelineVersion,
                    baseUpdatedAt: remoteUpdatedAt,
                    ...(initialCues ? { baseCompositionVersion: timelineVersion, baseCompositionUpdatedAt: remoteUpdatedAt } : {}),
                    savedAt: new Date().toISOString(),
                    markers,
                }))
            } catch { /* quota and disabled storage are safe to ignore */ }
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [dirty, draftKey, draftOpen, initialCues, markers, projectId, remoteUpdatedAt, timelineVersion])

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
            if (!anchor || anchor.target === '_blank' || anchor.href === window.location.href) return
            event.preventDefault(); event.stopPropagation(); setNavigationTarget(anchor.href)
        }
        document.addEventListener('click', onClick, true)
        return () => document.removeEventListener('click', onClick, true)
    }, [dirty])

    const handleRecordPageTurn = () => {
        if (!canAdvancePage) return
        const nextPage = currentPage + 1
        previousProgressRef.current = { currentPage, browsePage }
        if (recordMarker(audioState.currentTime, nextPage)) { setCurrentPage(nextPage); setBrowsePage(nextPage) }
    }
    const undoComposition = () => {
        if (undoLast?.() && previousProgressRef.current) { setCurrentPage(previousProgressRef.current.currentPage); setBrowsePage(previousProgressRef.current.browsePage); previousProgressRef.current = null }
    }
    const handleRecordPartChange = () => {
        if (!audioState.isPlaying) { setValidationError('音楽を再生してから記録してください'); return }
        recordMarker(audioState.currentTime, currentPage)
    }
    const finishSave = (destination: 'parts' | 'player' | string) => {
        try { window.localStorage.removeItem(draftKey) } catch { /* optional */ }
        setSaveMessage(destination === 'parts' ? '構成を保存しました。パート分けへ移動します…' : '構成を保存しました。プレイヤーへ移動します…')
        window.setTimeout(() => router.push(destination === 'parts' ? `/${projectId}/parts` : destination === 'player' ? `/${projectId}` : destination), 350)
    }
    const handleSaveButton = async (force = false, destination: 'parts' | 'player' | string = 'player') => {
        if (isSavingRef.current) return
        isSavingRef.current = true
        setIsSaving(true)
        setSaveError('')
        setSaveMessage('')
        pendingSaveDestinationRef.current = destination
        try {
            if (!Number.isFinite(audioState.duration) || audioState.duration <= 0) throw new Error('音源の長さを取得できないため保存できません。音源の読み込みを待ってください。')
            if (initialCues && saveComposition) await saveComposition(projectId, compositionVersion ?? initialVersion, audioState.duration, numPages, force)
            else await saveMarkers(projectId, audioState.duration, force)
            finishSave(destination)
        } catch (error) {
            if (error instanceof TimelineConflictError) setConflictOpen(true)
            else setSaveError(error instanceof Error ? error.message : '保存に失敗しました。編集中の内容は残っています。')
        } finally {
            isSavingRef.current = false
            setIsSaving(false)
        }
    }
    const reloadRemote = async () => {
        setConflictOpen(false)
        try {
            const remote = await getClientTimelineSnapshot(projectId)
            replaceMarkersFromRemote(initialCues ? remote.compositionCues : remote.markers, initialCues ? remote.compositionVersion : remote.version)
            setRemoteUpdatedAt(initialCues ? remote.compositionUpdatedAt : remote.updatedAt)
            setDraftCandidate(null)
            try { window.localStorage.removeItem(draftKey) } catch { /* optional */ }
            setSaveError('')
        } catch {
            setSaveError('最新のタイムラインを読み込めませんでした。編集中の内容は残っています。')
        }
    }

    return (
        <div className="editor-layout relative">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />

            {draftOpen && draftCandidate && (
                <div className="overlay">
                    <div className="dialog">
                        <h2>未保存の編集があります</h2>
                        <p>前回の編集内容（{new Date(draftCandidate.savedAt).toLocaleString()}）を復元しますか？</p>
                        <div className="dialog-actions">
                            <button type="button" className="button" onClick={() => { restoreMarkers(draftCandidate.markers); setDraftOpen(false) }}>復元</button>
                            <button type="button" className="button-secondary" onClick={() => { try { window.localStorage.removeItem(draftKey) } catch { /* optional */ } setDraftOpen(false); setDraftCandidate(null) }}>破棄</button>
                        </div>
                    </div>
                </div>
            )}
            {conflictOpen && (
                <div className="overlay">
                    <div className="dialog">
                        <h2>他の編集と競合しました</h2>
                        <p>別の保存が先に完了しています。再読み込みすると編集中の内容は破棄されます。</p>
                        <div className="dialog-actions">
                            <button type="button" className="button" onClick={reloadRemote}>再読み込み</button>
                            <button type="button" className="button-secondary" onClick={() => handleSaveButton(true, pendingSaveDestinationRef.current)}>上書き</button>
                            <button type="button" className="button-quiet" onClick={() => setConflictOpen(false)}>キャンセル</button>
                        </div>
                    </div>
                </div>
            )}
            {navigationTarget && <div className="overlay"><div className="dialog"><h2>未保存の構成があります</h2><p>移動前に編集内容を保存しますか？</p><div className="dialog-actions"><button type="button" className="button" onClick={() => { const target = navigationTarget; setNavigationTarget(null); void handleSaveButton(false, target) }}>保存</button><button type="button" className="button-secondary" onClick={() => { const target = navigationTarget; setNavigationTarget(null); router.push(target) }}>破棄して移動</button><button type="button" className="button-quiet" onClick={() => setNavigationTarget(null)}>移動をやめる</button></div></div></div>}

            <aside className="editor-sidebar" data-expanded={isTimelineExpanded}>
                <button type="button" aria-expanded={isTimelineExpanded} aria-controls="timeline-list" onClick={() => setIsTimelineExpanded(!isTimelineExpanded)} className="timeline-head">
                    <span>タイムライン ({markers.length})</span>
                    {isTimelineExpanded ? <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> : <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                </button>
                {isTimelineExpanded && <div id="timeline-list" className="timeline-list">
                    <div className="flex justify-end items-center pb-2"><button type="button" onClick={clearMarkers} className="button-quiet">全削除</button></div>
                    <div>
                        {markers.length === 0 ? <div className="text-center py-6 text-zinc-500 text-xs">まだ区切りがありません。</div> : [...markers].sort((a, b) => a.time - b.time).map((m, i, arr) => {
                            const partNumber = arr.slice(0, i + 1).filter((x) => x.page === m.page).length
                            return <div key={m.id} className="timeline-item"><div className="timeline-item-top"><div className="flex items-center gap-3"><span className="timeline-time">{m.time.toFixed(1)}s</span><span className="timeline-page">ページ {m.page} {partNumber > 1 && <span className="text-zinc-500 ml-1">パート {partNumber}</span>}</span></div><button type="button" aria-label={`ページ${m.page}の区切りを削除`} onClick={() => deleteMarker(m.id)} className="timeline-delete"><svg aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m1-10V4a1 1 0 011 1v3M4 7h16" /></svg></button></div><input aria-label={`ページ${m.page}のフォーメーション名`} type="text" maxLength={100} value={m.name || ''} onChange={(e) => updateMarkerName(m.id, e.target.value)} placeholder="フォーメーション名（任意）" /></div>
                        })}
                    </div>
                </div>}
            </aside>

            <div className="editor-pdf"><div className="flex items-center justify-between px-2 pb-2"><button type="button" className="button-quiet" aria-label="前を見る" disabled={browsePage <= 1} onClick={() => setBrowsePage((page) => Math.max(1, page - 1))}>前を見る</button><span className="text-xs text-zinc-400">{browsePage === currentPage ? '記録中の構成' : `確認中: ページ${browsePage}`} {browsePage !== currentPage && <button type="button" className="button-quiet ml-2" onClick={() => setBrowsePage(currentPage)}>記録中の構成に戻る</button>}</span><button type="button" className="button-quiet" aria-label="次を見る" disabled={numPages !== null && browsePage >= numPages} onClick={() => setBrowsePage((page) => Math.min(numPages ?? page + 1, page + 1))}>次を見る</button></div><PDFViewerWrapper
                url={pdfUrl}
                currentPage={browsePage}
                pages={browsePage === currentPage && previewPages[0] === currentPage ? previewPages : [browsePage]}
                pageLabels={{ current: '現在の構成', next: '次の構成', emptyNext: '次の構成はありません' }}
                showEmptyNext={numPages !== null && !canAdvancePage}
                previewLayout="grid"
                onDocumentLoadSuccess={setNumPages}
                fitToContainer={false}
            /></div>
            <div className="editor-actions">
                {initialCues && <p className="text-xs text-zinc-400">構成を曲に合わせます。練習パートの区切りはパート分け画面で設定します。</p>}
                <AudioControls {...audioState} />
                <div className="editor-action-row">{!initialCues && <button type="button" onClick={handleRecordPartChange} className="editor-action">パート区切りを記録</button>}{initialCues && <button type="button" className="editor-action" onClick={undoComposition}>直前の記録を取り消す</button>}{initialCues ? <><button type="button" aria-label="ここで次の構成へ" onClick={handleRecordPageTurn} disabled={!canAdvancePage} className="editor-action accent">ここで次の構成へ</button><button type="button" aria-hidden="true" tabIndex={-1} onClick={handleRecordPageTurn} disabled={!canAdvancePage} className="sr-only">次のページへ</button></> : <button type="button" aria-label="ここで次の構成へ" title={!canAdvancePage ? '最終ページのため次の構成はありません' : undefined} onClick={handleRecordPageTurn} disabled={!canAdvancePage} className="editor-action accent">次のページへ</button>}{initialCues && !canAdvancePage && numPages !== null && <span role="status" className="text-xs text-zinc-400">最終ページのため記録できません</span>}</div>
                    {(validationError || saveError) && <p role="alert" aria-live="assertive" className="alert alert-error">{validationError || saveError}</p>}
                    {saveMessage && <p role="status" aria-live="polite" className="alert alert-success">{saveMessage}</p>}
                    {!initialCues && <button type="button" onClick={() => { setCurrentPage((prev) => Math.max(1, prev - 1)); setBrowsePage((prev) => Math.max(1, prev - 1)) }} disabled={currentPage <= 1} className="button-quiet w-full">← 前のページに戻る</button>}
                    {initialCues && <div className="flex gap-2"><button type="button" onClick={() => handleSaveButton(false, 'parts')} disabled={isSaving} className="button w-full">保存してパート分けへ</button><button type="button" onClick={() => handleSaveButton(false, 'player')} disabled={isSaving} className="button-secondary w-full">保存してそのまま練習</button></div>}
                    {!initialCues && <button type="button" onClick={() => handleSaveButton()} disabled={isSaving} className="button w-full">{isSaving ? '保存中...' : '保存してプレイヤーへ'}</button>}
                </div>
        </div>
    )
}
