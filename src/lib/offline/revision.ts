import type { OfflineProject, OfflineProjectInput } from './types'

export type MediaChange = { audio: boolean; pdf: boolean }

export function compareOfflineRevision(saved: OfflineProject | null | undefined, next: OfflineProjectInput) {
  if (!saved) return { kind: 'new' as const, media: { audio: true, pdf: true }, timeline: true, title: true }
  const media: MediaChange = { audio: saved.audioUrl !== next.audioUrl, pdf: saved.pdfUrl !== next.pdfUrl }
  const timeline = saved.timelineVersion !== next.timelineVersion || saved.timelineUpdatedAt !== next.timelineUpdatedAt
    || saved.compositionVersion !== next.compositionVersion || saved.compositionUpdatedAt !== next.compositionUpdatedAt
    || saved.practiceVersion !== next.practiceVersion || saved.practiceUpdatedAt !== next.practiceUpdatedAt
  const title = saved.title !== next.title
  return { kind: media.audio || media.pdf || timeline || title ? 'changed' as const : 'same' as const, media, timeline, title }
}
