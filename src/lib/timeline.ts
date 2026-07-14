import type { Database } from "@/types/database.types"

export type Marker = {
    id?: string
    time: number
    page: number
    text?: string
}

type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']
type TimelineMarkerInsert = Database['public']['Tables']['timeline_markers']['Insert']

// 1. Marker[] から DBに保存する形式(Insert[]) への変換
export const convertMarkersToDbPayload = (markers: Marker[], projectId: string): TimelineMarkerInsert[] => {
    const sorted = [...markers].sort((a, b) => a.time - b.time)

    return sorted.map((m, i) => {
        // 最後のマーカーでなければ次のマーカーの開始時刻、最後なら超長い時間(99999)をend_timeにする
        const endTime = i < sorted.length - 1 ? sorted[i + 1].time : 99999;

        return {
            ...(m.id ? { id: m.id } : {}),
            project_id: projectId,
            page_number: m.page,
            start_time: m.time,
            end_time: endTime,
        }
    })
}

// 2. DBのデータ(Row[]) から Marker[] への変換
export const convertDbRowsToMarkers = (rows: TimelineMarkerRow[]): Marker[] => {
    return rows.map(row => ({
        id: row.id,
        time: row.start_time,
        page: row.page_number,
    }))
}
