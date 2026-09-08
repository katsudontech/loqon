import { describe, expect, it } from 'vitest'
import { compareOfflineRevision } from './revision'
import type { OfflineProjectInput } from './types'

const base: OfflineProjectInput = {
  id: 'p', title: '練習', audioUrl: 'https://cdn/audio.mp3', pdfUrl: 'https://cdn/a.pdf',
  audioBytes: 10, pdfBytes: 20, timelineVersion: 4, timelineUpdatedAt: '2026-01-01T00:00:00Z', markers: [],
}

describe('offline revision comparison', () => {
  it('distinguishes timeline-only changes from media changes', () => {
    const saved = { ...base, appAssetUrls: [], savedAt: 1 }
    expect(compareOfflineRevision(saved, { ...base, timelineVersion: 5 }).media).toEqual({ audio: false, pdf: false })
    expect(compareOfflineRevision(saved, { ...base, timelineUpdatedAt: '2026-01-02T00:00:00Z' }).timeline).toBe(true)
    expect(compareOfflineRevision(saved, { ...base, audioUrl: 'https://cdn/new.mp3' }).media).toEqual({ audio: true, pdf: false })
  })

  it('uses immutable URL identity and title in revision comparison', () => {
    const saved = { ...base, appAssetUrls: [], savedAt: 1 }
    expect(compareOfflineRevision(saved, base).kind).toBe('same')
    expect(compareOfflineRevision(saved, { ...base, title: '別名' }).title).toBe(true)
  })

  it('detects composition-only and practice-only updates without treating media as changed', () => {
    const saved = { ...base, appAssetUrls: [], savedAt: 1, compositionVersion: 1, compositionUpdatedAt: 'a', practiceVersion: 1, practiceUpdatedAt: 'a' }
    expect(compareOfflineRevision(saved, { ...base, compositionVersion: 2, compositionUpdatedAt: 'b' })).toMatchObject({ kind: 'changed', media: { audio: false, pdf: false } })
    expect(compareOfflineRevision(saved, { ...base, practiceVersion: 2, practiceUpdatedAt: 'b' })).toMatchObject({ kind: 'changed', media: { audio: false, pdf: false } })
  })
})
