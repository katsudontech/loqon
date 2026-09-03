import 'server-only'

import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'
import { convertDbRowsToMarkers, type Marker } from '@/lib/timeline'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']

export type PublicTimelineSnapshot = {
  markers: Marker[]
  version: number
  updatedAt: string | null
}

export type PublicProject = Pick<
  ProjectRow,
  'id' | 'title' | 'audio_url' | 'pdf_url' | 'created_at'
>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const getPublicProject = cache(async (projectId: string): Promise<PublicProject | null> => {
  if (!uuidPattern.test(projectId)) return null

  const { data, error } = await supabase
    .rpc('get_public_project', { p_project_id: projectId })
    .maybeSingle()

  if (error) {
    console.error('プロジェクト取得エラー:', error)
    throw new Error('プロジェクトの読み込みに失敗しました')
  }

  return data
})

export async function getPublicTimelineMarkers(
  projectId: string,
): Promise<TimelineMarkerRow[]> {
  if (!uuidPattern.test(projectId)) return []

  const { data, error } = await supabase.rpc('get_public_timeline_markers', {
    p_project_id: projectId,
  })

  if (error) {
    console.error('タイムライン取得エラー:', error)
    throw new Error('タイムラインの読み込みに失敗しました')
  }

  return data ?? []
}

export async function getPublicTimelineSnapshot(projectId: string): Promise<PublicTimelineSnapshot> {
  if (!uuidPattern.test(projectId)) return { markers: [], version: 0, updatedAt: null }
  const { data, error } = await supabase.rpc('get_public_timeline_snapshot', { p_project_id: projectId })
  if (error) {
    console.error('タイムラインスナップショット取得エラー:', error)
    throw new Error('タイムラインの読み込みに失敗しました')
  }
  const snapshot = data as { markers?: TimelineMarkerRow[]; version?: number; updated_at?: string | null } | null
  return {
    markers: convertDbRowsToMarkers(Array.isArray(snapshot?.markers) ? snapshot.markers : []),
    version: Number.isInteger(snapshot?.version) ? Number(snapshot?.version) : 0,
    updatedAt: typeof snapshot?.updated_at === 'string' ? snapshot.updated_at : null,
  }
}
