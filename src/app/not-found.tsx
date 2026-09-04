import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page-shell"><div className="empty-panel">
      <p className="eyebrow">404</p>
      <h1>ページが見つかりません</h1>
      <p>URLを確認するか、トップページからお試しください。</p>
      <Link href="/" className="button">
        トップページへ
      </Link></div>
    </main>
  )
}
