import { supabase } from "@/lib/supabase"
import { EditorContainer } from "@/components/EditorContainer"
import Link from "next/link"
import { convertDbRowsToMarkers } from "@/lib/timeline"

type Props = {
    params: Promise<{ projectId: string }>
}

export default async function EditPage({ params }: Props) {
    const { projectId } = await params;

    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    if (error) return <div className="p-8 text-red-500">Error: {error.message}</div>
    if (!project) return <div className="p-8">Project not found</div>

    const pdfUrl = project.pdf_url;
    const audioUrl = project.audio_url;

    const { data: timelines, error: timelinesError } = await supabase
        .from('timeline_markers')
        .select('*')
        .eq('project_id', projectId);

    if (timelinesError) return <div className="p-8 text-red-500">Error: {timelinesError.message}</div>
    const initialMarkers = timelines ? convertDbRowsToMarkers(timelines) : [];

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold">{project.title || 'Edit Project'}</h1>
                    <p className="text-zinc-500 text-sm mt-1">Project ID: {projectId}</p>
                </div>
                <Link
                    href={`/${projectId}/settings`}
                    className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex items-center gap-2"
                >
                    <span>⚙️</span> 設定
                </Link>
            </div>

            <EditorContainer
                audioUrl={audioUrl}
                pdfUrl={pdfUrl}
                initialMarkers={initialMarkers}
                projectId={projectId}
            />
        </div>
    )
}