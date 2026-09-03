import { describe, expect, it } from 'vitest'
import { convertDbRowsToMarkers, convertMarkersToDbPayload, type Marker } from '@/lib/timeline'

describe('convertMarkersToDbPayload', () => {
    it('sorts markers by time without mutating the input and uses the next marker as end_time', () => {
        const markers: Marker[] = [
            { id: 'late', time: 30, page: 3, name: 'Chorus' },
            { id: 'early', time: 10, page: 1, name: 'Intro' },
            { id: 'middle', time: 20, page: 2 },
        ]
        const original = structuredClone(markers)

        expect(convertMarkersToDbPayload(markers, 'project-1')).toEqual([
            {
                id: 'early',
                project_id: 'project-1',
                page_number: 1,
                start_time: 10,
                end_time: 20,
                name: 'Intro',
            },
            {
                id: 'middle',
                project_id: 'project-1',
                page_number: 2,
                start_time: 20,
                end_time: 30,
                name: null,
            },
            {
                id: 'late',
                project_id: 'project-1',
                page_number: 3,
                start_time: 30,
                end_time: 99999,
                name: 'Chorus',
            },
        ])
        expect(markers).toEqual(original)
    })

    it('preserves stable input order for duplicate times', () => {
        const markers: Marker[] = [
            { id: 'second', time: 10, page: 2, name: 'B' },
            { id: 'first', time: 10, page: 1, name: 'A' },
            { id: 'last', time: 20, page: 3 },
        ]

        expect(convertMarkersToDbPayload(markers, 'project-2')).toMatchObject([
            { id: 'second', start_time: 10, end_time: 10 },
            { id: 'first', start_time: 10, end_time: 20 },
            { id: 'last', start_time: 20, end_time: 99999 },
        ])
    })

    it('returns an empty payload for an empty marker list', () => {
        expect(convertMarkersToDbPayload([], 'project-3')).toEqual([])
    })

    it('omits ids for new markers and maps optional names to null', () => {
        expect(convertMarkersToDbPayload([{ time: 0, page: 1 }], 'project-4')).toEqual([
            {
                project_id: 'project-4',
                page_number: 1,
                start_time: 0,
                end_time: 99999,
                name: null,
            },
        ])
    })
})

describe('convertDbRowsToMarkers', () => {
    it('maps database rows to marker fields and converts null names to undefined', () => {
        expect(convertDbRowsToMarkers([
            {
                id: 'marker-1',
                project_id: 'project-1',
                page_number: 4,
                start_time: 12.5,
                end_time: 20,
                created_at: '2026-08-19T00:00:00Z',
                name: 'Bridge',
            },
            {
                id: 'marker-2',
                project_id: 'project-1',
                page_number: 5,
                start_time: 20,
                end_time: 99999,
                created_at: '2026-08-19T00:00:01Z',
                name: null,
            },
        ])).toEqual([
            { id: 'marker-1', time: 12.5, page: 4, name: 'Bridge' },
            { id: 'marker-2', time: 20, page: 5, name: undefined },
        ])
    })

    it('returns an empty marker list for empty rows', () => {
        expect(convertDbRowsToMarkers([])).toEqual([])
    })
})
