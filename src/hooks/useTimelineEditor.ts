'use client'
import { useCallback, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { addMarker, classifyTimelineError, convertMarkersToDbPayload, deleteMarkerById, markersEqual, normalizeMarkers, resetMarkers, updateMarkerById, type LegacyMarker, type Marker } from '@/lib/timeline'

type Options = { numPages?: number | null; initialVersion?: number; initialUpdatedAt?: string | null }
export const useTimelineEditor = (initialMarkers: readonly LegacyMarker[] = [], options: Options = {}) => {
    const normalizedInitial = useMemo(() => normalizeMarkers(initialMarkers, options.numPages), [initialMarkers, options.numPages])
    const [markers, setMarkers] = useState<Marker[]>(normalizedInitial)
    const [baseline, setBaseline] = useState<Marker[]>(normalizedInitial)
    const [timelineVersion, setTimelineVersion] = useState(options.initialVersion ?? 0)
    const [validationError, setValidationError] = useState('')
    const dirty = !markersEqual(markers, baseline)
    const recordMarker = useCallback((time: number, page: number) => {
        try { setMarkers((previous) => addMarker(previous, time, page, options.numPages)); setValidationError(''); return true }
        catch (error) { setValidationError(error instanceof Error ? error.message : 'マーカーを追加できません'); return false }
    }, [options.numPages])
    const deleteMarker = useCallback((id: string) => { setMarkers((previous) => deleteMarkerById(previous, id)) }, [])
    const updateMarkerName = useCallback((id: string, name: string) => { setMarkers((previous) => updateMarkerById(previous, id, name)); setValidationError('') }, [])
    const clearMarkers = useCallback(() => { setMarkers(resetMarkers()); setValidationError('') }, [])
    const replaceMarkersFromRemote = useCallback((nextMarkers: readonly LegacyMarker[], version: number) => { const normalized = normalizeMarkers(nextMarkers, options.numPages); setMarkers(normalized); setBaseline(normalized); setTimelineVersion(version); setValidationError('') }, [options.numPages])
    const restoreMarkers = useCallback((nextMarkers: readonly LegacyMarker[]) => { setMarkers(normalizeMarkers(nextMarkers, options.numPages)); setValidationError('') }, [options.numPages])
    const saveMarkers = useCallback(async (projectId: string, duration: number, force = false) => {
        const payload = convertMarkersToDbPayload(markers, projectId, duration, options.numPages)
        const { data, error } = await supabase.rpc('replace_timeline_markers', { p_project_id: projectId, p_markers: payload, p_expected_version: timelineVersion, p_duration: duration, p_force: force })
        if (error) throw classifyTimelineError(error)
        const nextVersion = typeof data === 'number' ? data : timelineVersion + 1
        setTimelineVersion(nextVersion); setBaseline(markers); setValidationError(''); return nextVersion
    }, [markers, options.numPages, timelineVersion])
    return { markers, dirty, baseline, timelineVersion, validationError, recordMarker, deleteMarker, updateMarkerName, clearMarkers, saveMarkers, replaceMarkersFromRemote, restoreMarkers, setValidationError }
}
