import { ProjectForm } from '@/components/ProjectForm'
import Link from 'next/link'

export default function CreatePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none" />
      
      <div className="w-full max-w-xl z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">新しいプロジェクト</h1>
          <p className="text-zinc-400">音源と構成図（PDF）をアップロードして準備を始めましょう。</p>
        </div>

        <ProjectForm />

        <div className="text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
