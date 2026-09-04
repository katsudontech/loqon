'use client'

type Props = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  playbackError?: string;
}

export function AudioControls({ isPlaying, currentTime, duration, playbackRate, togglePlay, seekTo, setPlaybackRate, playbackError = '' }: Props) {
  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '00:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="audio-controls">
      <div className="audio-seek">
        <span className="time-label">{formatTime(currentTime)}</span>
        <input aria-label="再生位置" type="range" min={0} max={duration || 100} value={currentTime} onChange={(e) => seekTo(Number(e.target.value))} className="audio-range" />
        <span className="time-label">{formatTime(duration)}</span>
      </div>
      <div className="audio-buttons">
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? '一時停止' : '再生'} aria-pressed={isPlaying} className="audio-button primary">
          {isPlaying ? <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z" /></svg>}
        </button>
        <button type="button" onClick={() => seekTo(Math.max(0, currentTime - 5))} aria-label="5秒戻る" className="audio-button">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 5v5h5" /><path d="M12 8v4l2.5 2" /></svg>
        </button>
        <select aria-label="再生速度" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))} className="speed-select">
          <option value={0.75}>0.75x</option><option value={0.8}>0.8x</option><option value={0.9}>0.9x</option><option value={0.95}>0.95x</option><option value={1}>1.0x</option><option value={1.5}>1.5x</option>
        </select>
      </div>
      {playbackError && <p role="status" aria-live="assertive" className="alert-error">{playbackError}</p>}
    </div>
  )
}
