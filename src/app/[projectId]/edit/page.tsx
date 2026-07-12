import { supabase } from "@/lib/supabase"
import { EditorContainer } from "@/components/EditorContainer"

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

    // 後で timelines テーブルから取得する処理を追加しますが、今は空配列を渡します
    const initialMarkers: any[] = [];

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl font-bold">{project.title || 'Edit Project'}</h1>
                    <p className="text-zinc-500 text-sm mt-1">Project ID: {projectId}</p>
                </div>
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