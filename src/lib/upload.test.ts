import { describe, expect, it, vi } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  createUploadPath,
  parseOwnedStoragePath,
  uploadProjectFiles,
  validateUploadMetadata,
  validateUploadSignature,
} from '@/lib/upload'

const projectId = '123e4567-e89b-12d3-a456-426614174000'
const supabaseUrl = 'https://example.supabase.co'

describe('project uploads', () => {
  it('accepts a valid audio file and rejects a PDF with a spoofed signature', async () => {
    const audio = new File([new Uint8Array([0xff, 0xfb, 0x90, 0x64])], 'song.mp3', {
      type: 'audio/mpeg',
    })
    expect(validateUploadMetadata(audio, 'audio')).toBeNull()
    await expect(validateUploadSignature(audio, 'audio', 'mp3')).resolves.toBeNull()

    const spoofedPdf = new File(['not a pdf'], 'plan.pdf', { type: 'application/pdf' })
    expect(validateUploadMetadata(spoofedPdf, 'pdf')).toBeNull()
    await expect(validateUploadSignature(spoofedPdf, 'pdf', 'pdf')).resolves.toContain('内容')
  })

  it('rejects oversized, empty, and MIME-spoofed files before upload', () => {
    expect(validateUploadMetadata(new File([''], 'empty.pdf', { type: 'application/pdf' }), 'pdf')).toContain('空')
    expect(validateUploadMetadata(
      { name: 'large.mp3', size: MAX_UPLOAD_BYTES + 1, type: 'audio/mpeg' },
      'audio',
    )).toContain('50MB')
    expect(validateUploadMetadata(
      new File(['bad'], 'song.mp3', { type: 'application/pdf' }),
      'audio',
    )).toContain('対応')
  })

  it('creates immutable random paths and rejects project/path mismatches', () => {
    const path = createUploadPath(projectId, 'audio', 'mp3')
    expect(path).toMatch(new RegExp(`^${projectId}/audio/[0-9a-f-]+\\.mp3$`))
    const url = `${supabaseUrl}/storage/v1/object/public/projects/${path}`
    expect(parseOwnedStoragePath(supabaseUrl, projectId, url, 'audio')).toBe(path)
    expect(parseOwnedStoragePath(supabaseUrl, '223e4567-e89b-12d3-a456-426614174000', url, 'audio')).toBeNull()
    expect(parseOwnedStoragePath(supabaseUrl, projectId, url.replace('/projects/', '/other/'), 'audio')).toBeNull()
    expect(parseOwnedStoragePath('https://other.supabase.co', projectId, url, 'audio')).toBeNull()
    expect(parseOwnedStoragePath(
      supabaseUrl,
      projectId,
      `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/pdf/123e4567-e89b-12d3-a456-426614174001.mp3`,
    )).toBeNull()
  })

  it('cleans the completed audio upload when the following PDF upload fails', async () => {
    const audio = new File([new Uint8Array([0xff, 0xfb, 0x90, 0x64])], 'song.mp3', {
      type: 'audio/mpeg',
    })
    const pdf = new File(['%PDF-1.7\n%%EOF'], 'plan.pdf', { type: 'application/pdf' })
    const upload = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'PDF upload failed' } })
    const discardPartialUploads = vi.fn(async () => undefined)

    await expect(uploadProjectFiles({
      projectId,
      supabaseUrl,
      audioFile: audio,
      pdfFile: pdf,
      upload,
      discardPartialUploads,
    })).rejects.toThrow('PDF upload failed')

    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0][2]).toMatchObject({ cacheControl: '31536000', upsert: false })
    expect(discardPartialUploads).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`/projects/${projectId}/audio/[0-9a-f-]+[.]mp3$`)),
    ])
  })

  it('retains legacy old URLs only for cleanup and never treats them as new uploads', () => {
    const oldUrl = `${supabaseUrl}/storage/v1/object/public/projects/${projectId}/audio.mp3?t=123`
    expect(parseOwnedStoragePath(supabaseUrl, projectId, oldUrl, 'audio')).toBeNull()
    expect(parseOwnedStoragePath(supabaseUrl, projectId, oldUrl, 'audio', {
      allowQuery: true,
      allowLegacy: true,
    })).toBe(`${projectId}/audio.mp3`)
  })
})
