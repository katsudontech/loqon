'use client'
import { useState, useEffect } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useCachedMedia } from '@/hooks/useCachedMedia'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'

type Marker = {
    id?: string
    time: number
    end_time: number
    page: number
    name?: string
}

type Props = {
    audioUrl: string
    pdfUrl: string
    markers: Marker[]
}

export const PlayerContainer = ({ audioUrl, pdfUrl, markers }: Props) => {
    // URLをキャッシュストレージから取得するカスタムフック
    const { cachedUrl: localAudioUrl, isCaching: isAudioCaching } = useCachedMedia(audioUrl)
    const { cachedUrl: localPdfUrl, isCaching: isPdfCaching } = useCachedMedia(pdfUrl)

    const { audioRef, ...audioState } = useAudioPlayer()

    // モード管理: 'full' = 全体再生, 'part' = パート練習
    const [mode, setMode] = useState<'full' | 'part'>('part')

    // PDFの現在ページ
    const [currentPage, setCurrentPage] = useState(1)

    // パート練習時の開始マーカーと終了マーカーのインデックス
    const [startMarkerIdx, setStartMarkerIdx] = useState(0)
    const [endMarkerIdx, setEndMarkerIdx] = useState(0)

    // リードイン（5秒前再生）がオンになっているかどうか
    const [isLeadinEnabled, setIsLeadinEnabled] = useState(false)

    // パート内でのカスタムA-Bループ（秒数指定）
    const [customLoopA, setCustomLoopA] = useState<number | null>(null)
    const [customLoopB, setCustomLoopB] = useState<number | null>(null)

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

        // 再生位置が「終了位置」に達したら、「開始位置」へ戻る（ループ）
        const loopEnd = customLoopB !== null ? customLoopB : endMarker.end_time;
        const loopStart = customLoopA !== null ? customLoopA : startMarker.time;

        if (audioState.isPlaying && audioState.currentTime >= loopEnd) {
            if (audioRef.current) {
                const targetTime = isLeadinEnabled ? Math.max(0, loopStart - 5) : loopStart;
                audioRef.current.currentTime = targetTime;
            }
        }
    }, [audioState.currentTime, audioState.isPlaying, mode, markers, startMarkerIdx, endMarkerIdx, isLeadinEnabled, customLoopA, customLoopB, audioRef])


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
                    const loopStart = customLoopA !== null ? customLoopA : startMarker.time;
                    const targetTime = isLeadinEnabled ? Math.max(0, loopStart - 5) : loopStart;
                    audio.currentTime = targetTime;
                    audio.play();
                }
            }
        };

        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, [mode, markers, startMarkerIdx, audioRef]);

    // ===== リードイン（5秒前再生）機能 =====
    const handleLeadinToggle = () => {
        setIsLeadinEnabled(prev => {
            const nextState = !prev;
            // オンにした瞬間に適用してジャンプさせる
            if (nextState) {
                const startMarker = mode === 'part' ? markers[startMarkerIdx] : markers.find(m => m.page === currentPage);
                if (startMarker && audioRef.current) {
                    const targetTime = Math.max(0, startMarker.time - 5);
                    audioRef.current.currentTime = targetTime;
                    if (!audioState.isPlaying) audioRef.current.play();
                }
            }
            return nextState;
        });
    }

    // ===== パートの前後移動 =====
    const handleShiftPart = (direction: -1 | 1) => {
        const newStart = startMarkerIdx + direction;
        const newEnd = endMarkerIdx + direction;

        if (newStart >= 0 && newEnd < markers.length) {
            setStartMarkerIdx(newStart);
            setEndMarkerIdx(newEnd);
            setCustomLoopA(null);
            setCustomLoopB(null);

            // シフトしたら自動的に新しいパートの先頭に飛ぶ (Safari対応のためsetTimeoutで遅延実行)
            setTimeout(() => {
                if (audioRef.current && markers[newStart]) {
                    const targetTime = isLeadinEnabled ? Math.max(0, markers[newStart].time - 5) : markers[newStart].time;
                    audioRef.current.currentTime = targetTime;
                }
            }, 10);
        }
    }

    // ===== スマホの通知欄（Media Session API）との連携 =====
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        // 次へボタン
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (mode === 'part') {
                handleShiftPart(1);
            }
        });

        // 前へボタン
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (mode === 'part' && audioRef.current) {
                const startMarker = markers[startMarkerIdx];
                if (!startMarker) return;

                const loopStart = customLoopA !== null ? customLoopA : startMarker.time;
                const targetTime = isLeadinEnabled ? Math.max(0, loopStart - 5) : loopStart;

                const currentAudioTime = audioRef.current.currentTime;

                // 3秒以上進んでいれば先頭に戻る、そうでなければ前パートへ
                if (currentAudioTime > targetTime + 3) {
                    audioRef.current.currentTime = targetTime;
                } else {
                    handleShiftPart(-1);
                }
            }
        });

        return () => {
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, markers, startMarkerIdx, endMarkerIdx, customLoopA, isLeadinEnabled, audioRef]);

    // ===== シークバーの表示計算 =====
    let displayCurrentTime = audioState.currentTime;
    let displayDuration = audioState.duration;
    let displaySeekTo = audioState.seekTo;

    if (mode === 'part' && markers.length > 0) {
        const startMarker = markers[startMarkerIdx];
        const endMarker = markers[endMarkerIdx];
        if (startMarker && endMarker) {
            const partStart = isLeadinEnabled ? Math.max(0, startMarker.time - 5) : startMarker.time;
            const partEnd = Math.min(endMarker.end_time, audioState.duration || 99999);

            displayDuration = Math.max(0, partEnd - partStart);
            displayCurrentTime = Math.max(0, Math.min(audioState.currentTime - partStart, displayDuration));
            displaySeekTo = (time: number) => {
                audioState.seekTo(time + partStart);
            };
        }
    }

    return (
        <div className="flex flex-col w-full h-full overflow-hidden relative">
            {/* 隠しオーディオ要素 */}
            <audio ref={audioRef} src={localAudioUrl} preload="auto" />

            {/* ダウンロード中表示 (画面上部に固定) */}
            {(isAudioCaching || isPdfCaching) && (
                <div className="absolute top-2 left-2 right-2 z-50 bg-indigo-500/90 text-white text-xs text-center py-2 px-4 rounded-lg shadow-lg flex justify-center items-center gap-2">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    初回の読み込みのため、メディアファイルをキャッシュに保存しています...
                </div>
            )}

            {/* PDFビューア (スクロールしないように画面にフィットさせる領域) */}
            <div className="flex-1 w-full overflow-hidden bg-zinc-950 flex flex-col relative">
                <PDFViewerWrapper url={localPdfUrl} currentPage={currentPage} />
            </div>

            {/* 下部固定コントロール領域 */}
            <div className="w-full shrink-0 flex flex-col bg-zinc-950 border-t border-zinc-800 pb-safe">
                {/* リピート区間コントロール */}
                {mode === 'part' && markers.length > 0 && (
                    <div className="w-full bg-indigo-950/30 border-b border-indigo-900/50 p-2 sm:p-4 backdrop-blur-sm">
                        <div className="flex justify-between items-center mb-3">
                            <button
                                onClick={() => handleShiftPart(-1)}
                                disabled={startMarkerIdx <= 0}
                                className="px-4 py-3 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 font-bold rounded-xl flex-1 mr-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-center text-sm sm:text-base"
                            >
                                ◀ 前のパート
                            </button>
                            <div className="flex flex-col items-center justify-center mx-1">
                                <span className="text-indigo-300/80 text-xs font-bold whitespace-nowrap">🔁</span>
                            </div>
                            <button
                                onClick={() => handleShiftPart(1)}
                                disabled={endMarkerIdx >= markers.length - 1}
                                className="px-4 py-3 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 font-bold rounded-xl flex-1 ml-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-center text-sm sm:text-base"
                            >
                                次のパート ▶
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                                <span className="text-zinc-400 text-xs whitespace-nowrap">開始:</span>
                                <select
                                    value={startMarkerIdx}
                                    onChange={(e) => {
                                        const newStart = Number(e.target.value)
                                        setStartMarkerIdx(newStart)
                                        if (endMarkerIdx < newStart) setEndMarkerIdx(newStart)
                                        setCustomLoopA(null)
                                        setCustomLoopB(null)
                                        setTimeout(() => {
                                            if (audioRef.current && markers[newStart]) {
                                                const targetTime = isLeadinEnabled ? Math.max(0, markers[newStart].time - 5) : markers[newStart].time;
                                                audioRef.current.currentTime = targetTime;
                                            }
                                        }, 10);
                                    }}
                                    className="w-full bg-zinc-800 text-white border-none rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm py-1"
                                >
                                    {markers.map((m, i) => (
                                        <option key={`start-${i}`} value={i}>{m.name ? `${m.name} (P${m.page})` : `Page ${m.page}`}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-zinc-500 font-bold text-sm">〜</span>
                            <div className="flex-1 flex items-center gap-2 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                                <span className="text-zinc-400 text-xs whitespace-nowrap">終了:</span>
                                <select
                                    value={endMarkerIdx}
                                    onChange={(e) => {
                                        const newEnd = Number(e.target.value)
                                        setEndMarkerIdx(newEnd)
                                        if (startMarkerIdx > newEnd) setStartMarkerIdx(newEnd)
                                        setCustomLoopA(null)
                                        setCustomLoopB(null)
                                    }}
                                    className="w-full bg-zinc-800 text-white border-none rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm py-1"
                                >
                                    {markers.map((m, i) => (
                                        <option key={`end-${i}`} value={i}>{m.name ? `${m.name} (P${m.page})` : `Page ${m.page}`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* カスタムA-Bループ */}
                        <div className="mt-2 flex flex-row flex-nowrap overflow-x-auto no-scrollbar items-center justify-start gap-2">
                            <button
                                onClick={() => {
                                    if (customLoopB !== null && audioState.currentTime >= customLoopB) return alert('Bより前の時間を設定してください');
                                    setCustomLoopA(audioState.currentTime)
                                }}
                                className={`px-2 py-1 text-xs font-bold rounded border transition-colors whitespace-nowrap ${customLoopA !== null ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-zinc-800 text-indigo-300 border-zinc-700 hover:bg-zinc-700'}`}
                            >
                                A: {customLoopA !== null ? `${customLoopA.toFixed(1)}s` : '開始'}
                            </button>
                            <button
                                onClick={() => {
                                    if (customLoopA !== null && audioState.currentTime <= customLoopA) return alert('Aより後の時間を設定してください');
                                    setCustomLoopB(audioState.currentTime)
                                }}
                                className={`px-2 py-1 text-xs font-bold rounded border transition-colors whitespace-nowrap ${customLoopB !== null ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-zinc-800 text-indigo-300 border-zinc-700 hover:bg-zinc-700'}`}
                            >
                                B: {customLoopB !== null ? `${customLoopB.toFixed(1)}s` : '終了'}
                            </button>
                            {(customLoopA !== null || customLoopB !== null) && (
                                <button
                                    onClick={() => { setCustomLoopA(null); setCustomLoopB(null); }}
                                    className="px-2 py-1 text-xs font-bold bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded border border-zinc-700 transition-colors whitespace-nowrap"
                                >
                                    クリア
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* オーディオコントロール領域 (一番下) */}
                <div className="w-full bg-zinc-900 p-3 sm:p-4 pb-8 sm:pb-6 shadow-2xl flex flex-col gap-3">
                    <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                            {markers.length > 0 && (
                                <button
                                    onClick={() => setMode(mode === 'part' ? 'full' : 'part')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${mode === 'part'
                                            ? 'bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 border-indigo-700'
                                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                                        }`}
                                >
                                    {mode === 'part' ? '🎯 パート' : '🎵 全体'}
                                </button>
                            )}
                            <button
                                onClick={handleLeadinToggle}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 border ${isLeadinEnabled
                                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                                        : 'bg-zinc-800 hover:bg-zinc-700 text-indigo-300 border-zinc-700'
                                    }`}
                            >
                                <span>⏪</span> {isLeadinEnabled ? '5秒前 ON' : '5秒前 OFF'}
                            </button>
                        </div>
                        <div className="text-zinc-400 text-xs text-right whitespace-nowrap">
                            現在: <span className="text-white font-bold text-sm">{(() => {
                                const m = markers.find(m => audioState.currentTime >= m.time && audioState.currentTime < m.end_time) || markers.find(m => m.page === currentPage);
                                return m?.name ? `${m.name} (P${currentPage})` : `Page ${currentPage}`
                            })()}</span>
                        </div>
                    </div>
                    <AudioControls
                        {...audioState}
                        currentTime={displayCurrentTime}
                        duration={displayDuration}
                        seekTo={displaySeekTo}
                    />
                </div>
            </div>
        </div>
    )
}
