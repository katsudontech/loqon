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
            className={`text-sm flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 ${
                status === 'shared' || status === 'copied'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border-zinc-700'
            }`}
          >
            <span aria-hidden="true">{status === 'shared' || status === 'copied' ? '✅' : '🔗'}</span>
            {status === 'shared' ? '共有しました' : status === 'copied' ? 'URLをコピーしました' : '共有する'}
          </button>
          <p id="share-status" className="sr-only" aria-live="polite">
            {status === 'shared' ? '共有しました' : status === 'copied' ? '共有URLをコピーしました' : status === 'error' ? '自動コピーに失敗しました。URLを選択してコピーしてください。' : ''}
          </p>
          {showFallback && (
            <div className="w-56 rounded border border-amber-500/50 bg-zinc-900 p-2 text-left">
              <p className="mb-1 text-xs text-amber-200">下のURLを選択してコピーしてください</p>
              <input ref={urlRef} aria-label="共有URL" readOnly value={typeof window === 'undefined' ? '' : window.location.href} onFocus={(event) => event.currentTarget.select()} className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200" />
            </div>
          )}
        </div>
    )
}
