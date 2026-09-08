import 'server-only'

import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'
import { convertDbRowsToMarkers, migrateLegacyMarkers, type Marker, type CompositionCue, type PracticePart } from '@/lib/timeline'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']

export type PublicTimelineSnapshot = {
  markers: Marker[]
  compositionCues: CompositionCue[]
  practiceParts: PracticePart[]
  version: number
  updatedAt: string | null
  compositionVersion: number
  compositionUpdatedAt: string | null
  practiceVersion: number
  practiceUpdatedAt: string | null
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
  if (!uuidPattern.test(projectId)) return { markers: [], compositionCues: [], practiceParts: [], version: 0, updatedAt: null, compositionVersion: 0, compositionUpdatedAt: null, practiceVersion: 0, practiceUpdatedAt: null }
  const { data, error } = await supabase.rpc('get_public_timeline_snapshot', { p_project_id: projectId })
  if (error) {
    console.error('タイムラインスナップショット取得エラー:', error)
    throw new Error('タイムラインの読み込みに失敗しました')
  }
  const snapshot = data as ({ markers?: TimelineMarkerRow[]; version?: number; updated_at?: string | null } & Record<string, unknown>) | null
  const value = snapshot ?? {}
  const legacyRows = Array.isArray(snapshot?.markers) ? snapshot.markers : []
  const markers = convertDbRowsToMarkers(legacyRows)
  const migrated = migrateLegacyMarkers(legacyRows.map((row) => ({ id: row.id, time: row.start_time, page: row.page_number, end_time: row.end_time, name: row.name ?? undefined })))
  const rawCues = (snapshot as { composition_cues?: unknown })?.composition_cues
  const compositionCues = Array.isArray(rawCues) && rawCues.length > 0
    ? rawCues.map((cue) => { const value = cue as Record<string, unknown>; return { id: String(value.id), time: Number(value.time ?? value.start_time), page: Number(value.page ?? value.page_number), name: typeof value.name === 'string' ? value.name : undefined } })
    : migrated.compositionCues
  const rawParts = (snapshot as { practice_parts?: unknown })?.practice_parts
  const practiceParts = Array.isArray(rawParts) && rawParts.length > 0
    ? rawParts.map((part) => { const value = part as Record<string, unknown>; return { id: String(value.id), startTime: Number(value.startTime ?? value.start_time), endTime: Number(value.endTime ?? value.end_time), name: typeof value.name === 'string' ? value.name : undefined, startPage: Number.isInteger(value.start_page) ? Number(value.start_page) : undefined, endPage: Number.isInteger(value.end_page) ? Number(value.end_page) : undefined } })
    : migrated.practiceParts
  return {
    markers, compositionCues, practiceParts,
    version: Number.isInteger(value.version) ? Number(value.version) : 0,
    updatedAt: typeof value.updated_at === 'string' ? value.updated_at : null,
    compositionVersion: Number.isInteger(value.composition_version) ? Number(value.composition_version) : Number.isInteger(value.version) ? Number(value.version) : 0,
    compositionUpdatedAt: typeof value.composition_updated_at === 'string' ? value.composition_updated_at : (typeof value.updated_at === 'string' ? value.updated_at : null),
    practiceVersion: Number.isInteger(value.practice_version) ? Number(value.practice_version) : Number.isInteger(value.version) ? Number(value.version) : 0,
    practiceUpdatedAt: typeof value.practice_updated_at === 'string' ? value.practice_updated_at : (typeof value.updated_at === 'string' ? value.updated_at : null),
  }
}
