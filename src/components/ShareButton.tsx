'use client'
import { useState } from 'react'

export const ShareButton = () => {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy text: ', err)
        }
    }

    return (
        <button
            onClick={handleCopy}
            className={`text-sm flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium border ${
                copied 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border-zinc-700'
            }`}
        >
            <span>{copied ? '✅' : '🔗'}</span> 
            {copied ? 'URLをコピーしました' : '共有URLをコピー'}
        </button>
    )
}
