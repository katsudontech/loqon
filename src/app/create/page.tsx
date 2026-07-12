import { createProject } from './actions'
import { SubmitButton } from './SubmitButton'
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

        {/* Server Action を action 属性に指定 */}
        <form action={createProject} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          
          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300">
              プロジェクト名 (任意)
            </label>
            <input
              type="text"
              id="title"
              name="title"
              placeholder="例: 2026 Showcase HipHop"
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-zinc-600 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="audio" className="block text-sm font-medium text-zinc-300">
              音源ファイル <span className="text-red-400">*</span>
            </label>
            <input
              type="file"
              id="audio"
              name="audio"
              accept="audio/*"
              required
              className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pdf" className="block text-sm font-medium text-zinc-300">
              構成図 (PDF) <span className="text-red-400">*</span>
            </label>
            <input
              type="file"
              id="pdf"
              name="pdf"
              accept="application/pdf"
              required
              className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
            />
          </div>

          <div className="pt-4">
            <SubmitButton />
          </div>
        </form>

        <div className="text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
