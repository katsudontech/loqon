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
        <div className="flex flex-col w-full h-full overflow-hidden relative">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />

            {draftOpen && draftCandidate && (
                <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-indigo-500/50 rounded-xl p-5 max-w-sm w-full">
                        <h2 className="text-white font-bold mb-2">未保存の編集があります</h2>
                        <p className="text-zinc-300 text-sm mb-4">前回の編集内容（{new Date(draftCandidate.savedAt).toLocaleString()}）を復元しますか？</p>
                        <div className="flex gap-2">
                            <button type="button" className="flex-1 bg-indigo-600 text-white rounded-lg py-2" onClick={() => { restoreMarkers(draftCandidate.markers); setDraftOpen(false) }}>復元</button>
                            <button type="button" className="flex-1 bg-zinc-700 text-white rounded-lg py-2" onClick={() => { try { window.localStorage.removeItem(timelineDraftKey(projectId)) } catch { /* optional */ } setDraftOpen(false); setDraftCandidate(null) }}>破棄</button>
                        </div>
                    </div>
                </div>
            )}
            {conflictOpen && (
                <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-amber-500/50 rounded-xl p-5 max-w-sm w-full">
                        <h2 className="text-white font-bold mb-2">他の編集と競合しました</h2>
                        <p className="text-zinc-300 text-sm mb-4">別の保存が先に完了しています。再読み込みすると編集中の内容は破棄されます。</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className="flex-1 min-w-[30%] bg-indigo-600 text-white rounded-lg py-2" onClick={reloadRemote}>再読み込み</button>
                            <button type="button" className="flex-1 min-w-[30%] bg-amber-600 text-white rounded-lg py-2" onClick={() => handleSaveButton(true)}>上書き</button>
                            <button type="button" className="flex-1 min-w-[30%] bg-zinc-700 text-white rounded-lg py-2" onClick={() => setConflictOpen(false)}>キャンセル</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full shrink-0 bg-zinc-900 border-b border-zinc-800 flex flex-col z-20 shadow-md">
                <button type="button" aria-expanded={isTimelineExpanded} aria-controls="timeline-list" onClick={() => setIsTimelineExpanded(!isTimelineExpanded)} className="flex justify-between items-center p-3 sm:p-4 w-full hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-2"><span className="text-base sm:text-lg">⏱️</span><span className="font-bold text-sm sm:text-base text-white">タイムライン ({markers.length})</span></div>
                    {isTimelineExpanded ? <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> : <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                </button>
                {isTimelineExpanded && <div id="timeline-list" className="w-full bg-zinc-950 flex flex-col max-h-[40vh] border-t border-zinc-800">
                    <div className="flex justify-end items-center p-2 px-4 border-b border-zinc-800 bg-zinc-900 shrink-0"><button type="button" onClick={clearMarkers} className="text-xs px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors">全削除</button></div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {markers.length === 0 ? <div className="text-center py-6 text-zinc-500 text-xs">まだ区切りがありません。</div> : [...markers].sort((a, b) => a.time - b.time).map((m, i, arr) => {
                            const partNumber = arr.slice(0, i + 1).filter((x) => x.page === m.page).length
                            return <div key={m.id} className="flex flex-col gap-2 bg-zinc-800 rounded px-3 py-2 border border-zinc-700/50"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="font-mono text-xs sm:text-sm text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">{m.time.toFixed(1)}s</span><span className="text-zinc-300 font-medium text-xs sm:text-sm">ページ {m.page} {partNumber > 1 && <span className="text-zinc-500 text-[10px] sm:text-xs ml-1">パート {partNumber}</span>}</span></div><button type="button" aria-label={`ページ${m.page}の区切りを削除`} onClick={() => deleteMarker(m.id)} className="text-red-400 hover:text-red-300 p-1 rounded"><svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m1-10V4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div><input aria-label={`ページ${m.page}のフォーメーション名`} type="text" maxLength={100} value={m.name || ''} onChange={(e) => updateMarkerName(m.id, e.target.value)} placeholder="フォーメーション名（任意）" className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" /></div>
                        })}
                    </div>
                </div>}
            </div>

            <div className="flex-1 w-full overflow-y-auto bg-zinc-950 p-2 sm:p-4"><div className="flex flex-col gap-4"><PDFViewerWrapper url={pdfUrl} currentPage={currentPage} pages={numPages && currentPage < numPages ? [currentPage, currentPage + 1] : [currentPage]} onDocumentLoadSuccess={setNumPages} fitToContainer={false} /></div></div>
            <div className="w-full shrink-0 flex flex-col bg-zinc-950 border-t border-zinc-800 pb-safe">
                <div className="p-2 sm:p-4 flex flex-col gap-3 shrink-0 border-b border-zinc-800 bg-zinc-900"><AudioControls {...audioState} /></div>
                <div className="p-3 sm:p-4 flex flex-col gap-2 shrink-0 bg-zinc-950">
                    <div className="flex gap-2"><button type="button" onClick={handleRecordPartChange} className="flex-1 py-3 sm:py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl shadow-lg border border-zinc-700 transition-all active:scale-[0.98] text-sm sm:text-base">📍 パート区切り</button><button type="button" onClick={handleRecordPageTurn} disabled={numPages !== null && currentPage >= numPages} className="flex-1 py-3 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:from-zinc-600 disabled:to-zinc-700 disabled:shadow-none disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base">📄 次のページへ</button></div>
                    {(validationError || saveError) && <p role="alert" aria-live="assertive" className="rounded-lg border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{validationError || saveError}</p>}
                    {saveMessage && <p role="status" aria-live="polite" className="rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{saveMessage}</p>}
                    <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="w-full py-2 mt-1 bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 text-xs sm:text-sm font-medium rounded-lg border border-zinc-700/50 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1">◀ 前のページに戻る（やり直し用）</button>
                    <button type="button" onClick={() => handleSaveButton()} disabled={isSaving} className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"><span>💾</span> {isSaving ? '保存中...' : '保存してプレイヤーへ'}</button>
                </div>
            </div>
        </div>
    )
}
