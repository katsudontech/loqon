'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { AudioControls } from '@/components/AudioControls'
import { PDFViewerWrapper } from '@/components/PDFViewerWrapper'
import { getPartBounds, shiftPartIndices, shouldLoopAt } from '@/lib/partLoop'

type Marker = {
    id: string
    time: number
    end_time?: number
    page: number
    name?: string
}

type Props = {
    audioUrl: string
    pdfUrl: string
    markers: Marker[]
    compositionCues?: { id: string; time: number; page: number; name?: string }[]
    practiceParts?: { id: string; startTime: number; endTime: number; name?: string }[]
}

export function derivePlayerTimeline(compositionCues: Props['compositionCues'] = [], practiceParts: Props['practiceParts'] = [], legacyMarkers: Marker[] = []) {
    const cues = compositionCues.length ? compositionCues.map((cue) => ({ id: cue.id, time: cue.time, page: cue.page, name: cue.name })) : legacyMarkers
    const parts = practiceParts.length ? practiceParts.map((part) => ({ id: part.id, time: part.startTime, end_time: part.endTime > part.startTime ? part.endTime : undefined, page: [...cues].reverse().find((cue) => cue.time <= part.startTime)?.page ?? 1, name: part.name })) : legacyMarkers
    return { cues, parts }
}

