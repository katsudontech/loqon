'use client'

import { useState, useSyncExternalStore } from 'react'

const subscribeToUserAgent = () => () => undefined
const getIsLineBrowserSnapshot = () => /Line/i.test(navigator.userAgent)
const getIsLineBrowserServerSnapshot = () => false

export function LineBrowserWarning() {
    const isLineBrowser = useSyncExternalStore(
        subscribeToUserAgent,
        getIsLineBrowserSnapshot,
        getIsLineBrowserServerSnapshot,
    )
    const [isDismissed, setIsDismissed] = useState(false)

    if (!isLineBrowser || isDismissed) return null;

    return (
        <div className="warning-screen">
            <div className="dialog">
                <p className="eyebrow">Browser compatibility</p>
                <h2>標準ブラウザで開いてください</h2>
                <p>
                    LINEの内部ブラウザでは、音楽の再生やPDFの表示機能が<strong>正常に動作しない</strong>場合があります。<br/><br/>
                    右下（または右上）のメニューボタン（<span className="font-bold">⋮</span> や <span className="font-bold">↑</span>）を押して、<br/>
                    <strong>「他のアプリで開く」</strong> または <strong>「ブラウザで開く」</strong><br/>
                    を選択し、SafariやChromeで開き直してください。
                </p>
                <button 
                    type="button"
                    aria-label="案内を閉じる"
                    onClick={() => setIsDismissed(true)}
                    className="button-quiet"
                >
                    このまま表示する（動作は保証されません）
                </button>
            </div>
        </div>
    )
}
