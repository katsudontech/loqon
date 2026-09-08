import { supabase } from '@/lib/supabase'
import { convertDbRowsToMarkers, migrateLegacyMarkers, type Marker, type CompositionCue, type PracticePart } from '@/lib/timeline'
import type { Database } from '@/types/database.types'

type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']
export type ClientTimelineSnapshot = { markers: Marker[]; compositionCues: CompositionCue[]; practiceParts: PracticePart[]; version: number; updatedAt: string | null; compositionVersion: number; compositionUpdatedAt: string | null; practiceVersion: number; practiceUpdatedAt: string | null }

export async function getClientTimelineSnapshot(projectId: string): Promise<ClientTimelineSnapshot> {
  const { data, error } = await supabase.rpc('get_public_timeline_snapshot', { p_project_id: projectId })
  if (error) throw new Error('タイムラインの読み込みに失敗しました')
  const snapshot = data as { markers?: TimelineMarkerRow[]; version?: number; updated_at?: string | null } | null
  const legacyRows = Array.isArray(snapshot?.markers) ? snapshot.markers : []
  const markers = convertDbRowsToMarkers(legacyRows)
  const migrated = migrateLegacyMarkers(legacyRows.map((row) => ({ id: row.id, time: row.start_time, page: row.page_number, end_time: row.end_time, name: row.name ?? undefined })))
  const value = (snapshot ?? {}) as Record<string, unknown>
  return {
    markers,
    compositionCues: Array.isArray(value.composition_cues) && value.composition_cues.length > 0 ? value.composition_cues.map((cue) => { const item = cue as Record<string, unknown>; return { id: String(item.id), time: Number(item.time ?? item.start_time), page: Number(item.page ?? item.page_number), name: typeof item.name === 'string' ? item.name : undefined } }) : migrated.compositionCues,
    practiceParts: Array.isArray(value.practice_parts) && value.practice_parts.length > 0 ? value.practice_parts.map((part) => { const item = part as Record<string, unknown>; return { id: String(item.id), startTime: Number(item.startTime ?? item.start_time), endTime: Number(item.endTime ?? item.end_time), name: typeof item.name === 'string' ? item.name : undefined, startPage: Number.isInteger(item.start_page) ? Number(item.start_page) : undefined, endPage: Number.isInteger(item.end_page) ? Number(item.end_page) : undefined } }) : migrated.practiceParts,
    version: Number.isInteger(value.version) ? Number(value.version) : 0,
    updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null,
    compositionVersion: Number.isInteger(value.composition_version) ? Number(value.composition_version) : Number(value.version ?? 0),
    compositionUpdatedAt: typeof value.composition_updated_at === 'string' ? value.composition_updated_at : (typeof value.updated_at === 'string' ? value.updated_at : null),
    practiceVersion: Number.isInteger(value.practice_version) ? Number(value.practice_version) : Number(value.version ?? 0),
    practiceUpdatedAt: typeof value.practice_updated_at === 'string' ? value.practice_updated_at : (typeof value.updated_at === 'string' ? value.updated_at : null),
  }
}
