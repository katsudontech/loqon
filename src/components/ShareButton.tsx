'use client'
import { useRef, useState } from 'react'

export const ShareButton = () => {
    const [status, setStatus] = useState<'idle' | 'shared' | 'copied' | 'error'>('idle')
    const [showFallback, setShowFallback] = useState(false)
    const urlRef = useRef<HTMLInputElement>(null)

    const handleShare = async () => {
        const url = window.location.href
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ title: document.title || 'Loqon', url })
                setStatus('shared')
                setShowFallback(false)
            } else {
                await navigator.clipboard.writeText(url)
                setStatus('copied')
                setShowFallback(false)
            }
        } catch (err) {
            // A cancelled native share is not a failure worth surfacing, but a
            // clipboard/security error should leave the URL easy to select.
            if (err instanceof DOMException && err.name === 'AbortError') return
            try {
                await navigator.clipboard.writeText(url)
                setStatus('copied')
                setShowFallback(false)
            } catch {
                setStatus('error')
                setShowFallback(true)
                window.setTimeout(() => urlRef.current?.select(), 0)
            }
        }
        window.setTimeout(() => setStatus('idle'), 3000)
    }

    return (
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleShare}
            aria-describedby="share-status"
            className="console-link"
          >
            <svg className="console-icon" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12v7h14v-7" /><path d="m12 3 5 5m-5-5L7 8m5-5v13" /></svg>
            <span className="console-label">{status === 'shared' ? '共有しました' : status === 'copied' ? 'URLをコピーしました' : '共有する'}</span>
          </button>
          <p id="share-status" className="sr-only" aria-live="polite">
            {status === 'shared' ? '共有しました' : status === 'copied' ? '共有URLをコピーしました' : status === 'error' ? '自動コピーに失敗しました。URLを選択してコピーしてください。' : ''}
          </p>
          {showFallback && (
            <div className="floating-notice">
              <p>下のURLを選択してコピーしてください</p>
              <input ref={urlRef} aria-label="共有URL" readOnly value={typeof window === 'undefined' ? '' : window.location.href} onFocus={(event) => event.currentTarget.select()} className="text-input" />
            </div>
          )}
        </div>
    )
}
