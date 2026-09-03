import type { Database } from "@/types/database.types"

export const MAX_TIMELINE_MARKERS = 500
export const MAX_MARKER_NAME_LENGTH = 100
export const MAX_MARKER_PAGE = 10_000
export const DRAFT_SCHEMA_VERSION = 1

export type Marker = {
    id: string
    time: number
    page: number
    text?: string
    name?: string
}
export type LegacyMarker = Omit<Marker, "id"> & { id?: string | null }
export type PlayerMarker = Marker & { end_time?: number }
export type TimelineDraft = {
    schemaVersion: number
    projectId: string
    baseTimelineVersion: number
    baseUpdatedAt: string | null
    savedAt: string
    markers: Marker[]
}
type TimelineMarkerRow = Database['public']['Tables']['timeline_markers']['Row']
type TimelineMarkerInsert = Database['public']['Tables']['timeline_markers']['Insert']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isMarkerId(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value) }

export class TimelineValidationError extends Error {
    readonly code = 'timeline_validation'
    constructor(message: string) { super(message); this.name = 'TimelineValidationError' }
}
export class TimelineConflictError extends Error {
    readonly code = 'timeline_conflict'
    constructor(message = 'このタイムラインは別のタブで更新されています') { super(message); this.name = 'TimelineConflictError' }
}
export function classifyTimelineError(error: unknown): Error {
    const value = error as { code?: string; message?: string } | null
    if (value?.code === '40001' || value?.code === '23P01' || value?.code === 'P0001' || /conflict|version|同時|別の.*更新|outdated/i.test(value?.message ?? '')) return new TimelineConflictError()
    return error instanceof Error ? error : new Error('タイムラインの保存に失敗しました')
}

function makeFallbackUuid(): string {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function createMarkerId(): string {
    const randomUUID = globalThis.crypto?.randomUUID
    return randomUUID ? randomUUID.call(globalThis.crypto) : makeFallbackUuid()
}
export function normalizeMarkerName(name: unknown): string | undefined {
    if (typeof name !== 'string') return undefined
    const trimmed = name.trim()
    return trimmed ? trimmed.slice(0, MAX_MARKER_NAME_LENGTH) : undefined
}
function validMarkerShape(marker: Partial<LegacyMarker>, numPages?: number | null): boolean {
    return Number.isFinite(marker.time) && marker.time! >= 0 && Number.isInteger(marker.page)
        && marker.page! >= 1 && marker.page! <= MAX_MARKER_PAGE && (numPages == null || marker.page! <= numPages)
}

/** Read-time migration: duplicate starts keep the first sorted row and its first non-empty name. */
export function normalizeMarkers(input: readonly LegacyMarker[] | null | undefined, numPages?: number | null): Marker[] {
    const seenIds = new Set<string>()
    const candidates = (input ?? []).flatMap((source, index) => {
        if (!validMarkerShape(source, numPages)) return []
        const id = isMarkerId(source.id) && !seenIds.has(source.id) ? source.id : createMarkerId()
        seenIds.add(id)
        return [{ id, time: source.time!, page: source.page!, name: normalizeMarkerName(source.name), _index: index }]
    })
    candidates.sort((a, b) => a.time - b.time || a._index - b._index || a.id.localeCompare(b.id))
    const merged: Marker[] = []
    for (const candidate of candidates) {
        const previous = merged.at(-1)
        if (candidate.time === 0) {
            if (previous?.time === 0) { if (!previous.name && candidate.name) previous.name = candidate.name; continue }
            merged.push({ id: candidate.id, time: 0, page: 1, name: candidate.name })
            continue
        }
        if (previous && previous.time === candidate.time) { if (!previous.name && candidate.name) previous.name = candidate.name; continue }
        merged.push({ id: candidate.id, time: candidate.time, page: candidate.page, name: candidate.name })
    }
    if (!merged[0] || merged[0].time !== 0 || merged[0].page !== 1) merged.unshift({ id: createMarkerId(), time: 0, page: 1 })
    return merged.slice(0, MAX_TIMELINE_MARKERS)
}

export function validateMarkers(markers: readonly Marker[], duration: number, numPages?: number | null): void {
    if (!Number.isFinite(duration) || duration <= 0) throw new TimelineValidationError('音源の長さを取得できないため保存できません。音源の読み込みを待ってください。')
    if (markers.length === 0) throw new TimelineValidationError('タイムラインにはマーカーが必要です')
    if (markers.length > MAX_TIMELINE_MARKERS) throw new TimelineValidationError(`マーカーは${MAX_TIMELINE_MARKERS}件以内にしてください`)
    const ids = new Set<string>(); let previousTime = -1
    for (const [index, marker] of markers.entries()) {
        if (!isMarkerId(marker.id)) throw new TimelineValidationError('マーカーIDが不正です')
        if (ids.has(marker.id)) throw new TimelineValidationError('マーカーIDが重複しています')
        ids.add(marker.id)
        if (!Number.isFinite(marker.time) || marker.time < 0 || marker.time >= duration) throw new TimelineValidationError('マーカー時刻は音源の長さより前の有限値にしてください')
        if (!Number.isInteger(marker.page) || marker.page < 1 || marker.page > MAX_MARKER_PAGE || (numPages != null && marker.page > numPages)) throw new TimelineValidationError(`ページ番号は1〜${numPages ?? MAX_MARKER_PAGE}の整数にしてください`)
        if (marker.time <= previousTime) throw new TimelineValidationError('マーカー時刻は重複せず昇順にしてください')
        if (index === 0 && (marker.time !== 0 || marker.page !== 1)) throw new TimelineValidationError('最初のマーカーは0秒・1ページ目にしてください')
        if (marker.name && marker.name.length > MAX_MARKER_NAME_LENGTH) throw new TimelineValidationError(`マーカー名は${MAX_MARKER_NAME_LENGTH}文字以内にしてください`)
        previousTime = marker.time
    }
}
export function addMarker(markers: readonly Marker[], time: number, page: number, numPages?: number | null): Marker[] {
    if (!Number.isFinite(time) || time < 0) throw new TimelineValidationError('マーカー時刻が不正です')
    if (!Number.isInteger(page) || page < 1 || page > MAX_MARKER_PAGE || (numPages != null && page > numPages)) throw new TimelineValidationError('ページ番号が不正です')
    if (markers.length >= MAX_TIMELINE_MARKERS) throw new TimelineValidationError(`マーカーは${MAX_TIMELINE_MARKERS}件以内にしてください`)
    if (markers.some((marker) => marker.time === time)) throw new TimelineValidationError('同じ時刻のマーカーは追加できません')
    return normalizeMarkers([...markers, { id: createMarkerId(), time, page }], numPages)
}
export function deleteMarkerById(markers: readonly Marker[], id: string): Marker[] {
    return markers.filter((marker) => marker.id !== id || (marker.time === 0 && marker.page === 1))
}
export function updateMarkerById(markers: readonly Marker[], id: string, name: string): Marker[] {
    return markers.map((marker) => marker.id === id ? { ...marker, name: normalizeMarkerName(name) } : marker)
}
export function resetMarkers(): Marker[] { return [{ id: createMarkerId(), time: 0, page: 1 }] }

export function convertMarkersToDbPayload(markers: Marker[], projectId: string, duration?: number, numPages?: number | null): TimelineMarkerInsert[] {
    if (duration === undefined) throw new TimelineValidationError('音源の長さを取得できないため保存できません。音源の読み込みを待ってください。')
    const sorted = [...markers].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)); validateMarkers(sorted, duration, numPages)
    return sorted.map((marker, index) => ({ id: marker.id, project_id: projectId, page_number: marker.page, start_time: marker.time, end_time: index < sorted.length - 1 ? sorted[index + 1].time : duration, name: normalizeMarkerName(marker.name) ?? null }))
}
export function convertDbRowsToMarkers(rows: TimelineMarkerRow[], numPages?: number | null): Marker[] {
    return normalizeMarkers(rows.map((row) => ({ id: row.id, time: row.start_time, page: row.page_number, name: row.name ?? undefined })), numPages)
}
export function convertDbRowsToPlayerMarkers(rows: TimelineMarkerRow[], duration?: number): PlayerMarker[] {
    const normalized = convertDbRowsToMarkers(rows)
    const byId = new Map(rows.map((row) => [row.id, row]))
    return normalized.map((marker, index) => {
        const next = normalized[index + 1]
        const legacyEnd = byId.get(marker.id)?.end_time
        const finalEnd = !next && Number.isFinite(legacyEnd) && legacyEnd! > marker.time ? legacyEnd : undefined
        return { ...marker, end_time: next?.time ?? finalEnd ?? (Number.isFinite(duration) && duration! > marker.time ? duration : undefined) }
    })
}

