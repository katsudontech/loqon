import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublicProject, getPublicTimelineSnapshot } from '@/lib/projects'
import { PartsEditorContainer } from '@/components/PartsEditorContainer'

type Props = { params: Promise<{ projectId: string }> }

export default async function PartsPage({ params }: Props) {
  const { projectId } = await params
  const project = await getPublicProject(projectId)
  if (!project) notFound()
  const timeline = await getPublicTimelineSnapshot(projectId)
  return <div className="project-frame"><div className="project-header"><div className="project-header-main"><h1>{project.title || '名称未設定プロジェクト'}</h1><span className="project-header-id">パートを分ける / {projectId.slice(0, 8)}</span></div><Link href={`/${projectId}`} className="console-link flow-link">練習する</Link></div><div className="console-content"><PartsEditorContainer projectId={projectId} audioUrl={project.audio_url} pdfUrl={project.pdf_url} cues={timeline.compositionCues} initialParts={timeline.practiceParts} initialVersion={timeline.practiceVersion} initialUpdatedAt={timeline.practiceUpdatedAt} /></div></div>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params
  const project = await getPublicProject(projectId)
  if (!project) notFound()
  return { title: `パートを分ける: ${project.title?.trim() || '名称未設定プロジェクト'} | Loqon` }
}
