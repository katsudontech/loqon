import { describe, expect, it } from 'vitest'
import { derivePlayerTimeline } from './PlayerContainer'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('player timeline domains', () => {
  it('uses composition cues for pages and practice parts for ranges/names', () => {
    const result = derivePlayerTimeline([
      { id: id(1), time: 0, page: 1 }, { id: id(2), time: 5, page: 2 }, { id: id(3), time: 10, page: 3 },
    ], [{ id: id(4), startTime: 0, endTime: 15, name: '全体' }])
    expect(result.cues.map((cue) => cue.page)).toEqual([1, 2, 3])
    expect(result.parts).toEqual([{ id: id(4), time: 0, end_time: 15, page: 1, name: '全体' }])
  })

  it('keeps same-page practice splits independent from composition cues', () => {
    const result = derivePlayerTimeline([{ id: id(1), time: 0, page: 1 }], [
      { id: id(2), startTime: 0, endTime: 4, name: 'A' }, { id: id(3), startTime: 4, endTime: 8, name: 'B' },
    ])
    expect(result.cues).toHaveLength(1)
    expect(result.parts.map((part) => part.name)).toEqual(['A', 'B'])
    expect(result.parts.map((part) => part.page)).toEqual([1, 1])
  })
})
