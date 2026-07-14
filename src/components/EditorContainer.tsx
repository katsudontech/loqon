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
    const { markers, recordMarker, deleteMarker, clearMarkers, saveMarkers } = useTimelineEditor(initialMarkers)

    const [currentPage, setCurrentPage] = useState(1)
    const [numPages, setNumPages] = useState<number | null>(null)

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
        <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
            {/* 隠しオーディオ要素：これがフックのaudioRefと繋がり、音楽を再生します */}
            <audio ref={audioRef} src={localAudioUrl} preload="auto" />

            {/* ダウンロード中表示 */}
            {(isAudioCaching || isPdfCaching) && (
                <div className="w-full bg-indigo-500/10 text-indigo-300 text-xs text-center py-2 rounded-lg border border-indigo-500/20 flex justify-center items-center gap-2">
                    <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    初回の読み込みのため、メディアファイルをキャッシュに保存しています...
                </div>
            )}

            {/* オーディオのコントローラー */}
            <div className="w-full">
                <AudioControls {...audioState} />
            </div>

            {/* 記録ボタンエリア */}
            <div className="w-full flex flex-col gap-3">
                <div className="flex gap-4">
                    <button
                        onClick={handleRecordPartChange}
                        className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xl font-bold rounded-2xl shadow-lg border border-zinc-700 transition-all active:scale-[0.98]"
                    >
                        📍 同じページでパートを区切る
                    </button>
                    <button
                        onClick={handleRecordPageTurn}
                        disabled={numPages !== null && currentPage >= numPages}
                        className="flex-1 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-xl font-bold rounded-2xl shadow-[0_0_40px_rgba(99,102,241,0.3)] hover:shadow-[0_0_60px_rgba(99,102,241,0.5)] transition-all active:scale-[0.98] disabled:from-zinc-600 disabled:to-zinc-700 disabled:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {numPages !== null && currentPage >= numPages ? '📄 最後のページです' : `📄 次のページ (${currentPage + 1}P) へ`}
                    </button>
                </div>
                <div>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                        className="w-full py-3 bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 text-sm font-medium rounded-xl border border-zinc-700/50 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        前のページ ({currentPage > 1 ? currentPage - 1 : 1}P) に戻る（記録やり直し用）
                    </button>
                    <p className="text-xs text-zinc-500 text-center mt-2 flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        間違えて記録したマーカーを取り消す場合は、下部のタイムライン一覧から削除してください。
                    </p>
                </div>
            </div>

            {/* PDFビューア（2ページ並べて表示） */}
            <div className={`w-full grid gap-4 ${numPages && currentPage < numPages ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {/* 現在のページ */}
                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative flex flex-col">
                    <div className="bg-zinc-800 text-center text-zinc-300 text-sm font-bold py-2 border-b border-zinc-700">
                        現在のページ ({currentPage}P)
                    </div>
                    <PDFViewerWrapper 
                        url={localPdfUrl} 
                        currentPage={currentPage} 
                        onDocumentLoadSuccess={setNumPages}
                    />
                </div>
                
                {/* 次のページ */}
                {numPages && currentPage < numPages && (
                    <div className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden shadow-xl relative flex flex-col opacity-80">
                        <div className="bg-zinc-800/50 text-center text-zinc-400 text-sm font-bold py-2 border-b border-zinc-800">
                            次のページ ({currentPage + 1}P)
                        </div>
                        <PDFViewerWrapper 
                            url={localPdfUrl} 
                            currentPage={currentPage + 1} 
                        />
                    </div>
                )}
            </div>

            {/* タイムライン表示エリア */}
            <div className="w-full bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2">
                        <span>⏱️</span> タイムライン
                    </h3>
                    <button
                        onClick={clearMarkers}
                        className="text-sm px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                        全削除
                    </button>
                </div>

                <div className="space-y-3">
                    {markers.length === 0 ? (
                        <div className="text-center py-12 bg-zinc-800/30 rounded-xl border border-zinc-800/50">
                            <p className="text-zinc-500">まだ区切りがありません。</p>
                            <p className="text-zinc-600 text-sm mt-1">音楽を再生し、記録ボタンを押してマーカーを追加してください</p>
                        </div>
                    ) : (
                        [...markers].sort((a, b) => a.time - b.time).map((m, i, arr) => {
                            const partNumber = arr.slice(0, i + 1).filter(x => x.page === m.page).length;
                            return (
                                <div
                                    key={m.id || i}
                                    className="flex items-center justify-between bg-zinc-800 rounded-xl px-6 py-4 hover:bg-zinc-700/80 transition-colors border border-zinc-700/50"
                                >
                                    <div className="flex items-center gap-6">
                                        <span className="font-mono text-lg text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-lg">
                                            {m.time.toFixed(1)}s
                                        </span>
                                        <span className="text-zinc-300 font-medium text-lg">
                                            Page {m.page} {partNumber > 1 && <span className="text-zinc-500 text-sm ml-2">Part {partNumber}</span>}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => deleteMarker(m.time, m.page)}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition-colors"
                                        title="削除"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 保存ボタン */}
                <div className="mt-8 pt-6 border-t border-zinc-800">
                    <button
                        onClick={handleSaveButton}
                        disabled={markers.length === 0}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span>💾</span> タイムラインを保存してプレイヤーへ
                    </button>
                </div>
            </div>
        </div>
    )
}