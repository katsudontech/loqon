import { describe, expect, it } from 'vitest'
import { mapOfflineError, OfflineSaveError } from './types'
import { migrateOfflineRecord } from './db'

describe('offline error mapping', () => {
  it('classifies abort, quota, and network failures', () => {
    expect(mapOfflineError(new DOMException('cancelled', 'AbortError')).code).toBe('aborted')
    expect(mapOfflineError(new DOMException('full', 'QuotaExceededError')).code).toBe('quota')
    expect(mapOfflineError(new TypeError('failed fetch')).code).toBe('network')
    expect(mapOfflineError(new OfflineSaveError('incomplete', 'partial')).code).toBe('incomplete')
  })
})

describe('offline legacy records', () => {
  it('derives separate domains from markers without confusing bytes with seconds', () => {
    const record = migrateOfflineRecord({ id: 'p', title: 'x', audioUrl: 'a', pdfUrl: 'p', audioBytes: 9999, pdfBytes: 22, timelineVersion: 3, timelineUpdatedAt: null, markers: [
      { id: '00000000-0000-4000-8000-000000000001', time: 0, page: 1, name: 'A' },
      { id: '00000000-0000-4000-8000-000000000002', time: 4, page: 1, name: 'B' },
    ], appAssetUrls: [], savedAt: 1 })
    expect(record.compositionCues?.map((cue) => cue.page)).toEqual([1])
    expect(record.practiceParts?.map((part) => part.startTime)).toEqual([0, 4])
    expect(record.practiceParts?.at(-1)?.endTime).toBe(0)
  })
})
