'use client'
import { useState } from "react"
import { supabase } from "@/lib/supabase"

export type Marker = {
    id?: string
    time: number
    page: number
    text?: string
}

export const useTimelineEditor = (initialMarkers: Marker[] = []) => {
    // 初期状態：もし空っぽなら、必ず「1ページ目が0秒から始まる」マーカーを入れておく
    const defaultMarkers = initialMarkers.length > 0 ? initialMarkers : [{ time: 0, page: 1 }]

    const [markers, setMarkers] = useState<Marker[]>(defaultMarkers)

    const recordMarker = (time: number, page: number) => {
        setMarkers(prev => [...prev, { time, page }])
    }

    const deleteMarker = (time: number, page: number) => {
        // 0秒・1ページ目のマーカーは削除できないように保護する
        if (time === 0 && page === 1) return;
        setMarkers(prev => prev.filter(m => m.time !== time || m.page !== page))
    }

    const clearMarkers = () => {
        // 全削除した時も、1ページ目のマーカーだけは残す
        setMarkers([{ time: 0, page: 1 }])
    }

    const saveMarkers = async (projectId: string) => {

        const sorted = [...markers].sort((a, b) => a.time - b.time)

        // DBに保存する形式に変換（end_timeを計算）
        const payload = sorted.map((m, i) => {
            // 最後のマーカーでなければ次のマーカーの開始時刻、最後なら超長い時間(99999)をend_timeにする
            const endTime = i < sorted.length - 1 ? sorted[i + 1].time : 99999;

            return {
                // id は新規作成時に自動生成されるため、あえて外しておくか、ある場合のみ渡す
                ...(m.id ? { id: m.id } : {}),
                project_id: projectId,
                page_number: m.page,
                start_time: m.time,
                end_time: endTime,
            }
        })

        await supabase.from('timeline_markers').delete().eq('project_id', projectId)
        const { data, error } = await supabase.from('timeline_markers').insert(payload)

        if (error) {
            console.error('保存エラー:', error)
        } else {
            console.log('✅保存完了:', { data })
        }
    }

    return {
        markers,
        recordMarker,
        deleteMarker,
        clearMarkers,
        saveMarkers
    }
}
