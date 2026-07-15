import { ProjectForm } from '@/components/ProjectForm'
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
                <ProjectForm project={project} />
            </div>
        </div>
    )
}
