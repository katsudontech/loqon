import type { Marker } from '@/lib/timeline'

export type PartBounds = { selectionStart: number; selectionEnd: number; loopStart: number; loopEnd: number; leadInStart: number }

export function getPartBounds(markers: readonly (Marker & { end_time?: number })[], startIndex: number, endIndex: number, duration: number, customA: number | null, customB: number | null, leadIn: boolean): PartBounds | null {
    const start = markers[startIndex]; const end = markers[endIndex]
    if (!start || !end || startIndex > endIndex || !Number.isFinite(duration) || duration <= 0) return null
    const selectionStart = Math.max(0, Math.min(start.time, duration))
    const rawEnd = typeof end.end_time === 'number' && Number.isFinite(end.end_time) ? end.end_time : duration
    const selectionEnd = Math.max(selectionStart, Math.min(rawEnd, duration))
    if (!(selectionEnd > selectionStart)) return null
    const loopStart = customA == null ? selectionStart : customA
    const loopEnd = customB == null ? selectionEnd : customB
    if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd) || loopStart < selectionStart || loopEnd > selectionEnd || !(loopStart < loopEnd)) return null
    return { selectionStart, selectionEnd, loopStart, loopEnd, leadInStart: leadIn ? Math.max(0, loopStart - 5) : loopStart }
}
export function shouldLoopAt(currentTime: number, loopEnd: number): boolean { return Number.isFinite(currentTime) && Number.isFinite(loopEnd) && currentTime >= loopEnd }
export function shiftPartIndices(startIndex: number, endIndex: number, direction: -1 | 1, length: number): { startIndex: number; endIndex: number } | null {
    const nextStart = startIndex + direction; const nextEnd = endIndex + direction
    return nextStart >= 0 && nextEnd < length && nextStart <= nextEnd ? { startIndex: nextStart, endIndex: nextEnd } : null
}
