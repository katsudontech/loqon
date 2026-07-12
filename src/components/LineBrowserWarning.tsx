'use client'

import { useState, useEffect } from 'react'

export function LineBrowserWarning() {
    const [isLineBrowser, setIsLineBrowser] = useState(false)

    useEffect(() => {
        // ユーザーエージェントを取得
        const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
        // LINE内蔵ブラウザからのアクセスを検知
        if (ua.indexOf('Line') > -1 || ua.indexOf('LINE') > -1) {
            setIsLineBrowser(true)
        }
    }, [])

    if (!isLineBrowser) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            <div className="bg-zinc-900 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-indigo-500/30 flex flex-col items-center gap-6">
                <div className="text-6xl animate-bounce">⚠️</div>
                <h2 className="text-2xl font-bold text-white">標準ブラウザで開いてください</h2>
                <p className="text-zinc-300 text-sm leading-relaxed text-left bg-zinc-800 p-4 rounded-xl">
                    LINEの内部ブラウザでは、音楽の再生やPDFの表示機能が<strong>正常に動作しない</strong>場合があります。<br/><br/>
                    右下（または右上）のメニューボタン（<span className="font-bold text-white">⋮</span> や <span className="font-bold text-white">↑</span>）を押して、<br/>
                    <strong className="text-indigo-400">「他のアプリで開く」</strong> または <strong className="text-indigo-400">「ブラウザで開く」</strong><br/>
                    を選択し、SafariやChromeで開き直してください。
                </p>
                <button 
                    onClick={() => setIsLineBrowser(false)}
                    className="mt-2 text-zinc-500 text-xs underline hover:text-zinc-400 transition-colors"
                >
                    このまま表示する（動作は保証されません）
                </button>
            </div>
        </div>
    )
}
