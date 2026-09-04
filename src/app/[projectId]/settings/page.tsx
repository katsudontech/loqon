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
        <div className="page-shell narrow">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Project settings</p>
                    <h1 className="page-title">プロジェクト設定</h1>
                    <p className="page-lede">プロジェクト名、音源、構成図を更新します。</p>
                </div>
                <Link href={`/${projectId}/edit`} className="button-quiet">
                    編集画面に戻る
                </Link>
            </div>

            <div className="mt-8">
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
