'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

type AudioPlayerState = {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
  })

  const play = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play()
      } catch (err) {
        console.error('再生に失敗しました:', err)
      }
    }
  }, [])

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
  }, [])

  // オーディオ要素から状態を同期する
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setState(s => ({ ...s, currentTime: audio.currentTime }))
    const updateDuration = () => setState(s => ({ ...s, duration: audio.duration }))
    const onPlay = () => setState(s => ({ ...s, isPlaying: true }))
    const onPause = () => setState(s => ({ ...s, isPlaying: false }))
    const onRateChange = () => setState(s => ({ ...s, playbackRate: audio.playbackRate }))

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ratechange', onRateChange)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ratechange', onRateChange)
    }
  }, [])

  // バックグラウンド再生中のロック画面操作（Media Session API）の設定
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', play)
      navigator.mediaSession.setActionHandler('pause', pause)
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (audioRef.current) audioRef.current.currentTime -= 5
      })
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (audioRef.current) audioRef.current.currentTime += 5
      })

      return () => {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('seekbackward', null)
        navigator.mediaSession.setActionHandler('seekforward', null)
      }
    }
  }, [pause, play])

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause()
    } else {
      play()
    }
  }, [state.isPlaying, play, pause])

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }, [])

  return {
    audioRef,
    ...state,
    play,
    pause,
    togglePlay,
    seekTo,
    setPlaybackRate
  }
}
