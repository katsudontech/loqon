'use client'
import { useState } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useTimelineEditor } from '@/hooks/useTimelineEditor'
import { useCachedMedia } from '@/hooks/useCachedMedia'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'
import { useRouter } from 'next/navigation'

// マーカーの型（useTimelineEditorと同じもの）
export type Marker = {
    id?: string
    time: number
    page: number
    text?: string
    name?: string
}

type Props = {
    audioUrl: string
    pdfUrl: string
    initialMarkers?: Marker[]
    projectId: string
}

export const EditorContainer = ({ audioUrl, pdfUrl, initialMarkers = [], projectId }: Props) => {
    const router = useRouter()

    // URLをキャッシュストレージから取得するカスタムフック
    const { cachedUrl: localAudioUrl, isCaching: isAudioCaching } = useCachedMedia(audioUrl)
    const { cachedUrl: localPdfUrl, isCaching: isPdfCaching } = useCachedMedia(pdfUrl)

    const { audioRef, ...audioState } = useAudioPlayer()
    const { markers, recordMarker, deleteMarker, updateMarkerName, clearMarkers, saveMarkers } = useTimelineEditor(initialMarkers)

    const [currentPage, setCurrentPage] = useState(1)
    const [numPages, setNumPages] = useState<number | null>(null)
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(false)

    const handleRecordPageTurn = () => {
        if (!audioState.isPlaying) {
            alert('音楽を再生してから記録を開始してください！')
            return
        }

        const nextPage = currentPage + 1
        recordMarker(audioState.currentTime, nextPage)
        setCurrentPage(nextPage)
    }

    const handleRecordPartChange = () => {
        if (!audioState.isPlaying) {
            alert('音楽を再生してから記録を開始してください！')
            return
        }

        // ページはそのまま
        recordMarker(audioState.currentTime, currentPage)
    }

    const handleSaveButton = async () => {
        await saveMarkers(projectId)
        alert('保存しました')
        router.push(`/${projectId}`)
    }

    return (
        <div className="flex flex-col w-full h-full overflow-hidden relative">
            {/* 隠しオーディオ要素 */}
            <audio ref={audioRef} src={localAudioUrl} preload="auto" />

            {/* ダウンロード中表示 */}
            {(isAudioCaching || isPdfCaching) && (
                <div className="absolute top-2 left-2 right-2 z-50 bg-indigo-500/90 text-white text-xs text-center py-2 px-4 rounded-lg shadow-lg flex justify-center items-center gap-2">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    初回の読み込みのため、メディアファイルをキャッシュに保存しています...
                </div>
            )}

            {/* タイムライン（折りたたみ式・最上部） */}
            <div className="w-full shrink-0 bg-zinc-900 border-b border-zinc-800 flex flex-col z-20 shadow-md">
                <button 
                    onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                    className="flex justify-between items-center p-3 sm:p-4 w-full hover:bg-zinc-800/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg">⏱️</span> 
                        <span className="font-bold text-sm sm:text-base text-white">タイムライン ({markers.length})</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {isTimelineExpanded ? (
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        ) : (
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        )}
                    </div>
                </button>
                
                {isTimelineExpanded && (
                    <div className="w-full bg-zinc-950 flex flex-col max-h-[40vh] border-t border-zinc-800">
                        <div className="flex justify-end items-center p-2 px-4 border-b border-zinc-800 bg-zinc-900 shrink-0">
                            <button onClick={clearMarkers} className="text-xs px-2 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors">
                                全削除
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {markers.length === 0 ? (
                                <div className="text-center py-6 text-zinc-500 text-xs">まだ区切りがありません。</div>
                            ) : (
                                [...markers].sort((a, b) => a.time - b.time).map((m, i, arr) => {
                                    const partNumber = arr.slice(0, i + 1).filter(x => x.page === m.page).length;
                                    return (
                                        <div key={m.id || i} className="flex flex-col gap-2 bg-zinc-800 rounded px-3 py-2 border border-zinc-700/50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-xs sm:text-sm text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                                                        {m.time.toFixed(1)}s
                                                    </span>
                                                    <span className="text-zinc-300 font-medium text-xs sm:text-sm">
                                                        Page {m.page} {partNumber > 1 && <span className="text-zinc-500 text-[10px] sm:text-xs ml-1">Part {partNumber}</span>}
                                                    </span>
                                                </div>
                                                <button onClick={() => deleteMarker(m.time, m.page)} className="text-red-400 hover:text-red-300 p-1 rounded">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={m.name || ''}
                                                onChange={(e) => updateMarkerName(m.time, m.page, e.target.value)}
                                                placeholder="フォーメーション名（任意）"
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                            />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* PDFビューア（縦並び・スクロール） */}
            <div className="flex-1 w-full overflow-y-auto bg-zinc-950 p-2 sm:p-4">
                <div className="flex flex-col gap-4">
                    {/* 現在のページ */}
                    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative flex flex-col shrink-0">
                        <div className="bg-zinc-800 text-center text-zinc-300 text-xs sm:text-sm font-bold py-1 sm:py-2 border-b border-zinc-700 shrink-0">
                            現在のページ ({currentPage}P)
                        </div>
                        <div className="w-full relative flex justify-center bg-black/20">
                            <PDFViewerWrapper url={localPdfUrl} currentPage={currentPage} onDocumentLoadSuccess={setNumPages} fitToContainer={false} />
                        </div>
                    </div>
                    
                    {/* 次のページ */}
                    {numPages && currentPage < numPages && (
                        <div className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden shadow-xl relative flex flex-col opacity-80 shrink-0">
                            <div className="bg-zinc-800/50 text-center text-zinc-400 text-xs sm:text-sm font-bold py-1 sm:py-2 border-b border-zinc-800 shrink-0">
                                次のページ ({currentPage + 1}P)
                            </div>
                            <div className="w-full relative flex justify-center bg-black/20">
                                <PDFViewerWrapper url={localPdfUrl} currentPage={currentPage + 1} fitToContainer={false} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 下部固定コントロール領域（左右分割なし） */}
            <div className="w-full shrink-0 flex flex-col bg-zinc-950 border-t border-zinc-800 pb-safe">
                <div className="p-2 sm:p-4 flex flex-col gap-3 shrink-0 border-b border-zinc-800 bg-zinc-900">
                    <AudioControls {...audioState} />
                </div>
                <div className="p-3 sm:p-4 flex flex-col gap-2 shrink-0 bg-zinc-950">
                    <div className="flex gap-2">
                        <button
                            onClick={handleRecordPartChange}
                            className="flex-1 py-3 sm:py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl shadow-lg border border-zinc-700 transition-all active:scale-[0.98] text-sm sm:text-base"
                        >
                            📍 パート区切り
                        </button>
                        <button
                            onClick={handleRecordPageTurn}
                            disabled={numPages !== null && currentPage >= numPages}
                            className="flex-1 py-3 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:from-zinc-600 disabled:to-zinc-700 disabled:shadow-none disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                        >
                            📄 次のページへ
                        </button>
                    </div>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                        className="w-full py-2 mt-1 bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 text-xs sm:text-sm font-medium rounded-lg border border-zinc-700/50 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                        ◀ 前のページに戻る（やり直し用）
                    </button>
                    <button
                        onClick={handleSaveButton}
                        disabled={markers.length === 0}
                        className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span>💾</span> 保存してプレイヤーへ
                    </button>
                </div>
            </div>
        </div>
    )
}