export const PlayerContainer = ({ audioUrl, pdfUrl, markers: legacyMarkers, compositionCues = [], practiceParts = [] }: Props) => {
    const { audioRef, play, ...audioState } = useAudioPlayer()
    const playerTimeline = useMemo(() => derivePlayerTimeline(compositionCues, practiceParts, legacyMarkers), [compositionCues, legacyMarkers, practiceParts])
    const compositionMarkers = playerTimeline.cues
    // Practice controls are driven only by ranges. Page is derived from the
    // composition timeline so same-page parts remain distinct.
    const markers = playerTimeline.parts

    // モード管理: 'full' = 全体再生, 'part' = パート練習
    const [mode, setMode] = useState<'full' | 'part'>('part')

    // パート練習時の開始マーカーと終了マーカーのインデックス
    const [startMarkerIdx, setStartMarkerIdx] = useState(0)
    const [endMarkerIdx, setEndMarkerIdx] = useState(0)

    // リードイン（5秒前再生）がオンになっているかどうか
    const [isLeadinEnabled, setIsLeadinEnabled] = useState(false)

    // パート内でのカスタムA-Bループ（秒数指定）
    const [customLoopA, setCustomLoopA] = useState<number | null>(null)
    const [customLoopB, setCustomLoopB] = useState<number | null>(null)
    const [loopError, setLoopError] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)

    // 現在の再生時間に合わせて表示するPDFページを導出する
    const currentPage = useMemo(() => {
        if (compositionMarkers.length === 0) return 1
        // currentTime 以下で最も時間が大きいマーカーを探す
        let activePage = compositionMarkers[0].page;
        for (let i = 0; i < compositionMarkers.length; i++) {
            if (audioState.currentTime >= compositionMarkers[i].time) {
                activePage = compositionMarkers[i].page
            } else {
                break; // 時間順に並んでいる前提なので、超えたらそこで終了
            }
        }
        return activePage
    }, [audioState.currentTime, compositionMarkers])

    // ===== パート練習（A-Bリピート）のロジック =====
    useEffect(() => {
        if (mode !== 'part' || !audioState.isPlaying) return
        const audio = audioRef.current
        const bounds = getPartBounds(markers, startMarkerIdx, endMarkerIdx, audioState.duration, customLoopA, customLoopB, isLeadinEnabled)
        if (!audio || !bounds) return
        let frame = 0
        const monitor = () => {
            if (!audio.paused && shouldLoopAt(audio.currentTime, bounds.loopEnd)) {
                audio.currentTime = bounds.leadInStart
                void play()
            }
            if (!audio.paused) frame = requestAnimationFrame(monitor)
        }
        frame = requestAnimationFrame(monitor)
        return () => cancelAnimationFrame(frame)
    }, [audioState.duration, audioState.isPlaying, audioRef, customLoopA, customLoopB, endMarkerIdx, isLeadinEnabled, markers, mode, play, startMarkerIdx])


    // ===== 楽曲終了時のループ処理 =====
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => {
            if (mode === 'full') {
                // 全体再生モード：最初からやり直す
                audio.currentTime = 0;
                void play();
            } else if (mode === 'part') {
                // パート練習モード：指定した開始位置からやり直す
                const startMarker = markers[startMarkerIdx];
                if (startMarker) {
                    const loopStart = customLoopA !== null ? customLoopA : startMarker.time;
                    const targetTime = isLeadinEnabled ? Math.max(0, loopStart - 5) : loopStart;
                    audio.currentTime = targetTime;
                    void play();
                }
            }
        };

        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, [mode, markers, startMarkerIdx, customLoopA, isLeadinEnabled, audioRef, play]);

    // ===== リードイン（5秒前再生）機能 =====
    const handleLeadinToggle = () => {
        setIsLeadinEnabled(prev => {
            const nextState = !prev;
            // オンにした瞬間に適用してジャンプさせる
            const startMarker = mode === 'part' ? markers[startMarkerIdx] : markers.find(m => m.page === currentPage);
            if (startMarker && audioRef.current) {
                const effectiveStart = mode === 'part' && customLoopA !== null ? customLoopA : startMarker.time;
                const targetTime = nextState ? Math.max(0, effectiveStart - 5) : effectiveStart;
                audioRef.current.currentTime = targetTime;
                if (nextState && !audioState.isPlaying) void play();
            }
            return nextState;
        });
    }

    // ===== パートの前後移動 =====
    const handleShiftPart = useCallback((direction: -1 | 1) => {
        const newStart = startMarkerIdx + direction;
        const newEnd = endMarkerIdx + direction;

        if (shiftPartIndices(startMarkerIdx, endMarkerIdx, direction, markers.length)) {
            setStartMarkerIdx(newStart);
            setEndMarkerIdx(newEnd);
            setCustomLoopA(null);
            setCustomLoopB(null);
            setLoopError('')

            // シフトしたら自動的に新しいパートの先頭に飛ぶ (Safari対応のためsetTimeoutで遅延実行)
            setTimeout(() => {
                if (audioRef.current && markers[newStart]) {
                    const targetTime = isLeadinEnabled ? Math.max(0, markers[newStart].time - 5) : markers[newStart].time;
                    audioRef.current.currentTime = targetTime;
                }
            }, 10);
        }
    }, [audioRef, endMarkerIdx, isLeadinEnabled, markers, startMarkerIdx])

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
    }, [audioRef, customLoopA, handleShiftPart, isLeadinEnabled, markers, mode, startMarkerIdx]);

    // ===== シークバーの表示計算 =====
    let displayCurrentTime = audioState.currentTime;
    let displayDuration = audioState.duration;
    let displaySeekTo = audioState.seekTo;

    if (mode === 'part' && markers.length > 0) {
        const bounds = getPartBounds(markers, startMarkerIdx, endMarkerIdx, audioState.duration, customLoopA, customLoopB, isLeadinEnabled)
        if (bounds) {
            displayDuration = Math.max(0, bounds.loopEnd - bounds.leadInStart)
            displayCurrentTime = Math.max(0, Math.min(audioState.currentTime - bounds.leadInStart, displayDuration))
            displaySeekTo = (time: number) => audioState.seekTo(time + bounds.leadInStart)
        }
    }

    return (
        <div className="player-layout flex flex-col w-full h-full overflow-hidden relative">
            {/* 隠しオーディオ要素 */}
            <audio ref={audioRef} src={audioUrl} preload="metadata" crossOrigin="anonymous" />

            {/* PDFビューア (スクロールしないように画面にフィットさせる領域) */}
            <div className="player-pdf-stage">
                <PDFViewerWrapper
                    url={pdfUrl}
                    currentPage={currentPage}
                    renderStandbyPage
                />
            </div>

            {/* 下部固定コントロール領域 */}
            <div className="player-controls">
                {markers.length > 0 && <div className="part-nav" aria-label="パート移動">
                    <button type="button" aria-label="前のパート" onClick={() => handleShiftPart(-1)} disabled={startMarkerIdx <= 0} className="console-toggle">←</button>
                    <span className="part-nav-label">{mode === 'part' ? (markers[startMarkerIdx]?.name || `パート ${startMarkerIdx + 1}`) : '全体再生'}</span>
                    <button type="button" aria-label="次のパート" onClick={() => handleShiftPart(1)} disabled={endMarkerIdx >= markers.length - 1} className="console-toggle">→</button>
                </div>}
                {/* リピート区間コントロール */}
                {markers.length > 0 && (
                    <>
                    <button type="button" className="console-toggle w-full" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)}>
                        {showAdvanced ? 'パート設定を閉じる' : 'パート設定を開く'}
                    </button>
                    {showAdvanced && <div className="advanced-panel">
                        <div className="compact-tools advanced-mode-tools">
                            <button type="button" aria-pressed={mode === 'part'} aria-label={mode === 'part' ? 'パート練習モード（選択中）' : '全体再生モードへ切り替え'} onClick={() => {
                                if (mode === 'part') { setMode('full'); setCustomLoopA(null); setCustomLoopB(null) }
                                else { setMode('part'); setCustomLoopA(null); setCustomLoopB(null); setLoopError(''); const marker = markers[startMarkerIdx]; if (marker && audioRef.current) audioRef.current.currentTime = isLeadinEnabled ? Math.max(0, marker.time - 5) : marker.time }
                            }} className="console-toggle">{mode === 'part' ? 'パート練習' : '全体再生'}</button>
                            <button type="button" aria-pressed={isLeadinEnabled} aria-label={isLeadinEnabled ? '5秒前再生をオフにする' : '5秒前再生をオンにする'} onClick={handleLeadinToggle} className="console-toggle">{isLeadinEnabled ? '5秒前 ON' : '5秒前 OFF'}</button>
                        </div>
                        {mode === 'part' && <div className="loop-grid">
                            <div className="console-field">
                                <span className="text-zinc-400 text-xs whitespace-nowrap">開始:</span>
                                <select
                                    aria-label="ループ開始パート"
                                    value={startMarkerIdx}
                                    onChange={(e) => {
                                        const newStart = Number(e.target.value)
                                        setStartMarkerIdx(newStart)
                                        if (endMarkerIdx < newStart) setEndMarkerIdx(newStart)
                                        setCustomLoopA(null)
                                        setCustomLoopB(null)
                                        setLoopError('')
                                        setTimeout(() => {
                                            if (audioRef.current && markers[newStart]) {
                                                const targetTime = isLeadinEnabled ? Math.max(0, markers[newStart].time - 5) : markers[newStart].time;
                                                audioRef.current.currentTime = targetTime;
                                            }
                                        }, 10);
                                    }}
                                    className="select-input"
                                >
                                    {markers.map((m, i) => (
                                        <option key={`start-${i}`} value={i}>{m.name ? `${m.name} (ページ${m.page})` : `ページ ${m.page}`}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="sr-only">から</span>
                            <div className="console-field">
                                <span className="text-zinc-400 text-xs whitespace-nowrap">終了:</span>
                                <select
                                    aria-label="ループ終了パート"
                                    value={endMarkerIdx}
                                    onChange={(e) => {
                                        const newEnd = Number(e.target.value)
                                        setEndMarkerIdx(newEnd)
                                        if (startMarkerIdx > newEnd) setStartMarkerIdx(newEnd)
                                        setCustomLoopA(null)
                                        setCustomLoopB(null)
                                        setTimeout(() => {
                                            if (audioRef.current && markers[Math.min(startMarkerIdx, newEnd)]) {
                                                const marker = markers[Math.min(startMarkerIdx, newEnd)]
                                                audioRef.current.currentTime = isLeadinEnabled ? Math.max(0, marker.time - 5) : marker.time
                                            }
                                        }, 10)
                                    }}
                                    className="select-input"
                                >
                                    {markers.map((m, i) => (
                                        <option key={`end-${i}`} value={i}>{m.name ? `${m.name} (ページ${m.page})` : `ページ ${m.page}`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>}

                        {/* カスタムA-Bループ */}
                        <div className="mt-2 flex flex-row flex-wrap items-center justify-start gap-2">
                            <button
                                type="button"
                                aria-label="ループ開始位置Aを設定"
                                onClick={() => {
                                    const bounds = getPartBounds(markers, startMarkerIdx, endMarkerIdx, audioState.duration, null, null, false)
                                    const time = audioState.currentTime
                                    if (!bounds || time < bounds.selectionStart || time >= (customLoopB ?? bounds.selectionEnd)) { setLoopError('Aは選択範囲内で、Bより前に設定してください'); return }
                                    setCustomLoopA(time)
                                    setLoopError('')
                                }}
                                className={`console-toggle ${customLoopA !== null ? 'active' : ''}`}
                            >
                                A: {customLoopA !== null ? `${customLoopA.toFixed(1)}s` : '開始'}
                            </button>
                            <button
                                type="button"
                                aria-label="ループ終了位置Bを設定"
                                onClick={() => {
                                    const bounds = getPartBounds(markers, startMarkerIdx, endMarkerIdx, audioState.duration, null, null, false)
                                    const time = audioState.currentTime
                                    if (!bounds || time <= (customLoopA ?? bounds.selectionStart) || time > bounds.selectionEnd) { setLoopError('Bは選択範囲内で、Aより後に設定してください'); return }
                                    setCustomLoopB(time)
                                    setLoopError('')
                                }}
                                className={`console-toggle ${customLoopB !== null ? 'active' : ''}`}
                            >
                                B: {customLoopB !== null ? `${customLoopB.toFixed(1)}s` : '終了'}
                            </button>
                            {(customLoopA !== null || customLoopB !== null) && (
                                <button
                                    type="button"
                                    aria-label="カスタムループをクリア"
                                    onClick={() => { setCustomLoopA(null); setCustomLoopB(null); setLoopError('') }}
                                    className="console-toggle"
                                >
                                    クリア
                                </button>
                            )}
                        </div>
                        {loopError && <p role="alert" aria-live="assertive" className="mt-2 text-xs text-red-300">{loopError}</p>}
                    </div>}
                    </>
                )}

                {/* オーディオコントロール領域 (一番下) */}
                <div className="controls-primary">
                    <div className="flex justify-between items-center gap-2">
                        <div className="text-zinc-400 text-xs text-right whitespace-nowrap">
                            現在: <span className="text-white font-bold text-sm">{(() => {
                                const m = markers.find(m => audioState.currentTime >= m.time && (m.end_time == null || audioState.currentTime < m.end_time)) || [...markers].reverse().find(m => m.time <= audioState.currentTime) || markers.find(m => m.page === currentPage);
                                return m?.name ? `${m.name} (ページ${currentPage})` : `ページ ${currentPage}`
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