export function timelineDraftKey(projectId: string): string { return `loqon:timeline-draft:${projectId}` }
export function parseTimelineDraft(raw: string | null, projectId: string): TimelineDraft | null {
    if (!raw) return null
    try {
        const value = JSON.parse(raw) as Partial<TimelineDraft>
        if (value.schemaVersion !== DRAFT_SCHEMA_VERSION || value.projectId !== projectId || !Array.isArray(value.markers) || !Number.isInteger(value.baseTimelineVersion) || typeof value.savedAt !== 'string') return null
        const baseTimelineVersion = Number(value.baseTimelineVersion)
        const savedAt = value.savedAt
        if (baseTimelineVersion < 0 || !Number.isFinite(Date.parse(savedAt))) return null
        if (value.baseUpdatedAt !== null && value.baseUpdatedAt !== undefined && (typeof value.baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(value.baseUpdatedAt)))) return null
        return { schemaVersion: DRAFT_SCHEMA_VERSION, projectId, baseTimelineVersion, baseUpdatedAt: typeof value.baseUpdatedAt === 'string' ? value.baseUpdatedAt : null, savedAt, markers: normalizeMarkers(value.markers as LegacyMarker[]) }
    } catch { return null }
}
export function serializeTimelineDraft(draft: Omit<TimelineDraft, 'schemaVersion'>): string { return JSON.stringify({ ...draft, schemaVersion: DRAFT_SCHEMA_VERSION }) }
export function markersEqual(left: readonly Marker[], right: readonly Marker[]): boolean { return JSON.stringify(left) === JSON.stringify(right) }
export function shouldOfferDraftRestore(draft: TimelineDraft | null, baseVersion: number, baseUpdatedAt: string | null, baseMarkers: readonly Marker[]): boolean {
    if (!draft || markersEqual(draft.markers, baseMarkers)) return false
    const draftSaved = Date.parse(draft.savedAt); const loadedBase = baseUpdatedAt ? Date.parse(baseUpdatedAt) : NaN
    if (Number.isFinite(draftSaved) && Number.isFinite(loadedBase)) return draftSaved > loadedBase
    return draft.baseTimelineVersion >= baseVersion
}
