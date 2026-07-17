import { supabase } from "@/lib/supabase"
import { PlayerContainer } from "@/components/PlayerContainer"
import { ShareButton } from "@/components/ShareButton"
import { RecentProjectTracker } from "@/components/RecentProjectTracker"

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
        end_time: m.end_time,
        name: m.name || undefined
    }))

    return (
        <div className="h-[calc(100dvh-4rem)] w-full bg-zinc-950 flex flex-col overflow-hidden">
            <RecentProjectTracker projectId={projectId} title={project.title || ''} />
            
            {/* Header: fixed height */}
            <div className="w-full shrink-0 flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950 z-10">
                <div className="flex-1 min-w-0 mr-4">
                    <h1 className="text-xl font-bold text-white truncate">{project.title || 'Untitled Project'}</h1>
                    <p className="text-zinc-500 text-xs mt-1">Player Mode</p>
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
