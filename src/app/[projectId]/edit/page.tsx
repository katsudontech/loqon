import { getPublicProject, getPublicTimelineSnapshot } from "@/lib/projects"
import { EditorContainer } from "@/components/EditorContainer"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function EditPage({ params }: Props) {
    const { projectId } = await params;

    const project = await getPublicProject(projectId)
    if (!project) notFound()

    const pdfUrl = project.pdf_url;
    const audioUrl = project.audio_url;

    const timeline = await getPublicTimelineSnapshot(projectId)

    return (
        <div className="h-[calc(100dvh-4rem)] w-full bg-zinc-950 flex flex-col overflow-hidden">
            <div className="w-full shrink-0 flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950 z-10">
                <div className="flex-1 min-w-0 mr-4">
                    <h1 className="text-xl font-bold text-white truncate">{project.title || '名称未設定プロジェクト'}</h1>
                    <p className="text-zinc-500 text-xs mt-1">プロジェクトID: {projectId}</p>
                </div>
                <Link
                    href={`/${projectId}/settings`}
                    className="text-sm px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                >
                    <span>⚙️</span> <span className="hidden sm:inline">設定</span>
                </Link>
            </div>

            <div className="flex-1 w-full overflow-hidden relative">
                <EditorContainer
                    audioUrl={audioUrl}
                    pdfUrl={pdfUrl}
                    initialMarkers={timeline.markers}
                    initialVersion={timeline.version}
                    initialUpdatedAt={timeline.updatedAt}
                    projectId={projectId}
                />
            </div>
        </div>
    )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { projectId } = await params
    const project = await getPublicProject(projectId)
    if (!project) notFound()
    const title = project.title?.trim() || '名称未設定プロジェクト'
    return { title: `編集: ${title} | Loqon` }
}
