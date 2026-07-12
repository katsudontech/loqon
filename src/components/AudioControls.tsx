'use client'

type Props = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
}

export function AudioControls({
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  togglePlay,
  seekTo,
  setPlaybackRate
}: Props) {
  
  // 秒数を MM:SS の形式に変換する便利関数
  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '00:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full max-w-4xl bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4">
      
      {/* 進行状況（シークバー） */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-zinc-400 w-12 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <span className="text-xs font-mono text-zinc-400 w-12">
          {formatTime(duration)}
        </span>
      </div>

      {/* コントロールボタン群 */}
      <div className="flex items-center justify-between">
        
        {/* 再生速度変更 */}
        <div className="flex items-center gap-2">
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value={0.75}>0.75x</option>
            <option value={0.8}>0.8x</option>
            <option value={0.9}>0.9x</option>
            <option value={0.95}>0.95x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </div>

        {/* 再生・一時停止ボタン */}
        <button
          onClick={togglePlay}
          className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          {isPlaying ? (
            // 一時停止アイコン
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            // 再生アイコン
            <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* デザインを真ん中揃えにするためのスペーサー */}
        <div className="w-[60px]" />
      </div>
    </div>
  )
}
