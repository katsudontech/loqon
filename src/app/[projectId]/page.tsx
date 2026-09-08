import { getPublicProject, getPublicTimelineSnapshot } from "@/lib/projects"
import { PlayerContainer } from "@/components/PlayerContainer"
import { ShareButton } from "@/components/ShareButton"
import { RecentProjectTracker } from "@/components/RecentProjectTracker"
import { OfflineProjectControl } from "@/components/OfflineProjectControl"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function PlayerPage({ params }: Props) {
    const { projectId } = await params;

    const project = await getPublicProject(projectId)

    if (!project) notFound()

    const snapshot = await getPublicTimelineSnapshot(projectId)
    const markers = snapshot.markers

    return (
        <div className="project-frame">
            <RecentProjectTracker projectId={projectId} title={project.title || ''} />
            
            {/* Header: fixed height */}
            <div className="project-header">
                <div className="project-header-main">
                    <h1>{project.title || '名称未設定プロジェクト'}</h1>
                    <span className="project-header-id">PLAYER</span>
                </div>
                <div className="project-header-actions">
                    <ShareButton />
                    <a
                        href={`/${projectId}/edit`}
                        className="console-link"
                    >
                        <svg className="console-icon" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 16-.7 4.7L8 20l11-11-4-4L4 16Z" /><path d="m13 6 4 4" /></svg> <span className="console-label">エディタ</span>
                    </a>
                </div>
            </div>

            <OfflineProjectControl project={{
                id: project.id,
                title: project.title || '名称未設定プロジェクト',
                audioUrl: project.audio_url,
                pdfUrl: project.pdf_url,
                timelineVersion: snapshot.version,
                timelineUpdatedAt: snapshot.updatedAt,
                markers,
            }} />

            {/* Player Container takes remaining space */}
            <div className="console-content">
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
