import { describe, expect, it } from 'vitest'
import { mapOfflineError, OfflineSaveError } from './types'

describe('offline error mapping', () => {
  it('classifies abort, quota, and network failures', () => {
    expect(mapOfflineError(new DOMException('cancelled', 'AbortError')).code).toBe('aborted')
    expect(mapOfflineError(new DOMException('full', 'QuotaExceededError')).code).toBe('quota')
    expect(mapOfflineError(new TypeError('failed fetch')).code).toBe('network')
    expect(mapOfflineError(new OfflineSaveError('incomplete', 'partial')).code).toBe('incomplete')
  })
})
