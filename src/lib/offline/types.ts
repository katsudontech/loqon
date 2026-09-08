import type { Marker } from '@/lib/timeline'

export type OfflineProject = {
  id: string
  title: string
  audioUrl: string
  pdfUrl: string
  audioBytes?: number | null
  pdfBytes?: number | null
  timelineVersion: number
  timelineUpdatedAt: string | null
  markers: Marker[]
  appAssetUrls: string[]
  savedAt: number
}

export type OfflineProjectInput = Omit<OfflineProject, 'savedAt' | 'appAssetUrls'> & { appAssetUrls?: string[] }

export type OfflineErrorCode = 'quota' | 'network' | 'aborted' | 'unsupported' | 'incomplete' | 'unknown'

export class OfflineSaveError extends Error {
  code: OfflineErrorCode
  constructor(code: OfflineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OfflineSaveError'
    this.code = code
  }
}

export function mapOfflineError(error: unknown): OfflineSaveError {
  if (error instanceof OfflineSaveError) return error
  if (error instanceof DOMException && error.name === 'AbortError') return new OfflineSaveError('aborted', '保存をキャンセルしました', { cause: error })
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) return new OfflineSaveError('quota', '端末の空き容量が不足しています', { cause: error })
  if (error instanceof TypeError) return new OfflineSaveError('network', 'ネットワークまたはCORSエラーで保存できませんでした', { cause: error })
  return new OfflineSaveError('unknown', error instanceof Error ? error.message : 'オフライン保存に失敗しました', { cause: error instanceof Error ? error : undefined })
}
