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
        <div className="project-frame">
            <div className="project-header">
                <div className="project-header-main">
                    <h1>{project.title || '名称未設定プロジェクト'}</h1>
                    <span className="project-header-id">EDITOR / {projectId.slice(0, 8)}</span>
                </div>
                <Link
                    href={`/${projectId}/settings`}
                    className="console-link"
                >
                    <svg className="console-icon" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" /><path d="m19 13.5 1.2 1-.1 1.8-1.7 1-1.5-.6a8 8 0 0 1-1.3.8l-.4 1.6-1.6.7-1.4-1a8 8 0 0 1-1.6 0l-1.4 1-1.6-.7-.4-1.6a8 8 0 0 1-1.3-.8l-1.5.6-1.7-1 .1-1.8 1.2-1a8 8 0 0 1 0-1.7l-1.2-1 .1-1.8 1.7-1 1.5.6a8 8 0 0 1 1.3-.8l.4-1.6 1.6-.7 1.4 1a8 8 0 0 1 1.6 0l1.4-1 1.6.7.4 1.6a8 8 0 0 1 1.3.8l1.5-.6 1.7 1-.1 1.8-1.2 1a8 8 0 0 1 0 1.7Z" /></svg> <span className="console-label">設定</span>
                </Link>
            </div>

            <div className="console-content">
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
