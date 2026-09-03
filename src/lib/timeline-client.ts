import { supabase } from '@/lib/supabase'
import { convertDbRowsToMarkers, type Marker } from '@/lib/timeline'
import type { Database } from '@/types/database.types'

type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']
export type ClientTimelineSnapshot = { markers: Marker[]; version: number; updatedAt: string | null }

export async function getClientTimelineSnapshot(projectId: string): Promise<ClientTimelineSnapshot> {
  const { data, error } = await supabase.rpc('get_public_timeline_snapshot', { p_project_id: projectId })
  if (error) throw new Error('タイムラインの読み込みに失敗しました')
  const snapshot = data as { markers?: TimelineMarkerRow[]; version?: number; updated_at?: string | null } | null
  return {
    markers: convertDbRowsToMarkers(Array.isArray(snapshot?.markers) ? snapshot.markers : []),
    version: Number.isInteger(snapshot?.version) ? Number(snapshot?.version) : 0,
    updatedAt: typeof snapshot?.updated_at === 'string' ? snapshot.updated_at : null,
  }
}
