import { describe, expect, it } from 'vitest'
import { requestedOfflineProjectId } from './route'

describe('offline route selection', () => {
  it('prefers query id and supports a UUID pathname', () => {
    expect(requestedOfflineProjectId('/offline', '?project=from-query')).toBe('from-query')
    expect(requestedOfflineProjectId('/123e4567-e89b-42d3-a456-426614174000', '')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(requestedOfflineProjectId('/123e4567-e89b-42d3-a456-426614174000/', '')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(requestedOfflineProjectId('/offline', '')).toBeNull()
  })
})
