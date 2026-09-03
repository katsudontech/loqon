import { getPublicProject, getPublicTimelineMarkers } from "@/lib/projects"
import { convertDbRowsToPlayerMarkers } from "@/lib/timeline"
import { PlayerContainer } from "@/components/PlayerContainer"
import { ShareButton } from "@/components/ShareButton"
import { RecentProjectTracker } from "@/components/RecentProjectTracker"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function PlayerPage({ params }: Props) {
    const { projectId } = await params;

    const project = await getPublicProject(projectId)

    if (!project) notFound()

    const markersData = await getPublicTimelineMarkers(projectId)

    // DBのtimeline_markers形式を、Playerで扱いやすいMarker型にマッピングする
    const markers = convertDbRowsToPlayerMarkers(markersData)

    return (
        <div className="h-[calc(100dvh-4rem)] w-full bg-zinc-950 flex flex-col overflow-hidden">
            <RecentProjectTracker projectId={projectId} title={project.title || ''} />
            
            {/* Header: fixed height */}
            <div className="w-full shrink-0 flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950 z-10">
                <div className="flex-1 min-w-0 mr-4">
                    <h1 className="text-xl font-bold text-white truncate">{project.title || '名称未設定プロジェクト'}</h1>
                    <p className="text-zinc-500 text-xs mt-1">プレイヤーモード</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <ShareButton />
                    <a
                        href={`/${projectId}/edit`}
                        className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 bg-indigo-500/10 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-indigo-500/30"
                    >
                        <span>✏️</span> <span className="hidden sm:inline">エディタ</span>
                    </a>
                </div>
            </div>

            {/* Player Container takes remaining space */}
            <div className="flex-1 w-full overflow-hidden relative">
                <PlayerContainer
                    audioUrl={project.audio_url}
                    pdfUrl={project.pdf_url}
                    markers={markers}
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
    return { title: `${title} | Loqon`, description: `${title}のダンス練習プレイヤー` }
}
