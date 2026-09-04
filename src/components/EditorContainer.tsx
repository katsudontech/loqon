'use client'
import { useEffect, useRef, useState } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useTimelineEditor } from '@/hooks/useTimelineEditor'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'
import { useRouter } from 'next/navigation'
import { getClientTimelineSnapshot } from '@/lib/timeline-client'
import { parseTimelineDraft, serializeTimelineDraft, shouldOfferDraftRestore, timelineDraftKey, TimelineConflictError, type Marker } from '@/lib/timeline'

type Props = {
    audioUrl: string
    pdfUrl: string
    initialMarkers?: Marker[]
    projectId: string
    initialVersion?: number
    initialUpdatedAt?: string | null
}

export const EditorContainer = ({ audioUrl, pdfUrl, initialMarkers = [], projectId, initialVersion = 0, initialUpdatedAt = null }: Props) => {
    const router = useRouter()
    const { audioRef, ...audioState } = useAudioPlayer()
    const [currentPage, setCurrentPage] = useState(1)
    const [numPages, setNumPages] = useState<number | null>(null)
    const editor = useTimelineEditor(initialMarkers, { initialVersion, initialUpdatedAt, numPages })
    const { markers, dirty, timelineVersion, validationError, recordMarker, deleteMarker, updateMarkerName, clearMarkers, saveMarkers, replaceMarkersFromRemote, restoreMarkers, setValidationError } = editor
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saveMessage, setSaveMessage] = useState('')
    const [conflictOpen, setConflictOpen] = useState(false)
    const [draftCandidate, setDraftCandidate] = useState<ReturnType<typeof parseTimelineDraft>>(null)
    const [draftOpen, setDraftOpen] = useState(false)
    const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(initialUpdatedAt)
    const isSavingRef = useRef(false)

    useEffect(() => {
        try {
            const rawDraft = window.localStorage.getItem(timelineDraftKey(projectId))
            const candidate = parseTimelineDraft(rawDraft, projectId)
            if (shouldOfferDraftRestore(candidate, initialVersion, initialUpdatedAt, initialMarkers)) {
                window.setTimeout(() => { setDraftCandidate(candidate); setDraftOpen(true) }, 0)
            } else if (rawDraft !== null) {
                window.localStorage.removeItem(timelineDraftKey(projectId))
            }
        } catch { /* localStorage is optional in private mode */ }
    }, [initialMarkers, initialUpdatedAt, initialVersion, projectId])

    useEffect(() => {
        if (!dirty || draftOpen) return
        const timeout = window.setTimeout(() => {
            try {
                window.localStorage.setItem(timelineDraftKey(projectId), serializeTimelineDraft({
                    projectId,
                    baseTimelineVersion: timelineVersion,
                    baseUpdatedAt: remoteUpdatedAt,
                    savedAt: new Date().toISOString(),
                    markers,
                }))
            } catch { /* quota and disabled storage are safe to ignore */ }
        }, 300)
        return () => window.clearTimeout(timeout)
    }, [dirty, draftOpen, markers, projectId, remoteUpdatedAt, timelineVersion])

    useEffect(() => {
        if (!dirty) return
        const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [dirty])

    const handleRecordPageTurn = () => {
        if (!audioState.isPlaying) { setValidationError('音楽を再生してから記録してください'); return }
        const nextPage = currentPage + 1
        if (recordMarker(audioState.currentTime, nextPage)) setCurrentPage(nextPage)
    }
    const handleRecordPartChange = () => {
        if (!audioState.isPlaying) { setValidationError('音楽を再生してから記録してください'); return }
        recordMarker(audioState.currentTime, currentPage)
    }
    const finishSave = () => {
        try { window.localStorage.removeItem(timelineDraftKey(projectId)) } catch { /* optional */ }
        setSaveMessage('タイムラインを保存しました。プレイヤーへ移動します…')
        window.setTimeout(() => router.push(`/${projectId}`), 350)
    }
    const handleSaveButton = async (force = false) => {
        if (isSavingRef.current) return
        isSavingRef.current = true
        setIsSaving(true)
        setSaveError('')
        setSaveMessage('')
        try {
            if (!Number.isFinite(audioState.duration) || audioState.duration <= 0) throw new Error('音源の長さを取得できないため保存できません。音源の読み込みを待ってください。')
            await saveMarkers(projectId, audioState.duration, force)
            finishSave()
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
            replaceMarkersFromRemote(remote.markers, remote.version)
            setRemoteUpdatedAt(remote.updatedAt)
            setDraftCandidate(null)
            try { window.localStorage.removeItem(timelineDraftKey(projectId)) } catch { /* optional */ }
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
                            <button type="button" className="button-secondary" onClick={() => { try { window.localStorage.removeItem(timelineDraftKey(projectId)) } catch { /* optional */ } setDraftOpen(false); setDraftCandidate(null) }}>破棄</button>
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
                            <button type="button" className="button-secondary" onClick={() => handleSaveButton(true)}>上書き</button>
                            <button type="button" className="button-quiet" onClick={() => setConflictOpen(false)}>キャンセル</button>
                        </div>
                    </div>
                </div>
            )}

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

            <div className="editor-pdf"><PDFViewerWrapper url={pdfUrl} currentPage={currentPage} pages={numPages && currentPage < numPages ? [currentPage, currentPage + 1] : [currentPage]} onDocumentLoadSuccess={setNumPages} fitToContainer={false} /></div>
            <div className="editor-actions">
                <AudioControls {...audioState} />
                <div className="editor-action-row"><button type="button" onClick={handleRecordPartChange} className="editor-action">パート区切りを記録</button><button type="button" onClick={handleRecordPageTurn} disabled={numPages !== null && currentPage >= numPages} className="editor-action accent">次のページへ</button></div>
                    {(validationError || saveError) && <p role="alert" aria-live="assertive" className="alert alert-error">{validationError || saveError}</p>}
                    {saveMessage && <p role="status" aria-live="polite" className="alert alert-success">{saveMessage}</p>}
                    <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="button-quiet w-full">← 前のページに戻る</button>
                    <button type="button" onClick={() => handleSaveButton()} disabled={isSaving} className="button w-full">{isSaving ? '保存中...' : '保存してプレイヤーへ'}</button>
                </div>
        </div>
    )
}
