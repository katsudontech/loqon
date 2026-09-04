'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportClientError'

type Props = { error: Error & { digest?: string }; unstable_retry: () => void }

export default function AppError({ error, unstable_retry }: Props) {
  useEffect(() => {
    reportClientError(error, 'アプリ画面エラー')
  }, [error])

  return (
    <main className="page-shell" role="alert">
      <div className="empty-panel"><p className="eyebrow">Something went wrong</p><h1>読み込みに失敗しました</h1>
      <p>一時的な問題の可能性があります。もう一度お試しください。</p>
      <button type="button" onClick={() => unstable_retry()} className="button">
        もう一度試す
      </button></div>
    </main>
  )
}
