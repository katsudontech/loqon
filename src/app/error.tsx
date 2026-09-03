'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/reportClientError'

type Props = { error: Error & { digest?: string }; unstable_retry: () => void }

export default function AppError({ error, unstable_retry }: Props) {
  useEffect(() => {
    reportClientError(error, 'アプリ画面エラー')
  }, [error])

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="alert">
      <h1 className="text-2xl font-bold text-white">読み込みに失敗しました</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-400">一時的な問題の可能性があります。もう一度お試しください。</p>
      <button type="button" onClick={() => unstable_retry()} className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
        もう一度試す
      </button>
    </main>
  )
}
