import { supabase } from "@/lib/supabase"
import { PlayerContainer } from "@/components/PlayerContainer"
import { ShareButton } from "@/components/ShareButton"

type Props = {
  params: Promise<{ projectId: string }>
}

export default async function PlayerPage({ params }: Props) {
    const { projectId } = await params;

    // プロジェクト本体の取得
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    if (projectError || !project) {
        return <div className="p-8 text-red-500">Project not found</div>
    }

    // マーカー一覧の取得（start_timeで昇順ソート）
    const { data: markersData, error: markersError } = await supabase
        .from('timeline_markers')
        .select('*')
        .eq('project_id', projectId)
        .order('start_time', { ascending: true })
    
    if (markersError) {
        console.error("Error fetching markers:", markersError)
    }

    // DBのtimeline_markers形式を、Playerで扱いやすいMarker型にマッピングする
    const markers = (markersData || []).map(m => ({
        id: m.id,
        page: m.page_number,
        time: m.start_time,
        end_time: m.end_time
    }))

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">{project.title || 'Untitled Project'}</h1>
                    <p className="text-zinc-500 text-sm mt-2">Player Mode</p>
                </div>
                <div className="flex items-center gap-3">
                    <ShareButton />
                    <a 
                        href={`/${projectId}/edit`}
                        className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-2 bg-indigo-500/10 px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-indigo-500/30"
                    >
                        <span>✏️</span> エディタを開く
                    </a>
                </div>
            </div>
            
            <PlayerContainer 
                audioUrl={project.audio_url} 
                pdfUrl={project.pdf_url} 
                markers={markers}
            />
        </div>
    )
}
