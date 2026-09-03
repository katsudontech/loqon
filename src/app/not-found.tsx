import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-indigo-300">404</p>
      <h1 className="mt-3 text-2xl font-bold text-white">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-zinc-400">URLを確認するか、トップページからお試しください。</p>
      <Link href="/" className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
        トップページへ
      </Link>
    </main>
  )
}
