import { ProjectForm } from '@/components/ProjectForm'
import { getPublicProject } from '@/lib/projects'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function SettingsPage({ params }: Props) {
    const { projectId } = await params;

    const project = await getPublicProject(projectId)
    if (!project) notFound()

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 flex flex-col items-center">
            <div className="w-full max-w-xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold">⚙️ プロジェクト設定</h1>
                    <p className="text-zinc-500 text-sm mt-1">プロジェクトID: {projectId}</p>
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { projectId } = await params
    const project = await getPublicProject(projectId)
    if (!project) notFound()
    const title = project.title?.trim() || '名称未設定プロジェクト'
    return { title: `設定: ${title} | Loqon` }
}
