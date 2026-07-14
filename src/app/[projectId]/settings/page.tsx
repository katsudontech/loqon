import { saveProject } from '@/app/actions'
import { SubmitButton } from '@/components/SubmitButton'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function SettingsPage({ params }: Props) {
    const { projectId } = await params;

    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>
    if (!project) return <div className="p-8">Project not found</div>

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 flex flex-col items-center">
            <div className="w-full max-w-xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold">⚙️ プロジェクト設定</h1>
                    <p className="text-zinc-500 text-sm mt-1">Project ID: {projectId}</p>
                </div>
                <Link href={`/${projectId}/edit`} className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors">
                    編集画面に戻る
                </Link>
            </div>

            <div className="w-full max-w-xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <form action={saveProject.bind(null, projectId)} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
                    
                    <div className="space-y-2">
                        <label htmlFor="title" className="block text-sm font-medium text-zinc-300">
                            プロジェクト名
                        </label>
                        <input
                            type="text"
                            id="title"
                            name="title"
                            defaultValue={project.title || ''}
                            placeholder="例: 2026 Showcase HipHop"
                            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-zinc-600 transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="audio" className="block text-sm font-medium text-zinc-300">
                            音源ファイル <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>
                        </label>
                        <input
                            type="file"
                            id="audio"
                            name="audio"
                            accept="audio/*"
                            className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                        />
                        {project.audio_url && (
                            <p className="text-xs text-zinc-500 mt-2 truncate">現在のファイル: <a href={project.audio_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">リンクを開く</a></p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="pdf" className="block text-sm font-medium text-zinc-300">
                            構成図 (PDF) <span className="text-zinc-500 text-xs ml-2">※変更する場合のみ選択</span>
                        </label>
                        <input
                            type="file"
                            id="pdf"
                            name="pdf"
                            accept="application/pdf"
                            className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                        />
                        {project.pdf_url && (
                            <p className="text-xs text-zinc-500 mt-2 truncate">現在のファイル: <a href={project.pdf_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">リンクを開く</a></p>
                        )}
                    </div>

                    <div className="pt-4">
                        <SubmitButton idleText="設定を更新する" pendingText="更新中..." />
                    </div>
                </form>
            </div>
        </div>
    )
}
