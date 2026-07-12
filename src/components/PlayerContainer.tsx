'use client'
import { useState, useEffect } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'

type Marker = {
    id?: string
    time: number
    end_time: number
    page: number
}

type Props = {
    audioUrl: string
    pdfUrl: string
    markers: Marker[]
}

export const PlayerContainer = ({ audioUrl, pdfUrl, markers }: Props) => {
    const { audioRef, ...audioState } = useAudioPlayer()
    
    // モード管理: 'full' = 全体再生, 'part' = パート練習
    const [mode, setMode] = useState<'full' | 'part'>('full')
    
    // PDFの現在ページ
    const [currentPage, setCurrentPage] = useState(1)
    
    // パート練習時の開始マーカーと終了マーカーのインデックス
    const [startMarkerIdx, setStartMarkerIdx] = useState(0)
    const [endMarkerIdx, setEndMarkerIdx] = useState(0)

    // ===== 共通の同期ロジック =====
    // 現在の再生時間に合わせて、自動的にPDFのページを切り替える
    useEffect(() => {
        if (markers.length === 0) return;

        // currentTime 以下で最も時間が大きいマーカーを探す
        let activePage = markers[0].page;
        for (let i = 0; i < markers.length; i++) {
            if (audioState.currentTime >= markers[i].time) {
                activePage = markers[i].page
            } else {
                break; // 時間順に並んでいる前提なので、超えたらそこで終了
            }
        }
        
        if (currentPage !== activePage) {
            setCurrentPage(activePage)
        }
    }, [audioState.currentTime, markers, currentPage])


    // ===== パート練習（A-Bリピート）のロジック =====
    useEffect(() => {
        if (mode !== 'part' || markers.length === 0) return;

        const startMarker = markers[startMarkerIdx]
        const endMarker = markers[endMarkerIdx]
        
        if (!startMarker || !endMarker) return;

        // 再生位置が「終了ページのend_time」に達したら、「開始ページのstart_time」へ戻る（ループ）
        if (audioState.isPlaying && audioState.currentTime >= endMarker.end_time) {
             if (audioRef.current) {
                 audioRef.current.currentTime = startMarker.time
             }
        }
    }, [audioState.currentTime, audioState.isPlaying, mode, markers, startMarkerIdx, endMarkerIdx, audioRef])


    // ===== 楽曲終了時のループ処理 =====
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => {
            if (mode === 'full') {
                // 全体再生モード：最初からやり直す
                audio.currentTime = 0;
                audio.play();
            } else if (mode === 'part') {
                // パート練習モード：指定した開始位置からやり直す
                const startMarker = markers[startMarkerIdx];
                if (startMarker) {
                    audio.currentTime = startMarker.time;
                    audio.play();
                }
            }
        };

        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, [mode, markers, startMarkerIdx, audioRef]);

    // ===== リードイン（5秒前再生）機能 =====
    const handleLeadin = () => {
        const startMarker = mode === 'part' ? markers[startMarkerIdx] : markers.find(m => m.page === currentPage)
        if (!startMarker) return;
        
        const targetTime = Math.max(0, startMarker.time - 5)
        if (audioRef.current) {
            audioRef.current.currentTime = targetTime
            // もし停止中なら再生も開始する
            if (!audioState.isPlaying) {
                audioRef.current.play()
            }
        }
    }

    // ===== パートの前後移動 =====
    const handleShiftPart = (direction: -1 | 1) => {
        const newStart = startMarkerIdx + direction;
        const newEnd = endMarkerIdx + direction;
        
        if (newStart >= 0 && newEnd < markers.length) {
            setStartMarkerIdx(newStart);
            setEndMarkerIdx(newEnd);
            // シフトしたら自動的に新しいパートの先頭に飛ぶ
            if (audioRef.current) {
                audioRef.current.currentTime = markers[newStart].time;
            }
        }
    }

    return (
        <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
            {/* 隠しオーディオ要素 */}
            <audio ref={audioRef} src={audioUrl} preload="auto" />

            {/* モード切替タブ */}
            <div className="bg-zinc-900 p-1 rounded-xl flex w-full max-w-sm mx-auto shadow-lg border border-zinc-800">
                <button
                    onClick={() => setMode('full')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        mode === 'full' 
                        ? 'bg-zinc-800 text-white shadow-md' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    全体再生モード
                </button>
                <button
                    onClick={() => setMode('part')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        mode === 'part' 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    パート練習モード
                </button>
            </div>

            {/* パート練習モード専用のコントロールパネル */}
            {mode === 'part' && markers.length > 0 && (
                <div className="w-full bg-indigo-950/30 border border-indigo-900/50 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-indigo-300 font-bold flex items-center gap-2">
                            <span>🔁</span> リピート区間
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleShiftPart(-1)}
                                disabled={startMarkerIdx <= 0}
                                className="px-3 py-1 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 text-sm font-medium rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                ◀ 前パート
                            </button>
                            <button
                                onClick={() => handleShiftPart(1)}
                                disabled={endMarkerIdx >= markers.length - 1}
                                className="px-3 py-1 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 text-sm font-medium rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                次パート ▶
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="flex-1 flex items-center gap-3 w-full bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                            <span className="text-zinc-400 text-sm whitespace-nowrap">開始:</span>
                            <select 
                                value={startMarkerIdx}
                                onChange={(e) => {
                                    const newStart = Number(e.target.value)
                                    setStartMarkerIdx(newStart)
                                    // 終了が開始より前になったら、終了を開始に合わせる
                                    if (endMarkerIdx < newStart) setEndMarkerIdx(newStart)
                                }}
                                className="w-full bg-zinc-800 text-white border-none rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg py-2"
                            >
                                {markers.map((m, i) => (
                                    <option key={`start-${i}`} value={i}>Page {m.page}</option>
                                ))}
                            </select>
                        </div>
                        <span className="text-zinc-500 font-bold">〜</span>
                        <div className="flex-1 flex items-center gap-3 w-full bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                            <span className="text-zinc-400 text-sm whitespace-nowrap">終了:</span>
                            <select 
                                value={endMarkerIdx}
                                onChange={(e) => {
                                    const newEnd = Number(e.target.value)
                                    setEndMarkerIdx(newEnd)
                                    // 開始が終了より後になったら、開始を終了に合わせる
                                    if (startMarkerIdx > newEnd) setStartMarkerIdx(newEnd)
                                }}
                                className="w-full bg-zinc-800 text-white border-none rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg py-2"
                            >
                                {markers.map((m, i) => (
                                    <option key={`end-${i}`} value={i}>Page {m.page}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* オーディオのコントローラーと5秒前ボタン */}
            <div className="w-full bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-2xl space-y-4">
                <div className="flex justify-between items-center mb-2">
                    <button
                        onClick={handleLeadin}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 border border-zinc-700"
                    >
                        <span>⏪</span> 5秒前から再生 (リードイン)
                    </button>
                    <div className="text-zinc-400 text-sm">
                        現在: <span className="text-white font-bold text-lg">Page {currentPage}</span>
                    </div>
                </div>
                <AudioControls {...audioState} />
            </div>

            {/* PDFビューア */}
            <div className="w-full h-[600px]">
                <PDFViewerWrapper url={pdfUrl} currentPage={currentPage} />
            </div>
            
        </div>
    )
}
