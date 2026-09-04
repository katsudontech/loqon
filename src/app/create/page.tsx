import { ProjectForm } from '@/components/ProjectForm'
import Link from 'next/link'

export default function CreatePage() {
  return (
    <div className="page-shell narrow">
      <div>
          <p className="eyebrow">New project</p>
          <h1 className="page-title">新しいプロジェクト</h1>
          <p className="page-lede">音源と構成図（PDF）を登録して、チームの練習画面を準備します。</p>
      </div>

      <div className="mt-8"><ProjectForm /></div>

      <div className="mt-6 text-center">
          <Link href="/" className="text-link text-sm">
            トップページに戻る
          </Link>
      </div>
    </div>
  )
}
