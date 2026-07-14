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
        <div className="h-[calc(100dvh-4rem)] w-full bg-zinc-950 flex flex-col overflow-hidden">
            <div className="w-full shrink-0 flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950 z-10">
                <div className="flex-1 min-w-0 mr-4">
                    <h1 className="text-xl font-bold text-white truncate">{project.title || 'Edit Project'}</h1>
                    <p className="text-zinc-500 text-xs mt-1">Project ID: {projectId}</p>
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
                    initialMarkers={initialMarkers}
                    projectId={projectId}
                />
            </div>
        </div>
    )
}